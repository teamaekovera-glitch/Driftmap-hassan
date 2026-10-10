import type { ReactNode } from "react";

export interface PanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

/** Hairline-bordered surface — the workhorse container of the editorial layout. */
export function Panel({ title, children, className = "" }: PanelProps) {
  return (
    <section className={`border border-line bg-ink-raised ${className}`}>
      {title ? (
        <h2 className="border-b border-line px-5 py-3 text-xs font-medium uppercase tracking-[0.2em] text-muted">
          {title}
        </h2>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}
