"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/mock-platform";

type PublicRole = Exclude<AppRole, "admin">;

const roleCopy: Record<
  AppRole,
  {
    destination: string;
  }
> = {
  player: {
    destination: "/live",
  },
  host: {
    destination: "/manage",
  },
  admin: {
    destination: "/admin",
  },
};

const registerOptions = [
  {
    role: "host",
    label: "Sign in to start a queue",
    description: "Create your own queue sessions and keep games moving fairly.",
    icon: QueueIcon,
  },
] as const satisfies ReadonlyArray<{
  role: PublicRole;
  label: string;
  description: string;
  icon: typeof QueueIcon;
}>;

const supabaseEnvReady =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
const OAUTH_PENDING_ROLE_KEY = "stack-serve-oauth-pending-role";

function isPublicRole(role: string | null): role is PublicRole {
  return role === "player" || role === "host";
}

function getFallbackFullName(email?: string | null) {
  if (!email) return "Stack & Serve User";
  return email.split("@")[0] || "Stack & Serve User";
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.4c-.24 1.26-.96 2.33-2.04 3.05l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.49 0-.72-.06-1.41-.18-2.08H12Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.89 6.62-2.41l-3.3-2.56c-.92.61-2.09.97-3.32.97-2.55 0-4.71-1.72-5.49-4.03l-3.42 2.64A9.99 9.99 0 0 0 12 22Z"
      />
      <path
        fill="#4A90E2"
        d="M6.51 13.97A5.97 5.97 0 0 1 6.2 12c0-.68.12-1.34.31-1.97L3.09 7.39A10.01 10.01 0 0 0 2 12c0 1.61.38 3.13 1.09 4.61l3.42-2.64Z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.96c1.47 0 2.79.5 3.83 1.48l2.88-2.88C16.96 2.93 14.7 2 12 2A9.99 9.99 0 0 0 3.09 7.39l3.42 2.64C7.29 7.68 9.45 5.96 12 5.96Z"
      />
    </svg>
  );
}

function QueueIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none">
      <rect
        x="3.5"
        y="3.5"
        width="14"
        height="14"
        rx="2.6"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="7.6" cy="7.5" r="1.05" fill="currentColor" />
      <circle cx="7.6" cy="11" r="1.05" fill="currentColor" />
      <circle cx="7.6" cy="14.5" r="1.05" fill="currentColor" />
      <path
        d="M10.4 7.5h4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M10.4 11h4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10.4 14.5h4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="18.2" cy="16.9" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M19.9 18.6 22 20.7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M14.6 21c.6-1.5 1.8-2.3 3.6-2.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LoadingPickleball() {
  return (
    <div className="relative h-5 w-16">
      <div className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-white/70 bg-white/10 animate-[ball-bounce_1.1s_ease-in-out_infinite]" />
      <div className="absolute left-[18px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-volt/90 shadow-[0_0_12px_rgba(202,243,0,0.35)] animate-[ball-travel_1.1s_ease-in-out_infinite]" />
      <div className="absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-white/70 bg-white/10 animate-[paddle-bounce_1.1s_ease-in-out_infinite]" />
    </div>
  );
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "Something went wrong. Please try again.";
}

export default function AuthPage() {
  const router = useRouter();
  const [role, setRole] = useState<PublicRole>("host");
  const [status, setStatus] = useState<{ type: "idle" | "error"; message: string }>({
    type: "idle",
    message: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!supabaseEnvReady) return;

    const supabase = createBrowserSupabaseClient();

    void (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) return;

      let currentRole = session.user.user_metadata?.role as AppRole | undefined;
      const pendingRole =
        typeof window !== "undefined" ? window.localStorage.getItem(OAUTH_PENDING_ROLE_KEY) : null;

      if (isPublicRole(pendingRole) && currentRole !== pendingRole) {
        const existingName =
          session.user.user_metadata?.full_name ??
          session.user.user_metadata?.name ??
          session.user.user_metadata?.user_name;

        const { error } = await supabase.auth.updateUser({
          data: {
            role: pendingRole,
            roles: [pendingRole],
            full_name:
              typeof existingName === "string" && existingName.trim()
                ? existingName
                : getFallbackFullName(session.user.email),
          },
        });

        if (!error) {
          currentRole = pendingRole;
        }
      }

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(OAUTH_PENDING_ROLE_KEY);
      }

      if (currentRole === "player" || currentRole === "host" || currentRole === "admin") {
        router.replace(roleCopy[currentRole].destination);
      }
    })();
  }, [router]);

  async function handleGoogleAuth(nextRole?: PublicRole) {
    const targetRole = nextRole ?? role;

    if (!supabaseEnvReady) {
      setStatus({
        type: "error",
        message: "Add your Supabase URL and publishable key to .env.local before signing in.",
      });
      return;
    }

    setIsLoading(true);
    setStatus({ type: "idle", message: "" });
    setRole(targetRole);

    try {
      const supabase = createBrowserSupabaseClient();
      if (typeof window !== "undefined") {
        window.localStorage.setItem(OAUTH_PENDING_ROLE_KEY, targetRole);
      }

      const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (error) throw error;
    } catch (error) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(OAUTH_PENDING_ROLE_KEY);
      }

      const message = extractErrorMessage(error);
      setStatus({
        type: "error",
        message:
          message === "Something went wrong. Please try again."
            ? "Google sign-in could not start. Make sure the Google provider is enabled in Supabase and its redirect settings include your localhost URL."
            : message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-ink">
      <style jsx global>{`
        @keyframes ball-travel {
          0%,
          100% {
            transform: translate(0, -50%) scale(0.9);
          }
          25% {
            transform: translate(10px, -80%) scale(1);
          }
          50% {
            transform: translate(24px, -50%) scale(1.05);
          }
          75% {
            transform: translate(38px, -20%) scale(1);
          }
        }

        @keyframes ball-bounce {
          0%,
          100% {
            transform: translateY(-50%) rotate(-12deg);
          }
          50% {
            transform: translateY(-50%) rotate(6deg);
          }
        }

        @keyframes paddle-bounce {
          0%,
          100% {
            transform: translateY(-50%) rotate(12deg);
          }
          50% {
            transform: translateY(-50%) rotate(-6deg);
          }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <Image
          src="/stack-serve-logo.png"
          alt=""
          fill
          priority
          className="object-cover opacity-[0.09] blur-[1px] select-none"
        />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(202,243,0,0.2),transparent_32%),linear-gradient(135deg,rgba(10,14,14,0.86),rgba(10,14,14,0.95))]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
        <section className="w-full max-w-md">
          <div className="glass rounded-[32px] p-6 shadow-2xl shadow-black/30 sm:p-8">
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 text-mist">
                <Zap className="h-4 w-4 text-volt" />
                <span className="font-head text-2xl font-black tracking-tight sm:text-3xl">
                  STACK<span className="text-volt">&</span>SERVE
                </span>
              </div>
              <div className="mt-3 max-w-md font-head text-base font-bold uppercase tracking-[0.12em] text-mist/72 sm:text-lg">
                <p>Start the queue.</p>
                <p className="mt-1">Keep the games moving.</p>
              </div>
            </div>

            <div className="mx-auto grid max-w-[19rem] gap-4">
              {registerOptions.map(({ role: registerRole, label, description, icon: Icon }) => (
                <button
                  key={registerRole}
                  type="button"
                  onClick={() => void handleGoogleAuth(registerRole)}
                  disabled={isLoading || !supabaseEnvReady}
                  className="group rounded-[26px] border border-white/10 bg-white/5 p-5 text-left transition-all hover:border-white/25 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex justify-center">
                    <div className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-white/8 px-3.5">
                      <Zap className="h-5 w-5 text-volt" />
                      <Icon className="h-8 w-8 text-mist" />
                    </div>
                  </div>

                  <h2 className="mt-3 font-head text-xl font-black">{label}</h2>
                  <p className="mt-2 text-sm leading-6 text-mist/55">{description}</p>

                  <div className="mt-6 inline-flex items-center gap-3 text-sm font-head font-bold text-mist">
                    {isLoading && role === registerRole ? (
                      <>
                        <LoadingPickleball />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <GoogleIcon />
                        Continue with Google
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {status.type !== "idle" && (
              <div className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {status.message}
              </div>
            )}

            {!supabaseEnvReady && (
              <div className="mt-6 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                Supabase environment variables are missing. Add `NEXT_PUBLIC_SUPABASE_URL` and
                `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to `.env.local`.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
