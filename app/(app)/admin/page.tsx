"use client";

import { useEffect, useMemo, useState } from "react";
import { AppRoleGuard } from "@/components/auth/app-role-guard";
import type { HostEventRecord } from "@/lib/host-events";

type AdminQueueRecord = HostEventRecord & {
  ownerName: string;
  ownerEmail: string;
};

export default function AdminPage() {
  const [sessions, setSessions] = useState<AdminQueueRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function syncSessions() {
      setStatus("loading");
      setErrorMessage("");

      try {
        const response = await fetch("/api/admin/queues", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { sessions?: AdminQueueRecord[]; error?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error || "Could not load the admin queue overview.");
        }

        if (!isMounted) return;
        setSessions(Array.isArray(payload?.sessions) ? payload.sessions : []);
        setStatus("ready");
      } catch (error) {
        if (!isMounted) return;
        setSessions([]);
        setStatus("error");
        setErrorMessage(
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "Could not load the admin queue overview."
        );
      }
    }

    void syncSessions();
    window.addEventListener("focus", syncSessions);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", syncSessions);
    };
  }, []);

  const summary = useMemo(() => {
    const uniqueHosts = new Set(
      sessions.map((session) => session.ownerEmail || session.ownerName || session.ownerId || session.id)
    );
    const totalPlayers = sessions.reduce((sum, session) => sum + session.players.length, 0);
    const activeCourts = sessions.reduce(
      (sum, session) => sum + session.activeCourtAssignments.length,
      0
    );
    const totalGames = sessions.reduce((sum, session) => sum + session.completedGames.length, 0);

    return {
      totalHosts: uniqueHosts.size,
      totalQueues: sessions.length,
      totalPlayers,
      activeCourts,
      totalGames,
    };
  }, [sessions]);

  return (
    <AppRoleGuard allowedRoles={["admin"]}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.25em] text-mist/45">Admin Console</p>
          <h1 className="mt-2 font-head text-2xl font-black sm:text-3xl">Platform Overview</h1>
          <p className="mt-2 text-sm text-mist/55">
            Review all host queues across the platform, inspect who owns them, and monitor player and game activity.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <AdminMetric label="Hosts" value={summary.totalHosts.toString()} />
          <AdminMetric label="Queues" value={summary.totalQueues.toString()} />
          <AdminMetric label="Players" value={summary.totalPlayers.toString()} />
          <AdminMetric label="Active Courts" value={summary.activeCourts.toString()} />
          <AdminMetric label="Games Completed" value={summary.totalGames.toString()} />
        </div>

        {status === "error" && (
          <div className="mt-6 rounded-3xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">
            {errorMessage}
            <div className="mt-2 text-rose-100/80">
              Make sure `SUPABASE_SERVICE_ROLE_KEY` is present in `.env.local` and the `host_queues` table has been created in Supabase.
            </div>
          </div>
        )}

        <div className="mt-6 rounded-3xl border border-white/10 bg-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-head text-lg font-black">All Queue Sessions</h2>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-wide text-mist/55">
              {status === "loading" ? "Loading" : `${sessions.length} queues`}
            </span>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-mist/45">
                <tr>
                  <th className="pb-3 font-medium">Queue</th>
                  <th className="pb-3 font-medium">Host</th>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Format</th>
                  <th className="pb-3 font-medium">Courts</th>
                  <th className="pb-3 font-medium">Players</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Games</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td className="py-4 font-semibold">{session.clubName}</td>
                    <td className="py-4">
                      <div className="font-medium text-mist">{session.ownerName}</div>
                      <div className="text-xs text-mist/45">{session.ownerEmail || "No email available"}</div>
                    </td>
                    <td className="py-4 text-mist/65">{new Date(session.eventDate).toLocaleDateString()}</td>
                    <td className="py-4 capitalize">{session.playFormat}</td>
                    <td className="py-4">{session.courts.length}</td>
                    <td className="py-4">{session.players.length}</td>
                    <td className="py-4 capitalize">{session.queueStatus}</td>
                    <td className="py-4">{session.completedGames.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {status === "ready" && sessions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-mist/55">
                No queues have been created yet.
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-panel p-5">
          <h2 className="font-head text-lg font-black">Queue History</h2>
          <div className="mt-5 space-y-3">
            {status === "loading" ? (
              <p className="text-sm text-mist/55">Loading queue history...</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-mist/55">No queue history yet.</p>
            ) : (
              sessions.map((session) => (
                <div key={session.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-mist">{session.clubName}</p>
                      <p className="mt-1 text-sm text-mist/55">
                        {session.ownerName}
                        {session.ownerEmail ? ` · ${session.ownerEmail}` : ""}
                      </p>
                      <p className="mt-1 text-sm text-mist/55">
                        {new Date(session.eventDate).toLocaleDateString()} · {session.time}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-wide text-mist/65">
                      {session.queueStatus}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-mist/60">
                    {session.completedGames.length} completed games · {session.players.length} players ·{" "}
                    {session.courts.length} courts
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppRoleGuard>
  );
}

function AdminMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-panel p-5">
      <p className="text-xs uppercase tracking-wide text-mist/40">{label}</p>
      <p className="mt-3 font-head text-3xl font-black">{value}</p>
    </div>
  );
}
