"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "@/lib/session";
import type { Feed, FeedItem, Person } from "@/lib/types";
import { cn, firstName, timeAgo } from "@/lib/utils";
import { ConfidencePill } from "./confidence";
import { ICON_STROKE } from "./icons";
import { DeleteChange, TrashIcon } from "./delete-change";
import { Avatar, PersonLine, SampleTag } from "./person";
import { Button } from "./button";
import { RiskBadge } from "./risk-badge";
import { useInView } from "./motion/in-view";

/**
 * Eases from the number on screen to `to` once `start` is true: from 0 on
 * first enter, from the old value when filters change. Reduced motion jumps.
 */
function useTween(to: number, start: boolean, duration = 1600) {
  const [value, setValue] = useState(0);
  const shown = useRef(0);
  useEffect(() => {
    if (!start) return;
    const from = shown.current;
    if (from === to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shown.current = to;
      setValue(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      shown.current = from + (to - from) * (1 - Math.pow(1 - p, 4));
      setValue(shown.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, start, duration]);
  return value;
}

export function StatTile({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "attention" }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const shown = useTween(value, inView);
  return (
    <div ref={ref} data-inview={inView ? "true" : "false"} className="rounded-md bg-surface-1 px-5 py-4 shadow-elev-1">
      <p className="stat-label iv t-small text-fg-2">{label}</p>
      <p className={cn("mt-1 font-display text-[2rem] leading-none font-semibold tabular-nums", tone === "attention" && value > 0 ? "text-(--risk-medium)" : "text-fg-1")}>
        <span aria-hidden className="stat-num iv">
          {Math.round(shown)}
        </span>
        <span className="sr-only">{value}</span>
      </p>
      {hint && <p className="mt-2 t-small text-fg-3">{hint}</p>}
    </div>
  );
}

/** One change in a feed, already written at the reader's level. */
export function FeedCard({ item, showAuthor = true, onDeleted }: { item: FeedItem; showAuthor?: boolean; onDeleted?: (id: string) => void }) {
  const author = item.author;
  // Clients read business terms: no GitHub pills, repository names or commit IDs.
  const { user } = useSession();
  const technicalDetails = user?.role !== "client";
  return (
    <li className="relative">
      <Link
        href={`/app/c/${item.id}`}
        className="press group block rounded-md bg-surface-1 p-5 shadow-elev-1 transition-[box-shadow,transform] duration-150 hover:shadow-elev-2 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {showAuthor && <Avatar name={item.authorName} />}
            <div className="min-w-0">
              <h3 className="t-body font-semibold text-pretty text-fg-1">{item.title}</h3>
              <p className="mt-0.5 t-small text-fg-3">
                {showAuthor && (
                  <>
                    <PersonLine person={author} fallback={item.authorName} className="text-fg-3" />
                    <span aria-hidden> · </span>
                  </>
                )}
                <time dateTime={item.committedAt}>{timeAgo(item.committedAt)}</time>
              </p>
            </div>
          </div>
          <RiskBadge risk={item.risk} />
        </div>
        <p className="mt-4 max-w-[66ch] t-body text-pretty text-fg-2">{item.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 t-micro">
          {item.status === "approved" ? (
            <span className="inline-flex h-6 items-center rounded-xs bg-surface-2 px-2 text-fg-2">
              Reviewed by {firstName(item.authorName)}
            </span>
          ) : (
            <span className="inline-flex h-6 items-center rounded-xs bg-[color-mix(in_srgb,var(--risk-medium)_8%,transparent)] tone-pill px-2 text-(--risk-medium)">
              Not reviewed yet
            </span>
          )}
          {item.sample && <SampleTag label="Sample change" />}
          {item.confidence && item.status !== "approved" && <ConfidencePill c={item.confidence} />}
          {item.reports > 0 && (
            <span className="inline-flex h-6 items-center rounded-xs bg-[color-mix(in_srgb,var(--risk-high)_8%,transparent)] tone-pill px-2 text-(--risk-high)">
              {item.reports === 1 ? "1 mistake reported" : `${item.reports} mistakes reported`}
            </span>
          )}
          {technicalDetails && (item.source === "sync" || item.source === "webhook" || item.source === "push") ? (
            <span className="inline-flex h-6 items-center rounded-xs bg-surface-2 px-2 text-fg-3">Arrived from GitHub</span>
          ) : null}
          {item.comments > 0 && (
            <span className="text-fg-3">
              {item.comments} {item.comments === 1 ? "comment" : "comments"}
            </span>
          )}
          {item.openQuestions > 0 && (
            <span className="text-fg-3">
              · {item.openQuestions} open {item.openQuestions === 1 ? "question" : "questions"}
            </span>
          )}
          {technicalDetails && (
            <span className={cn("ml-auto font-mono text-fg-3", onDeleted && "mr-8")}>
              {item.repo.split("/")[1]} · {item.ref}
            </span>
          )}
        </div>
      </Link>
      {onDeleted && (
        <DeleteChange
          id={item.id}
          title={item.title}
          onDeleted={() => onDeleted(item.id)}
          trigger={<TrashIcon />}
          triggerClassName="absolute right-3 bottom-3.5 grid size-9 sm:bottom-[18px] place-items-center rounded-sm text-fg-3 hover:bg-surface-2 hover:text-(--risk-high) pointer-coarse:size-11"
        />
      )}
    </li>
  );
}

export function FeedList({
  items,
  empty,
  showAuthor,
  filtered,
  onDeleted,
}: {
  items: FeedItem[];
  empty: ReactNode;
  showAuthor?: boolean;
  filtered?: boolean;
  /** Set on your own work: each card gets a delete button. */
  onDeleted?: (id: string) => void;
}) {
  if (!items.length) {
    return (
      <div className="rounded-md p-8 text-center shadow-ring">
        {filtered ? <p className="t-body text-fg-2">Nothing matches these filters.</p> : empty}
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3">
      {items.map((item) => (
        <FeedCard key={item.id} item={item} showAuthor={showAuthor} onDeleted={onDeleted} />
      ))}
    </ul>
  );
}

/** Pill filters: All, then one per person or team. */
export function FilterChips<T extends { id: string }>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: T[];
  value: string | null;
  onChange: (id: string | null) => void;
  render: (option: T) => ReactNode;
}) {
  if (!options.length) return null;
  const chip = (active: boolean) =>
    cn(
      "press inline-flex h-9 items-center gap-2 rounded-full px-3.5 t-small font-medium shadow-ring",
      active ? "bg-(--btn-primary-bg) text-(--btn-primary-fg)" : "bg-surface-1 text-fg-2 hover:text-fg-1",
    );
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="mr-1 t-small text-fg-3">{label}</span>
      <button type="button" aria-pressed={value === null} className={chip(value === null)} onClick={() => onChange(null)}>
        Everyone
      </button>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} className={chip(value === o.id)} onClick={() => onChange(o.id)}>
          {render(o)}
        </button>
      ))}
    </div>
  );
}

export const personChip = (p: Person) => (
  <>
    <Avatar name={p.name} size={22} />
    {p.name.split(" ")[0]}
  </>
);

/* ------------------------------------------------------------------ */
/* Search and filters                                                  */
/* ------------------------------------------------------------------ */

export type ToolsValue = { q: string; days: string; risk: string; repo: string };
export const NO_TOOLS: ToolsValue = { q: "", days: "", risk: "", repo: "" };

const selectClass =
  "h-9 shrink-0 cursor-pointer rounded-sm bg-surface-1 pr-8 pl-3 t-small text-fg-1 shadow-ring outline-none focus-visible:shadow-[0_0_0_2px_var(--focus)] pointer-coarse:h-11";

/** Search in your own words, plus date, risk and repository. */
export function FeedTools({ value, onChange, repos }: { value: ToolsValue; onChange: (v: ToolsValue) => void; repos: string[] }) {
  const set = (patch: Partial<ToolsValue>) => {
    const next = { ...value, ...patch };
    onChange(Object.values(next).every((v) => !v) ? NO_TOOLS : next);
  };
  const active = value !== NO_TOOLS;
  return (
    <div role="search" aria-label="Search and filter changes" className="flex flex-wrap items-end gap-2">
      <label className="grid min-w-0 flex-1 basis-56 gap-1">
        <span className="t-micro text-fg-3">Search</span>
        <span className="relative">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={value.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Words from the change"
            aria-label="Search changes"
            className="h-9 w-full rounded-sm bg-surface-1 pr-3 pl-9 t-small text-fg-1 shadow-ring outline-none placeholder:text-fg-3 focus-visible:shadow-[0_0_0_2px_var(--focus)] pointer-coarse:h-11"
          />
        </span>
      </label>
      <label className="grid gap-1">
        <span className="t-micro text-fg-3">When</span>
        <select value={value.days} onChange={(e) => set({ days: e.target.value })} className={selectClass}>
          <option value="">Any time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>
      </label>
      <label className="grid gap-1">
        <span className="t-micro text-fg-3">Risk</span>
        <select value={value.risk} onChange={(e) => set({ risk: e.target.value })} className={selectClass}>
          <option value="">Any risk</option>
          <option value="high">High risk</option>
          <option value="medium">Medium risk</option>
          <option value="low">Low risk</option>
        </select>
      </label>
      {repos.length > 1 && (
        <label className="grid gap-1">
          <span className="t-micro text-fg-3">Repository</span>
          <select value={value.repo} onChange={(e) => set({ repo: e.target.value })} className={cn(selectClass, "max-w-48")}>
            <option value="">All repositories</option>
            {repos.map((r) => (
              <option key={r} value={r}>
                {r.split("/")[1] ?? r}
              </option>
            ))}
          </select>
        </label>
      )}
      {active && (
        <button type="button" onClick={() => onChange(NO_TOOLS)} className="h-9 px-2 t-small text-fg-3 underline underline-offset-4 hover:text-fg-1 pointer-coarse:h-11">
          Clear filters
        </button>
      )}
    </div>
  );
}

export function LoadMore({ page, shown, loading, onMore }: { page: Feed["page"]; shown: number; loading: boolean; onMore: () => void }) {
  if (!page.more) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-2">
      <Button onClick={onMore} loading={loading}>
        Show more
      </Button>
      <span className="t-small text-fg-3">
        {shown} of {page.total}
      </span>
    </div>
  );
}
