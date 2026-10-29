"use client";

import { Menu } from "@base-ui/react/menu";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { roleNoun } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { cn, firstName } from "@/lib/utils";
import { buttonStyles } from "./button";
import { Avatar } from "./person";

const itemClass =
  "press flex h-10 cursor-pointer items-center rounded-full px-3 t-small font-medium text-fg-1 outline-none data-[highlighted]:bg-surface-2";

/** Right side of the nav: Log in / Get started, or the account menu. */
export function AccountNav() {
  const { user, org, status, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  if (status === "loading") return <span aria-hidden className="inline-block h-10 w-36" />;

  if (!user) {
    const next = pathname && pathname.startsWith("/app") ? `?next=${encodeURIComponent(pathname)}` : "";
    return (
      <>
        <Link href={`/login${next}`} className={cn(buttonStyles({ variant: "secondary", dot: true }), "nav-pulse max-sm:px-3.5")}>
          Log in
        </Link>
        <Link href="/signup" className={cn(buttonStyles({ variant: "primary" }), "max-sm:px-3.5")}>
          Get started
        </Link>
      </>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(buttonStyles({ variant: "ghost" }), "gap-2 pr-3 pl-1.5 data-[popup-open]:bg-surface-2")}
        aria-label={`Account: ${user.name}`}
      >
        <Avatar name={user.name} size={28} lead />
        <span className="max-w-32 truncate max-sm:sr-only">{firstName(user.name)}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="menu-popup w-64 rounded-md bg-surface-1 p-1.5 shadow-elev-2 outline-none">
            <div className="px-3 pt-2 pb-3">
              <p className="truncate t-small font-semibold text-fg-1">{user.name}</p>
              <p className="truncate t-small text-fg-3">{user.email}</p>
              <p className="mt-2 t-micro text-fg-2">
                {roleNoun(user.role).replace(/^a(n)? /, (m) => m.charAt(0).toUpperCase() + m.slice(1))}
                {org && ` at ${org.name}`}
              </p>
            </div>
            {pathname?.startsWith("/app") ? null : (
              <Menu.Item className={itemClass} onClick={() => router.push("/app")}>
                Open Rosetta
              </Menu.Item>
            )}
            <Menu.Item className={itemClass} onClick={() => router.push("/app/profile")}>
              Profile and preferences
            </Menu.Item>
            <Menu.Item
              className={itemClass}
              onClick={() => {
                logout();
                toast("Logged out.");
                router.push("/");
              }}
            >
              Log out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
