"use client";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
} from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { LAST_LEVEL, LEVELS, type LevelSource } from "@/lib/levels";
import { clamp, cn } from "@/lib/utils";

/**
 * The Bridge Slider (design.md §7). Position is a motion value in percent of
 * the track, so it renders correctly on the server and never needs measuring
 * except while dragging.
 */

type Variant = "full" | "mini" | "dock";

type Props = {
  value: number;
  /** How `value` last changed; decides spring vs instant. */
  source: LevelSource;
  onChange: (index: number, source: LevelSource) => void;
  variant?: Variant;
  className?: string;
};

const DECELERATION = 0.998;
const toPct = (index: number) => (index / LAST_LEVEL) * 100;
const toIndex = (pct: number) => Math.round((pct / 100) * LAST_LEVEL);

/** Where a flick would come to rest (Apple's scroll projection). */
const project = (velocityPerSecond: number) => ((velocityPerSecond / 1000) * DECELERATION) / (1 - DECELERATION);

export function BridgeSlider({ value, source, onChange, variant = "full", className }: Props) {
  const reduceMotion = useReducedMotion();
  const pct = useMotionValue(toPct(value));
  const thumbX = useTransform(pct, (v) => `${v}%`);
  const fillX = useTransform(pct, (v) => `${v - 100}%`);
  // Knob trail: spans the filled part; its tail brightens with speed.
  const trailW = useTransform(pct, (v) => `${v}%`);
  const speed = useVelocity(pct);
  const trailOpacity = useSpring(
    useTransform(speed, (v) => Math.min(0.45 + Math.abs(v) / 160, 1)),
    { stiffness: 170, damping: 22 },
  );
  const [live, setLive] = useState(value);
  const [dragging, setDragging] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ offset: number; left: number; width: number } | null>(null);
  const animation = useRef<AnimationPlaybackControls | null>(null);
  /** The stop this instance is heading to; equals `value` once in sync. */
  const target = useRef(value);

  useMotionValueEvent(pct, "change", (v) => setLive(toIndex(v)));

  const jumpTo = (index: number) => {
    animation.current?.stop();
    target.current = index;
    pct.set(toPct(index));
  };

  const springTo = (index: number, bounce: number, velocity = 0) => {
    if (reduceMotion) return jumpTo(index);
    animation.current?.stop();
    target.current = index;
    animation.current = animate(pct, toPct(index), {
      type: "spring",
      bounce,
      duration: 0.35,
      velocity,
      restDelta: 0.01,
    });
  };

  // Follow changes made elsewhere (the other slider instance, the demo autoplay).
  useEffect(() => {
    if (drag.current || value === target.current) return;
    if (source === "keyboard") jumpTo(value);
    else springTo(value, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, source]);

  useEffect(() => () => animation.current?.stop(), []);

  const choose = (index: number, how: LevelSource) => {
    if (how === "keyboard") jumpTo(index);
    else springTo(index, 0);
    onChange(index, how);
  };

  /* ---------- pointer: drag the thumb ---------- */

  const onThumbDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !trackRef.current) return;
    e.stopPropagation();
    const rect = trackRef.current.getBoundingClientRect();
    const thumbCenter = rect.left + (pct.get() / 100) * rect.width;
    drag.current = { offset: e.clientX - thumbCenter, left: rect.left, width: rect.width };
    animation.current?.stop();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onThumbMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = clamp(((e.clientX - d.offset - d.left) / d.width) * 100, 0, 100);
    pct.set(next);
    // Live preview: content changes as the thumb crosses a midpoint.
    const index = toIndex(next);
    if (index !== target.current) {
      target.current = index;
      onChange(index, "drag");
    }
  };

  const onThumbUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    const velocity = pct.getVelocity();
    const landing = clamp(pct.get() + project(velocity), 0, 100);
    const index = toIndex(landing);
    springTo(index, 0.15, velocity);
    onChange(index, "pointer");
  };

  /* ---------- pointer: click the track or a label ---------- */

  const onTrackDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    choose(toIndex(clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100)), "click");
  };

  /* ---------- keyboard: one stop, no movement animation ---------- */

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      PageDown: -1,
      PageUp: 1,
    };
    let next: number | null = null;
    if (e.key in step) next = clamp(target.current + step[e.key], 0, LAST_LEVEL);
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = LAST_LEVEL;
    if (next === null) return;
    e.preventDefault();
    if (next !== target.current) choose(next, "keyboard");
  };

  const activeLabel = LEVELS[live].label;

  return (
    <div className={cn("w-full", className)} data-dragging={dragging || undefined}>
      {variant === "full" && <StopLabels active={live} onPick={(i) => choose(i, "click")} />}
      {variant === "mini" && (
        <div className="mb-3 flex items-baseline justify-between t-micro text-fg-3">
          <button type="button" tabIndex={-1} className="press -mx-1 rounded-xs px-1" onClick={() => choose(0, "click")}>
            {LEVELS[0].label}
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="press -mx-1 rounded-xs px-1"
            onClick={() => choose(LAST_LEVEL, "click")}
          >
            {LEVELS[LAST_LEVEL].label}
          </button>
        </div>
      )}

      {/* Generous vertical hit area around the 6px track. */}
      <div className="relative -mx-4 -my-3 cursor-pointer overflow-x-clip px-4 py-3 touch-pan-y" onPointerDown={onTrackDown}>
        <div ref={trackRef} className="relative h-1 rounded-full bg-(--ring-strong)">
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <motion.div className="absolute inset-0 bg-accent shadow-[0_0_12px_var(--accent-glow)]" style={{ x: fillX }} />
          </div>

          <motion.div
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-0 h-0"
            style={{ width: trailW, opacity: reduceMotion ? 0.45 : trailOpacity }}
          >
            <span className="bs-trail absolute top-0 right-0 h-1.5 w-14 max-w-full -translate-y-1/2 rounded-full" />
          </motion.div>

          {LEVELS.map((level, i) => (
            <span
              key={level.key}
              aria-hidden
              data-passed={i <= live}
              className={cn(
                "bs-tick absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                i <= live ? "bg-accent-fg/60" : "bg-fg-3",
              )}
              style={{ left: `${toPct(i)}%` }}
            />
          ))}

          <motion.div className="pointer-events-none absolute inset-0" style={{ x: thumbX }}>
            <div
              role="slider"
              tabIndex={0}
              aria-label="Reading level"
              aria-valuemin={0}
              aria-valuemax={LAST_LEVEL}
              aria-valuenow={live}
              aria-valuetext={activeLabel}
              aria-orientation="horizontal"
              onPointerDown={onThumbDown}
              onPointerMove={onThumbMove}
              onPointerUp={onThumbUp}
              onPointerCancel={onThumbUp}
              onLostPointerCapture={onThumbUp}
              onKeyDown={onKeyDown}
              className={cn(
                "slider-thumb bs-knob pointer-events-auto absolute touch-none top-1/2 left-0 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper",
                dragging ? "cursor-grabbing" : "cursor-grab",
              )}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/** Stop labels above the track. Below 480px only the active label shows. */
function StopLabels({ active, onPick }: { active: number; onPick: (index: number) => void }) {
  return (
    <div className="relative mb-4 h-5" aria-hidden>
      {LEVELS.map((level, i) => {
        const edge = i === 0 ? "left-0" : i === LAST_LEVEL ? "right-0" : "-translate-x-1/2";
        const isActive = i === active;
        return (
          <button
            key={level.key}
            type="button"
            tabIndex={-1}
            onClick={() => onPick(i)}
            className={cn(
              "press bs-label absolute top-0 rounded-xs px-1 -mx-1 t-micro whitespace-nowrap",
              edge,
              isActive ? "font-semibold text-fg-1" : "text-fg-3 enabled:hover:text-fg-2 max-[480px]:hidden",
            )}
            style={i === 0 || i === LAST_LEVEL ? undefined : { left: `${toPct(i)}%` }}
          >
            {level.label}
          </button>
        );
      })}
    </div>
  );
}
