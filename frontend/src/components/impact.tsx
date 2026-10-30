"use client";

import { useState } from "react";
import { isFullImpact, type Impact, type ImpactBrief, type Reach } from "@/lib/types";
import { cn } from "@/lib/utils";

const REACH: Record<Reach, string> = {
  none: "Nothing else in the codebase uses what changed.",
  contained: "Only a few other places rely on this.",
  moderate: "Several other parts rely on this.",
  wide: "Many other parts rely on this.",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/**
 * "What else this touches": the files beyond the diff that rely on the change,
 * from Rosetta's map of the whole repository. People who read code get the
 * files and a picture; everyone else gets how far it reaches.
 */
export function ImpactPanel({ impact, className }: { impact: Impact | ImpactBrief; className?: string }) {
  const warn = isFullImpact(impact) ? impact.broken.length > 0 : impact.broken > 0;
  return (
    <section id="impact" aria-labelledby="impact-heading" className={cn("scroll-mt-36", className)}>
      <h2 id="impact-heading" className="t-heading text-fg-1">
        What else this touches
      </h2>
      <p className="mt-2 t-body text-fg-2">
        {REACH[impact.reach]}
        {impact.totalFiles > 0 && ` ${plural(impact.totalFiles, "other file")}${isFullImpact(impact) && impact.capped ? " or more" : ""} in the codebase depend on it.`}
      </p>
      {warn && (
        <p className="mt-3 rounded-sm bg-surface-1 px-3 py-2 t-small text-(--risk-high)" role="note">
          {isFullImpact(impact)
            ? `${plural(impact.broken.length, "file")} still use${impact.broken.length === 1 ? "s" : ""} something this change removed, and weren't updated with it.`
            : "Some parts still use something this change removed. The engineer should check them."}
        </p>
      )}
      {isFullImpact(impact) ? <Details impact={impact} /> : impact.entryPoints > 0 && <p className="mt-2 t-small text-fg-3">That includes {plural(impact.entryPoints, "screen or route", "screens or routes")} people use.</p>}
    </section>
  );
}

function Details({ impact }: { impact: Impact }) {
  const [all, setAll] = useState(false);
  const direct = all ? impact.direct : impact.direct.slice(0, 8);
  return (
    <>
      {impact.changed.some((c) => c.symbols.length) && (
        <p className="mt-4 t-small text-fg-2">
          Changed:{" "}
          {impact.changed
            .filter((c) => c.symbols.length)
            .map((c) => `${baseName(c.file)} (${c.symbols.slice(0, 5).join(", ")})`)
            .join(" · ")}
        </p>
      )}

      {impact.broken.length > 0 && (
        <ul className="mt-3">
          {impact.broken.map((b) => (
            <li key={b.file} className="flex min-h-9 items-center justify-between gap-6 t-code">
              <span className="min-w-0 truncate text-(--risk-high)" title={b.file}>{b.file}</span>
              <span className="shrink-0 text-fg-3">{b.names.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}

      {impact.edges.length > 0 && <ImpactGraph impact={impact} />}

      {impact.direct.length > 0 && (
        <>
          <h3 className="mt-6 t-small font-medium text-fg-1">Uses it directly</h3>
          <ul className="mt-2">
            {direct.map((d) => (
              <li key={d.file} className="flex min-h-9 items-center justify-between gap-6 t-code">
                <span className="min-w-0 truncate text-fg-2" title={d.file}>{d.file}</span>
                <span className="shrink-0 text-fg-3">{d.uses.length ? d.uses.join(", ") : "whole file"}</span>
              </li>
            ))}
          </ul>
          {impact.direct.length > direct.length && (
            <button type="button" onClick={() => setAll(true)} className="mt-2 t-small text-fg-2 underline underline-offset-4 hover:text-fg-1">
              Show all {impact.direct.length}
            </button>
          )}
        </>
      )}

      {impact.indirect.length > 0 && (
        <p className="mt-4 t-small text-fg-2">
          {plural(impact.indirect.length, "more file")} depend on those, a step or two further out.
        </p>
      )}
      {impact.areas.length > 0 && (
        <p className="mt-2 t-small text-fg-3">Areas: {impact.areas.map((a) => `${a.name} (${a.files})`).join(", ")}</p>
      )}
      <p className="mt-2 t-small text-fg-3">From Rosetta&apos;s map of {plural(impact.mapFiles, "file")} in this repository.</p>
    </>
  );
}

/** Columns: the changed files, the files that use them, then the ones further out. Arrows point at what is used. */
function ImpactGraph({ impact }: { impact: Impact }) {
  const changed = new Set(impact.changed.map((c) => c.file));
  const direct = new Set(impact.direct.map((d) => d.file));
  const broken = new Set(impact.broken.map((b) => b.file));
  const nodes = [...new Set(impact.edges.flat())];
  const column = (f: string) => (changed.has(f) ? 0 : direct.has(f) ? 1 : 2);
  const cols: string[][] = [[], [], []];
  for (const f of nodes) cols[column(f)].push(f);
  const W = 720;
  const ROW = 34;
  const BOX_W = 200;
  const xOf = (c: number) => 10 + c * ((W - BOX_W - 20) / 2);
  const rows = Math.max(...cols.map((c) => c.length), 1);
  const H = rows * ROW + 10;
  const pos = new Map<string, { x: number; y: number }>();
  cols.forEach((list, c) => list.forEach((f, i) => pos.set(f, { x: xOf(c), y: 8 + i * ROW + ((rows - list.length) * ROW) / 2 })));

  return (
    <div className="mt-5 overflow-x-auto rounded-md bg-surface-1 p-3">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 560 }} role="img" aria-label="Which files rely on the changed files">
        <defs>
          <marker id="impact-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" fill="var(--text-3)" />
          </marker>
        </defs>
        {impact.edges.map(([from, to]) => {
          const a = pos.get(from);
          const b = pos.get(to);
          if (!a || !b) return null;
          // From the user's box to the used file's box.
          const leftward = a.x > b.x;
          const x1 = leftward ? a.x : a.x + BOX_W;
          const x2 = leftward ? b.x + BOX_W : b.x;
          return <line key={`${from}>${to}`} x1={x1} y1={a.y + 12} x2={x2} y2={b.y + 12} stroke="var(--text-3)" strokeOpacity={0.5} markerEnd="url(#impact-arrow)" />;
        })}
        {[...pos].map(([f, p]) => (
          <g key={f}>
            <title>{f}</title>
            <rect
              x={p.x}
              y={p.y}
              width={BOX_W}
              height={24}
              rx={6}
              fill={changed.has(f) ? "var(--accent-ink, var(--text-1))" : "var(--surface-2)"}
              fillOpacity={changed.has(f) ? 0.18 : 1}
              stroke={broken.has(f) ? "var(--risk-high)" : changed.has(f) ? "var(--accent-ink, var(--text-1))" : "var(--ring-strong, var(--text-3))"}
              strokeOpacity={0.7}
            />
            <text x={p.x + 10} y={p.y + 16} fontSize="11" fontFamily="var(--font-mono, monospace)" fill={broken.has(f) ? "var(--risk-high)" : "var(--text-1)"}>
              {baseName(f).length > 28 ? `${baseName(f).slice(0, 27)}…` : baseName(f)}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-2 t-small text-fg-3">Left: changed in this commit. Middle: uses it directly. Right: further out.</p>
    </div>
  );
}
