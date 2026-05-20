import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider, DEFAULT_MODEL } from "@/lib/ai-gateway";
import { AGENTS, type AgentId } from "@/lib/agents";
import { createClient } from "@supabase/supabase-js";

type ChatBody = {
  messages?: UIMessage[];
  agent?: AgentId;
  conversationId?: string;
  model?: string;
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = auth.slice(7);

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!LOVABLE_API_KEY) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as ChatBody;
        if (!Array.isArray(body.messages)) {
          return new Response("messages required", { status: 400 });
        }

        const agentId: AgentId = (body.agent ?? "default") as AgentId;
        const agent = AGENTS[agentId] ?? AGENTS.default;
        const model = body.model ?? DEFAULT_MODEL;

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
              .map((c: { content: string; similarity: number }, i: number) =>
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

        const gateway = createLovableAiGatewayProvider(LOVABLE_API_KEY);

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
            ctx: { supabase, userId, conversationId: body.conversationId },
          });
          // Wrap onFinish for orchestrator path
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
          model: gateway(model),
          system: agent.systemPrompt,
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
