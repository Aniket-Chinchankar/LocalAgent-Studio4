import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  CheckCircle2,
  Loader2,
  XCircle,
  Terminal,
  Clock,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { AGENTS, type AgentId } from "@/lib/agents";
import { listAgentRuns } from "@/lib/agent-runs.functions";

export const Route = createFileRoute("/_authenticated/agents")({
  component: AgentsPage,
});

function AgentsPage() {
  const fetchRuns = useServerFn(listAgentRuns);
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["agent_runs"],
    queryFn: () => fetchRuns(),
    refetchInterval: 3000,
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Agent Activity</h1>
            <p className="text-sm text-muted-foreground">
              Live timeline of orchestration, specialists, and reviewer cycles.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-secondary/50 px-3 py-1 text-xs text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Live Monitoring
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-4">
        <div className="space-y-6 lg:col-span-1">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Specialist Registry
          </h2>
          <div className="grid gap-3">
            {Object.values(AGENTS).map((a) => (
              <Link
                key={a.id}
                to="/chat"
                search={{ agent: a.id }}
                className="glass group relative block overflow-hidden rounded-xl p-4 transition-all hover:border-primary/50 hover:bg-primary/5 hover:scale-[1.02]"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold">{a.name}</h3>
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground group-hover:text-primary transition">
                    {a.id}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  {a.description}
                </p>
                <div className="absolute -bottom-4 -right-4 h-8 w-8 rounded-full bg-primary/10 transition-transform group-hover:scale-[3]" />
              </Link>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Run History
          </h2>
          <div className="glass overflow-hidden rounded-2xl">
            {isLoading && runs.length === 0 ? (
              <div className="py-20 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : runs.length === 0 ? (
              <div className="px-6 py-20 text-center">
                <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-secondary">
                  <Terminal className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="font-medium text-foreground">No recent activity</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Agent runs will appear here as they execute in your chats.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {runs.map((r: any) => (
                  <li key={r.id} className="flex gap-4 px-6 py-5 transition hover:bg-white/5">
                    <div className="mt-1">
                      <StatusIcon status={r.status} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap gap-2 mb-2">
                        <span className="text-sm font-semibold text-foreground">
                          {AGENTS[r.agent as AgentId]?.name ?? r.agent}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(r.started_at).toLocaleTimeString()}
                        </span>
                        {r.latency_ms != null && (
                          <span className="flex items-center gap-1 rounded-md bg-secondary/50 px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                            <Zap className="h-2.5 w-2.5 text-amber-400" />
                            {r.latency_ms}ms
                          </span>
                        )}
                        {r.conversation_id && (
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            Session: {r.conversation_id.slice(0, 8)}
                          </span>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {r.input && (
                          <div className="rounded-lg bg-black/20 p-3">
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                              <Terminal className="h-3 w-3" /> Input
                            </p>
                            <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap text-[11px] text-muted-foreground scrollbar-hide font-mono">
                              {typeof r.input === "string"
                                ? r.input
                                : JSON.stringify(r.input, null, 2)}
                            </pre>
                          </div>
                        )}
                        {r.output && (
                          <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3" /> Output
                            </p>
                            <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap text-[11px] text-foreground/80 scrollbar-hide font-mono">
                              {typeof r.output === "string"
                                ? r.output
                                : JSON.stringify(r.output, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>

                      {r.error && (
                        <div className="mt-3 rounded-lg bg-destructive/10 border border-destructive/20 p-3 flex gap-2 items-start">
                          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                          <p className="text-[11px] text-destructive leading-normal">{r.error}</p>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running")
    return (
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 border border-primary/20">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      </div>
    );
  if (status === "failed")
    return (
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-destructive/10 border border-destructive/20">
        <XCircle className="h-4 w-4 text-destructive" />
      </div>
    );
  return (
    <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    </div>
  );
}
