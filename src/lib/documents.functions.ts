import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { embedTexts, embedOne, chunkText, EMBED_DIMS } from "@/lib/embeddings.server";
import { extractText, getDocumentProxy } from "unpdf";

const UploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  /** base64-encoded file bytes */
  base64: z.string().min(1),
});

async function decodeFile(input: z.infer<typeof UploadSchema>): Promise<{ text: string; size: number }> {
  const binary = Uint8Array.from(atob(input.base64), (c) => c.charCodeAt(0));
  const size = binary.byteLength;
  if (size > 8 * 1024 * 1024) throw new Error("File exceeds 8MB limit");

  if (input.mimeType === "application/pdf" || input.filename.toLowerCase().endsWith(".pdf")) {
    const pdf = await getDocumentProxy(binary);
    const { text } = await extractText(pdf, { mergePages: true });
    return { text: Array.isArray(text) ? text.join("\n\n") : text, size };
  }
  // Plain text / markdown / json
  const text = new TextDecoder("utf-8").decode(binary);
  return { text, size };
}

export const uploadDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UploadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    // Insert document row
    const { data: doc, error: insertErr } = await context.supabase
      .from("uploaded_documents")
      .insert({
        user_id: context.userId,
        filename: data.filename,
        mime_type: data.mimeType,
        status: "processing",
      })
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    try {
      const { text, size } = await decodeFile(data);
      if (!text.trim()) throw new Error("No text could be extracted");

      const chunks = chunkText(text);
      if (chunks.length === 0) throw new Error("Document produced no chunks");
      if (chunks.length > 400) throw new Error("Document too large (>400 chunks)");

      // Embed in batches of 64
      const all: number[][] = [];
      for (let i = 0; i < chunks.length; i += 64) {
        const batch = chunks.slice(i, i + 64);
        const vecs = await embedTexts(apiKey, batch);
        all.push(...vecs);
      }

      const rows = chunks.map((content, idx) => ({
        user_id: context.userId,
        document_id: doc.id,
        chunk_index: idx,
        content,
        embedding: all[idx] as unknown as string, // pgvector accepts number[] via supabase-js
      }));

      // Insert chunks
      const { error: chunkErr } = await context.supabase
        .from("document_chunks")
        .insert(rows);
      if (chunkErr) throw new Error(chunkErr.message);

      await context.supabase
        .from("uploaded_documents")
        .update({ status: "ready", size_bytes: size })
        .eq("id", doc.id);

      return { id: doc.id, chunks: chunks.length, dims: EMBED_DIMS };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      await context.supabase
        .from("uploaded_documents")
        .update({ status: "failed", error: msg })
        .eq("id", doc.id);
      throw new Error(msg);
    }
  });

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("uploaded_documents")
      .select("id, filename, mime_type, size_bytes, status, error, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("document_chunks").delete().eq("document_id", data.id);
    const { error } = await context.supabase
      .from("uploaded_documents")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const searchMemoryAndDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ query: z.string().min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
    const vec = await embedOne(apiKey, data.query);
    const [chunks, memory] = await Promise.all([
      context.supabase.rpc("match_chunks", {
        query_embedding: vec as unknown as string,
        match_count: 5,
        p_user_id: context.userId,
      }),
      context.supabase.rpc("match_memory", {
        query_embedding: vec as unknown as string,
        match_count: 5,
        p_user_id: context.userId,
      }),
    ]);
    return {
      chunks: chunks.data ?? [],
      memory: memory.data ?? [],
    };
  });

export const listMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("semantic_memory")
      .select("id, content, metadata, conversation_id, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("semantic_memory")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
