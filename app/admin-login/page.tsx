"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, LoaderCircle, ShieldPlus, Zap } from "lucide-react";
import { clearAdminSession, readAdminSession, writeAdminSession } from "@/lib/admin-session";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void fetch("/api/admin/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          if (readAdminSession()) {
            clearAdminSession();
          }
          return;
        }

        router.replace("/admin");
      })
      .catch(() => {
        if (readAdminSession()) {
          clearAdminSession();
        }
      });
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setStatus("");

    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not open the admin environment.");
      }

      writeAdminSession();
      router.replace("/admin");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open the admin environment.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-ink">
      <Image
        src="https://images.unsplash.com/photo-1554068865-24cecd4e34b8?q=80&w=1600&auto=format&fit=crop"
        alt="Pickleball court at golden hour"
        fill
        priority
        className="object-cover brightness-[0.18]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(10,14,14,0.92),rgba(10,14,14,0.97))]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
        <section className="w-full max-w-md">
          <div className="glass rounded-[32px] p-6 shadow-2xl shadow-black/30 sm:p-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-mist/55 transition-colors hover:text-mist"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to main login
            </Link>

            <div className="mt-6">
              <div className="inline-flex items-center gap-2 text-mist">
                <ShieldPlus className="h-4 w-4 text-volt" />
                <span className="font-head text-2xl font-black tracking-tight sm:text-3xl">
                  ADMIN<span className="text-volt"> ENV</span>
                </span>
              </div>
              <p className="mt-3 text-sm text-mist/58">
                Use the dedicated admin environment to review queues, users, and system activity.
              </p>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wide text-mist/50">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="admin"
                  required
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition-colors placeholder:text-mist/30 focus:border-volt"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wide text-mist/50">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter admin password"
                  required
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition-colors placeholder:text-mist/30 focus:border-volt"
                />
              </div>

              {status && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {status}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="group mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 py-3.5 text-sm font-head font-bold text-ink transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    Open admin environment
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 flex items-center gap-2 text-xs text-mist/40">
              <Zap className="h-3.5 w-3.5 text-volt" />
              Stack & Serve admin route is separate from the main user sign-in.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
