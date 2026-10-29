"use client";

import { useEffect, useRef } from "react";

const INTERACTIVE = "a, button, [role='button'], [role='slider'], [role='tab'], [role='menuitem'], label, summary, select";
const BUTTONISH = "button, [role='button'], [role='tab'], [role='menuitem'], a[class*='rounded-full'], a[class*='press']";
const TEXT = "input:not([type='checkbox']):not([type='radio']), textarea, [contenteditable='true']";

/**
 * A small dot plus a thin ring that follows with lag (lerp .15). The ring
 * grows to 44px over interactive elements and tints lime over buttons. It
 * also feeds the pointer position to glass cards for their spotlight.
 * Only on devices that really hover; with reduced motion the ring doesn't lag.
 */
export function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!fine.matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    const dot = dotRef.current!;
    const ring = ringRef.current!;
    let mx = -100;
    let my = -100;
    let rx = mx;
    let ry = my;
    let raf = 0;
    let shown = false;
    let card: HTMLElement | null = null;

    const loop = () => {
      const k = reduce ? 1 : 0.15;
      rx += (mx - rx) * k;
      ry += (my - ry) * k;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      raf = Math.abs(mx - rx) + Math.abs(my - ry) > 0.1 ? requestAnimationFrame(loop) : 0;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      mx = e.clientX;
      my = e.clientY;
      if (!shown) {
        shown = true;
        rx = mx;
        ry = my;
        root.classList.add("has-cursor");
      }
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      if (!raf) raf = requestAnimationFrame(loop);

      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(TEXT)) root.dataset.cursor = "text";
      else delete root.dataset.cursor;
      if (target?.closest(BUTTONISH)) ring.dataset.hover = "button";
      else if (target?.closest(INTERACTIVE)) ring.dataset.hover = "link";
      else delete ring.dataset.hover;

      // Spotlight on the glass card under the pointer.
      const next = (target?.closest(".panel, .spot") as HTMLElement | null) ?? null;
      if (next !== card) {
        card?.style.setProperty("--spot", "0");
        card = next;
        card?.style.setProperty("--spot", "1");
      }
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${mx - r.left}px`);
        card.style.setProperty("--my", `${my - r.top}px`);
      }
    };
    const onLeave = () => {
      root.dataset.cursor = "hidden";
      card?.style.setProperty("--spot", "0");
      card = null;
    };
    const onEnter = () => delete root.dataset.cursor;

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.documentElement.addEventListener("pointerenter", onEnter);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.documentElement.removeEventListener("pointerenter", onEnter);
      root.classList.remove("has-cursor");
      delete root.dataset.cursor;
    };
  }, []);

  return (
    <>
      <div ref={ringRef} aria-hidden className="cursor-ring" />
      <div ref={dotRef} aria-hidden className="cursor-dot" />
    </>
  );
}
