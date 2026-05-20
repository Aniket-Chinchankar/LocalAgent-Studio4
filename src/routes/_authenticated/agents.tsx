import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { AGENTS, type AgentId } from "@/lib/agents";
import { listAgentRuns } from "@/lib/agent-runs.functions";

export const Route = createFileRoute("/_authenticated/agents")({
  component: AgentsPage,
});

function AgentsPage() {
  const fetchRuns = useServerFn(listAgentRuns);
  const { data: runs = [] } = useQuery({
    queryKey: ["agent_runs"],
    queryFn: () => fetchRuns(),
    refetchInterval: 3000,
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agent Activity</h1>
          <p className="text-sm text-muted-foreground">
            Live timeline of orchestrator decisions, specialist runs, and reviewer passes.
          </p>
        </div>
      </div>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.values(AGENTS).map((a) => (
          <div key={a.id} className="glass rounded-xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{a.name}</h3>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider text-secondary-foreground">
                {a.id}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{a.description}</p>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent runs</h2>
        <div className="glass overflow-hidden rounded-xl">
          {runs.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No runs yet. Start a chat with the Orchestrator agent to see live activity.
            </div>
          )}
          <ul className="divide-y divide-border">
            {runs.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                <StatusIcon status={r.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{AGENTS[r.agent as AgentId]?.name ?? r.agent}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.started_at).toLocaleTimeString()}
                    </span>
                    {r.latency_ms != null && (
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                        {r.latency_ms}ms
                      </span>
                    )}
                  </div>
                  {r.input != null && (
                    <pre className="mt-1 max-h-20 overflow-hidden whitespace-pre-wrap text-[11px] text-muted-foreground">
                      {JSON.stringify(r.input).slice(0, 220)}
                    </pre>
                  )}
                  {r.output != null && (
                    <pre className="mt-1 max-h-20 overflow-hidden whitespace-pre-wrap text-[11px] text-foreground/80">
                      {JSON.stringify(r.output).slice(0, 220)}
                    </pre>
                  )}
                  {r.error && (
                    <p className="mt-1 text-[11px] text-destructive">{r.error}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running")
    return <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" />;
  if (status === "failed")
    return <XCircle className="mt-0.5 h-4 w-4 text-destructive" />;
  return <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />;
}
