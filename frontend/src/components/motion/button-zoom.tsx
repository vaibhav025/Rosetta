"use client";

import { useEffect } from "react";

/**
 * Watches every .btn in the page content (including ones added later) and sets
 * data-zoom="in" while it is on screen, "out" when it leaves, so buttons
 * zoom in as you scroll to them and back out as you scroll past.
 * Buttons in the same group get a small stagger.
 *
 * Skipped: buttons outside <main>, and buttons in fixed or sticky bars and
 * dialogs, which never scroll into view and would stay hidden.
 * Starts only after hydration so React never sees the extra attributes.
 */
const pinned = (el: HTMLElement) => {
  for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    if (a.getAttribute("role") === "dialog") return true;
    const pos = getComputedStyle(a).position;
    if (pos === "fixed" || pos === "sticky") return true;
  }
  return false;
};

export function ButtonZoom() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.target as HTMLElement).dataset.zoom = e.isIntersecting ? "in" : "out";
      },
      { threshold: 0.15 },
    );
    const seen = new WeakSet<Element>();
    const scan = () => {
      document.querySelectorAll<HTMLElement>("main .btn").forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        if (pinned(el)) return;
        const siblings = el.parentElement ? [...el.parentElement.children].filter((c) => c.classList.contains("btn")) : [];
        el.style.setProperty("--zoom-delay", `${Math.max(0, siblings.indexOf(el)) * 90}ms`);
        // Already on screen: show it as is, no flash.
        const r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight) el.dataset.zoom = "in";
        el.classList.add("zoom-ready");
        io.observe(el);
      });
    };
    let pending = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(scan);
    });
    // Wait for the page to finish loading and go idle: hydration is done by then.
    let idle = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      const run = () => {
        scan();
        mo.observe(document.body, { childList: true, subtree: true });
      };
      if ("requestIdleCallback" in window) idle = window.requestIdleCallback(run, { timeout: 1500 });
      else timer = setTimeout(run, 300);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      if (idle) window.cancelIdleCallback(idle);
      clearTimeout(timer);
      io.disconnect();
      mo.disconnect();
      cancelAnimationFrame(pending);
    };
  }, []);
  return null;
}
