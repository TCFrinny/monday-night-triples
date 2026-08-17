import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { PageShell } from "@/components/page-shell";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_LEAGUE_NAME } from "@/lib/branding";


export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: `Admin — ${DEFAULT_LEAGUE_NAME}` },
      {
        name: "description",
        content: `League administration for ${DEFAULT_LEAGUE_NAME}: season setup, rosters, schedule and score entry.`,
      },
      { property: "og:title", content: `Admin — ${DEFAULT_LEAGUE_NAME}` },
      { property: "og:description", content: "Season setup, rosters, schedule and duckpin score entry." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

const TABS: { to: "/admin" | "/admin/teams" | "/admin/schedule" | "/admin/entry"; label: string; exact?: boolean }[] = [
  { to: "/admin", label: "Overview", exact: true },
  { to: "/admin/teams", label: "Teams & Bowlers" },
  { to: "/admin/schedule", label: "Schedule" },
  { to: "/admin/entry", label: "Score Entry" },
];

function AdminLayout() {
  const { user, isAdmin, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (loading) {
    return (
      <PageShell eyebrow="Restricted" title="Admin">
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </PageShell>
    );
  }

  if (!user) return <AuthScreen />;

  if (!isAdmin) {
    return (
      <PageShell eyebrow="Restricted" title="Admin">
        <div className="panel max-w-lg space-y-4 p-6">
          <p className="text-sm text-muted-foreground">
            Signed in as {user.email}, but this account does not have the league administrator role.
            Ask an existing administrator to grant access.
          </p>
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>
            Sign out
          </Button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="League administration" title="Admin">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={
                active
                  ? "rounded-md border border-gold/60 bg-gold/10 px-3 py-1.5 font-display text-xs uppercase tracking-[0.14em] text-gold"
                  : "rounded-md border border-border px-3 py-1.5 font-display text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
              }
            >
              {t.label}
            </Link>
          );
        })}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => supabase.auth.signOut()}>
          Sign out
        </Button>
      </div>
      <Outlet />
    </PageShell>
  );
}

function AuthScreen() {
  return (
    <PageShell eyebrow="Restricted" title="Admin sign in">
      <div className="max-w-sm space-y-4">
        <SignInForm />
      </div>
    </PageShell>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) setError(error.message);
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="panel space-y-4 p-6">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          maxLength={255}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          required
          maxLength={200}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Administrator accounts are created by the league secretary. Public pages need no sign in.
      </p>
    </form>
  );
}

