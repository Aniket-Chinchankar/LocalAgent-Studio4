import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, Activity, Database, Zap, Sparkles, ArrowRight, Brain } from "lucide-react";
import { listConversations, getStats } from "@/lib/conversations.functions";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const list = useServerFn(listConversations);
  const fetchStats = useServerFn(getStats);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: any) => {
      const name =
        data.user?.user_metadata?.display_name || data.user?.email?.split("@")[0] || "there";
      setUserName(name);
    });
  }, []);

  const { data: convs = [] } = useQuery({ queryKey: ["conversations"], queryFn: () => list() });
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => fetchStats() });

  const cards = [
    {
      label: "Conversations",
      value: stats?.conversations ?? 0,
      icon: MessageSquare,
      color: "text-blue-400",
    },
    {
      label: "Tokens in",
      value: stats?.tokensIn.toLocaleString() ?? 0,
      icon: Zap,
      color: "text-amber-400",
    },
    {
      label: "Tokens out",
      value: stats?.tokensOut.toLocaleString() ?? 0,
      icon: Activity,
      color: "text-emerald-400",
    },
    { label: "Memory entries", value: stats?.memory ?? 0, icon: Brain, color: "text-purple-400" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="relative mb-12 overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 to-accent/10 p-8 shadow-glow">
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />
            <span>Welcome back</span>
          </div>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">
            Hi, <span className="text-gradient capitalize">{userName}</span>
          </h1>
          <p className="mt-2 max-w-lg text-muted-foreground">
            AgentFlow AI is ready. Your multi-agent collective has processed{" "}
            {stats?.tokensOut.toLocaleString() ?? 0} tokens of insight today.
          </p>
          <div className="mt-6">
            <Link
              to="/chat"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:scale-[1.02]"
            >
              Start new session
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        {/* Decorative elements */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-20 right-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((s) => (
          <div
            key={s.label}
            className="glass group relative overflow-hidden rounded-2xl p-5 transition-all hover:border-primary/50"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {s.label}
              </span>
              <div className={`rounded-lg bg-secondary p-2 ${s.color}`}>
                <s.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-bold">{s.value}</span>
            </div>
            <div className="absolute -bottom-6 -right-6 h-12 w-12 rounded-full bg-primary/5 transition-transform group-hover:scale-[3]" />
          </div>
        ))}
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Activity</h2>
            <Link to="/chat" className="text-xs font-medium text-primary hover:underline">
              View all chats
            </Link>
          </div>
          <div className="glass overflow-hidden rounded-2xl">
            {convs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 rounded-full bg-secondary p-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-medium text-foreground">No conversations yet</h3>
                <p className="mt-1 text-sm text-muted-foreground text-pretty max-w-xs">
                  Start a chat to see your recent activity here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {convs.slice(0, 5).map((c: any) => (
                  <Link
                    key={c.id}
                    to="/chat/$conversationId"
                    params={{ conversationId: c.id }}
                    className="flex items-center justify-between px-5 py-4 transition hover:bg-white/5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(c.updated_at).toLocaleString()}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div>
            <h2 className="mb-4 text-lg font-semibold">System Status</h2>
            <div className="glass space-y-4 rounded-2xl p-5 border-primary/20">
              <StatusItem label="AI Gateway" status="Operational" />
              <StatusItem label="Supabase DB" status="Operational" />
              <StatusItem label="Embeddings" status="1536-dim" />
              <div className="mt-2 pt-4 border-t border-border">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">
                  Primary Model
                </p>
                <div className="rounded-lg bg-white/5 p-2 text-[11px] font-mono text-primary/80">
                  google/gemini-3-flash-preview
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold">Agent Roster</h2>
            <div className="glass space-y-3 rounded-2xl p-5">
              <AgentItem id="planner" icon="🧭" name="Planner" desc="Orchestration & breakdown" />
              <AgentItem id="research" icon="🔬" name="Research" desc="Web & document synthesis" />
              <AgentItem id="coding" icon="💻" name="Coding" desc="Production-grade development" />
              <AgentItem id="reviewer" icon="🛡️" name="Reviewer" desc="Security & logic audits" />
              <AgentItem id="memory" icon="🧠" name="Memory" desc="Long-term semantic recall" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusItem({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_oklch(0.7_0.2_150)]" />
        {status}
      </span>
    </div>
  );
}

function AgentItem({
  id,
  icon,
  name,
  desc,
}: {
  id: string;
  icon: string;
  name: string;
  desc: string;
}) {
  return (
    <Link
      to="/chat"
      search={{ agent: id }}
      className="flex items-center gap-3 rounded-xl bg-white/5 p-3 transition hover:bg-white/10 hover:scale-[1.01]"
    >
      <div className="text-xl">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{desc}</p>
      </div>
    </Link>
  );
}
