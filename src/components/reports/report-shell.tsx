import { Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { resolveLeagueName, type BrandingSource } from "@/lib/branding";

export function ReportShell({
  season,
  title,
  latestWeek,
  backTo,
  orientation,
  children,
}: {
  season?: (BrandingSource & { season_name?: string | null }) | null;
  title: string;
  latestWeek: number;
  backTo: "/standings" | "/stats";
  orientation: "landscape" | "portrait";
  children: ReactNode;
}) {
  const leagueName = resolveLeagueName(season);
  return (
    <div className={`print-report print-report-${orientation}`}>
      <div className="print-toolbar">
        <Button variant="outline" size="sm" asChild>
          <Link to={backTo}><ArrowLeft /> Back</Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}><Printer /> Print / Save PDF</Button>
      </div>
      <header className="print-report-header">
        <div>
          <p className="print-report-brand">{leagueName}</p>
          <p className="print-report-season">{season?.season_name ?? "Active season"} · AMF Dundalk</p>
        </div>
        <div className="print-report-heading">
          <h1>{title}</h1>
          <p>{latestWeek > 0 ? `As of completed Week ${latestWeek}` : "Preseason · no finalized matches"}</p>
        </div>
      </header>
      {children}
    </div>
  );
}