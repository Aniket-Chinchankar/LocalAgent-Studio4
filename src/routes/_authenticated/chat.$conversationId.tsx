import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Send, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getConversation, renameConversation } from "@/lib/conversations.functions";
import { Markdown } from "@/components/chat/markdown";
import { AGENTS, type AgentId } from "@/lib/agents";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/chat/$conversationId")({
  component: ChatPage,
});

function ChatPage() {
  const { conversationId } = Route.useParams();
  const qc = useQueryClient();
  const fetchConv = useServerFn(getConversation);
  const rename = useServerFn(renameConversation);
  const [agent, setAgent] = useState<AgentId>("orchestrator");

  const { data } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => fetchConv({ data: { id: conversationId } }),
  });

  const initialMessages: UIMessage[] = useMemo(() => {
    return (data?.messages ?? []).map((m) => ({
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
          const headers = new Headers(init?.headers);
          if (session.session?.access_token) {
            headers.set("Authorization", `Bearer ${session.session.access_token}`);
          }
          return fetch(url, { ...init, headers });
        },
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: { messages, conversationId, agent, ...body },
        }),
      }),
    [conversationId, agent],
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: conversationId,
    transport,
    onError: (e) => toast.error(e.message),
    onFinish: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["token_usage"] });
    },
  });

  useEffect(() => {
    if (initialMessages.length && messages.length === 0) setMessages(initialMessages);
  }, [initialMessages, messages.length, setMessages]);

  const [input, setInput] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => { inputRef.current?.focus(); }, [conversationId, status]);

  const isLoading = status === "submitted" || status === "streaming";

  const submit = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    // Auto-title from first message
    if (messages.length === 0 && data?.conversation?.title === "New Conversation") {
      const title = text.slice(0, 60);
      rename({ data: { id: conversationId, title } }).then(() => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      }).catch(() => {});
    }
    await sendMessage({ text });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium">{data?.conversation?.title ?? "Chat"}</h1>
          <p className="text-xs text-muted-foreground">Agent: {AGENTS[agent].name}</p>
        </div>
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value as AgentId)}
          className="rounded-md border border-input bg-card/60 px-2 py-1 text-xs outline-none"
        >
          {Object.values(AGENTS).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </header>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {messages.length === 0 && !isLoading && (
            <div className="grid place-items-center py-16 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow">
                <Sparkles className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-xl font-semibold">How can I help you today?</h2>
              <p className="mt-2 text-sm text-muted-foreground">Ask anything. Switch agents from the top-right.</p>
            </div>
          )}
          <div className="space-y-6">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error.message}</p>}
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-background/60 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="glass flex items-end gap-2 rounded-2xl p-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
              placeholder="Message Nebula…"
              rows={1}
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={submit}
              disabled={!input.trim() || isLoading}
              className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow transition disabled:opacity-40"
              aria-label="Send"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Streaming via Lovable AI Gateway · {AGENTS[agent].description}
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const text = message.parts
    .map((p) => (p.type === "text" ? (p as { text: string }).text : ""))
    .join("");
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-primary to-accent text-primary-foreground">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      )}
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${isUser ? "bg-primary text-primary-foreground" : "glass"}`}>
        {isUser ? <p className="whitespace-pre-wrap">{text}</p> : <Markdown content={text || "…"} />}
      </div>
    </div>
  );
}
