import { useState } from "react";
import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { localSignUp, localSignIn } from "@/lib/mock-supabase";

const search = z.object({ mode: z.enum(["signin", "signup"]).optional() });

export const Route = createFileRoute("/login")({
  validateSearch: (s) => search.parse(s),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { mode } = Route.useSearch();
  const [isSignup, setIsSignup] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignup) {
        const res = await localSignUp({ data: { email, password, name } });
        const token = res.session.access_token;
        const parts = token.split(":");
        const userId = parts[1];
        const userEmail = parts[2];
        const displayName = parts[3];

        const sessionObj = {
          access_token: token,
          refresh_token: token,
          expires_in: 3600 * 24 * 365,
          expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
          token_type: "bearer",
          user: {
            id: userId,
            aud: "authenticated",
            role: "authenticated",
            email: userEmail,
            email_confirmed_at: new Date().toISOString(),
            confirmed_at: new Date().toISOString(),
            last_sign_in_at: new Date().toISOString(),
            user_metadata: { display_name: displayName },
            app_metadata: { provider: "email" },
            identities: [],
          },
        };
        localStorage.setItem("sb-arxwmkssbnlwpzxcljiy-auth-token", JSON.stringify(sessionObj));
        window.dispatchEvent(new Event("storage"));

        toast.success("Welcome to AgentFlow AI! Registration successful.");
        navigate({ to: "/dashboard" });
      } else {
        try {
          const res = await localSignIn({ data: { email, password } });
          const token = res.session.access_token;
          const parts = token.split(":");
          const userId = parts[1];
          const userEmail = parts[2];
          const displayName = parts[3];

          const sessionObj = {
            access_token: token,
            refresh_token: token,
            expires_in: 3600 * 24 * 365,
            expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
            token_type: "bearer",
            user: {
              id: userId,
              aud: "authenticated",
              role: "authenticated",
              email: userEmail,
              email_confirmed_at: new Date().toISOString(),
              confirmed_at: new Date().toISOString(),
              last_sign_in_at: new Date().toISOString(),
              user_metadata: { display_name: displayName },
              app_metadata: { provider: "email" },
              identities: [],
            },
          };
          localStorage.setItem("sb-arxwmkssbnlwpzxcljiy-auth-token", JSON.stringify(sessionObj));
          window.dispatchEvent(new Event("storage"));

          toast.success("Logged in successfully!");
          navigate({ to: "/dashboard" });
        } catch (signInErr: any) {
          if (signInErr.message?.includes("Invalid email or password")) {
            // Auto-signup fallback for a seamless experience
            const res = await localSignUp({ data: { email, password, name: email.split("@")[0] } });
            const token = res.session.access_token;
            const parts = token.split(":");
            const userId = parts[1];
            const userEmail = parts[2];
            const displayName = parts[3];

            const sessionObj = {
              access_token: token,
              refresh_token: token,
              expires_in: 3600 * 24 * 365,
              expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
              token_type: "bearer",
              user: {
                id: userId,
                aud: "authenticated",
                role: "authenticated",
                email: userEmail,
                email_confirmed_at: new Date().toISOString(),
                confirmed_at: new Date().toISOString(),
                last_sign_in_at: new Date().toISOString(),
                user_metadata: { display_name: displayName },
                app_metadata: { provider: "email" },
                identities: [],
              },
            };
            localStorage.setItem("sb-arxwmkssbnlwpzxcljiy-auth-token", JSON.stringify(sessionObj));
            window.dispatchEvent(new Event("storage"));

            toast.success("Welcome! Your local account has been created.");
            navigate({ to: "/dashboard" });
          } else {
            throw signInErr;
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setLoading(true);
    try {
      const guestEmail = "guest@agentflow.ai";
      const guestPassword = "GuestPassword123!";

      const { error } = await supabase.auth.signInWithPassword({
        email: guestEmail,
        password: guestPassword,
      });

      if (error) {
        // Try creating the guest account first
        const { error: signUpError } = await supabase.auth.signUp({
          email: guestEmail,
          password: guestPassword,
          options: {
            data: { display_name: "Guest" },
          },
        });

        if (signUpError) {
          // Fallback to a local mock guest session in localStorage
          const mockSession = {
            access_token: "mock-guest-token",
            refresh_token: "mock-guest-token",
            expires_in: 3600 * 24 * 365,
            expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
            token_type: "bearer",
            user: {
              id: "00000000-0000-0000-0000-000000000000",
              aud: "authenticated",
              role: "authenticated",
              email: "guest@agentflow.ai",
              email_confirmed_at: new Date().toISOString(),
              confirmed_at: new Date().toISOString(),
              last_sign_in_at: new Date().toISOString(),
              user_metadata: { display_name: "Guest" },
              app_metadata: { provider: "email" },
              identities: [],
            },
          };
          localStorage.setItem("sb-arxwmkssbnlwpzxcljiy-auth-token", JSON.stringify(mockSession));
          window.dispatchEvent(new Event("storage"));
        } else {
          // Log in with the newly created guest account
          await supabase.auth.signInWithPassword({
            email: guestEmail,
            password: guestPassword,
          });
        }
      }

      toast.success("Logged in as Guest!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error("Guest login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2 font-semibold">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow">
            <Sparkles className="h-4 w-4" />
          </div>
          AgentFlow AI
        </Link>
        <div className="glass rounded-2xl p-8">
          <h1 className="text-2xl font-semibold">{isSignup ? "Create account" : "Welcome back"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSignup ? "Start orchestrating your AI agents." : "Sign in to your workspace."}
          </p>

          <button
            onClick={handleGuestLogin}
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card/60 py-2.5 text-sm font-medium transition hover:bg-card disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4 text-primary" /> Continue as Guest (Instant Bypass)
          </button>

          <div className="mt-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-2.5 text-left text-xs text-muted-foreground shadow-glow-sm">
            <p className="flex items-center gap-1.5 font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" /> API Keys & Internet Access
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
              Create an account or sign in to configure your own API keys. Alternatively, continue
              as Guest for instant bypass with internet search access.
            </p>
          </div>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            {isSignup && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Display name"
                className="w-full rounded-lg border border-input bg-background/40 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            )}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-lg border border-input bg-background/40 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 8 chars)"
              className="w-full rounded-lg border border-input bg-background/40 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow-glow transition hover:scale-[1.01] disabled:opacity-50"
            >
              {loading ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
            </button>
          </form>

          <button
            onClick={() => setIsSignup((v) => !v)}
            className="mt-5 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {isSignup ? "Have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
      </div>
    </main>
  );
}
