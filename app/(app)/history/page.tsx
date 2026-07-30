"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Clock3, History, Shuffle, Users } from "lucide-react";
import { formatRotationModeLabel, type HostEventRecord } from "@/lib/host-events";
import { listOwnerHostQueues } from "@/lib/supabase/host-queues";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function HistoryPage() {
  const [sessions, setSessions] = useState<HostEventRecord[]>([]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let isMounted = true;

    async function syncSessions() {
      try {
        const { data } = await supabase.auth.getSession();
        const ownerId = data.session?.user?.id ?? null;

        if (!isMounted) return;

        if (!ownerId) {
          setSessions([]);
          return;
        }

        const ownerSessions = await listOwnerHostQueues(ownerId);
        if (!isMounted) return;
        setSessions(ownerSessions);
      } catch {
        if (!isMounted) return;
        setSessions([]);
      }
    }

    void syncSessions();
    window.addEventListener("focus", syncSessions);
    window.addEventListener("storage", syncSessions);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", syncSessions);
      window.removeEventListener("storage", syncSessions);
    };
  }, []);

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (left, right) =>
          new Date(`${right.eventDate}T00:00:00`).getTime() -
          new Date(`${left.eventDate}T00:00:00`).getTime()
      ),
    [sessions]
  );

  const summary = useMemo(() => {
    const completedGames = sortedSessions.reduce((sum, session) => sum + session.completedGames.length, 0);
    const totalPlayers = sortedSessions.reduce((sum, session) => sum + session.players.length, 0);

    return {
      totalQueues: sortedSessions.length,
      completedGames,
      totalPlayers,
    };
  }, [sortedSessions]);

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-3xl border border-white/10 bg-panel p-6">
          <p className="text-xs uppercase tracking-[0.22em] text-mist/45">Queue History</p>
          <h1 className="mt-3 font-head text-3xl font-black">Past Queue Sessions</h1>
          <p className="mt-2 text-sm text-mist/55">
            Review every queue you created, how many games were completed, and which matchups have already run.
          </p>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <HistoryCard label="Queues Logged" value={summary.totalQueues.toString()} />
          <HistoryCard label="Completed Games" value={summary.completedGames.toString()} />
          <HistoryCard label="Players Logged" value={summary.totalPlayers.toString()} />
        </div>

        <div className="space-y-4">
          {sortedSessions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-panel p-6 text-sm text-mist/55">
              No queue history yet. Start and complete a queue first, then the session history will appear here.
            </div>
          ) : (
            sortedSessions.map((session) => (
              <div key={session.id} className="rounded-3xl border border-white/10 bg-panel p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-mist/40">{session.queueStatus}</p>
                    <h2 className="mt-2 font-head text-2xl font-black">{session.clubName}</h2>
                    <div className="mt-4 space-y-2 text-sm text-mist/60">
                      <p className="flex items-center gap-2">
                        <CalendarRange className="h-4 w-4 text-volt" />
                        {new Date(session.eventDate).toLocaleDateString()}
                      </p>
                      <p className="flex items-center gap-2">
                        <Clock3 className="h-4 w-4 text-volt" />
                        {session.time}
                      </p>
                      <p className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-volt" />
                        {session.players.length} players / {session.playFormat}
                      </p>
                      <p className="flex items-center gap-2">
                        <Shuffle className="h-4 w-4 text-volt" />
                        {formatRotationModeLabel(session.rotation)} rotation
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist/70">
                    Games completed:{" "}
                    <span className="font-semibold text-mist">{session.completedGames.length}</span>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-mist/40">Recent Matchups</p>
                  {session.completedGames.length === 0 ? (
                    <p className="mt-3 text-sm text-mist/55">No completed games recorded for this queue yet.</p>
                  ) : (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {session.completedGames.slice().reverse().slice(0, 6).map((game) => (
                        <div
                          key={game.id}
                          className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-mist/65"
                        >
                          <p className="font-semibold text-mist">{game.courtName}</p>
                          <p className="mt-1">{game.playerNames.join(", ")}</p>
                          <p className="mt-2 text-xs text-mist/45">
                            {new Date(game.completedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-panel p-5">
      <p className="text-xs uppercase tracking-wide text-mist/40">{label}</p>
      <p className="mt-3 font-head text-2xl font-black">{value}</p>
    </div>
  );
}
