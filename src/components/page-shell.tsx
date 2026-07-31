import type { ReactNode } from "react";

export function PageShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 text-4xl font-semibold uppercase tracking-tight text-foreground sm:text-5xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-base text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

export function PendingSpec({ area }: { area: string }) {
  return (
    <div className="panel p-8">
      <p className="eyebrow">Awaiting league specification</p>
      <p className="mt-3 text-sm text-muted-foreground">
        The {area} module is scaffolded and ready. Scoring rules, point structure, and data
        model will be wired up once the league specification is provided.
      </p>
    </div>
  );
}
