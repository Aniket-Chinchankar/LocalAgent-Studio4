// Embeddings via Lovable AI Gateway. Server-only.
export const EMBED_MODEL = "openai/text-embedding-3-small";
export const EMBED_DIMS = 1536;

type EmbedResp = { data: { embedding: number[]; index: number }[] };

export async function embedTexts(apiKey: string, inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];

  if (!apiKey || apiKey === "undefined" || apiKey === "null" || apiKey === "mock-key" || apiKey.trim() === "") {
    // Return a deterministic mock vector based on the text hash so same input gets similar results
    return inputs.map((text) => {
      const vec = new Array(EMBED_DIMS).fill(0);
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = text.charCodeAt(i) + ((hash << 5) - hash);
      }
      for (let i = 0; i < EMBED_DIMS; i++) {
        const seed = Math.sin(hash + i) * 10000;
        vec[i] = seed - Math.floor(seed);
      }
      return vec;
    });
  }

  if (apiKey && apiKey.startsWith("AIzaSy")) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-004",
        input: inputs,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Embedding failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as EmbedResp;
    return json.data
      .sort((a, b) => a.index - b.index)
      .map((d) => {
        const emb = d.embedding;
        if (emb.length === 768) {
          return [...emb, ...new Array(768).fill(0)];
        }
        if (emb.length < 1536) {
          return [...emb, ...new Array(1536 - emb.length).fill(0)];
        }
        return emb.slice(0, 1536);
      });
  }

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
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedOne(apiKey: string, input: string): Promise<number[]> {
  const [v] = await embedTexts(apiKey, [input]);
  return v;
}

/** Split text into ~1000-char chunks with 150-char overlap, breaking on paragraph/sentence when possible. */
export function chunkText(text: string, target = 1000, overlap = 150): string[] {
  const clean = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
