import type { ReactNode } from "react";
import { Logo } from "./logo";

/** Thin, transparent bar with a slight blur; at most three items on the right. */
export function Nav({ meta, children }: { meta?: ReactNode; children?: ReactNode }) {
  return (
    <header className="glass glass-flat sticky top-0 z-40 h-(--nav-h)">
      <div className="mx-auto flex h-full max-w-(--w-app) items-center justify-between gap-4 px-(--gutter)">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          {meta && <div className="hidden min-w-0 truncate t-small text-fg-3 sm:block">{meta}</div>}
        </div>
        <nav aria-label="Main" className="flex shrink-0 items-center gap-2">
          {children}
        </nav>
      </div>
    </header>
  );
}
