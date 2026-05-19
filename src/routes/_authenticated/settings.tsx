import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [model, setModel] = useState("google/gemini-3-flash-preview");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      if (prof?.display_name) setName(prof.display_name);
      const { data: s } = await supabase.from("user_settings").select("default_model").eq("user_id", user.id).maybeSingle();
      if (s?.default_model) setModel(s.default_model);
    })();
  }, []);

  const save = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [p, s] = await Promise.all([
      supabase.from("profiles").upsert({ id: user.id, display_name: name }),
      supabase.from("user_settings").upsert({ user_id: user.id, default_model: model }),
    ]);
    setLoading(false);
    if (p.error || s.error) toast.error("Failed to save");
    else toast.success("Saved");
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="glass mt-6 space-y-4 rounded-xl p-6">
        <Field label="Email"><input disabled value={email} className="input opacity-60" /></Field>
        <Field label="Display name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </Field>
        <Field label="Default model">
          <select value={model} onChange={(e) => setModel(e.target.value)} className="input">
            <option value="google/gemini-3-flash-preview">Gemini 3 Flash (fast)</option>
            <option value="google/gemini-2.5-pro">Gemini 2.5 Pro (reasoning)</option>
            <option value="openai/gpt-5">GPT-5</option>
            <option value="openai/gpt-5-mini">GPT-5 mini</option>
          </select>
        </Field>
        <button onClick={save} disabled={loading} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow disabled:opacity-50">
          {loading ? "Saving…" : "Save"}
        </button>
      </div>
      <style>{`.input{width:100%;border:1px solid var(--input);background:color-mix(in oklab,var(--background) 60%,transparent);padding:0.5rem 0.75rem;border-radius:0.5rem;font-size:0.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px var(--ring)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
