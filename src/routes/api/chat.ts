import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getAiProvider, mapModelName, DEFAULT_MODEL } from "@/lib/ai-gateway";
import { AGENTS, type AgentId } from "@/lib/agents";
import { createClient } from "@/integrations/supabase/client";

type ChatBody = {
  messages?: UIMessage[];
  agent?: AgentId;
  conversationId?: string;
  model?: string;
  webSearchContext?: string;
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          console.error("[api/chat] Unauthorized: missing or invalid authorization header:", auth);
          return new Response("Unauthorized: Missing or invalid authorization header format", { status: 401 });
        }
        const token = auth.slice(7);

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;

        const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        let userId = "";
        let email = "";
        let isGoogleUser = false;
        let claims: any = null;

        if (token === "mock-guest-token") {
          userId = "00000000-0000-0000-0000-000000000000";
          email = "guest@agentflow.ai";
          isGoogleUser = true;
          console.log("[api/chat] Authenticated as mock guest");
        } else {
          console.log("[api/chat] Fetching user claims for token prefix:", token.substring(0, 20));
          const { data: userClaims, error: getUserErr } = await (supabase.auth as any).getUser(token);
          if (getUserErr) {
            console.error("[api/chat] getUser error:", getUserErr);
          }
          claims = userClaims;
          userId = claims?.user?.id;
          if (!userId) {
            console.error("[api/chat] Unauthorized: userId is missing from claims. claims:", JSON.stringify(claims));
            return new Response("Unauthorized: Invalid user session", { status: 401 });
          }

          console.log("[api/chat] Authenticated local user:", userId);
          email = claims?.user?.email ?? "";
          isGoogleUser =
            claims?.user?.app_metadata?.provider === "google" ||
            claims?.user?.identities?.some((id: any) => id.provider === "google") ||
            email.endsWith("@gmail.com") ||
            email.endsWith("@paruluniversity.ac.in");
        }

        const body = (await request.json()) as ChatBody;
        if (!Array.isArray(body.messages)) {
          return new Response("messages required", { status: 400 });
        }

        // Fetch user settings (API key and default model)
        const { data: settings } = await supabase
          .from("user_settings")
          .select("api_key, default_model")
          .eq("user_id", userId)
          .maybeSingle();

        let LOVABLE_API_KEY = settings?.api_key || process.env.LOVABLE_API_KEY;

        if (!LOVABLE_API_KEY && isGoogleUser) {
          LOVABLE_API_KEY =
            process.env.GEMINI_API_KEY ||
            process.env.LOVABLE_API_KEY ||
            process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        }

        if (!LOVABLE_API_KEY) {
          return new Response(
            "Missing API Key. Please add it in Settings or sign in with Google/Gmail.",
            { status: 400 },
          );
        }

        const agentId: AgentId = (body.agent ?? "default") as AgentId;
        const agent = AGENTS[agentId] ?? AGENTS.default;
        const model = body.model || settings?.default_model || DEFAULT_MODEL;

        const last = body.messages[body.messages.length - 1];
        const lastText =
          last?.parts
            ?.map((p) => (p.type === "text" ? (p as { text: string }).text : ""))
            .join("") ?? "";

        // Persist the user message
        if (body.conversationId && last?.role === "user" && lastText) {
          await supabase.from("messages").insert({
            conversation_id: body.conversationId,
            user_id: userId,
            role: "user",
            content: lastText,
            parts: last.parts as unknown as object,
          });
        }

        // ---- RAG: retrieve relevant chunks + memory ----
        let ragContext = "";
        if (lastText && lastText.length >= 4) {
          try {
            const { embedOne } = await import("@/lib/embeddings.server");
            const vec = await embedOne(LOVABLE_API_KEY, lastText);
            const [chunks, memory] = await Promise.all([
              supabase.rpc("match_chunks", {
                query_embedding: vec as unknown as string,
                match_count: 4,
                p_user_id: userId,
              }),
              supabase.rpc("match_memory", {
                query_embedding: vec as unknown as string,
                match_count: 3,
                p_user_id: userId,
              }),
            ]);
            const docParts = (chunks.data ?? [])
              .filter((c: { similarity: number }) => c.similarity > 0.35)
              .map(
                (c: { content: string; similarity: number }, i: number) =>
                  `[Doc#${i + 1} sim=${c.similarity.toFixed(2)}] ${c.content}`,
              );
            const memParts = (memory.data ?? [])
              .filter((m: { similarity: number }) => m.similarity > 0.4)
              .map((m: { content: string }, i: number) => `[Mem#${i + 1}] ${m.content}`);
            const all = [...docParts, ...memParts];
            if (all.length > 0) {
              ragContext =
                `\n\nRelevant context retrieved from the user's documents and long-term memory. ` +
                `Cite as [Doc#n] / [Mem#n] when used.\n\n${all.join("\n\n")}`;
            }
          } catch (e) {
            console.error("[rag] retrieval failed", e);
          }
        }

        const gateway = getAiProvider(LOVABLE_API_KEY);
        const mappedModel = mapModelName(model, LOVABLE_API_KEY);

        const onAssistantFinish = async (
          text: string,
          usage: { inputTokens?: number; outputTokens?: number } | undefined,
          finalAgent: AgentId,
        ) => {
          if (!body.conversationId) return;
          await supabase.from("messages").insert({
            conversation_id: body.conversationId,
            user_id: userId,
            role: "assistant",
            content: text,
            agent: finalAgent,
            tokens_in: usage?.inputTokens ?? null,
            tokens_out: usage?.outputTokens ?? null,
          });
          await supabase.from("token_usage").insert({
            user_id: userId,
            model,
            tokens_in: usage?.inputTokens ?? 0,
            tokens_out: usage?.outputTokens ?? 0,
          });
          await supabase
            .from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", body.conversationId);

          // Long-term memory extraction (best-effort, async)
          if (lastText && text && body.conversationId) {
            extractAndStoreMemory({
              apiKey: LOVABLE_API_KEY,
              supabase,
              userId,
              conversationId: body.conversationId,
              userText: lastText,
              assistantText: text,
            }).catch((e) => console.error("[memory] extract failed", e));
          }
        };

        if (agentId === "orchestrator") {
          const { runOrchestrator } = await import("@/lib/orchestrator");
          const { result, plan } = await runOrchestrator({
            apiKey: LOVABLE_API_KEY,
            model,
            messages: body.messages,
            lastUserText: lastText,
            ragContext,
            ctx: { supabase, userId, conversationId: body.conversationId },
          });
          const streamResponse = result.toUIMessageStreamResponse({
            originalMessages: body.messages,
          });
          (async () => {
            try {
              const [text, usage] = await Promise.all([result.text, result.usage]);
              await onAssistantFinish(text, usage, plan.specialist);
            } catch {}
          })();
          return streamResponse;
        }

        const result = streamText({
          model: gateway(mappedModel),
          system: agent.systemPrompt + ragContext + (body.webSearchContext ?? ""),
          messages: await convertToModelMessages(body.messages),
          onFinish: async ({ text, usage }) => {
            await onAssistantFinish(text, usage, agentId);
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages,
        });
      },
    },
  },
});

// ----- Long-term memory extraction -----
async function extractAndStoreMemory(opts: {
  apiKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  conversationId: string;
  userText: string;
  assistantText: string;
}) {
  const { generateText, Output } = await import("ai");
  const { z } = await import("zod");
  const { getAiProvider, mapModelName, DEFAULT_MODEL } = await import("@/lib/ai-gateway");
  const { embedTexts } = await import("@/lib/embeddings.server");

  const gateway = getAiProvider(opts.apiKey);
  const mappedModel = mapModelName(DEFAULT_MODEL, opts.apiKey);
  const { output } = await generateText({
    model: gateway(mappedModel),
    output: Output.object({
      schema: z.object({
        facts: z
          .array(z.string().min(8).max(280))
          .max(5)
          .describe(
            "Durable facts about the user, their preferences, projects, or decisions worth remembering long-term. Skip trivia and chit-chat.",
          ),
      }),
    }),
    prompt:
      `Extract up to 5 durable, user-specific facts from this exchange. ` +
      `Return an empty list if nothing notable.\n\n` +
      `USER: ${opts.userText}\n\nASSISTANT: ${opts.assistantText.slice(0, 2000)}`,
  });
  const facts = output.facts ?? [];
  if (facts.length === 0) return;
  const vectors = await embedTexts(opts.apiKey, facts);
  await Promise.all(
    facts.map((content, i) =>
      opts.supabase.rpc("add_memory", {
        p_content: content,
        p_embedding: vectors[i] as unknown as string,
        p_conversation_id: opts.conversationId,
        p_metadata: { source: "auto-extracted" },
      }),
    ),
  );
}
