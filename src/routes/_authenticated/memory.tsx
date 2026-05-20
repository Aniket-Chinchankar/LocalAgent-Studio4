import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Database, FileText, Loader2, Search, Trash2, Upload, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  uploadDocument,
  listDocuments,
  deleteDocument,
  listMemory,
  deleteMemory,
  searchMemoryAndDocs,
} from "@/lib/documents.functions";

export const Route = createFileRoute("/_authenticated/memory")({
  component: MemoryPage,
});

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function MemoryPage() {
  const qc = useQueryClient();
  const upload = useServerFn(uploadDocument);
  const listDocs = useServerFn(listDocuments);
  const delDoc = useServerFn(deleteDocument);
  const listMem = useServerFn(listMemory);
  const delMem = useServerFn(deleteMemory);
  const search = useServerFn(searchMemoryAndDocs);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: docs = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: () => listDocs(),
    refetchInterval: (q) =>
      (q.state.data as { status: string }[] | undefined)?.some((d) => d.status === "processing")
        ? 2000
        : false,
  });
  const { data: memory = [] } = useQuery({
    queryKey: ["memory"],
    queryFn: () => listMem(),
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await fileToBase64(file);
      return upload({
        data: {
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          base64,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`Indexed ${r.chunks} chunks`);
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const [query, setQuery] = useState("");
  const searchMut = useMutation({
    mutationFn: (q: string) => search({ data: { query: q } }),
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow">
          <Database className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Memory & Knowledge</h1>
          <p className="text-sm text-muted-foreground">
            Upload PDFs/text to ground answers. Long-term facts are auto-extracted from chats.
          </p>
        </div>
      </div>

      {/* Semantic search */}
      <section className="glass mt-8 rounded-xl p-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) searchMut.mutate(query.trim());
            }}
            placeholder="Search across documents + memory (semantic)…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={() => query.trim() && searchMut.mutate(query.trim())}
            disabled={!query.trim() || searchMut.isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40"
          >
            {searchMut.isPending ? "Searching…" : "Search"}
          </button>
        </div>
        {searchMut.data && (
          <div className="mt-4 grid gap-2">
            {[
              ...searchMut.data.chunks.map((c, i) => ({ kind: "Doc", n: i + 1, ...c })),
              ...searchMut.data.memory.map((m, i) => ({ kind: "Mem", n: i + 1, ...m })),
            ].map((r, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-card/40 p-3 text-xs">
                <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>{r.kind}#{r.n}</span>
                  <span>sim {(r.similarity as number).toFixed(3)}</span>
                </div>
                <p className="whitespace-pre-wrap text-foreground/90">{(r.content as string).slice(0, 400)}</p>
              </div>
            ))}
            {searchMut.data.chunks.length === 0 && searchMut.data.memory.length === 0 && (
              <p className="text-sm text-muted-foreground">No matches.</p>
            )}
          </div>
        )}
      </section>

      {/* Documents */}
      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Documents</h2>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-glow disabled:opacity-40"
          >
            {uploadMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,.md,.json,application/pdf,text/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadMut.mutate(f);
              e.target.value = "";
            }}
          />
        </div>
        <div className="glass overflow-hidden rounded-xl">
          {docs.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No documents yet. Upload a PDF or text file to ground answers.
            </div>
          )}
          <ul className="divide-y divide-border">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.mime_type} · {d.size_bytes ? `${Math.round(d.size_bytes / 1024)}KB` : ""} ·{" "}
                    <span
                      className={
                        d.status === "ready"
                          ? "text-primary"
                          : d.status === "failed"
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }
                    >
                      {d.status}
                    </span>
                    {d.error && ` · ${d.error}`}
                  </p>
                </div>
                <button
                  onClick={() =>
                    delDoc({ data: { id: d.id } }).then(() =>
                      qc.invalidateQueries({ queryKey: ["documents"] }),
                    )
                  }
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/20"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Long-term memory */}
      <section className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" /> Long-term memory ({memory.length})
        </h2>
        <div className="glass overflow-hidden rounded-xl">
          {memory.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No memories yet. Chat with the assistant; durable facts are extracted automatically.
            </div>
          )}
          <ul className="divide-y divide-border">
            {memory.map((m) => (
              <li key={m.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(m.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() =>
                    delMem({ data: { id: m.id } }).then(() =>
                      qc.invalidateQueries({ queryKey: ["memory"] }),
                    )
                  }
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/20"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
