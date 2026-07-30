"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<{ type: "idle" | "error" | "success"; message: string }>({
    type: "idle",
    message: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const url = new URL(window.location.href);
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");

    async function prepareRecoverySession() {
      if (tokenHash && type === "recovery") {
        const { error } = await supabase.auth.verifyOtp({
          type: "recovery",
          token_hash: tokenHash,
        });

        if (error) {
          setStatus({ type: "error", message: error.message });
          return;
        }
      }

      setIsReady(true);
    }

    void prepareRecoverySession();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setStatus({ type: "error", message: "Passwords do not match." });
      return;
    }

    setIsLoading(true);
    setStatus({ type: "idle", message: "" });

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      setStatus({
        type: "success",
        message: "Password updated successfully. You can now return to login.",
      });
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to update password.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-6 py-10">
      <div className="glass w-full max-w-md rounded-[28px] p-8 shadow-2xl shadow-black/30">
        <div className="mb-6 flex items-center gap-2 text-mist/70">
          <ShieldCheck className="h-4 w-4 text-volt" />
          <span className="text-xs uppercase tracking-[0.22em]">Password Recovery</span>
        </div>

        <h1 className="font-head text-3xl font-black">Reset your password</h1>
        <p className="mt-2 text-sm text-mist/55">
          Set a new password for your Stack&Serve account.
        </p>

        {!isReady ? (
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-mist/65">
            <LoaderCircle className="h-4 w-4 animate-spin text-volt" />
            Validating your recovery link...
          </div>
        ) : (
          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-mist/50">
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition-colors placeholder:text-mist/30 focus:border-volt"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-mist/50">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={6}
                required
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition-colors placeholder:text-mist/30 focus:border-volt"
              />
            </div>

            {status.type !== "idle" && (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  status.type === "error"
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                }`}
              >
                {status.message}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-volt py-3.5 text-sm font-head font-bold text-ink transition-colors hover:bg-volt/90 disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  Update password
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        <Link
          href="/"
          className="mt-6 inline-flex text-sm font-semibold text-volt transition-opacity hover:opacity-80"
        >
          Back to login
        </Link>
      </div>
    </main>
  );
}
