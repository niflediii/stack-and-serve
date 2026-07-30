"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  ClipboardList,
  LogOut,
  Settings2,
  ShieldCheck,
  User,
  Users,
  Zap,
} from "lucide-react";
import { clearAdminSession, readAdminSession } from "@/lib/admin-session";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/mock-platform";

const navItemsByRole = {
  player: [
    { href: "/live", label: "Sessions", icon: Users },
    { href: "/profile", label: "Stats", icon: User },
  ],
  host: [
    { href: "/manage", label: "Dashboard", icon: ClipboardList },
    { href: "/history", label: "Queue History", icon: Activity },
  ],
  admin: [
    { href: "/admin", label: "Overview", icon: ShieldCheck },
    { href: "/live", label: "Sessions", icon: Activity },
    { href: "/profile", label: "Account", icon: Settings2 },
  ],
} as const;

export default function AppShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<AppRole>("player");
  const [displayName, setDisplayName] = useState("Signed-in user");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    void (async () => {
      const adminResponse = await fetch("/api/admin/session", { cache: "no-store" }).catch(() => null);
      if (adminResponse?.ok) {
        const adminPayload = (await adminResponse.json().catch(() => null)) as
          | { username?: string }
          | null;

        setRole("admin");
        setDisplayName(adminPayload?.username?.trim() || "admin");
        setAvatarUrl(null);
        return;
      }

      if (readAdminSession()) {
        clearAdminSession();
      }

      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      const currentRole = data.session?.user?.user_metadata?.role as AppRole | undefined;
      if (currentRole === "player" || currentRole === "host" || currentRole === "admin") {
        setRole(currentRole);
      }

      const nextName =
        user?.user_metadata?.full_name ??
        user?.user_metadata?.name ??
        user?.email?.split("@")[0] ??
        "Signed-in user";

      if (typeof nextName === "string" && nextName.trim()) {
        setDisplayName(nextName.trim());
      }

      const nextAvatar =
        (typeof user?.user_metadata?.avatar_url === "string" && user.user_metadata.avatar_url.trim()) ||
        (typeof user?.user_metadata?.picture === "string" && user.user_metadata.picture.trim()) ||
        (typeof user?.user_metadata?.image === "string" && user.user_metadata.image.trim()) ||
        null;
      setAvatarUrl(nextAvatar);
    })();
  }, []);

  async function handleSignOut() {
    if (readAdminSession()) {
      await fetch("/api/admin/session", { method: "DELETE" }).catch(() => null);
      clearAdminSession();
    }

    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut().catch(() => null);
    router.replace("/");
  }

  const navItems = navItemsByRole[role];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Desktop top nav */}
      <header className="hidden lg:flex items-center justify-between px-8 h-16 border-b border-white/10 bg-panel/60 backdrop-blur-md sticky top-0 z-40">
        <Link href="/live" className="flex items-center gap-2 font-head font-black text-lg">
          <Zap className="h-5 w-5 text-volt" />
          STACK<span className="text-volt">&</span>SERVE
        </Link>

        <nav className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-volt/10 text-volt"
                    : "text-mist/60 hover:text-mist hover:bg-white/5"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-mist/45">
              {role === "host" ? "user" : role}
            </span>
          </div>
          <div
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5"
            title={displayName}
            aria-label={displayName}
          >
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-volt/10 text-sm font-head font-black uppercase text-volt">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="h-full w-full object-cover"
                  onError={() => setAvatarUrl(null)}
                />
              ) : (
                <span>{getInitials(displayName)}</span>
              )}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex h-9 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold uppercase tracking-wide text-mist/70 hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 pb-20 lg:pb-0">{children}</main>

      {/* Mobile bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-panel/90 backdrop-blur-md">
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-volt" : "text-mist/50"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function getInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => /[A-Za-z]/.test(part));

  if (parts.length === 0) {
    return "SS";
  }

  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  const initials = `${first}${last || first}`.toUpperCase();
  return initials.slice(0, 2);
}
