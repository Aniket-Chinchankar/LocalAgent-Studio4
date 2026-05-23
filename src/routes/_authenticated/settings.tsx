import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Settings, User, Cpu, Shield, Save, Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [model, setModel] = useState("puter/gemini-3.5-flash");
  const [apiKey, setApiKey] = useState("");
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const isGoogle =
        user.app_metadata?.provider === "google" ||
        user.identities?.some((id: any) => id.provider === "google") ||
        (user.email ?? "").endsWith("@gmail.com") ||
        (user.email ?? "").endsWith("@paruluniversity.ac.in");
      setIsGoogleUser(isGoogle);
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      if (prof?.display_name) setName(prof.display_name);
      const { data: s, error: sErr } = await supabase
        .from("user_settings")
        .select("default_model, api_key")
        .eq("user_id", user.id)
        .maybeSingle();
      if (sErr) {
        console.error("Fetch settings failed:", sErr);
        // If column is missing, it's a migration issue
        if (sErr.message.includes('column "api_key" does not exist')) {
          toast.error("System update in progress. Please refresh in a moment.");
        }
      }
      if (s?.default_model) setModel(s.default_model);
      if (s?.api_key) setApiKey(s.api_key);
      setInitialLoading(false);
    })();
  }, []);

  const save = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const [p, s] = await Promise.all([
      supabase.from("profiles").upsert({ id: user.id, display_name: name }, { onConflict: "id" }),
      supabase
        .from("user_settings")
        .upsert(
          { user_id: user.id, default_model: model, api_key: apiKey },
          { onConflict: "user_id" },
        ),
    ]);
    setLoading(false);
    if (p.error || s.error) {
      const msg = p.error?.message || s.error?.message || "Failed to save changes";
      toast.error(msg);
      console.error("Save failed:", { pError: p.error, sError: s.error });
    } else {
      toast.success("Settings updated");
    }
  };

  if (initialLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your account and AI preferences.</p>
        </div>
      </div>

      <div className="space-y-6">
        <section className="glass overflow-hidden rounded-2xl">
          <div className="flex items-center gap-2 border-b border-border bg-white/5 px-6 py-4">
            <User className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Profile</h2>
          </div>
          <div className="p-6 space-y-4">
            <Field label="Email Address">
              <input disabled value={email} className="input opacity-60 cursor-not-allowed" />
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Your account email cannot be changed here.
              </p>
            </Field>
            <Field label="Display Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="How should we call you?"
              />
            </Field>
          </div>
        </section>

        <section className="glass overflow-hidden rounded-2xl">
          <div className="flex items-center gap-2 border-b border-border bg-white/5 px-6 py-4">
            <Cpu className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">AI Preferences</h2>
          </div>
          <div className="p-6 space-y-6">
            <Field label="Default Model">
              <select value={model} onChange={(e) => setModel(e.target.value)} className="input">
                <optgroup label="Puter.js (Free & Unlimited - No API Key Required)">
                  <option value="puter/gemini-3.5-flash">
                    Puter Gemini 3.5 Flash (Fastest & Free)
                  </option>
                  <option value="puter/gemini-3.1-pro-preview">
                    Puter Gemini 3.1 Pro (Deep Reasoning & Free)
                  </option>
                  <option value="puter/gemini-3.1-flash-lite">
                    Puter Gemini 3.1 Flash Lite (Lightweight & Free)
                  </option>
                </optgroup>
                <optgroup label="Google (High Reliability)">
                  <option value="google/gemini-3-flash-preview">
                    Gemini 3 Flash (Fastest & Balanced)
                  </option>
                  <option value="google/gemini-2.5-pro">Gemini 2.5 Pro (Deep Reasoning)</option>
                </optgroup>
                <optgroup label="Anthropic (Coding & Logic)">
                  <option value="anthropic/claude-3-5-sonnet-20240620">
                    Claude 3.5 Sonnet (Best for Coding)
                  </option>
                  <option value="anthropic/claude-3-opus">Claude 3 Opus (Creative Writing)</option>
                  <option value="anthropic/claude-3-haiku">Claude 3 Haiku (Cost Effective)</option>
                </optgroup>
                <optgroup label="OpenAI (Advanced Productivity)">
                  <option value="openai/gpt-4o">GPT-4o (Most Intelligent)</option>
                  <option value="openai/gpt-4o-mini">GPT-4o mini (Daily Tasks)</option>
                </optgroup>
                <optgroup label="Meta (Open Source Power)">
                  <option value="meta/llama-3.1-405b-instruct">
                    Llama 3.1 405B (State-of-the-art Open Source)
                  </option>
                  <option value="meta/llama-3.1-70b-instruct">
                    Llama 3.1 70B (Great All-rounder)
                  </option>
                  <option value="meta/llama-3.1-8b-instruct">Llama 3.1 8B (Super Fast)</option>
                </optgroup>
                <optgroup label="Mistral & European AI">
                  <option value="mistral/mistral-large-2407">
                    Mistral Large 2 (Multilingual Mastery)
                  </option>
                  <option value="mistral/pixtral-12b-2409">Pixtral 12B (Vision & Text)</option>
                  <option value="mistral/codestral-2405">Codestral (Python & FIM focus)</option>
                </optgroup>
                <optgroup label="Specialized Models">
                  <option value="perplexity/llama-3.1-sonar-large-128k-online">
                    Perplexity Online (Real-time Search)
                  </option>
                  <option value="perplexity/llama-3.1-sonar-huge-128k-online">
                    Perplexity Pro (Expert Search)
                  </option>
                  <option value="deepseek/deepseek-chat">DeepSeek Chat (Efficient & Smart)</option>
                  <option value="deepseek/deepseek-coder">
                    DeepSeek Coder (Advanced Programming)
                  </option>
                </optgroup>
              </select>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                This model will be used for new conversations unless changed.
              </p>
            </Field>

            <Field label="Default Model API Key">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="input"
                placeholder="Enter key for default model..."
              />
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Powers your <strong>Default Model</strong> and all <strong>Specialist Agents</strong>. Supports Lovable LIG, Anthropic, Google Gemini (starts with AIzaSy), and OpenAI keys.
              </p>

              {isGoogleUser ? (
                <div className="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-4 shadow-glow-sm">
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-xs font-semibold">Google/Gmail Login Active</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
                    You are signed in with a Google/Gmail account. Free Gemini API access is **active** across all agents. You don't need a personal API key unless you want to override it.
                  </p>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-border bg-white/5 p-4">
                  <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                    💡 <strong>Tip:</strong> Enter your API key above to enable model access and internet search features across your workspace.
                  </p>
                </div>
              )}
            </Field>
          </div>
        </section>

        <div className="flex justify-end pt-2">
          <button
            onClick={save}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:scale-[1.02] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </div>
      </div>

      <style>{`
        .input {
          width: 100%;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.9);
          color: #000000;
          font-weight: 500;
          padding: 0.625rem 0.875rem;
          border-radius: 0.75rem;
          font-size: 0.875rem;
          outline: none;
          transition: all 0.2s;
        }
        .input option {
          background-color: white;
          color: black;
        }
        .input:focus {
          background: #ffffff;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 30%, transparent);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
