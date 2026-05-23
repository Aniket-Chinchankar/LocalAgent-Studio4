import { generateText, streamText, Output, convertToModelMessages, type UIMessage, tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAiProvider, mapModelName, DEFAULT_MODEL } from "@/lib/ai-gateway";
import { AGENTS, type AgentId } from "@/lib/agents";

type LogCtx = {
  supabase: SupabaseClient;
  userId: string;
  conversationId?: string;
};

async function logRun(
  ctx: LogCtx,
  agent: AgentId,
  status: "running" | "completed" | "failed",
  patch: Record<string, unknown> = {},
  id?: string,
) {
  if (id) {
    await ctx.supabase
      .from("agent_runs")
      .update({ status, ...patch })
      .eq("id", id);
    return id;
  }
  const { data } = await ctx.supabase
    .from("agent_runs")
    .insert({
      user_id: ctx.userId,
      conversation_id: ctx.conversationId ?? null,
      agent,
      status,
      ...patch,
    })
    .select("id")
    .single();
  return data?.id as string | undefined;
}

const SPECIALISTS: AgentId[] = ["research", "planner", "coding", "reviewer", "memory"];

const PlannerSchema = z.object({
  specialist: z.enum(["research", "planner", "coding", "reviewer", "memory"]),
  reasoning: z.string().min(1).max(400),
  needsReview: z.boolean(),
  tools: z.array(z.enum(["web_search", "web_scrape", "document_retrieval"])).optional(),
});

export async function runOrchestrator(opts: {
  apiKey: string;
  model: string;
  messages: UIMessage[];
  ctx: LogCtx;
  lastUserText: string;
  ragContext?: string;
}) {
  const { apiKey, model, messages, ctx, lastUserText, ragContext = "" } = opts;
  const gateway = getAiProvider(apiKey);
  const mappedModel = mapModelName(model, apiKey);
  const plannerStart = Date.now();
  const plannerRunId = await logRun(ctx, "planner", "running", {
    input: { query: lastUserText },
  });

  let plan: z.infer<typeof PlannerSchema>;
  try {
    const { output } = await generateText({
      model: gateway(mappedModel),
      output: Output.object({ schema: PlannerSchema }),
      prompt:
        `Classify the user's query and choose the best specialist agent.\n\n` +
        `Available specialists: ${SPECIALISTS.join(", ")}.\n` +
        `- research: gather/summarize info with citations\n` +
        `- planner: break a goal into ordered steps\n` +
        `- coding: write production code\n` +
        `- reviewer: review code/text for issues\n` +
        `- memory: extract durable facts to remember\n\n` +
        `Available tools: web_search, web_scrape, document_retrieval.\n\n` +
        `Set needsReview=true for code or critical decisions.\n\n` +
        `User query:\n"""${lastUserText}"""`,
    });
    plan = output;
  } catch (e) {
    plan = { specialist: "research", reasoning: "fallback", needsReview: false };
  }
  await logRun(
    ctx,
    "planner",
    "completed",
    {
      output: plan,
      completed_at: new Date().toISOString(),
      latency_ms: Date.now() - plannerStart,
    },
    plannerRunId,
  );

  const specialist = AGENTS[plan.specialist];
  const execRunId = await logRun(ctx, plan.specialist, "running", {
    input: { delegatedFrom: "planner", reasoning: plan.reasoning, tools: plan.tools },
  });
  const execStart = Date.now();

  const result = streamText({
    model: gateway(mappedModel) as any,
    system:
      specialist.systemPrompt +
      `\n\nYou were selected by the orchestrator because: ${plan.reasoning}. ` +
      `Respond directly to the user in markdown.` +
      ragContext,
    messages: await convertToModelMessages(messages),
    tools: {
      web_search: (tool as any)({
        description: "Search the web for real-time information.",
        parameters: z.object({ query: z.string() }),
        execute: async ({ query }: { query: string }) => {
          return await performWebSearch(query);
        },
      }),
      web_scrape: (tool as any)({
        description: "Fetch and extract clean text content from a specific web URL.",
        parameters: z.object({ url: z.string().url() }),
        execute: async ({ url }: { url: string }) => {
          return await scrapeWebPage(url);
        },
      }),
    },
    onFinish: async ({ text, usage }) => {
      await logRun(
        ctx,
        plan.specialist,
        "completed",
        {
          output: { chars: text.length, usage },
          completed_at: new Date().toISOString(),
          latency_ms: Date.now() - execStart,
        },
        execRunId,
      );

      if (plan.needsReview) {
        const revStart = Date.now();
        const revId = await logRun(ctx, "reviewer", "running", {
          input: { reviewingAgent: plan.specialist },
        });
        try {
          const review = await generateText({
            model: gateway(mappedModel),
            system: AGENTS.reviewer.systemPrompt,
            prompt:
              `Review the following assistant response for correctness, security, and clarity. ` +
              `Return a 1–3 sentence verdict.\n\n---\n${text.slice(0, 4000)}`,
          });
          await logRun(
            ctx,
            "reviewer",
            "completed",
            {
              output: { verdict: review.text },
              completed_at: new Date().toISOString(),
              latency_ms: Date.now() - revStart,
            },
            revId,
          );
        } catch (e) {
          await logRun(
            ctx,
            "reviewer",
            "failed",
            {
              error: (e as Error).message,
              completed_at: new Date().toISOString(),
            },
            revId,
          );
        }
      }
    },
  });

  return { result, plan };
}

export async function performWebSearch(query: string) {
  const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
  if (TAVILY_API_KEY) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query,
          search_depth: "basic",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.results)) {
          return {
            results: data.results.map((r: any) => ({
              title: r.title,
              snippet: r.content || r.snippet,
              url: r.url,
            })),
            note: "Search results retrieved via Tavily.",
          };
        }
      }
    } catch (e) {
      console.warn("Tavily search failed, falling back to DuckDuckGo:", e);
    }
  }

  // Fallback DuckDuckGo HTML scraper
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`DDG response: ${res.statusText}`);
    const html = await res.text();
    const results: { title: string; snippet: string; url: string }[] = [];

    // Parse DDG search result blocks - target organic web results and skip ads
    const blocks = html.split(/<div[^>]*class="[^"]*web-result[^"]*"/);
    for (let i = 1; i < blocks.length && results.length < 5; i++) {
      const block = blocks[i];

      // Extract URL from href
      const hrefMatch = block.match(/href="([^"]+)"/);
      if (!hrefMatch) continue;
      let url = hrefMatch[1];

      // Extract the actual target url
      if (url.includes("uddg=")) {
        const parts = url.split("uddg=");
        if (parts[1]) {
          url = decodeURIComponent(parts[1].split("&")[0]);
        }
      } else if (url.startsWith("//")) {
        url = "https:" + url;
      }

      // Extract Title
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
      let title = "Search Result";
      if (titleMatch) {
        title = titleMatch[1]
          .replace(/<[^>]*>/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }

      // Extract Snippet
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      let snippet = "No description available.";
      if (snippetMatch) {
        snippet = snippetMatch[1]
          .replace(/<[^>]*>/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }

      results.push({ title, snippet, url });
    }

    return {
      results,
      note: "Search results retrieved via DuckDuckGo fallback scraper.",
    };
  } catch (error) {
    console.error("DuckDuckGo search scraper failed:", error);
    return {
      results: [
        {
          title: `Search: ${query}`,
          snippet: "Web search is currently unavailable.",
          url: "https://duckduckgo.com",
        },
      ],
      note: "Web search failed.",
    };
  }
}

async function scrapeWebPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      return `Failed to load page: ${res.statusText}`;
    }
    const html = await res.text();
    // Clean scripts, styles, and extract text
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text.slice(0, 4000); // Return first 4000 characters
  } catch (e) {
    return `Error scraping url: ${(e as Error).message}`;
  }
}
