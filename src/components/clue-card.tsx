/**
 * ClueCard — the cryptic clue as an editorial pull-quote, with the
 * category-level hint beneath. Deliberately takes only what may be shown
 * pre-reveal: no place reference exists in these props.
 */
export interface ClueCardProps {
  clue: string;
  hint: string;
  className?: string;
}

export function ClueCard({ clue, hint, className = "" }: ClueCardProps) {
  return (
    <figure className={`border-l-2 border-accent/60 pl-4 ${className}`}>
      <blockquote className="font-display text-xl leading-snug text-ivory">
        {clue}
      </blockquote>
      <figcaption className="mt-3 text-xs uppercase tracking-[0.2em] text-muted">
        Hint — {hint}
      </figcaption>
    </figure>
  );
}
