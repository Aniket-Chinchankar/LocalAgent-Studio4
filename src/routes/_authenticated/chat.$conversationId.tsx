import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Send, Sparkles, Loader2, Bot, User, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  getConversation,
  renameConversation,
  deleteConversation,
  saveLocalMessage,
  localWebSearch,
} from "@/lib/conversations.functions";
import { Markdown } from "@/components/chat/markdown";
import { AGENTS, type AgentId } from "@/lib/agents";
import { supabase } from "@/integrations/supabase/client";

function loadPuterScript(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).puter) {
      resolve((window as any).puter);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.puter.com/v2/";
    script.onload = () => {
      resolve((window as any).puter);
    };
    script.onerror = (err) => {
      reject(err);
    };
    document.head.appendChild(script);
  });
}

const search = z.object({ agent: z.string().optional() });

export const Route = createFileRoute("/_authenticated/chat/$conversationId")({
  validateSearch: (s) => search.parse(s),
  component: ChatPage,
});

function ChatPage() {
  const { conversationId } = Route.useParams();
  const { agent: initialAgent } = Route.useSearch();
  const qc = useQueryClient();
  const fetchConv = useServerFn(getConversation);
  const rename = useServerFn(renameConversation);
  const saveLocalMsg = useServerFn(saveLocalMessage);
  const webSearchFn = useServerFn(localWebSearch);
  const [agent, setAgent] = useState<AgentId>((initialAgent as AgentId) ?? "orchestrator");
  const [webSearch, setWebSearch] = useState(true);
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);
  const [userSettings, setUserSettings] = useState<{ default_model?: string; api_key?: string }>(
    {},
  );

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_settings")
        .select("default_model, api_key")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setUserSettings(data);
      }
    })();
  }, []);

  const { data, isLoading: isConvLoading } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => fetchConv({ data: { id: conversationId } }),
  });

  const initialMessages: UIMessage[] = useMemo(() => {
    return (data?.messages ?? []).map((m: any) => ({
      id: m.id,
      role: m.role as "user" | "assistant" | "system",
      parts: [{ type: "text", text: m.content }],
    })) as UIMessage[];
  }, [data?.messages]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: async (url, init) => {
          const { data: session } = await supabase.auth.getSession();
          const bodyObj = JSON.parse((init?.body as string) || "{}");
          let selectedModel =
            bodyObj.model || userSettings.default_model || "puter/gemini-3.5-flash";

          // Defensive fallback: if the selected model is not a Puter model,
          // but there is NO valid API key configured in userSettings or locally,
          // force it to use Puter's Gemini 3.5 Flash model instead of throwing an error!
          const hasApiKey =
            userSettings.api_key &&
            userSettings.api_key !== "mock-key" &&
            userSettings.api_key !== "undefined" &&
            userSettings.api_key !== "null" &&
            userSettings.api_key.trim() !== "";

          if (!selectedModel.startsWith("puter/") && !hasApiKey) {
            selectedModel = "puter/gemini-3.5-flash";
          }
          const isPuter = selectedModel.startsWith("puter/");

          if (isPuter) {
            try {
              await loadPuterScript();
              const puter = (window as any).puter;
              if (!puter) {
                throw new Error("Puter SDK failed to load on window");
              }

              const mappedMessages = bodyObj.messages.map((m: any) => ({
                role: m.role,
                content: m.content || m.parts?.map((p: any) => p.text).join("") || "",
              }));

              let systemPrompt = "";
              if (agent === "orchestrator") {
                systemPrompt = 
                  `You are the AgentFlow AI Collective. Since we are running in an optimized single-turn mode, you must act as all of our specialist agents sequentially to solve the user's request:\n\n` +
                  `1. PLANNER: Analyze the request and map out a step-by-step execution plan.\n` +
                  `2. RESEARCHER: Review the real-time search results (if provided below) and extract key facts.\n` +
                  `3. CODER: Write high-quality, production-ready, well-commented code blocks if required.\n` +
                  `4. REVIEWER: Double-check your logic and code, correct any flaws, and refine the final output.\n\n` +
                  `Structure your response with clear, beautiful headings for each phase (e.g., [PLANNING], [RESEARCH], [IMPLEMENTATION], [REVIEW]) so the user can see the collective's collaborative flow in action.`;
              } else {
                const activeAgent = AGENTS[agent] || AGENTS.default;
                systemPrompt = activeAgent.systemPrompt || "";
              }

              if (bodyObj.webSearchContext) {
                systemPrompt += `\n\n${bodyObj.webSearchContext}`;
              }

              if (systemPrompt) {
                mappedMessages.unshift({
                  role: "system",
                  content: systemPrompt,
                });
              }

              // Save user's message to local SQLite
              const lastMsg = bodyObj.messages[bodyObj.messages.length - 1];
              if (lastMsg && lastMsg.role === "user") {
                await saveLocalMsg({
                  data: {
                    conversationId,
                    role: "user",
                    content:
                      lastMsg.content || lastMsg.parts?.map((p: any) => p.text).join("") || "",
                    agent: agent,
                  },
                });
              }

              const puterModel = selectedModel.replace("puter/", "");
              const responseStream = await puter.ai.chat(mappedMessages, {
                model: puterModel,
                stream: true,
                tools: [{ type: "web_search" }],
              });

              let fullAssistantText = "";
              const encoder = new TextEncoder();
              const stream = new ReadableStream({
                async start(controller) {
                  try {
                    for await (const part of responseStream) {
                      if (part?.text) {
                        fullAssistantText += part.text;
                        const chunk = `0:${JSON.stringify(part.text)}\n`;
                        controller.enqueue(encoder.encode(chunk));
                      }
                    }

                    if (fullAssistantText) {
                      await saveLocalMsg({
                        data: {
                          conversationId,
                          role: "assistant",
                          content: fullAssistantText,
                          agent: agent,
                        },
                      });
                    }

                    controller.close();
                  } catch (streamErr: any) {
                    controller.error(streamErr);
                  }
                },
              });

              return new Response(stream, {
                headers: {
                  "Content-Type": "text/event-stream; charset=utf-8",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                },
              });
            } catch (err: any) {
              console.error("Puter.js streaming error:", err);
              throw err;
            }
          }

          const headers = new Headers(init?.headers);
          if (session.session?.access_token) {
            headers.set("Authorization", `Bearer ${session.session.access_token}`);
          }
          return fetch(url, { ...init, headers });
        },
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            messages,
            conversationId,
            agent,
            model: userSettings.default_model || "puter/gemini-3.5-flash",
            ...body,
          },
        }),
      }),
    [conversationId, agent, userSettings.default_model],
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: conversationId,
    transport,
    onError: (e) => toast.error(e.message),
    onFinish: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["token_usage"] });
      qc.invalidateQueries({ queryKey: ["agent_runs"] });
    },
  });

  useEffect(() => {
    if (initialMessages.length && messages.length === 0) setMessages(initialMessages);
  }, [initialMessages, messages.length, setMessages]);

  const [input, setInput] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, status]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [conversationId, status]);

  const isLoading = status === "submitted" || status === "streaming";

  const submit = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    if (messages.length === 0 && data?.conversation?.title === "New Conversation") {
      const title = text.slice(0, 60);
      rename({ data: { id: conversationId, title } })
        .then(() => {
          qc.invalidateQueries({ queryKey: ["conversations"] });
        })
        .catch(() => {});
    }

    let searchContext = "";
    if (webSearch) {
      setIsSearchingWeb(true);
      try {
        const searchRes = await webSearchFn({ data: { query: text } });
        if (searchRes && Array.isArray(searchRes.results) && searchRes.results.length > 0) {
          searchContext = `\n\n[Real-Time Internet Search Results]\n` + 
            searchRes.results.map((r: any) => `* Source: ${r.title}\n  URL: ${r.url}\n  Excerpt: ${r.snippet}`).join("\n\n");
        }
      } catch (err) {
        console.error("Web search failed:", err);
      } finally {
        setIsSearchingWeb(false);
      }
    }

    await (sendMessage as any)({ 
      text,
      body: {
        webSearchContext: searchContext,
      }
    });
  };

  return (
    <div className="flex h-full flex-col bg-background/50">
      <header className="flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-xl px-6 py-3">
        <div className="min-w-0 flex items-center gap-3">
          <div className="hidden sm:grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h1 className="truncate text-sm font-semibold">
              {data?.conversation?.title ?? "Untitled Session"}
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                Agent: <span className="text-primary">{AGENTS[agent].name}</span>
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-white/5 p-1 border border-border">
            <button
              onClick={() => setAgent("orchestrator")}
              className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition ${
                agent === "orchestrator"
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Orchestrator
            </button>
            <button
              onClick={() => agent === "orchestrator" && setAgent("research")}
              className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition ${
                agent !== "orchestrator"
                  ? "bg-accent text-accent-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Direct Chat
            </button>
          </div>

          {agent !== "orchestrator" && (
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value as AgentId)}
              className="rounded-lg border border-border bg-white/5 px-3 py-1.5 text-xs font-medium outline-none focus:border-primary/50 transition cursor-pointer"
            >
              {Object.values(AGENTS)
                .filter((a) => a.id !== "orchestrator")
                .map((a) => (
                  <option key={a.id} value={a.id} className="bg-background text-foreground">
                    {a.name}
                  </option>
                ))}
            </select>
          )}
        </div>
      </header>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto scroll-smooth scrollbar-hide">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          {messages.length === 0 && !isLoading && !isConvLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-500">
              <div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow animate-glow">
                <Sparkles className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">How can I assist you?</h2>
              <p className="mt-3 max-w-md text-sm text-muted-foreground leading-relaxed">
                AgentFlow AI is ready. I can plan projects, research topics, write code, or review your
                work using our specialist agent collective.
              </p>
              <div className="mt-8 grid grid-cols-2 gap-3 max-w-lg">
                <SuggestionCard
                  text="Plan a React app architecture"
                  onClick={() => setInput("Plan a React app architecture")}
                />
                <SuggestionCard
                  text="Research latest AI trends in 2024"
                  onClick={() => setInput("Research latest AI trends in 2024")}
                />
              </div>
            </div>
          )}

          <div className="space-y-8 pb-10">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {isSearchingWeb && (
              <div className="flex items-start gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="glass rounded-2xl px-5 py-3 text-sm text-muted-foreground flex items-center gap-2">
                  <span className="animate-pulse">Searching the web in real-time…</span>
                </div>
              </div>
            )}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && !isSearchingWeb && (
              <div className="flex items-start gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="glass rounded-2xl px-5 py-3 text-sm text-muted-foreground">
                  <span className="animate-pulse">Thinking…</span>
                </div>
              </div>
            )}
            {error && (
              <div className="mx-auto max-w-md rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-center">
                <p className="text-sm text-destructive">{error.message}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="relative glass-card flex items-end gap-2 rounded-2xl p-2 shadow-xl focus-within:border-primary/50 transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Message AgentFlow AI..."
              rows={1}
              className="max-h-60 flex-1 resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground scrollbar-hide"
            />
            <button
              onClick={submit}
              disabled={!input.trim() || isLoading}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow transition hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
              aria-label="Send"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
              <span>Orchestration: Enabled</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>RAG context: Dynamic</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>Memory: Active</span>
            </div>
            <button
              onClick={() => setWebSearch(!webSearch)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest border transition ${
                webSearch
                  ? "bg-primary/10 text-primary border-primary/25 shadow-glow-sm"
                  : "bg-white/5 text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              <Search className="h-3 w-3" />
              <span>Web Search: {webSearch ? "ON" : "OFF"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuggestionCard({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-border bg-white/5 px-4 py-3 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground transition text-left"
    >
      {text}
    </button>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const text = message.parts
    .map((p) => (p.type === "text" ? (p as { text: string }).text : ""))
    .join("");
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-4 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isUser ? "bg-white/10 text-foreground" : "bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow"}`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>
      <div
        className={`group relative flex-1 max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${isUser ? "bg-primary text-primary-foreground shadow-glow" : "glass border-white/5"}`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <Markdown content={text || "…"} />
        )}

        <div
          className={`absolute top-0 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? "-left-10" : "-right-10"}`}
        >
          {/* Add copy or other actions here */}
        </div>
      </div>
    </div>
  );
}
