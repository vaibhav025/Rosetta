"use client";

import { Menu } from "@base-ui/react/menu";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { NotificationItem } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { buttonStyles } from "./button";

const DOT: Record<NotificationItem["kind"], string> = {
  question: "bg-accent",
  reply: "bg-accent",
  report: "bg-(--risk-high)",
  change: "bg-(--risk-low)",
  reviewed: "bg-(--risk-low)",
  joined: "bg-fg-1",
};

/** The bell: questions, replies, reports and new changes, for people who don't live in email. */
export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(() => {
    api
      .getNotifications()
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread);
      })
      .catch(() => {});
  }, []);

  // Refreshed on navigation and every 30 s, like the questions badge.
  useEffect(() => {
    const first = window.setTimeout(load, 600);
    const timer = window.setInterval(load, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load, pathname]);

  const open = (n: NotificationItem) => {
    if (!n.read) {
      setItems((all) => all.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void api.readNotifications({ ids: [n.id] }).catch(() => {});
    }
    router.push(n.href);
  };

  const readAll = () => {
    setItems((all) => all.map((x) => ({ ...x, read: true })));
    setUnread(0);
    void api.readNotifications({ all: true }).catch(() => {});
  };

  return (
    <Menu.Root onOpenChange={(o) => setMenuOpen(o)}>
      <Menu.Trigger
        className={cn(buttonStyles({ variant: "ghost", size: "icon" }), "relative data-[popup-open]:bg-surface-2")}
        aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden data-active={menuOpen} className="ico size-[18px] shrink-0">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="badge-pop absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-(--risk-high) px-1 text-[10px] leading-none font-semibold text-paper tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="menu-popup w-[min(22rem,calc(100vw-32px))] rounded-md bg-surface-1 p-1.5 shadow-elev-2 outline-none">
            <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-2">
              <p className="t-small font-semibold text-fg-1">Notifications</p>
              {unread > 0 && (
                <button type="button" onClick={readAll} className="t-micro text-fg-3 underline underline-offset-4 hover:text-fg-1">
                  Mark all read
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="px-3 pt-1 pb-4 t-small text-fg-3">Nothing yet. Questions, replies and new changes show up here.</p>
            ) : (
              <div className="max-h-[60svh] overflow-y-auto">
                {items.map((n) => (
                  <Menu.Item
                    key={n.id}
                    onClick={() => open(n)}
                    className="press flex cursor-pointer items-start gap-3 rounded-sm px-3 py-2.5 outline-none data-[highlighted]:bg-surface-2"
                  >
                    <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : DOT[n.kind])} />
                    <span className="min-w-0">
                      <span className={cn("block t-small", n.read ? "text-fg-2" : "font-medium text-fg-1")}>{n.title}</span>
                      <span className="block t-micro text-fg-3">
                        {timeAgo(n.createdAt)}
                        {!n.read && <span className="sr-only">, new</span>}
                      </span>
                    </span>
                  </Menu.Item>
                ))}
              </div>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
