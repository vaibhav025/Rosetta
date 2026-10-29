"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Fade-and-rise on scroll, once. The initial state is the same on server and
 * client (no hydration mismatch); with reduced motion the rise is instant
 * (hidden while still transparent) and only the fade plays.
 */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{
        opacity: { duration: reduceMotion ? 0.3 : 0.85, ease: EASE, delay },
        y: { duration: reduceMotion ? 0 : 0.85, ease: EASE, delay },
      }}
    >
      {children}
    </motion.div>
  );
}
