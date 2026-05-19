import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { AGENTS } from "@/lib/agents";

export const Route = createFileRoute("/_authenticated/agents")({
  component: AgentsPage,
});

function AgentsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground">Specialized AI agents. Pick one from the chat header.</p>
        </div>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.values(AGENTS).map((a) => (
          <div key={a.id} className="glass rounded-xl p-5">
            <h3 className="font-semibold">{a.name}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{a.description}</p>
            <span className="mt-3 inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] uppercase tracking-wider text-secondary-foreground">{a.id}</span>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Live activity monitor (run timeline, latency, tool calls) ships in Milestone 2.</p>
    </div>
  );
}
