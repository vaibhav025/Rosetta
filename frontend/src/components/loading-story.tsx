"use client";

import { motion } from "motion/react";
import { Fragment } from "react";
import { SuccessCheck } from "./icons";
import { Spinner } from "./spinner";

const enter = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const },
};

/** Backticks mark code names, which render in Geist Mono. */
export function InlineCode({ text }: { text: string }) {
  return text.split("`").map((part, i) =>
    i % 2 ? (
      <code key={i} className="font-mono text-[0.9375em] text-fg-2">
        {part}
      </code>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/**
 * The wait explains the work: lines come from the diff itself, before the
 * AI call returns (FR-6.1).
 */
const STAGES = ["writing", "checking", "rewriting"] as const;
const STAGE_TEXT: Record<(typeof STAGES)[number], string> = {
  writing: "Writing explanations for six readers",
  checking: "Checking them against the code",
  rewriting: "Fixing what the check found",
};

export function LoadingStory({ title, findings, stage }: { title?: string; findings: string[]; stage: (typeof STAGES)[number] | null }) {
  const reached = stage ? STAGES.indexOf(stage) : -1;
  return (
    <div className="w-full text-left" role="status" aria-live="polite">
      <motion.p {...enter} className="t-heading text-fg-1">
        Reading {title ?? "the commit"}…
      </motion.p>
      <ul className="mt-4 grid gap-2">
        {findings.map((line, i) => (
          <motion.li key={i} {...enter} className="flex items-center gap-3 t-body text-fg-1">
            <SuccessCheck className="text-accent-ink" />
            <span>
              <InlineCode text={line} />
            </span>
          </motion.li>
        ))}
        {STAGES.slice(0, reached + 1).map((s, i) => (
          <motion.li key={s} {...enter} className="flex items-center gap-3 t-body text-fg-1">
            {i < reached ? <SuccessCheck className="text-accent-ink" /> : <Spinner className="text-fg-2" />}
            {STAGE_TEXT[s]}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
