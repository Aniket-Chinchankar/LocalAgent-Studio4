import { generateText, streamText, Output, convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider, DEFAULT_MODEL } from "@/lib/ai-gateway";
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
});

export async function runOrchestrator(opts: {
  apiKey: string;
  model: string;
  messages: UIMessage[];
  ctx: LogCtx;
  lastUserText: string;
}) {
  const { apiKey, model, messages, ctx, lastUserText } = opts;
  const gateway = createLovableAiGatewayProvider(apiKey);
  const plannerStart = Date.now();
  const plannerRunId = await logRun(ctx, "planner", "running", {
    input: { query: lastUserText },
  });

  let plan: z.infer<typeof PlannerSchema>;
  try {
    const { output } = await generateText({
      model: gateway(model),
      output: Output.object({ schema: PlannerSchema }),
      prompt:
        `Classify the user's query and choose the best specialist agent.\n\n` +
        `Available specialists: ${SPECIALISTS.join(", ")}.\n` +
        `- research: gather/summarize info with citations\n` +
        `- planner: break a goal into ordered steps\n` +
        `- coding: write production code\n` +
        `- reviewer: review code/text for issues\n` +
        `- memory: extract durable facts to remember\n\n` +
        `Set needsReview=true for code or critical decisions.\n\n` +
        `User query:\n"""${lastUserText}"""`,
    });
    plan = output;
  } catch (e) {
    plan = { specialist: "research", reasoning: "fallback", needsReview: false };
  }
  await logRun(ctx, "planner", "completed", {
    output: plan,
    completed_at: new Date().toISOString(),
    latency_ms: Date.now() - plannerStart,
  }, plannerRunId);

  const specialist = AGENTS[plan.specialist];
  const execRunId = await logRun(ctx, plan.specialist, "running", {
    input: { delegatedFrom: "planner", reasoning: plan.reasoning },
  });
  const execStart = Date.now();

  const result = streamText({
    model: gateway(model),
    system:
      specialist.systemPrompt +
      `\n\nYou were selected by the orchestrator because: ${plan.reasoning}. ` +
      `Respond directly to the user in markdown.`,
    messages: await convertToModelMessages(messages),
    onFinish: async ({ text, usage }) => {
      await logRun(ctx, plan.specialist, "completed", {
        output: { chars: text.length, usage },
        completed_at: new Date().toISOString(),
        latency_ms: Date.now() - execStart,
      }, execRunId);

      if (plan.needsReview) {
        const revStart = Date.now();
        const revId = await logRun(ctx, "reviewer", "running", {
          input: { reviewingAgent: plan.specialist },
        });
        try {
          const review = await generateText({
            model: gateway(model),
            system: AGENTS.reviewer.systemPrompt,
            prompt:
              `Review the following assistant response for correctness, security, and clarity. ` +
              `Return a 1–3 sentence verdict.\n\n---\n${text.slice(0, 4000)}`,
          });
          await logRun(ctx, "reviewer", "completed", {
            output: { verdict: review.text },
            completed_at: new Date().toISOString(),
            latency_ms: Date.now() - revStart,
          }, revId);
        } catch (e) {
          await logRun(ctx, "reviewer", "failed", {
            error: (e as Error).message,
            completed_at: new Date().toISOString(),
          }, revId);
        }
      }
    },
  });

  return { result, plan };
}
