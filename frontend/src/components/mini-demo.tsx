"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { CARD_DEFAULT_LEVEL, DEMO_DEFAULT_LEVEL, LAST_LEVEL, LEVELS, type LevelState } from "@/lib/levels";
import { SAMPLES } from "@/lib/mock/samples";
import { BridgeSlider } from "./bridge-slider";
import { LevelSwap } from "./level-swap";
import { useInView } from "./motion/in-view";

const PLAYED_KEY = "rosetta:demo-played";
/** ~1.8s from Engineer to CMO, pausing briefly at each stop. */
const STEP_MS = 380;

/**
 * Home mini demo, on the round-robin commit's cached explanation. On the
 * first visit per session it glides once from Engineer to CMO: the only
 * motion in the product nobody triggered (design.md §8).
 */
export function MiniDemo() {
  const { explanation } = SAMPLES[0].card;
  const reduceMotion = useReducedMotion();
  const [level, setLevel] = useState<LevelState>({ index: DEMO_DEFAULT_LEVEL, source: "program" });
  const sliderRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const timers = useRef<number[]>([]);

  const stop = () => {
    touched.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    if (reduceMotion) {
      setLevel({ index: CARD_DEFAULT_LEVEL, source: "keyboard" });
      return;
    }
    let played = false;
    try {
      played = sessionStorage.getItem(PLAYED_KEY) === "1";
    } catch {
      /* no storage: play it */
    }
    const el = sliderRef.current;
    if (played || !el) return;

    const play = () => {
      if (touched.current) return;
      try {
        sessionStorage.setItem(PLAYED_KEY, "1");
      } catch {
        /* ignore */
      }
      for (let i = 1; i <= LAST_LEVEL; i++) {
        timers.current.push(
          window.setTimeout(() => !touched.current && setLevel({ index: i, source: "program" }), (i - 1) * STEP_MS),
        );
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        timers.current.push(window.setTimeout(play, 600));
      },
      { threshold: 1 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [reduceMotion]);

  return (
    <figure className="w-full [perspective:1800px]" aria-label="Example: one commit explained at six levels">
      <div className="panel window-glass relative rounded-lg transition-transform duration-700 ease-(--ease-out) lg:[transform:rotateY(-9deg)_rotateX(5deg)_rotateZ(1deg)] lg:hover:[transform:none] lg:focus-within:[transform:none]">
        {/* Window chrome */}
        <div aria-hidden className="flex h-11 items-center gap-2 border-b border-(--ring) px-4">
          <span className="size-2.5 rounded-full bg-(--ring-strong)" />
          <span className="size-2.5 rounded-full bg-(--ring-strong)" />
          <span className="size-2.5 rounded-full bg-(--ring-strong)" />
          <span className="ml-auto h-5 w-24 rounded-full bg-(--btn-secondary-bg) shadow-[inset_0_0_0_1px_var(--ring)]" />
        </div>
        <div className="flex">
          <ToolRail />
          <div
            className="min-w-0 flex-1 p-6 text-left sm:p-8"
            onPointerDownCapture={stop}
            onKeyDownCapture={stop}
            data-swap-source={level.source === "keyboard" ? "keyboard" : undefined}
          >
            <div ref={sliderRef}>
              <BridgeSlider
                variant="mini"
                value={level.index}
                source={level.source}
                onChange={(index, source) => setLevel({ index, source })}
              />
            </div>
            <LevelSwap
              active={level.index}
              className="mt-6"
              render={(key) => (
                <>
                  <p className="t-mono text-fg-3">{LEVELS.find((l) => l.key === key)!.label}</p>
                  <p className="mt-2 t-summary text-fg-1 text-pretty">{explanation.levels[key].summary}</p>
                </>
              )}
            />
            <p className="sr-only" aria-live="polite">
              {LEVELS[level.index].label}: {explanation.levels[LEVELS[level.index].key].summary}
            </p>
            <NodeGraph />
          </div>
        </div>
      </div>
      <figcaption className="mt-5 text-center t-mono text-fg-3">The same commit, at six levels of detail.</figcaption>
    </figure>
  );
}

/** Thin 1.5px line icons for the decorative tool rail. */
const TOOL_ICONS = [
  // cursor
  <path key="cursor" d="M5.5 4 18 10.2l-5.6 1.9-2.2 5.6L5.5 4Z" />,
  // plus
  <path key="plus" d="M12 5.5v13M5.5 12h13" />,
  // wand
  <path key="wand" d="M5 19 14.5 9.5M13 8l3 3M18 3.5v3M16.5 5h3M19.5 11v2M18.5 12h2" />,
  // nodes
  <g key="nodes">
    <circle cx="6" cy="6.5" r="2.25" />
    <circle cx="6" cy="17.5" r="2.25" />
    <circle cx="18" cy="12" r="2.25" />
    <path d="M8.25 6.5c4 0 4 5.5 7.5 5.5M8.25 17.5c4 0 4-5.5 7.5-5.5" />
  </g>,
  // play
  <path key="play" d="M8 5.75v12.5L18 12 8 5.75Z" />,
];

/** Left mini icon toolbar (decorative): glass buttons, the first one active. */
function ToolRail() {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      aria-hidden
      data-inview={inView ? "true" : "false"}
      className="hidden w-14 shrink-0 flex-col items-center gap-3 border-r border-(--ring) py-5 sm:flex"
    >
      {TOOL_ICONS.map((icon, i) => (
        <span
          key={i}
          className="hero-tool iv"
          data-active={i === 0 ? "true" : undefined}
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            // 2.4 user units at 15px = a 1.5px stroke on screen.
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {icon}
          </svg>
        </span>
      ))}
    </div>
  );
}

const NODES = [
  { x: 8, y: 43, w: 64 },
  { x: 118, y: 10, w: 76 },
  { x: 118, y: 76, w: 76 },
  { x: 236, y: 43, w: 64 },
];
const H = 34;

/** Connectors; `dim` is the branch not taken. Delays in ms. */
const WIRES = [
  { d: "M72 60C95 60 95 27 118 27", delay: 300, dim: false },
  { d: "M72 60C95 60 95 93 118 93", delay: 420, dim: false },
  { d: "M194 27C215 27 215 60 236 60", delay: 900, dim: false },
  { d: "M194 93C215 93 215 60 236 60", delay: 1020, dim: true },
];

/** Blank branch pills ("true" / "else") sitting on the two branch wires. */
const PILLS = [
  { x: 85, y: 38.5, delay: 1100 },
  { x: 85, y: 71.5, delay: 1220 },
];

/** Rounded dark glass nodes, thin curved lime connectors, blank label pills (decorative). */
function NodeGraph() {
  const [ref, inView] = useInView<SVGSVGElement>();
  const id = useId().replace(/:/g, "");
  return (
    <svg
      ref={ref}
      aria-hidden
      data-inview={inView ? "true" : "false"}
      viewBox="0 0 308 120"
      className="mt-8 hidden w-full max-w-[22rem] overflow-visible sm:block"
      fill="none"
    >
      <defs>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.07" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`${id}-dim`} maskUnits="userSpaceOnUse" x="0" y="0" width="308" height="120">
          <path
            d={WIRES[3].d}
            pathLength={1}
            stroke="#fff"
            strokeWidth="4"
            className="draw iv"
            style={{ animationDelay: `${WIRES[3].delay}ms` }}
          />
        </mask>
      </defs>

      <g strokeWidth="1.25" strokeLinecap="round">
        {WIRES.map((w, i) =>
          w.dim ? (
            <path
              key={i}
              d={w.d}
              className="hero-wire"
              strokeOpacity="0.3"
              strokeDasharray="2 4"
              mask={`url(#${id}-dim)`}
            />
          ) : (
            <path
              key={i}
              d={w.d}
              pathLength={1}
              className="hero-wire draw iv"
              style={{ animationDelay: `${w.delay}ms` }}
            />
          ),
        )}
      </g>

      <g strokeWidth="2" strokeLinecap="round">
        {WIRES.map((w, i) => (
          <path
            key={i}
            d={w.d}
            pathLength={1}
            className="hero-pulse iv"
            strokeOpacity={w.dim ? 0.55 : 1}
            style={{ animationDelay: `${1800 + i * 800}ms` }}
          />
        ))}
      </g>

      {PILLS.map((p, i) => (
        <rect
          key={i}
          x={p.x}
          y={p.y}
          width="20"
          height="10"
          rx="5"
          className="hero-pill iv"
          style={{ animationDelay: `${p.delay}ms` }}
        />
      ))}

      {NODES.map((n, i) => (
        <g key={i} className="hero-node iv" style={{ animationDelay: `${i * 120}ms` }}>
          <rect x={n.x} y={n.y} width={n.w} height={H} rx="11" fill="var(--surface-2)" stroke="var(--ring-strong)" />
          <rect x={n.x + 0.5} y={n.y + 0.5} width={n.w - 1} height={H - 1} rx="10.5" fill={`url(#${id}-sheen)`} />
          <rect x={n.x + 11} y={n.y + 10} width={Math.round(n.w * 0.46)} height="5" rx="2.5" fill="var(--text-3)" fillOpacity="0.7" />
          <rect x={n.x + 11} y={n.y + 19.5} width={Math.round(n.w * 0.28)} height="4" rx="2" fill="var(--ring-strong)" />
          <circle
            cx={n.x + n.w - 13}
            cy={n.y + H / 2}
            r="3"
            fill={i === 3 ? "var(--accent)" : "var(--text-3)"}
            className={i === 3 ? "hero-dot" : undefined}
          />
        </g>
      ))}
    </svg>
  );
}
