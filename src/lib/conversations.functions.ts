import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("conversations")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ title: z.string().min(1).max(200).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("conversations")
      .insert({
        user_id: context.userId,
        title: data.title ?? "New Conversation",
      })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [conv, msgs] = await Promise.all([
      context.supabase
        .from("conversations")
        .select("id, title, created_at, updated_at")
        .eq("id", data.id)
        .maybeSingle(),
      context.supabase
        .from("messages")
        .select("id, role, content, parts, agent, created_at")
        .eq("conversation_id", data.id)
        .order("created_at", { ascending: true }),
    ]);
    if (conv.error) throw new Error(conv.error.message);
    if (msgs.error) throw new Error(msgs.error.message);
    return { conversation: conv.data, messages: msgs.data ?? [] };
  });

export const renameConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), title: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversations")
      .update({ title: data.title })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("conversations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTokenUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("token_usage")
      .select("model, tokens_in, tokens_out, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
export const getStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [convs, tokens, memory] = await Promise.all([
      context.supabase.from("conversations").select("id", { count: "exact", head: true }),
      context.supabase.from("token_usage").select("tokens_in, tokens_out"),
      context.supabase.from("semantic_memory").select("id", { count: "exact", head: true }),
    ]);

    const totalIn = (tokens.data ?? []).reduce((s: number, t: any) => s + (t.tokens_in ?? 0), 0);
    const totalOut = (tokens.data ?? []).reduce((s: number, t: any) => s + (t.tokens_out ?? 0), 0);

    return {
      conversations: convs.count ?? 0,
      tokensIn: totalIn,
      tokensOut: totalOut,
      memory: memory.count ?? 0,
    };
  });

export const saveLocalMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        agent: z.string().optional(),
        tokensIn: z.number().optional(),
        tokensOut: z.number().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("messages").insert({
      conversation_id: data.conversationId,
      user_id: context.userId,
      role: data.role,
      content: data.content,
      agent: data.agent || null,
    });
    if (error) throw new Error(error.message);

    if (data.tokensIn || data.tokensOut) {
      await context.supabase.from("token_usage").insert({
        user_id: context.userId,
        model: "gemini-3.5-flash",
        tokens_in: data.tokensIn ?? 0,
        tokens_out: data.tokensOut ?? 0,
      });
    }

    await context.supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);

    return { ok: true };
  });

export const localWebSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ query: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { performWebSearch } = await import("@/lib/orchestrator");
    return await performWebSearch(data.query);
  });
