export interface ChipProps {
  label: string;
  active?: boolean;
}

/** Small status/personality pill. `active` is reserved for emphasis — amber. */
export function Chip({ label, active = false }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs tracking-wide ${
        active ? "border-accent text-accent" : "border-line text-muted"
      }`}
    >
      {label}
    </span>
  );
}
