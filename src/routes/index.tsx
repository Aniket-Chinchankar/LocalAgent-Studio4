import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Sparkles, Brain, Search, Code2, ShieldCheck, Network } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

const features = [
  {
    icon: Network,
    title: "Multi-Agent Orchestration",
    body: "Planner, Research, Coding, Reviewer, and Memory agents coordinate on every task.",
  },
  {
    icon: Brain,
    title: "Semantic Memory (RAG)",
    body: "pgvector-backed long-term memory with embedding caching and metadata filtering.",
  },
  {
    icon: Search,
    title: "Tool Calling",
    body: "Agents invoke web search, PDF parsing, and semantic retrieval autonomously.",
  },
  {
    icon: Code2,
    title: "Production Code Output",
    body: "Generate typed APIs, components, and tests with reviewer-grade quality checks.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by Default",
    body: "JWT auth, RLS on every table, prompt-injection guards, and session isolation.",
  },
  {
    icon: Sparkles,
    title: "Token Saver Mode",
    body: "Switch between high-power multi-agent orchestration and ultra-efficient direct chat.",
  },
];

function Landing() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-semibold">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow">
            <Sparkles className="h-4 w-4" />
          </div>
          <span>AgentFlow AI</span>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link
            to="/login"
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            to="/login"
            search={{ mode: "signup" }}
            className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground shadow-glow"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 pt-16 pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          Multi-agent · RAG · Streaming
        </div>
        <h1 className="mt-6 text-balance text-5xl font-bold tracking-tight sm:text-6xl">
          Your <span className="text-gradient">autonomous research</span> team, in one chat.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
          AgentFlow AI coordinates specialized AI agents (Claude 3.5, Gemini 3, GPT-4o) to plan, research,
          code, and review — with semantic memory and citation-grade answers.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Link
            to="/login"
            search={{ mode: "signup" }}
            className="rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground shadow-glow transition hover:scale-[1.02]"
          >
            Start free
          </Link>
          <Link
            to="/login"
            className="rounded-lg border border-border bg-card/40 px-5 py-3 font-medium backdrop-blur transition hover:bg-card"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="glass rounded-2xl p-6">
            <f.icon className="h-6 w-6 text-primary" />
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
