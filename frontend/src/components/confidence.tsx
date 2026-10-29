"use client";

import { useState, type CSSProperties } from "react";
import type { Verification } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useInView } from "./motion/in-view";

const WORD: Record<Verification["confidence"], string> = { high: "High", medium: "Medium", low: "Low" };
const TONE: Record<Verification["confidence"], string> = { high: "var(--risk-low)", medium: "var(--risk-medium)", low: "var(--risk-high)" };

type Short = { score: number | null; level: Verification["confidence"]; checkedBy: Verification["checkedBy"]; needsReview: boolean; unscored?: boolean };

/** No judge was available (rules only), so there is no real number to show. */
const isUnscored = (v: { score: number | null; unscored?: boolean; checkedBy?: Verification["checkedBy"] }) =>
  v.unscored === true || v.checkedBy === "code" || typeof v.score !== "number";

/** One format everywhere: "92/100". */
export const formatScore = (score: number) => `${score}/100`;

/** A check mark in a ring that fills with the score. Icon + word + number, never color alone. */
function Ring({ score }: { score: number }) {
  const [ref, inView] = useInView<SVGSVGElement>();
  return (
    <svg ref={ref} data-inview={inView ? "true" : "false"} width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0 -rotate-90">
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <circle
        cx="7"
        cy="7"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        pathLength={100}
        strokeDasharray={`${score} 100`}
        strokeLinecap="round"
        className="ring-fill iv"
      />
    </svg>
  );
}

const pill = "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-xs px-2 t-micro tabular-nums bg-[color-mix(in_srgb,var(--tone)_8%,transparent)] tone-pill text-(--tone)";

/** Compact badge for feeds. */
export function ConfidencePill({ c }: { c: Short }) {
  if (c.checkedBy === "sample") return null;
  if (c.needsReview) {
    return (
      <span className={pill} style={{ "--tone": TONE.low } as CSSProperties}>
        Needs engineer review
      </span>
    );
  }
  if (isUnscored(c)) {
    return (
      <span className={pill} style={{ "--tone": TONE.medium } as CSSProperties} title="No accuracy score yet">
        Not scored yet
      </span>
    );
  }
  return (
    <span className={pill} style={{ "--tone": TONE[c.level] } as CSSProperties} title="How well the explanation matches the code">
      <Ring score={c.score ?? 0} />
      {formatScore(c.score ?? 0)}
      <span className="sr-only"> checked against the code</span>
    </span>
  );
}

/**
 * "Checked against the code: High (92/100)". Opens to show how it was
 * checked and, for people who read code, what the checks found.
 */
export function ConfidenceBadge({ v, approved, showIssues }: { v: Verification; approved: boolean; showIssues: boolean }) {
  const [open, setOpen] = useState(false);
  const unscored = v.checkedBy !== "sample" && isUnscored(v);
  const style = { "--tone": v.needsReview && !approved ? TONE.low : unscored ? TONE.medium : TONE[v.confidence] } as CSSProperties;
  const score = unscored ? "" : ` (${formatScore(v.score ?? 0)})`;
  const label =
    v.checkedBy === "sample"
      ? "Sample explanation, checked by hand"
      : v.needsReview && !approved
        ? `Needs engineer review${score}`
        : unscored
          ? "Not scored yet: the accuracy check wasn't available"
          : `Checked against the code: ${WORD[v.confidence]}${score}`;

  return (
    <div className="grid justify-items-start gap-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn("press cursor-pointer", pill)} style={style}>
        <Ring score={v.checkedBy === "sample" ? 100 : (v.score ?? 0)} />
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={cn("transition-transform", open && "rotate-180")}>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="max-w-(--w-read) rounded-sm bg-surface-2 p-4 t-small text-fg-2 shadow-ring">
          {v.checkedBy === "sample" ? (
            <p>This is one of Rosetta&rsquo;s built-in samples. Its text and the code behind each box were written and checked by hand.</p>
          ) : (
            <>
              <p>
                {unscored
                  ? "Rosetta couldn't score this explanation: the accuracy check wasn't available when it was written. Use Check accuracy to try again, and treat it as a draft until then."
                  : v.checkedBy === "ai"
                  ? "Rosetta checked this explanation against the real code in two ways: plain rules (no code words for non-technical readers, no names that aren't in the change) and a second AI model that scores accuracy, completeness and the flowchart."
                  : "Rosetta checked this explanation against the real code with plain rules: no code words for non-technical readers, and no names that aren't in the change. A second AI check wasn't available, so it can't score higher than Medium."}
                {v.retried && " The first version scored low, so it was rewritten once with the problems as feedback."}
              </p>
              {v.needsReview && !approved && <p className="mt-2 text-fg-1">Treat it as a draft until the engineer who wrote the change has read it.</p>}
              {approved && <p className="mt-2 text-fg-1">The engineer has since read and approved it.</p>}
              {showIssues && v.issues.length > 0 && (
                <ul className="mt-3 grid list-disc gap-1 pl-5 text-fg-1">
                  {v.issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              )}
              {showIssues && v.issues.length === 0 && <p className="mt-2">No problems found.</p>}
              <p className="mt-3 t-micro text-fg-3">Select any box in How it works to see the lines of code behind it.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
