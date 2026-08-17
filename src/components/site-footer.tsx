import { useLeagueName } from "@/hooks/use-league-name";

export function SiteFooter() {
  const leagueName = useLeagueName();
  return (
    <footer className="mt-20 border-t border-border/70 bg-card/40">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="font-display uppercase tracking-[0.18em] text-foreground">
          {leagueName}
        </p>
        <p>Duckpin triples league &middot; AMF Dundalk, Maryland</p>
      </div>
    </footer>
  );
}
