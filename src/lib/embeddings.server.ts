// Embeddings via Lovable AI Gateway. Server-only.
export const EMBED_MODEL = "google/gemini-embedding-001";
export const EMBED_DIMS = 1536;

type EmbedResp = { data: { embedding: number[]; index: number }[] };

export async function embedTexts(apiKey: string, inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: inputs,
      dimensions: EMBED_DIMS,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as EmbedResp;
  return json.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export async function embedOne(apiKey: string, input: string): Promise<number[]> {
  const [v] = await embedTexts(apiKey, [input]);
  return v;
}

/** Split text into ~1000-char chunks with 150-char overlap, breaking on paragraph/sentence when possible. */
export function chunkText(text: string, target = 1000, overlap = 150): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= target) return clean ? [clean] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + target, clean.length);
    if (end < clean.length) {
      const slice = clean.slice(i, end);
      const breakAt = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf("\n"),
        slice.lastIndexOf(". "),
      );
      if (breakAt > target * 0.5) end = i + breakAt + 1;
    }
    chunks.push(clean.slice(i, end).trim());
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks.filter(Boolean);
}
