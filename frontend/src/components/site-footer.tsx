"use client";

import Link from "next/link";
import { openConsentSettings } from "@/lib/consent";
import { CONTACT_EMAIL, LEGAL_ENTITY, LEGAL_PAGES, SOURCE_URL } from "@/lib/legal";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";

/** Legal links, business details and storage settings, on every page. */
export function SiteFooter({ className }: { className?: string }) {
  const link = "foot-link rounded-xs";
  const pages = LEGAL_PAGES.map((p) => (
    <Link key={p.href} href={p.href} className={link}>
      {p.label}
    </Link>
  ));
  const columns = [
    pages.slice(0, 3),
    pages.slice(3, 6),
    [
      pages[6],
      <button key="storage" type="button" onClick={openConsentSettings} className={cn(link, "cursor-pointer text-left")}>
        Storage settings
      </button>,
    ],
    [
      <a key="mail" href={`mailto:${CONTACT_EMAIL}`} className={link}>
        {CONTACT_EMAIL}
      </a>,
      <a key="source" href={SOURCE_URL} target="_blank" rel="noreferrer" className={link}>
        Source code<span className="sr-only"> (opens GitHub in a new tab)</span>
      </a>,
    ],
  ];
  return (
    <footer className={cn("mx-auto max-w-(--w-app) px-(--gutter) pb-12 print:hidden", className)}>
      <div className="grid gap-10 border-t border-(--ring) pt-12 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <p className="flex items-center gap-2 font-display text-[0.9375rem] font-semibold tracking-[-0.02em] text-fg-1">
            <LogoMark size={20} />
            Rosetta
          </p>
          <p className="mt-4 t-mono text-fg-3">Built by Team CodeCrunchers</p>
          <p className="mt-1 t-mono text-fg-3">
            © {new Date().getFullYear()} {LEGAL_ENTITY}
          </p>
        </div>
        <nav aria-label="Legal" className="grid grid-cols-2 gap-x-6 gap-y-8 t-mono text-fg-3 sm:grid-cols-4">
          {columns.map((items, i) => (
            <ul key={i} className="grid content-start gap-3">
              {items.map((item, j) => (
                <li key={j} className="min-w-0 break-words">
                  {item}
                </li>
              ))}
            </ul>
          ))}
        </nav>
      </div>
    </footer>
  );
}
