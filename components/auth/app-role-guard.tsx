"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { clearAdminSession, readAdminSession } from "@/lib/admin-session";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/mock-platform";

export function AppRoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: AppRole[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "allowed" | "blocked">("loading");

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    void (async () => {
      const adminResponse = await fetch("/api/admin/session", { cache: "no-store" }).catch(() => null);

      if (adminResponse?.ok) {
        if (allowedRoles.includes("admin")) {
          setState("allowed");
          return;
        }

        setState("blocked");
        return;
      }

      if (readAdminSession()) {
        clearAdminSession();
      }

      const { data } = await supabase.auth.getSession();
      const role = data.session?.user?.user_metadata?.role as AppRole | undefined;

      if (!role) {
        router.replace("/");
        return;
      }

      if (allowedRoles.includes(role)) {
        setState("allowed");
        return;
      }

      setState("blocked");
    })();
  }, [allowedRoles, router]);

  if (state === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-panel/80 px-5 py-3 text-sm text-mist/70">
          <LoaderCircle className="h-4 w-4 animate-spin text-volt" />
          Checking access...
        </div>
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <div className="rounded-3xl border border-white/10 bg-panel p-8">
          <p className="text-xs uppercase tracking-[0.25em] text-mist/45">Access Restricted</p>
          <h1 className="mt-3 font-head text-3xl font-black">This area is not available for your role.</h1>
          <p className="mt-3 text-sm leading-6 text-mist/55">
            Sign in with the correct account or go back to your main workspace.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full bg-volt px-5 py-3 text-sm font-head font-bold text-ink"
          >
            Return to login
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
