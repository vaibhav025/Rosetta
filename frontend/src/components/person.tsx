import { roleLabel } from "@/lib/roles";
import type { Person } from "@/lib/types";
import { cn } from "@/lib/utils";

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/** A round initials badge. Leads get Steel; everyone else a quieter fill. */
export function Avatar({ name, size = 32, lead = false }: { name: string; size?: number; lead?: boolean }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        lead ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg-1 shadow-ring-strong",
      )}
    >
      {initials(name)}
    </span>
  );
}

/** "Arjun Mehta · Engineer · Payments" */
/** Marks the people and changes made by "Add a sample team", so nobody takes them for real ones. */
export function SampleTag({ label = "Sample" }: { label?: string }) {
  return (
    <span className="inline-flex h-5 items-center rounded-xs bg-surface-2 px-1.5 t-micro font-medium text-fg-2 shadow-ring" title="Sample data, not a real person or change">
      {label}
    </span>
  );
}

export function PersonLine({ person, fallback = "Former member", className }: { person: Person | null; fallback?: string; className?: string }) {
  if (!person) return <span className={className}>{fallback}</span>;
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-1.5", className)}>
      <span className="font-medium text-fg-1">{person.name}</span>
      {person.sample && <SampleTag />}
      <span aria-hidden>·</span>
      <span>{person.title || roleLabel(person.role)}</span>
      {person.team && (
        <>
          <span aria-hidden>·</span>
          <span>{person.team.name}</span>
        </>
      )}
    </span>
  );
}
