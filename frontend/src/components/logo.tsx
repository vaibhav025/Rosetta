import Link from "next/link";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The glossy lime tile with a dark ">>" (radius 28%). One component at every
 * size: nav logo, footer, closing card, icon tiles. Hover slides the chevrons
 * right (second lags 60ms), idle "runs" them every ~3s, press springs to 0.94.
 */
export function LogoTile({ size = 26, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      className={cn("logo-tile", className)}
      style={{ width: size, height: size, "--tile-size": `${size}px`, ...style } as CSSProperties}
    >
      <ChevronsIcon size={Math.round(size * 0.62)} animated />
    </span>
  );
}

/** Kept for existing call sites. */
export const LogoMark = LogoTile;

export function ChevronsIcon({ size = 16, className, animated = false }: { size?: number; className?: string; animated?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path className={animated ? "chev chev-1" : undefined} d="M5 6.5 10.5 12 5 17.5" />
        <path className={animated ? "chev chev-2" : undefined} d="M12.5 6.5 18 12l-5.5 5.5" />
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <Link
      href="/"
      className="press -mx-2 inline-flex h-10 items-center gap-2.5 rounded-full px-2 font-display text-[1.0625rem] font-semibold tracking-[-0.02em] text-fg-1"
    >
      <LogoTile />
      Rosetta
    </Link>
  );
}
