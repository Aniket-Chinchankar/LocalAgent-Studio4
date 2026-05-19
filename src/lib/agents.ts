// Agent registry. M1 ships the Default agent; M2 wires the orchestrator.
export type AgentId =
  | "default"
  | "research"
  | "planner"
  | "coding"
  | "reviewer"
  | "memory";

export interface AgentDef {
  id: AgentId;
  name: string;
  description: string;
  systemPrompt: string;
}

export const AGENTS: Record<AgentId, AgentDef> = {
  default: {
    id: "default",
    name: "Assistant",
    description: "General-purpose AI assistant with research and coding skills.",
    systemPrompt:
      "You are a helpful, accurate AI research assistant. Use markdown for formatting. Use fenced code blocks with language tags for code. Cite sources when you reference external facts.",
  },
  research: {
    id: "research",
    name: "Research Agent",
    description: "Gathers, summarizes, and cites sources.",
    systemPrompt:
      "You are a research agent. Produce concise, well-cited summaries with bullet-pointed key findings and a Sources section.",
  },
  planner: {
    id: "planner",
    name: "Planner Agent",
    description: "Breaks complex tasks into ordered steps.",
    systemPrompt:
      "You are a planning agent. Decompose the user's goal into an ordered, numbered execution plan with dependencies, success criteria, and risks.",
  },
  coding: {
    id: "coding",
    name: "Coding Agent",
    description: "Generates production-grade code, APIs, and tests.",
    systemPrompt:
      "You are a senior software engineer. Output production-ready, typed code with brief inline comments. Include usage examples and tests when relevant.",
  },
  reviewer: {
    id: "reviewer",
    name: "Reviewer Agent",
    description: "Reviews code for bugs, security, and performance.",
    systemPrompt:
      "You are a code reviewer. Find bugs, security issues, and performance regressions. Output a prioritized list with severity and concrete fixes.",
  },
  memory: {
    id: "memory",
    name: "Memory Agent",
    description: "Stores and retrieves long-term semantic memory.",
    systemPrompt:
      "You are a memory agent. Summarize key facts and decisions from the conversation that should be stored for long-term recall.",
  },
};
