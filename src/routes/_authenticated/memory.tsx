import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Database,
  FileText,
  Loader2,
  Search,
  Trash2,
  Upload,
  Sparkles,
  Brain,
  Info,
  AlertCircle,
} from "lucide-react";
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

  const { data: docs = [], isLoading: docsLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: () => listDocs(),
    refetchInterval: (q) =>
      (q.state.data as { status: string }[] | undefined)?.some((d) => d.status === "processing")
        ? 2000
        : false,
  });
  const { data: memory = [], isLoading: memLoading } = useQuery({
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
      <div className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Memory & Knowledge</h1>
            <p className="text-sm text-muted-foreground">
              {" "}
              Ground your assistant with documents and long-term memory.
            </p>
          </div>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploadMut.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition hover:scale-[1.02] disabled:opacity-50"
        >
          {uploadMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Upload Knowledge
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

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          {/* Semantic search */}
          <section className="glass rounded-2xl p-6 border-primary/20 shadow-glow">
            <div className="flex items-center gap-3 mb-4">
              <Search className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Semantic Search</h2>
            </div>
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim()) searchMut.mutate(query.trim());
                }}
                placeholder="Ask your documents or memory..."
                className="w-full bg-white/5 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary/50 transition"
              />
              <button
                onClick={() => query.trim() && searchMut.mutate(query.trim())}
                disabled={!query.trim() || searchMut.isPending}
                className="absolute right-2 top-2 rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30 transition disabled:opacity-40"
              >
                {searchMut.isPending ? "Searching..." : "Search"}
              </button>
            </div>
            {searchMut.data && (
              <div className="mt-6 space-y-3">
                {[
                  ...searchMut.data.chunks.map((c: any, i: number) => ({ kind: "Doc", n: i + 1, ...c })),
                  ...searchMut.data.memory.map((m: any, i: number) => ({ kind: "Mem", n: i + 1, ...m })),
                ].map((r: any, idx: number) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-border bg-white/5 p-4 text-xs group transition hover:border-primary/30"
                  >
                    <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                      <span className="flex items-center gap-1">
                        {r.kind === "Doc" ? (
                          <FileText className="h-3 w-3" />
                        ) : (
                          <Brain className="h-3 w-3" />
                        )}
                        {r.kind}#{r.n}
                      </span>
                      <span className="rounded-full bg-secondary px-2 py-0.5">
                        match {(r.similarity as number).toFixed(3)}
                      </span>
                    </div>
                    <p className="leading-relaxed text-foreground/90">{r.content as string}</p>
                  </div>
                ))}
                {searchMut.data.chunks.length === 0 && searchMut.data.memory.length === 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                    <Info className="h-4 w-4" /> No relevant matches found.
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Documents */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Knowledge Base</h2>
              <span className="text-xs text-muted-foreground">{docs.length} files</span>
            </div>
            <div className="glass overflow-hidden rounded-2xl">
              {docsLoading ? (
                <div className="py-20 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : docs.length === 0 ? (
                <div className="px-4 py-16 text-center">
                  <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-secondary">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium">No documents yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">
                    Upload PDFs or text files to provide context to your assistant.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {docs.map((d: any) => (
                    <li
                      key={d.id}
                      className="group flex items-center gap-4 px-6 py-4 transition hover:bg-white/5"
                    >
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-primary">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{d.filename}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{d.mime_type?.split("/")[1]?.toUpperCase() || "FILE"}</span>
                          <span>•</span>
                          <span>
                            {d.size_bytes ? `${(d.size_bytes / 1024).toFixed(1)} KB` : "0 KB"}
                          </span>
                          <span>•</span>
                          <StatusBadge status={d.status} />
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          delDoc({ data: { id: d.id } }).then(() =>
                            qc.invalidateQueries({ queryKey: ["documents"] }),
                          )
                        }
                        className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/20 hover:text-destructive opacity-0 group-hover:opacity-100 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-8">
          {/* Long-term memory */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Durable Facts
              </h2>
            </div>
            <div className="glass overflow-hidden rounded-2xl">
              {memLoading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : memory.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Facts you discuss with AgentFlow AI will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="max-h-[600px] overflow-y-auto divide-y divide-border">
                  {memory.map((m: any) => (
                    <div key={m.id} className="group p-5 transition hover:bg-white/5">
                      <div className="flex justify-between gap-2">
                        <p className="text-sm leading-relaxed">{m.content}</p>
                        <button
                          onClick={() =>
                            delMem({ data: { id: m.id } }).then(() =>
                              qc.invalidateQueries({ queryKey: ["memory"] }),
                            )
                          }
                          className="shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                        Extracted {new Date(m.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 rounded-xl bg-primary/10 p-4 border border-primary/20">
              <div className="flex gap-3">
                <AlertCircle className="h-4 w-4 text-primary shrink-0" />
                <p className="text-xs text-primary/90 leading-normal">
                  Memories are used by the <strong>Orchestrator</strong> to maintain context across
                  different conversations.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    {
      ready: "bg-emerald-500/10 text-emerald-500",
      processing: "bg-amber-500/10 text-amber-500",
      failed: "bg-destructive/10 text-destructive",
      pending: "bg-muted text-muted-foreground",
    }[status] || "bg-muted text-muted-foreground";

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles}`}
    >
      {status === "processing" && <Loader2 className="mr-1 inline h-2 w-2 animate-spin" />}
      {status}
    </span>
  );
}
