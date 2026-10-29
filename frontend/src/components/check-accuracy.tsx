"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useState, type CSSProperties } from "react";
import * as api from "@/lib/api";
import type { Verification } from "@/lib/types";
import { cn } from "@/lib/utils";
import { errorText } from "@/lib/errors";
import { Button } from "./button";
import { formatScore } from "./confidence";
import { CloseIcon, SuccessCheck } from "./icons";
import { Spinner } from "./spinner";

const STEPS: { key: api.CheckStep["key"]; label: string }[] = [
  { key: "read", label: "Reading the real change" },
  { key: "evidence", label: "Matching every box to the code" },
  { key: "words", label: "Checking the plain-language versions" },
  { key: "names", label: "Looking for invented names" },
  { key: "judge", label: "Second model scoring the explanation" },
];

type StepState = { state: api.CheckStep["state"]; detail?: string };
const TONE: Record<Verification["confidence"], string> = { high: "var(--risk-low)", medium: "var(--risk-medium)", low: "var(--risk-high)" };
const WORD: Record<Verification["confidence"], string> = { high: "High", medium: "Medium", low: "Low" };

/** Counts up to the score, unless the reader prefers less motion. */
function useCountUp(target: number | null) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (target === null) return setN(0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setN(target);
    let frame = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1600);
      setN(Math.round(target * (1 - (1 - p) ** 4)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return n;
}

function ScoreRing({ score, tone }: { score: number; tone: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden className="-rotate-90">
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--ring-strong)" strokeWidth="10" />
      <circle cx="66" cy="66" r={r} fill="none" stroke={tone} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
    </svg>
  );
}

/**
 * "Check accuracy": re-runs the real checks on this change and shows each one
 * as it finishes. The same change always gets the same score.
 */
export function CheckAccuracy({
  cardId,
  showIssues,
  onChecked,
}: {
  cardId: string;
  showIssues: boolean;
  onChecked: (v: Verification) => void;
}) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<Partial<Record<api.CheckStep["key"], StepState>>>({});
  const [result, setResult] = useState<Verification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unscored = result !== null && result.checkedBy !== "sample" && (result.unscored === true || result.checkedBy === "code" || typeof result.score !== "number");
  const shown = useCountUp(unscored ? null : (result?.score ?? null));

  const run = async () => {
    setSteps({});
    setResult(null);
    setError(null);
    try {
      const v = await api.checkAccuracy(cardId, (s) => setSteps((all) => ({ ...all, [s.key]: { state: s.state, detail: s.detail } })));
      setResult(v);
      onChecked(v);
    } catch (e) {
      setError(
        e instanceof api.ApiError && e.code === "rate_limited" && !e.detail
          ? "That's a lot of checks. Try again in a few minutes."
          : errorText(e, "The check couldn't finish. Try again in a minute."),
      );
    }
  };

  const sample = result?.checkedBy === "sample";
  const visible = sample ? STEPS.slice(0, 1) : STEPS;
  const tone = result ? (result.needsReview ? TONE.low : unscored ? TONE.medium : TONE[result.confidence]) : "var(--color-fg-3)";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void run();
      }}
    >
      <Dialog.Trigger className="press inline-flex h-6 items-center gap-1.5 rounded-xs bg-surface-2 px-2 t-micro font-medium text-fg-1 shadow-ring hover:bg-(--surface-3)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Check accuracy
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 z-50 bg-abyss/50" />
        <Dialog.Popup className="dialog-popup fixed top-1/2 left-1/2 z-50 max-h-[90svh] w-[min(30rem,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-surface-1 p-6 shadow-elev-3 outline-none sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="t-heading text-fg-1">Checking against the code</Dialog.Title>
              <Dialog.Description className="mt-1 t-small text-fg-2">Every claim in this explanation, tested against the real change.</Dialog.Description>
            </div>
            <Dialog.Close className="press -mt-1 -mr-2 grid size-10 place-items-center rounded-sm text-fg-2 hover:bg-surface-2" aria-label="Close">
              <CloseIcon className="ico" />
            </Dialog.Close>
          </div>

          <ol className="mt-6 grid gap-3" aria-live="polite">
            {visible.map((s) => {
              const st = steps[s.key];
              return (
                <li key={s.key} className={cn("flex items-start gap-3 transition-opacity duration-300", !st && "opacity-40")}>
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center">
                    {!st ? (
                      <span className="size-2 rounded-full bg-(--ring-strong)" />
                    ) : st.state === "running" ? (
                      <Spinner className="text-fg-2" />
                    ) : st.state === "pass" ? (
                      <SuccessCheck className="text-(--risk-low)" />
                    ) : (
                      <span className="grid size-5 place-items-center rounded-full bg-[color-mix(in_srgb,var(--risk-medium)_16%,transparent)] text-[11px] font-bold text-(--risk-medium)">!</span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block t-small font-medium text-fg-1">{s.label}</span>
                    {st?.detail && <span className="block t-micro text-fg-3">{st.detail}</span>}
                  </span>
                </li>
              );
            })}
          </ol>

          {error && (
            <div className="mt-6 grid justify-items-start gap-3">
              <p role="alert" className="t-small font-medium text-danger">
                {error}
              </p>
              <Button onClick={run}>Try again</Button>
            </div>
          )}

          {result && (
            <div className="mt-6 grid justify-items-center gap-3 border-t border-(--ring) pt-6 text-center">
              <div className="relative">
                <ScoreRing score={shown} tone={tone} />
                <p className="absolute inset-0 grid place-items-center">
                  {unscored ? (
                    <span className="block t-small font-semibold text-fg-1">Not scored</span>
                  ) : (
                    <span>
                      <span className="score-num block font-display text-[2.25rem] leading-none font-semibold text-fg-1 tabular-nums">{formatScore(shown)}</span>
                      <span className="mt-1 block t-micro text-fg-3">match with the code</span>
                    </span>
                  )}
                </p>
              </div>
              <p className="t-body font-semibold" style={{ color: tone } as CSSProperties}>
                {sample
                  ? "Hand-checked sample"
                  : result.needsReview
                    ? "Needs engineer review"
                    : unscored
                      ? "Not scored: treat it as a draft"
                      : `${WORD[result.confidence]} confidence: this explanation matches the code`}
              </p>
              <p className="max-w-[24rem] t-small text-fg-2">
                {sample
                  ? "This is one of Rosetta's built-in samples, written and checked by hand."
                  : unscored
                    ? "The accuracy check wasn't available, so there's no score this time. Try again later."
                    : result.checkedBy === "ai"
                    ? "Scored by a second model and plain code rules. Checking the same change again gives the same score."
                    : "Scored by plain code rules only; the second model wasn't available, so it can't go above Medium."}
              </p>
              {showIssues && result.issues.length > 0 && (
                <ul className="mt-1 grid w-full list-disc gap-1 pl-5 text-left t-small text-fg-1">
                  {result.issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
