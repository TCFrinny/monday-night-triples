import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X, Lock } from "lucide-react";
import { useLeagueName } from "@/hooks/use-league-name";

export const navItems = [
  { to: "/", label: "Home" },
  { to: "/standings", label: "Standings" },
  { to: "/schedule", label: "Schedule" },
  { to: "/results", label: "Results" },
  { to: "/teams", label: "Teams" },
  { to: "/bowlers", label: "Bowlers" },
  { to: "/stats", label: "Stats" },
  { to: "/lane-data", label: "Lane Data" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const leagueName = useLeagueName();

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary font-display text-lg font-bold text-primary-foreground">
            3
          </span>
          <span className="leading-tight">
            <span className="block font-display text-lg font-semibold uppercase tracking-wide text-foreground">
              {leagueName}
            </span>
            <span className="block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              AMF Dundalk
            </span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              activeProps={{ className: "bg-accent text-accent-foreground" }}
              inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
              className="rounded-md px-3 py-2 font-display text-sm font-medium uppercase tracking-wide transition-colors hover:bg-accent/60"
            >
              {item.label}
            </Link>
          ))}
          <Link
            to="/admin"
            className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-gold/50 px-3 py-2 font-display text-sm font-medium uppercase tracking-wide text-gold transition-colors hover:bg-gold/10"
          >
            <Lock className="h-3.5 w-3.5" />
            Admin
          </Link>
        </nav>

        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-md border border-border p-2 text-foreground lg:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-border bg-card px-4 py-3 lg:hidden">
          <div className="grid gap-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                onClick={() => setOpen(false)}
                activeProps={{ className: "bg-accent text-accent-foreground" }}
                className="rounded-md px-3 py-2 font-display text-base uppercase tracking-wide text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/admin"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 font-display text-base uppercase tracking-wide text-gold"
            >
              Admin
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
