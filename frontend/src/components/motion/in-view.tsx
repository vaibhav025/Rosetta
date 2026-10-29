"use client";

import { useEffect, useRef, useState, type ElementType, type ComponentPropsWithoutRef, type RefObject } from "react";

/** True once the element has entered the viewport (never goes back). */
export function useInView<T extends Element>(options: { margin?: string; threshold?: number } = {}): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const { margin = "0px 0px -10% 0px", threshold = 0 } = options;
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") return setInView(true);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setInView(true);
        io.disconnect();
      },
      { rootMargin: margin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, margin, threshold]);
  return [ref, inView];
}

type InViewProps<T extends ElementType> = { as?: T } & ComponentPropsWithoutRef<T>;

/**
 * Carries data-inview="false" until it scrolls in, then "true". CSS
 * animations on `.iv` descendants wait paused on their first frame until then
 * (see globals.css), so entrances play once, on enter.
 */
export function InView<T extends ElementType = "div">({ as, ...props }: InViewProps<T>) {
  const [ref, inView] = useInView<HTMLElement>();
  const Tag = (as ?? "div") as ElementType;
  return <Tag ref={ref} data-inview={inView ? "true" : "false"} {...props} />;
}

/** Counts from 0 to `to` over `duration` ms once `start` is true (ease-out). */
export function useCountUp(to: number, start: boolean, duration = 1600) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setValue(to);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setValue(to * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, start, duration]);
  return value;
}
