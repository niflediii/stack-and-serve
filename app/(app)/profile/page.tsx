"use client";

import { useEffect, useMemo, useState } from "react";
import { Flame, Trophy, TrendingUp, Users } from "lucide-react";
import type { HostEventRecord } from "@/lib/host-events";
import { listOwnerHostQueues } from "@/lib/supabase/host-queues";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function ProfilePage() {
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

  const playerStats = useMemo(() => {
    const byName = new Map<string, { gamesPlayed: number; sessions: number; status: string }>();

    sessions.forEach((session) => {
      session.players.forEach((player) => {
        const current = byName.get(player.name) ?? {
          gamesPlayed: 0,
          sessions: 0,
          status: player.status,
        };

        byName.set(player.name, {
          gamesPlayed: current.gamesPlayed + player.gamesPlayed,
          sessions: current.sessions + 1,
          status: player.status,
        });
      });
    });

    return Array.from(byName.entries())
      .map(([name, value]) => ({ name, ...value }))
      .sort((left, right) => right.gamesPlayed - left.gamesPlayed);
  }, [sessions]);

  const summary = useMemo(() => {
    const totalGames = playerStats.reduce((sum, player) => sum + player.gamesPlayed, 0);
    const topPlayer = playerStats[0];

    return {
      totalPlayers: playerStats.length,
      totalGames,
      topPlayerName: topPlayer?.name ?? "No players yet",
      topPlayerGames: topPlayer?.gamesPlayed ?? 0,
    };
  }, [playerStats]);

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-3xl border border-white/10 bg-panel p-6">
          <p className="text-xs uppercase tracking-[0.22em] text-mist/45">Player Statistics</p>
          <h1 className="mt-3 font-head text-3xl font-black">Queue Performance Board</h1>
          <p className="mt-2 text-sm text-mist/55">
            Track how many games each player has completed across all queue sessions and who is leading the court load.
          </p>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Tracked Players" value={summary.totalPlayers.toString()} icon={<Users className="h-6 w-6 text-volt/70" />} />
          <StatCard label="Games Logged" value={summary.totalGames.toString()} icon={<TrendingUp className="h-6 w-6 text-volt/70" />} />
          <StatCard label="Top Player" value={summary.topPlayerName} icon={<Trophy className="h-6 w-6 text-volt/70" />} />
          <StatCard label="Top Games" value={summary.topPlayerGames.toString()} icon={<Flame className="h-6 w-6 text-volt/70" />} />
        </div>

        <div className="rounded-3xl border border-white/10 bg-panel p-5">
          <h2 className="font-head text-lg font-black">Player Game Count Summary</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-mist/45">
                <tr>
                  <th className="pb-3 font-medium">Player</th>
                  <th className="pb-3 font-medium">Games Played</th>
                  <th className="pb-3 font-medium">Sessions</th>
                  <th className="pb-3 font-medium">Current Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {playerStats.map((player) => (
                  <tr key={player.name}>
                    <td className="py-4 font-semibold">{player.name}</td>
                    <td className="py-4">{player.gamesPlayed}</td>
                    <td className="py-4">{player.sessions}</td>
                    <td className="py-4 capitalize">{player.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-mist/40">{label}</p>
          <p className="mt-3 font-head text-2xl font-black">{value}</p>
        </div>
        {icon}
      </div>
    </div>
  );
}
