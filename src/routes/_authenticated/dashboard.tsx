import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, Activity, Database, Zap } from "lucide-react";
import { listConversations, getTokenUsage } from "@/lib/conversations.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const list = useServerFn(listConversations);
  const usage = useServerFn(getTokenUsage);
  const { data: convs = [] } = useQuery({ queryKey: ["conversations"], queryFn: () => list() });
  const { data: tokens = [] } = useQuery({ queryKey: ["token_usage"], queryFn: () => usage() });

  const totalIn = tokens.reduce((s, t) => s + (t.tokens_in ?? 0), 0);
  const totalOut = tokens.reduce((s, t) => s + (t.tokens_out ?? 0), 0);

  const stats = [
    { label: "Conversations", value: convs.length, icon: MessageSquare },
    { label: "Tokens in", value: totalIn.toLocaleString(), icon: Zap },
    { label: "Tokens out", value: totalOut.toLocaleString(), icon: Activity },
    { label: "Memory entries", value: "—", icon: Database },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your AI workspace at a glance.</p>
        </div>
        <Link to="/chat" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow">New chat</Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</span>
              <s.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-2 text-2xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section className="glass rounded-xl p-5">
          <h2 className="font-semibold">Recent conversations</h2>
          <div className="mt-3 space-y-1">
            {convs.slice(0, 6).map((c) => (
              <Link key={c.id} to="/chat/$conversationId" params={{ conversationId: c.id }} className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent">
                <span className="truncate">{c.title}</span>
                <span className="text-xs text-muted-foreground">{new Date(c.updated_at).toLocaleDateString()}</span>
              </Link>
            ))}
            {convs.length === 0 && <p className="text-sm text-muted-foreground">Start your first chat to see it here.</p>}
          </div>
        </section>
        <section className="glass rounded-xl p-5">
          <h2 className="font-semibold">Agents available</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>🧭 <strong>Planner</strong> — task decomposition</li>
            <li>🔬 <strong>Research</strong> — sources & summaries</li>
            <li>💻 <strong>Coding</strong> — APIs, components, tests</li>
            <li>🛡️ <strong>Reviewer</strong> — bugs, security, perf</li>
            <li>🧠 <strong>Memory</strong> — long-term recall</li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Multi-agent orchestrator ships in Milestone 2.</p>
        </section>
      </div>
    </div>
  );
}
