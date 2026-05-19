import { createFileRoute } from "@tanstack/react-router";
import { Database } from "lucide-react";

export const Route = createFileRoute("/_authenticated/memory")({
  component: MemoryPage,
});

function MemoryPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow">
          <Database className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Memory</h1>
          <p className="text-sm text-muted-foreground">Long-term semantic memory and uploaded documents.</p>
        </div>
      </div>
      <div className="glass mt-8 rounded-xl p-6 text-sm text-muted-foreground">
        <p>RAG pipeline (PDF upload, chunking, pgvector retrieval, document browser) ships in <strong className="text-foreground">Milestone 3</strong>.</p>
        <p className="mt-2">Database tables (<code>uploaded_documents</code>, <code>document_chunks</code>, <code>semantic_memory</code>) and the <code>match_chunks</code> / <code>match_memory</code> SQL functions are already in place.</p>
      </div>
    </div>
  );
}
