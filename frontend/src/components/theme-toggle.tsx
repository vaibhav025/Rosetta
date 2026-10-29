"use client";

import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { MoonIcon, SunIcon } from "./icons";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const isDark = !mounted || resolvedTheme !== "light";
  // The glyph turns in only after a click, never on first paint.
  const [turned, setTurned] = useState(false);

  const toggle = () => {
    const root = document.documentElement;
    root.classList.add("theming");
    setTurned(true);
    setTheme(isDark ? "light" : "dark");
    window.setTimeout(() => root.classList.remove("theming"), 250);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? (
        <MoonIcon key="moon" strokeWidth={1.5} className={cn("ico", turned && "ico-turn-in")} />
      ) : (
        <SunIcon key="sun" strokeWidth={1.5} className={cn("ico", turned && "ico-turn-in")} />
      )}
    </Button>
  );
}
