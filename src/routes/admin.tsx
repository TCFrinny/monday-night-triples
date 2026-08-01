import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { PageShell } from "@/components/page-shell";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Monday Night Triples" },
      {
        name: "description",
        content: "League administration for Monday Night Triples: season setup, rosters, schedule and score entry.",
      },
      { property: "og:title", content: "Admin — Monday Night Triples" },
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

const adminExistsQuery = {
  queryKey: ["admin-exists"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_exists");
    if (error) throw new Error(error.message);
    return Boolean(data);
  },
  staleTime: 30_000,
};

function AdminLayout() {
  const { user, isAdmin, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: adminExists, isLoading: checkingBootstrap } = useQuery(adminExistsQuery);

  if (loading || checkingBootstrap) {
    return (
      <PageShell eyebrow="Restricted" title="Admin">
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </PageShell>
    );
  }

  if (!user) return <AuthScreen canBootstrap={adminExists === false} />;

  if (!isAdmin) {
    return (
      <PageShell eyebrow="Restricted" title="Admin">
        <div className="panel max-w-lg space-y-4 p-6">
          {adminExists === false ? (
            <>
              <p className="text-sm text-muted-foreground">
                Signed in as {user.email}. No league administrator exists yet — claim the first
                administrator account for this league.
              </p>
              <ClaimAdminButton />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Signed in as {user.email}, but this account does not have the league administrator role.
            </p>
          )}
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

function ClaimAdminButton() {
  const qc = useQueryClient();
  const claim = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("bootstrap_first_admin");
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await qc.invalidateQueries();
      window.location.reload();
    },
  });

  return (
    <div className="space-y-2">
      <Button onClick={() => claim.mutate()} disabled={claim.isPending}>
        {claim.isPending ? "Granting access…" : "Grant me administrator access"}
      </Button>
      {claim.error && <p className="text-sm text-destructive">{(claim.error as Error).message}</p>}
    </div>
  );
}

function AuthScreen({ canBootstrap }: { canBootstrap: boolean }) {
  const [mode, setMode] = useState<"signin" | "bootstrap">("signin");
  const active = canBootstrap ? mode : "signin";

  return (
    <PageShell
      eyebrow="Restricted"
      title={active === "bootstrap" ? "Create first admin" : "Admin sign in"}
    >
      <div className="max-w-sm space-y-4">
        {canBootstrap && (
          <div className="flex gap-2">
            {(
              [
                ["signin", "Sign in"],
                ["bootstrap", "Create first admin"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={
                  active === key
                    ? "rounded-md border border-gold/60 bg-gold/10 px-3 py-1.5 font-display text-xs uppercase tracking-[0.14em] text-gold"
                    : "rounded-md border border-border px-3 py-1.5 font-display text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {active === "bootstrap" ? <BootstrapForm /> : <SignInForm />}
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

function BootstrapForm() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const mail = email.trim();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: mail,
      password,
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }

    if (!data.session) {
      setBusy(false);
      setNotice(
        "Account created. Check your inbox and confirm your email address, then return here and sign in — the administrator role is granted on your first sign in.",
      );
      return;
    }

    const { error: rpcError } = await supabase.rpc("bootstrap_first_admin");
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await qc.invalidateQueries();
    window.location.reload();
  };

  return (
    <form onSubmit={submit} className="panel space-y-4 p-6">
      <p className="text-xs text-muted-foreground">
        No administrator exists yet. Create your own account below — this option disappears once the
        first administrator is set up.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="bs-email">Email</Label>
        <Input
          id="bs-email"
          type="email"
          required
          maxLength={255}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bs-password">Password</Label>
        <Input
          id="bs-password"
          type="password"
          required
          minLength={8}
          maxLength={200}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bs-confirm">Confirm password</Label>
        <Input
          id="bs-confirm"
          type="password"
          required
          minLength={8}
          maxLength={200}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-gold">{notice}</p>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Creating…" : "Create first admin"}
      </Button>
    </form>
  );
}

