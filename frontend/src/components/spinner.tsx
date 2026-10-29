import { cn } from "@/lib/utils";

/**
 * Thin arc spinner, one turn per 0.9s. The arc is lime on its own; inside a
 * lime primary button it takes the button's text colour (motion-nav.css).
 */
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={cn("spinner arc-spinner shrink-0", className)}
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1.5" />
      <path className="arc-spinner-arc" d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
