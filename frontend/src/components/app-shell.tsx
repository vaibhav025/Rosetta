"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getTickets } from "@/lib/api";
import { tabsFor } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { AccountNav } from "./account-nav";
import { Button } from "./button";
import { Logo } from "./logo";
import { NotificationBell } from "./notification-bell";
import { SiteFooter } from "./site-footer";
import { ThemeToggle } from "./theme-toggle";

/**
 * The signed-in app. Each role gets its own tabs: an engineer has "My work",
 * a manager "Team activity", a CMO "Overview".
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, org, status } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? "/app";
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (status === "anonymous") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  // Unread questions badge; refreshed on navigation and every 30 s.
  useEffect(() => {
    if (status !== "signed-in") return;
    let cancelled = false;
    const load = () => getTickets().then((t) => !cancelled && setUnread(t.unread)).catch(() => {});
    // A short delay lets a page that marks a question read finish first.
    const first = window.setTimeout(load, 800);
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [status, pathname]);

  if (status !== "signed-in" || !user) {
    return (
      <p className="mx-auto max-w-(--w-app) px-(--gutter) py-24 t-body text-fg-3" role="status">
        Opening your workspace…
      </p>
    );
  }

  const tabs = tabsFor(user.role);
  const active = (href: string) => (href === "/app" ? pathname === "/app" || pathname.startsWith("/app/c/") : pathname.startsWith(href));

  return (
    <>
      <header className="glass glass-flat sticky top-0 z-40">
        <div className="mx-auto flex h-(--nav-h) max-w-(--w-app) items-center justify-between gap-4 px-(--gutter)">
          <div className="flex min-w-0 items-center gap-3">
            <Logo />
            {org && <span className="hidden truncate t-small text-fg-3 md:inline">{org.name}</span>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell />
            <AccountNav />
            <ThemeToggle />
          </div>
        </div>
        <nav aria-label="Sections" className="mx-auto flex max-w-(--w-app) gap-1 overflow-x-auto px-(--gutter) pb-2">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active(tab.href) ? "page" : undefined}
              className={cn(
                "press relative inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 t-small font-medium",
                active(tab.href) ? "bg-surface-1 text-fg-1 shadow-elev-1" : "text-fg-2 hover:text-fg-1",
              )}
            >
              {tab.label}
              {tab.href === "/app/questions" && unread > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 t-micro font-semibold text-accent-fg tabular-nums">
                  {unread}
                  <span className="sr-only"> unread</span>
                </span>
              )}
            </Link>
          ))}
        </nav>
      </header>
      {children}
      <SiteFooter />
    </>
  );
}

/** Shown on a section that isn't one of the reader's tabs (see tabsFor). */
export function NotForRole({ title }: { title: string }) {
  return (
    <Page title={title}>
      <div className="grid max-w-(--w-read) justify-items-start gap-4 rounded-md p-8 shadow-ring">
        <p className="t-body font-medium text-fg-1">This page isn&rsquo;t part of your view.</p>
        <p className="t-small text-fg-2">Your role sees different sections. Everything meant for you is in the tabs above.</p>
        <Link href="/app" className="t-small font-medium text-fg-1 underline underline-offset-4">
          Go to your home page
        </Link>
      </div>
    </Page>
  );
}

/** A failed load, with a way to try again. Never an empty state. */
export function LoadError({ message = "This didn't load.", onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="grid justify-items-start gap-3 rounded-md p-8 shadow-ring">
      <p role="alert" className="t-body font-medium text-danger">
        {message}
      </p>
      <p className="t-small text-fg-2">Check your connection, then try again. If it keeps happening, try again in a few minutes.</p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}

/** Page frame inside the app. */
export function Page({ title, lead, actions, children }: { title: string; lead?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-(--w-app) px-(--gutter) pt-10 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="t-title text-balance text-fg-1">{title}</h1>
          {lead && <p className="mt-2 max-w-[44rem] t-body text-fg-2">{lead}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="mt-8">{children}</div>
    </main>
  );
}
