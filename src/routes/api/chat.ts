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

        const gateway = createLovableAiGatewayProvider(LOVABLE_API_KEY);
        const result = streamText({
          model: gateway(model),
          system: agent.systemPrompt,
          messages: await convertToModelMessages(body.messages),
          onFinish: async ({ text, usage }) => {
            if (body.conversationId) {
              await supabase.from("messages").insert({
                conversation_id: body.conversationId,
                user_id: userId,
                role: "assistant",
                content: text,
                agent: agentId,
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
            }
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages,
        });
      },
    },
  },
});
