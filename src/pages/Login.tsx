import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

export default function Login() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Sign in · Vapi RevRec";
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  if (session) return <Navigate to="/" replace />;

  function validateVapi(em: string) {
    return em.trim().toLowerCase().endsWith("@vapi.ai");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validateVapi(email)) {
      setError("Only @vapi.ai email addresses can sign in.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Account created. You're signed in.");
        navigate("/");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    if (email && !validateVapi(email)) {
      setError("Only @vapi.ai accounts. Set the email field if you want to enforce account selection.");
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: { hd: "vapi.ai", prompt: "select_account" },
      },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Vapi RevRec</h1>
          <p className="text-sm text-muted-foreground mt-1">Internal revenue recognition tool</p>
        </div>
        <div className="bg-background border border-border rounded-md p-5 space-y-4">
          <Button onClick={onGoogle} variant="outline" className="w-full h-9 text-sm" disabled={busy}>
            Continue with Google (vapi.ai)
          </Button>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wider">
            <div className="flex-1 h-px bg-border" />
            <span>or</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@vapi.ai"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                minLength={8}
                className="h-9"
              />
            </div>
            {error ? (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={busy} className="w-full h-9 text-sm">
              {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
            <button
              type="button"
              className="w-full text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
            >
              {mode === "signin" ? "Need to create an account?" : "Already have an account? Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
