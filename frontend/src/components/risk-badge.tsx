"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import type { CSSProperties } from "react";
import type { Risk } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useInView } from "./motion/in-view";

const WORD: Record<Risk, string> = { low: "Low", medium: "Medium", high: "High" };
const BARS: Record<Risk, number> = { low: 1, medium: 2, high: 3 };

/** Icon + word + color, never color alone (design.md §2). */
export function RiskBadge({ risk, reason }: { risk: Risk; reason?: string }) {
  const [ref, inView] = useInView<SVGSVGElement>();
  const badge = (
    <>
      <svg ref={ref} data-inview={inView ? "true" : "false"} width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0">
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={i * 4.5}
            y={8 - i * 3}
            width="3"
            height={4 + i * 3}
            rx="1"
            fill="currentColor"
            opacity={i < BARS[risk] ? 1 : 0.28}
            className="risk-bar iv"
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
      </svg>
      <span>
        {WORD[risk]}
        <span className="sr-only"> risk</span>
      </span>
    </>
  );

  const className = cn(
    "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-xs px-2 t-micro tabular-nums",
    "bg-[color-mix(in_srgb,var(--risk)_8%,transparent)] tone-pill text-(--risk)",
  );
  const style = { "--risk": `var(--risk-${risk})` } as CSSProperties;

  if (!reason) {
    return (
      <span className={className} style={style}>
        {badge}
      </span>
    );
  }

  return (
    <Tooltip.Root>
      <Tooltip.Trigger className={cn("press cursor-default", className)} style={style}>
        {badge}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Tooltip.Popup className="tooltip max-w-64 rounded-sm bg-surface-2 px-3 py-2 t-small text-fg-1 shadow-elev-2">
            {reason}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
