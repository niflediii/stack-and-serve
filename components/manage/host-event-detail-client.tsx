"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Clock3,
  CheckCircle2,
  Minus,
  Plus,
  Play,
  RotateCcw,
  Save,
  Settings2,
  Shuffle,
  Square,
  Trash2,
  Trophy,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { AppRoleGuard } from "@/components/auth/app-role-guard";
import {
  deriveEventQueue,
  deriveUpcomingMatchPlayers,
  formatRotationModeLabel,
  formatTimeRange,
  getQueueSummary,
  parseTimeLabelToTimeInputs,
  type HostEventRecord,
  type HostGenderGroup,
  type HostPlayFormat,
  type HostRotationMode,
  type WinningTeamSide,
} from "@/lib/host-events";
import {
  addCourtToOwnerHostQueue,
  addPlayerToOwnerHostQueue,
  completeOwnerHostQueueCourtGame,
  loadOwnerHostQueue,
  replaceActivePlayerOnOwnerHostQueue,
  removeCourtFromOwnerHostQueue,
  removePlayerFromOwnerHostQueue,
  resumeOwnerHostQueue,
  saveUpdatedOwnerHostQueue,
  startOrStopOwnerHostQueue,
} from "@/lib/supabase/host-queues";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const genderOptions: HostGenderGroup[] = ["male", "female", "mixed"];
const playFormatOptions: HostPlayFormat[] = ["single", "doubles"];
const rotationOptions: Array<{
  value: HostRotationMode;
  label: string;
  description: string;
}> = [
  {
    value: "random",
    label: "Random",
    description: "System chooses players based on fewest games, waiting time, and repeats.",
  },
  {
    value: "winLose",
    label: "Win/Lose",
    description: "Players regroup by their most recent result, with winners facing winners and losers facing losers.",
  },
];

export function HostEventDetailClient({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<HostEventRecord | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [clubName, setClubName] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [numberOfPlayers, setNumberOfPlayers] = useState(24);
  const [genderGroup, setGenderGroup] = useState<HostGenderGroup>("mixed");
  const [playFormat, setPlayFormat] = useState<HostPlayFormat>("doubles");
  const [rotation, setRotation] = useState<HostRotationMode>("random");
  const [saveMessage, setSaveMessage] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());
  const [isStopConfirmOpen, setIsStopConfirmOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isLeaderboardModalOpen, setIsLeaderboardModalOpen] = useState(false);
  const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [rosterMessage, setRosterMessage] = useState("");
  const [selectedWinnerByGameId, setSelectedWinnerByGameId] = useState<Record<string, WinningTeamSide>>({});
  const [replacePlayerState, setReplacePlayerState] = useState<{
    courtId: string;
    currentPlayerId: string;
    replacementPlayerId: string;
  } | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let isMounted = true;

    async function syncEvent() {
      try {
        const { data } = await supabase.auth.getSession();
        const currentOwnerId = data.session?.user?.id ?? null;
        if (!isMounted) return;
        setOwnerId(currentOwnerId);

        if (!currentOwnerId) {
          setEvent(null);
          return;
        }

        const currentEvent = await loadOwnerHostQueue(eventId, currentOwnerId);
        if (!isMounted) return;
        setEvent(currentEvent);

        if (!currentEvent) return;

        const { startTime: initialStartTime, endTime: initialEndTime } = parseTimeLabelToTimeInputs(
          currentEvent.time
        );

        setClubName(currentEvent.clubName);
        setStartTime(initialStartTime);
        setEndTime(initialEndTime);
        setNumberOfPlayers(currentEvent.numberOfPlayers);
        setGenderGroup(currentEvent.genderGroup);
        setPlayFormat(currentEvent.playFormat);
        setRotation(currentEvent.rotation);
      } catch (error) {
        if (!isMounted) return;
        setEvent(null);
        setSaveMessage(
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "We couldn't load this queue right now. Please refresh and try again."
        );
      }
    }

    void syncEvent();
    window.addEventListener("focus", syncEvent);
    window.addEventListener("storage", syncEvent);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", syncEvent);
      window.removeEventListener("storage", syncEvent);
    };
  }, [eventId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!event) {
      setSelectedWinnerByGameId({});
      return;
    }

    setSelectedWinnerByGameId((current) => {
      const activeGameIds = new Set(event.activeCourtAssignments.map((assignment) => assignment.gameId));
      const nextEntries = Object.entries(current).filter(([gameId]) => activeGameIds.has(gameId));
      return Object.fromEntries(nextEntries);
    });
  }, [event]);

  const queue = useMemo(() => (event ? deriveEventQueue(event) : []), [event]);
  const queueSummary = event ? getQueueSummary(event) : null;
  const hasQueueWindowLapsed = useMemo(() => {
    if (!event || event.queueStatus === "draft") return false;
    if (!event.eventDate || !endTime) return false;

    const queueEndTimestamp = new Date(`${event.eventDate}T${endTime}:00`).getTime();
    if (Number.isNaN(queueEndTimestamp)) return false;

    return nowTick >= queueEndTimestamp;
  }, [endTime, event, nowTick]);
  const nextPlayersUp = useMemo(() => (event ? deriveUpcomingMatchPlayers(event) : []), [event]);
  const upcomingMatchSummary = useMemo(() => {
    if (!event || nextPlayersUp.length === 0) {
      return "No waiting players are lined up yet.";
    }

    return formatMatchup(
      nextPlayersUp.map((player) => player.name),
      event.playFormat
    );
  }, [event, nextPlayersUp]);
  const activeCourts = useMemo(() => {
    if (!event) return [];

    return event.courts.map((court) => {
      const assignment = event.activeCourtAssignments.find((entry) => entry.courtId === court.id);
      return {
        ...court,
        assignment,
        players: assignment
          ? assignment.playerIds
              .map((playerId) => event.players.find((player) => player.id === playerId))
              .filter((player): player is NonNullable<typeof player> => Boolean(player))
          : [],
      };
    });
  }, [event]);
  const replacePlayerCourt = useMemo(() => {
    if (!replacePlayerState) return null;
    return activeCourts.find(
      (court) => court.id === replacePlayerState.courtId && Boolean(court.assignment)
    ) ?? null;
  }, [activeCourts, replacePlayerState]);
  const availableReplacementPlayers = useMemo(() => {
    if (!event || !replacePlayerState) {
      return [];
    }

    const activePlayerIds = new Set(event.activeCourtAssignments.flatMap((assignment) => assignment.playerIds));
    const queuePositions = new Map(queue.map((entry) => [entry.id, entry.position]));

    return event.players
      .filter(
        (player) =>
          player.id !== replacePlayerState.currentPlayerId && !activePlayerIds.has(player.id)
      )
      .sort((left, right) => {
        const leftPosition = queuePositions.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightPosition = queuePositions.get(right.id) ?? Number.MAX_SAFE_INTEGER;
        if (leftPosition !== rightPosition) {
          return leftPosition - rightPosition;
        }

        return left.name.localeCompare(right.name);
      })
      .map((player) => ({
        ...player,
        queuePosition: queuePositions.get(player.id) ?? event.players.length + 1,
      }));
  }, [event, queue, replacePlayerState]);
  const canAddCourt = Boolean(event);
  const isRosterFull = event ? event.players.length >= event.numberOfPlayers : false;
  const isWinLoseRotation = event?.rotation === "winLose";
  const playerStatistics = useMemo(() => {
    if (!event) {
      return [];
    }

    const queueLookup = new Map(queue.map((entry) => [entry.id, entry]));
    const winCounts = new Map<string, number>();
    const lossCounts = new Map<string, number>();

    event.completedGames.forEach((game) => {
      game.winnerPlayerIds?.forEach((playerId) => {
        winCounts.set(playerId, (winCounts.get(playerId) ?? 0) + 1);
      });
      game.loserPlayerIds?.forEach((playerId) => {
        lossCounts.set(playerId, (lossCounts.get(playerId) ?? 0) + 1);
      });
    });

    return event.players
      .map((player) => {
        const queueEntry = queueLookup.get(player.id);

        return {
          id: player.id,
          name: player.name,
          gamesPlayed: player.gamesPlayed,
          wins: winCounts.get(player.id) ?? 0,
          losses: lossCounts.get(player.id) ?? 0,
          latestResult: player.latestResult ?? null,
          statusLabel:
            queueEntry?.playerType ??
            (player.status === "playing"
              ? "Playing now"
              : player.status === "resting"
              ? "Resting"
              : "Waiting"),
        };
      })
      .sort((left, right) => {
        if (right.gamesPlayed !== left.gamesPlayed) {
          return right.gamesPlayed - left.gamesPlayed;
        }

        if (right.wins !== left.wins) {
          return right.wins - left.wins;
        }

        return left.name.localeCompare(right.name);
      });
  }, [event, queue]);
  const statisticsSummary = useMemo(() => {
    if (!event) {
      return {
        activePlayers: 0,
        offCourtPlayers: 0,
        averageGamesPlayed: "0.0",
        fairnessGap: 0,
      };
    }

    const activePlayers = event.activeCourtAssignments.reduce(
      (sum, assignment) => sum + assignment.playerIds.length,
      0
    );
    const offCourtPlayers = Math.max(0, event.players.length - activePlayers);
    const totalGamesPlayed = event.players.reduce((sum, player) => sum + player.gamesPlayed, 0);
    const averageGamesPlayed =
      event.players.length > 0 ? (totalGamesPlayed / event.players.length).toFixed(1) : "0.0";
    const gameCounts = event.players.map((player) => player.gamesPlayed);
    const fairnessGap =
      gameCounts.length > 0 ? Math.max(...gameCounts) - Math.min(...gameCounts) : 0;

    return {
      activePlayers,
      offCourtPlayers,
      averageGamesPlayed,
      fairnessGap,
    };
  }, [event]);
  const leaderboardPlayers = useMemo(() => {
    return [...playerStatistics]
      .sort((left, right) => {
        if (right.wins !== left.wins) {
          return right.wins - left.wins;
        }

        if (left.losses !== right.losses) {
          return left.losses - right.losses;
        }

        if (right.gamesPlayed !== left.gamesPlayed) {
          return right.gamesPlayed - left.gamesPlayed;
        }

        return left.name.localeCompare(right.name);
      })
      .map((player, index) => ({
        ...player,
        rank: index + 1,
      }));
  }, [playerStatistics]);
  const leaderboardPodium = useMemo(() => {
    if (leaderboardPlayers.length === 0) {
      return [];
    }

    const secondPlace = leaderboardPlayers[1];
    const firstPlace = leaderboardPlayers[0];
    const thirdPlace = leaderboardPlayers[2];

    return [secondPlace, firstPlace, thirdPlace].filter(
      (
        player
      ): player is (typeof leaderboardPlayers)[number] => Boolean(player)
    );
  }, [leaderboardPlayers]);
  const leaderboardRemainder = useMemo(
    () => leaderboardPlayers.slice(3),
    [leaderboardPlayers]
  );

  useEffect(() => {
    if (!replacePlayerState || !replacePlayerCourt) {
      return;
    }

    const firstCourtPlayerId = replacePlayerCourt.players[0]?.id;
    if (!firstCourtPlayerId) {
      setReplacePlayerState(null);
      return;
    }

    const currentPlayerStillOnCourt = replacePlayerCourt.players.some(
      (player) => player.id === replacePlayerState.currentPlayerId
    );

    if (!currentPlayerStillOnCourt) {
      setReplacePlayerState((current) =>
        current
          ? {
              ...current,
              currentPlayerId: firstCourtPlayerId,
              replacementPlayerId: "",
            }
          : current
      );
      return;
    }

    if (
      replacePlayerState.replacementPlayerId &&
      !availableReplacementPlayers.some(
        (player) => player.id === replacePlayerState.replacementPlayerId
      )
    ) {
      setReplacePlayerState((current) =>
        current
          ? {
              ...current,
              replacementPlayerId: "",
            }
          : current
      );
    }
  }, [availableReplacementPlayers, replacePlayerCourt, replacePlayerState]);

  async function persistEventMutation(
    mutation: (currentEvent: HostEventRecord, currentOwnerId: string) => Promise<HostEventRecord | null>
  ) {
    if (!event || !ownerId || event.ownerId !== ownerId) return null;

    try {
      const nextEvent = await mutation(event, ownerId);
      if (nextEvent) {
        setEvent(nextEvent);
      }

      return nextEvent;
    } catch (error) {
      setSaveMessage(
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "We couldn't save that queue update right now. Please try again."
      );
      window.setTimeout(() => setSaveMessage(""), 2400);
      return null;
    }
  }

  async function handleSave() {
    if (!event || !ownerId || event.ownerId !== ownerId) return;

    await persistEventMutation((currentEvent, currentOwnerId) =>
      saveUpdatedOwnerHostQueue(currentEvent.id, currentOwnerId, {
        clubName: clubName.trim() || "Queue",
        location: "",
        eventDate: currentEvent.eventDate,
        time: formatTimeRange(startTime, endTime),
        numberOfPlayers,
        skillFocus: "",
        genderGroup,
        playFormat,
        rotation,
        visibility: "public",
        costPerHead: 0,
        joinedCount: Math.min(currentEvent.joinedPlayers.length, numberOfPlayers),
      })
    );
    setSaveMessage("Queue details saved.");
    window.setTimeout(() => setSaveMessage(""), 2400);
  }

  async function handleStartStacking() {
    await persistEventMutation((currentEvent, currentOwnerId) =>
      startOrStopOwnerHostQueue(currentEvent.id, currentOwnerId, true)
    );
  }

  async function handleStopStacking() {
    await persistEventMutation((currentEvent, currentOwnerId) =>
      startOrStopOwnerHostQueue(currentEvent.id, currentOwnerId, false)
    );
    setIsStopConfirmOpen(false);
  }

  async function handleResumeQueue() {
    await persistEventMutation((currentEvent, currentOwnerId) =>
      resumeOwnerHostQueue(currentEvent.id, currentOwnerId)
    );
  }

  async function handleCompleteGame(courtId: string) {
    if (!event || !ownerId || event.ownerId !== ownerId) return;

    const currentAssignment = event.activeCourtAssignments.find((assignment) => assignment.courtId === courtId);
    const winnerSide = currentAssignment
      ? selectedWinnerByGameId[currentAssignment.gameId]
      : undefined;

    if (!winnerSide) {
      setSaveMessage("Select the winning team before completing the game.");
      window.setTimeout(() => setSaveMessage(""), 2400);
      return;
    }

    const nextEvent = await persistEventMutation((currentEvent, currentOwnerId) =>
      completeOwnerHostQueueCourtGame(currentEvent.id, currentOwnerId, courtId, winnerSide)
    );

    if (nextEvent && currentAssignment) {
      setSelectedWinnerByGameId((current) => {
        const nextSelections = { ...current };
        delete nextSelections[currentAssignment.gameId];
        return nextSelections;
      });
    }
  }

  function openReplacePlayerModal(courtId: string) {
    const selectedCourt = activeCourts.find((court) => court.id === courtId);
    const firstPlayerId = selectedCourt?.players[0]?.id;

    if (!selectedCourt?.assignment || !firstPlayerId) {
      setSaveMessage("Start a matchup on this court first before replacing a player.");
      window.setTimeout(() => setSaveMessage(""), 2400);
      return;
    }

    setReplacePlayerState({
      courtId,
      currentPlayerId: firstPlayerId,
      replacementPlayerId: "",
    });
  }

  async function handleReplaceActivePlayer() {
    if (!event || !ownerId || event.ownerId !== ownerId || !replacePlayerState) return;

    if (!replacePlayerState.replacementPlayerId) {
      setSaveMessage("Select a replacement player first.");
      window.setTimeout(() => setSaveMessage(""), 2400);
      return;
    }

    const currentPlayer = event.players.find(
      (player) => player.id === replacePlayerState.currentPlayerId
    );
    const replacementPlayer = event.players.find(
      (player) => player.id === replacePlayerState.replacementPlayerId
    );
    const courtName = resolveCourtName(event, replacePlayerState.courtId);

    const nextEvent = await persistEventMutation((currentEvent, currentOwnerId) =>
      replaceActivePlayerOnOwnerHostQueue(
        currentEvent.id,
        currentOwnerId,
        replacePlayerState.courtId,
        replacePlayerState.currentPlayerId,
        replacePlayerState.replacementPlayerId
      )
    );

    if (nextEvent) {
      setReplacePlayerState(null);
      setSaveMessage(
        `${replacementPlayer?.name ?? "Replacement player"} is now on ${courtName} in place of ${
          currentPlayer?.name ?? "the selected player"
        }.`
      );
      window.setTimeout(() => setSaveMessage(""), 2400);
    }
  }

  async function handleAddCourt() {
    if (!event || !ownerId || event.ownerId !== ownerId) return;

    const nextCourtNumber = event.courts.length + 1;
    const nextEvent = await persistEventMutation((currentEvent, currentOwnerId) =>
      addCourtToOwnerHostQueue(currentEvent.id, currentOwnerId)
    );

    if (nextEvent) {
      setSaveMessage(`Court ${nextCourtNumber} added.`);
      window.setTimeout(() => setSaveMessage(""), 2400);
    }
  }

  async function handleRemoveCourt(courtId: string) {
    if (!event || !ownerId || event.ownerId !== ownerId) return;

    const courtToRemove = event.courts.find((court) => court.id === courtId);
    if (!courtToRemove) return;

    if (event.courts.length <= 1) {
      setSaveMessage("At least one court must remain in the queue.");
      window.setTimeout(() => setSaveMessage(""), 2400);
      return;
    }

    const hasActiveAssignment = event.activeCourtAssignments.some(
      (assignment) => assignment.courtId === courtToRemove.id
    );

    if (hasActiveAssignment) {
      setSaveMessage(`Complete or stop ${courtToRemove.name} before removing it.`);
      window.setTimeout(() => setSaveMessage(""), 2400);
      return;
    }

    const nextEvent = await persistEventMutation((currentEvent, currentOwnerId) =>
      removeCourtFromOwnerHostQueue(currentEvent.id, currentOwnerId, courtId)
    );

    if (nextEvent) {
      setSaveMessage(`${courtToRemove.name} removed.`);
      window.setTimeout(() => setSaveMessage(""), 2400);
    }
  }

  async function handleAddPlayer() {
    if (!event || !ownerId || event.ownerId !== ownerId) return;

    const trimmedName = newPlayerName.trim();
    if (!trimmedName) {
      setRosterMessage("Enter a player name first.");
      return;
    }

    if (event.players.length >= event.numberOfPlayers) {
      setRosterMessage(
        `This queue is already full at ${event.numberOfPlayers} players. Increase the player count first if you want to add more.`
      );
      return;
    }

    const nameExists = event.players.some(
      (player) => player.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (nameExists) {
      setRosterMessage("That player is already in the roster.");
      return;
    }

    const playerId = crypto.randomUUID();
    await persistEventMutation((currentEvent, currentOwnerId) =>
      addPlayerToOwnerHostQueue(currentEvent.id, currentOwnerId, {
        id: playerId,
        name: trimmedName,
        joinedAt: new Date().toISOString(),
        playerType: currentEvent.playFormat === "single" ? "Solo" : "Group",
        skill: "",
      })
    );
    setNewPlayerName("");
    setRosterMessage(`${trimmedName} added to the roster.`);
    window.setTimeout(() => setRosterMessage(""), 2400);
  }

  async function handleRemovePlayer(playerId: string) {
    if (!event || !ownerId || event.ownerId !== ownerId) return;

    const playerToRemove = event.players.find((player) => player.id === playerId);
    if (!playerToRemove) {
      setRosterMessage("That player is no longer in the roster.");
      return;
    }

    const isPlayerActive = event.activeCourtAssignments.some((assignment) =>
      assignment.playerIds.includes(playerId)
    );

    if (isPlayerActive) {
      setRosterMessage(
        `${playerToRemove.name} is currently on an active court. Complete the game first before removing this player.`
      );
      return;
    }

    await persistEventMutation((currentEvent, currentOwnerId) =>
      removePlayerFromOwnerHostQueue(currentEvent.id, currentOwnerId, playerId)
    );
    setRosterMessage(`${playerToRemove.name} removed from the roster.`);
    window.setTimeout(() => setRosterMessage(""), 2400);
  }

  if (!event) {
    return (
      <AppRoleGuard allowedRoles={["host"]}>
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-white/10 bg-panel p-8 text-center">
            <h1 className="font-head text-2xl font-black">Queue not found</h1>
            <p className="mt-3 text-sm text-mist/55">
              This queue is no longer available. Head back to your workspace and choose another one.
            </p>
            <Link
              href="/manage"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-volt px-5 py-3 text-sm font-head font-bold text-ink"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to queues
            </Link>
          </div>
        </div>
      </AppRoleGuard>
    );
  }

  return (
    <AppRoleGuard allowedRoles={["host"]}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="sticky top-0 z-30 -mx-4 mb-6 border-y border-white/10 bg-ink/92 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:top-16 lg:-mx-8 lg:px-8">
          <div className="rounded-2xl border border-volt/25 bg-[linear-gradient(90deg,rgba(201,255,0,0.12),rgba(84,107,221,0.18))] px-4 py-3 shadow-[0_14px_36px_rgba(0,0,0,0.18)]">
            <div className="flex min-w-0 items-center gap-3 text-sm text-mist">
              <span className="shrink-0 rounded-full border border-volt/25 bg-volt/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-volt">
                Upcoming matchup
              </span>
              <p className="min-w-0 truncate font-head text-sm font-bold text-mist/90" title={upcomingMatchSummary}>
                {upcomingMatchSummary}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link
              href="/manage"
              className="inline-flex items-center gap-2 text-sm text-mist/55 transition-colors hover:text-mist"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to queues
            </Link>
            <p className="mt-5 text-xs uppercase tracking-[0.25em] text-mist/45">Live queue</p>
            <h1 className="mt-2 font-head text-3xl font-black sm:text-4xl">{event.clubName}</h1>
            <p className="mt-2 max-w-2xl text-sm text-mist/55">
              Edit the queue details, check who already joined, customize each court, and launch the live queue when you are ready.
            </p>
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-mist/45">
              Rotation: {formatRotationModeLabel(event.rotation)}
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap">
              {queueSummary && (
                <div className="inline-flex min-w-[170px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-head font-bold text-mist/80 whitespace-nowrap">
                  <Clock3 className="h-4 w-4 text-volt" />
                  Remaining {formatDuration(Math.floor(queueSummary.remainingMs / 1000))}
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleStartStacking()}
                disabled={event.queueStatus === "running" || hasQueueWindowLapsed}
                className="inline-flex min-w-[170px] items-center justify-center gap-2 rounded-full bg-volt px-5 py-3 text-sm font-head font-bold text-ink whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Play className="h-4 w-4" />
                {event.queueStatus === "running"
                  ? "Queue running"
                  : hasQueueWindowLapsed
                  ? "Queue ended"
                  : "Start queue"}
              </button>
              {event.queueStatus === "paused" && (
                <button
                  type="button"
                  onClick={() => void handleResumeQueue()}
                  className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-5 py-3 text-sm font-head font-bold text-sky-100"
                >
                  <RotateCcw className="h-4 w-4" />
                  Resume
                </button>
              )}
              {(event.queueStatus === "running" || event.queueStatus === "paused") && (
                <button
                  type="button"
                  onClick={() => setIsStopConfirmOpen(true)}
                  className="inline-flex min-w-[170px] items-center justify-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-5 py-3 text-sm font-head font-bold text-rose-200 whitespace-nowrap"
                >
                  <Square className="h-4 w-4" />
                  Stop queue
                </button>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <IconToolButton
                label="Leaderboard"
                onClick={() => setIsLeaderboardModalOpen(true)}
                icon={<Trophy className="h-5 w-5" />}
              />
              <div className="flex items-center justify-end gap-2">
                <IconToolButton
                  label="Queue settings"
                  onClick={() => setIsDetailsModalOpen(true)}
                  icon={<Settings2 className="h-5 w-5" />}
                />
                <IconToolButton
                  label="Player roster"
                  onClick={() => setIsRosterModalOpen(true)}
                  icon={<UserRound className="h-5 w-5" />}
                />
              </div>
            </div>
          </div>
        </div>

        {saveMessage && (
          <div className="mb-5 rounded-2xl border border-volt/25 bg-volt/10 px-4 py-3 text-sm text-volt">
            {saveMessage}
          </div>
        )}

        {isStopConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-panel p-6 shadow-2xl shadow-black/40">
              <p className="text-xs uppercase tracking-[0.25em] text-rose-200/70">Stop Queue</p>
              <h2 className="mt-3 font-head text-2xl font-black text-mist">
                Are you sure you want to stop?
              </h2>
              <p className="mt-3 text-sm leading-6 text-mist/55">
                This will stop the live queue for this session and clear the active court assignments.
              </p>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => void handleStopStacking()}
                  className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-5 py-3 text-sm font-head font-bold text-rose-200"
                >
                  <Square className="h-4 w-4" />
                  Stop queue
                </button>
                <button
                  type="button"
                  onClick={() => setIsStopConfirmOpen(false)}
                  className="rounded-full border border-white/10 px-5 py-3 text-sm font-head font-bold text-mist/75 hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {isDetailsModalOpen && (
          <ModalShell
            title="Queue Settings"
            subtitle="Update the core queue setup here whenever you need to make a change."
            onClose={() => setIsDetailsModalOpen(false)}
            maxWidthClassName="max-w-4xl"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Queue Name">
                <input
                  value={clubName}
                  onChange={(event) => setClubName(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist outline-none focus:border-volt"
                />
              </Field>

              <Field label="Start time">
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist outline-none focus:border-volt"
                />
              </Field>

              <Field label="End time">
                <input
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist outline-none focus:border-volt"
                />
              </Field>

              <Field label="Number of players">
                <input
                  type="number"
                  min={2}
                  value={numberOfPlayers}
                  onChange={(event) => setNumberOfPlayers(Number(event.target.value) || 2)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist outline-none focus:border-volt"
                />
              </Field>

              <Field label="Player mix">
                <select
                  value={genderGroup}
                  onChange={(event) => setGenderGroup(event.target.value as HostGenderGroup)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm capitalize text-mist outline-none focus:border-volt"
                >
                  {genderOptions.map((option) => (
                    <option key={option} value={option} className="bg-panel text-mist">
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-5">
              <p className="text-xs uppercase tracking-wide text-mist/40">Format</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {playFormatOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPlayFormat(option)}
                    className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
                      playFormat === option
                        ? "border-volt/40 bg-volt/10 text-volt"
                        : "border-white/10 bg-white/5 text-mist/70"
                    }`}
                  >
                    <div className="font-semibold capitalize">{option}</div>
                    <p className="mt-2 text-xs text-mist/50">
                      {option === "single"
                        ? "One player per side for this queue."
                        : "Two players per side for this queue."}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <Field label="Rotation">
                <div className="grid gap-3 sm:grid-cols-2">
                  {rotationOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRotation(option.value)}
                      className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
                        rotation === option.value
                          ? "border-volt/40 bg-volt/10 text-volt"
                          : "border-white/10 bg-white/5 text-mist/70"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        {option.value === "winLose" ? (
                          <Trophy className="h-4 w-4" />
                        ) : (
                          <Shuffle className="h-4 w-4" />
                        )}
                        {option.label}
                      </div>
                      <p className="mt-2 text-xs text-mist/55">{option.description}</p>
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDetailsModalOpen(false)}
                className="rounded-full border border-white/10 px-5 py-3 text-sm font-head font-bold text-mist/75 hover:bg-white/10"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-3 text-sm font-head font-bold text-mist/80 hover:bg-white/10"
              >
                <Save className="h-4 w-4" />
                Save details
              </button>
            </div>
          </ModalShell>
        )}

        {isLeaderboardModalOpen && (
          <ModalShell
            title="Leaderboard"
            subtitle="Top players in this queue ranked by wins, with each player's live win-loss record."
            onClose={() => setIsLeaderboardModalOpen(false)}
            maxWidthClassName="max-w-5xl"
          >
            {leaderboardPlayers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-mist/55">
                No player stats yet.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(196,255,0,0.18),_transparent_35%),linear-gradient(180deg,rgba(20,24,37,0.96),rgba(12,15,23,0.96))] p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.35em] text-mist/45">
                        Queue Leaders
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-volt/30 bg-volt/10 px-3 py-1 text-xs font-head font-bold uppercase tracking-[0.25em] text-volt">
                      <Trophy className="h-3.5 w-3.5" />
                      Live W/L
                    </span>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-3 md:items-end">
                    {leaderboardPodium.map((player) => {
                      const isFirst = player.rank === 1;
                      const isSecond = player.rank === 2;
                      const accentClasses = isFirst
                        ? "border-amber-300/30 bg-[linear-gradient(180deg,rgba(255,214,10,0.24),rgba(255,214,10,0.06))] md:-translate-y-4"
                        : isSecond
                          ? "border-slate-200/20 bg-[linear-gradient(180deg,rgba(203,213,225,0.16),rgba(148,163,184,0.05))]"
                          : "border-fuchsia-300/20 bg-[linear-gradient(180deg,rgba(217,70,239,0.16),rgba(76,29,149,0.08))]";
                      const placeLabel = isFirst
                        ? "1st place"
                        : isSecond
                          ? "2nd place"
                          : "3rd place";

                      return (
                        <div
                          key={`leaderboard-podium-${player.id}`}
                          className={`rounded-[26px] border p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-transform ${accentClasses}`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-xs uppercase tracking-[0.35em] text-mist/45">
                              {placeLabel}
                            </span>
                          </div>

                          <div className="mt-10">
                            <p
                              className="text-xl font-head font-black text-mist sm:text-2xl"
                              title={player.name}
                            >
                              {player.name}
                            </p>
                            <p className="mt-4 text-lg font-semibold text-volt">
                              {formatLeaderboardRecord(player.wins, player.losses)}
                            </p>
                            <p className="mt-2 text-sm text-mist/58">
                              Games Played: {player.gamesPlayed}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {leaderboardRemainder.length > 0 && (
                  <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-mist/45">
                          Full Ranking
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {leaderboardRemainder.map((player) => (
                        <div
                          key={`leaderboard-modal-${player.id}`}
                          className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 items-center gap-4">
                            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 font-head text-sm font-black text-mist">
                              #{player.rank}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-mist" title={player.name}>
                                {player.name}
                              </p>
                              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-mist/45">
                                Games Played: {player.gamesPlayed}
                              </p>
                            </div>
                          </div>

                          <div className="text-xs font-head font-bold uppercase tracking-[0.18em] text-mist/70 sm:text-sm sm:text-right">
                            {formatLeaderboardRecord(player.wins, player.losses)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ModalShell>
        )}

        {isRosterModalOpen && (
          <ModalShell
            title="Player Roster"
            subtitle="Everyone entered into this queue appears here as a simple player list."
            onClose={() => setIsRosterModalOpen(false)}
            maxWidthClassName="max-w-3xl"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-wide text-mist/55">
                {event.players.length}/{event.numberOfPlayers}
              </span>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={newPlayerName}
                  onChange={(entry) => setNewPlayerName(entry.target.value)}
                  placeholder="Add a player name"
                  className="flex-1 rounded-2xl border border-white/10 bg-panel/70 px-4 py-3 text-sm text-mist outline-none placeholder:text-mist/30 focus:border-volt"
                />
                <button
                  type="button"
                  onClick={() => void handleAddPlayer()}
                  disabled={isRosterFull}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-volt px-4 py-3 text-sm font-head font-bold text-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Add player
                </button>
              </div>
              {rosterMessage && (
                <p className="mt-3 text-sm text-mist/65">{rosterMessage}</p>
              )}
              {isRosterFull && !rosterMessage && (
                <p className="mt-3 text-sm text-mist/65">
                  Player limit reached. Increase the number of players in Queue Settings to add more.
                </p>
              )}
            </div>

            {event.players.length === 0 ? (
              <p className="mt-4 text-sm text-mist/55">No players have been added to this queue yet.</p>
            ) : (
              <div className="mt-4 max-h-[45vh] space-y-3 overflow-y-auto pr-1">
                {event.players.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <p className="font-semibold text-mist">{player.name}</p>
                    <button
                      type="button"
                      onClick={() => void handleRemovePlayer(player.id)}
                      className="inline-flex items-center gap-2 rounded-full border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs font-head font-bold text-rose-200 transition-colors hover:bg-rose-500/15"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ModalShell>
        )}

        {replacePlayerState && replacePlayerCourt && (
          <ModalShell
            title="Replace Playing Player"
            subtitle="Swap out a player in this live matchup when someone is unavailable and bring in another player from the queue."
            onClose={() => setReplacePlayerState(null)}
            maxWidthClassName="max-w-2xl"
          >
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-mist/40">
                {replacePlayerCourt.name}
              </p>
              <p className="mt-2 text-sm text-mist/60">
                Only players who are not currently on another active court can be swapped in.
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Current player on court">
                <select
                  value={replacePlayerState.currentPlayerId}
                  onChange={(nextEvent) =>
                    setReplacePlayerState((current) =>
                      current
                        ? {
                            ...current,
                            currentPlayerId: nextEvent.target.value,
                            replacementPlayerId: "",
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist outline-none focus:border-volt"
                >
                  {replacePlayerCourt.players.map((player) => (
                    <option key={player.id} value={player.id} className="bg-panel text-mist">
                      {player.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Replacement player from queue">
                <select
                  value={replacePlayerState.replacementPlayerId}
                  onChange={(nextEvent) =>
                    setReplacePlayerState((current) =>
                      current
                        ? {
                            ...current,
                            replacementPlayerId: nextEvent.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist outline-none focus:border-volt"
                >
                  <option value="" className="bg-panel text-mist">
                    Select a replacement player
                  </option>
                  {availableReplacementPlayers.map((player) => (
                    <option key={player.id} value={player.id} className="bg-panel text-mist">
                      #{player.queuePosition} {player.name} • {player.gamesPlayed} games
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {availableReplacementPlayers.length === 0 && (
              <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-mist/55">
                No waiting or resting players are available to swap in right now.
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReplacePlayerState(null)}
                className="rounded-full border border-white/10 px-5 py-3 text-sm font-head font-bold text-mist/75 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleReplaceActivePlayer()}
                disabled={!replacePlayerState.replacementPlayerId || availableReplacementPlayers.length === 0}
                className="inline-flex items-center gap-2 rounded-full bg-volt px-5 py-3 text-sm font-head font-bold text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Users className="h-4 w-4" />
                Swap player
              </button>
            </div>
          </ModalShell>
        )}

        <div className="space-y-6">
          <section className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard label="Players" value={`${event.players.length}/${event.numberOfPlayers}`} />
              <MetricCard label="Courts" value={event.courts.length.toString()} />
              <MetricCard label="Games Done" value={event.completedGames.length.toString()} />
              <MetricCard label="Queue" value={event.queueStatus} />
            </div>

            <div className="rounded-3xl border border-white/10 bg-panel p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-head text-lg font-black">Active Courts</h2>
                  <p className="mt-1 text-sm text-mist/55">
                    Each court runs its own live game timer and can be completed independently.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAddCourt()}
                    disabled={!canAddCourt}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-head font-bold uppercase tracking-wide text-mist/75 transition-colors hover:bg-white/10 hover:text-mist disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add court
                  </button>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-wide text-mist/55">
                    {activeCourts.filter((court) => court.assignment).length} live
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {activeCourts.map((court, index) => {
                  const courtTeams = buildCourtTeams(court.players, event.playFormat);
                  const courtVisualSlots = buildCourtVisualSlots(court.players, event.playFormat);
                  const assignmentGameId = court.assignment?.gameId ?? null;
                  const selectedWinnerSide = court.assignment
                    ? selectedWinnerByGameId[court.assignment.gameId] ?? null
                    : null;

                  return (
                    <div
                      key={court.id}
                      className="overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.22)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-mist/45">Court {index + 1}</p>
                          <p className="mt-2 text-xs capitalize text-mist/55">{court.genderGroup}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleRemoveCourt(court.id)}
                            disabled={event.courts.length <= 1 || Boolean(court.assignment)}
                            title={
                              event.courts.length <= 1
                                ? "At least one court must remain in the queue."
                                : court.assignment
                                ? "Complete or stop this court before removing it."
                                : `Remove ${court.name}`
                            }
                            aria-label={`Remove ${court.name}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-mist/65 transition-colors hover:bg-white/10 hover:text-mist disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                              court.assignment
                                ? "border border-volt/25 bg-volt/15 text-volt"
                                : "border border-white/10 bg-white/5 text-mist/65"
                            }`}
                          >
                            {court.assignment ? "Playing" : "Waiting"}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 bg-[linear-gradient(180deg,#3b3f43,#2f3337)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                        <div className="relative aspect-[16/9] overflow-hidden border-2 border-white bg-[linear-gradient(180deg,#6b7ef0,#586ddd)] shadow-[inset_0_10px_30px_rgba(255,255,255,0.05)]">
                          <div className="absolute inset-y-0 left-1/3 right-1/3 bg-[linear-gradient(180deg,#4c5158,#363a41)]" />
                          <div className="absolute inset-y-0 left-1/3 w-[2px] -translate-x-1/2 bg-white" />
                          <div className="absolute inset-y-0 right-1/3 w-[2px] translate-x-1/2 bg-white" />
                          <div className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 bg-[#101715]/90" />
                          <div className="absolute left-0 top-1/2 h-[2px] w-1/3 -translate-y-1/2 bg-white" />
                          <div className="absolute right-0 top-1/2 h-[2px] w-1/3 -translate-y-1/2 bg-white" />

                          {court.assignment ? (
                            <div className="relative z-10 h-full w-full">
                              {courtVisualSlots.map((slot) => (
                                <div
                                  key={`${court.id}-${slot.key}`}
                                  className={`absolute flex items-center justify-center p-3 ${slot.positionClassName}`}
                                >
                                  <div
                                    className={`w-full px-2 py-2 text-center ${
                                      slot.filled
                                        ? "text-white [text-shadow:0_3px_14px_rgba(0,0,0,0.35)]"
                                        : "text-white/35"
                                    }`}
                                  >
                                    <p className="font-head text-xs font-black leading-tight sm:text-sm">
                                      {slot.name}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="relative z-10 flex h-full items-center justify-center p-6 text-center">
                              <div className="rounded-2xl border border-white/12 bg-black/15 px-5 py-4 backdrop-blur-sm">
                                <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                                  Court ready
                                </p>
                                <p className="mt-3 max-w-xs text-sm leading-6 text-white/82">
                                  The next balanced assignment will appear here when the queue starts or another court finishes.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4">
                        {court.assignment ? (
                          <>
                            <div className="rounded-2xl border border-white/10 bg-panel/60 p-3">
                              <p className="text-[11px] uppercase tracking-[0.2em] text-mist/40">Matchup</p>
                              <p className="mt-2 text-xs text-mist/55">
                                Select the winning team, then complete the game.
                              </p>
                              <div className="mt-3 space-y-2">
                                {courtTeams.map((team) => (
                                  <button
                                    key={`${court.id}-${team.label}-summary`}
                                    type="button"
                                    onClick={() =>
                                      assignmentGameId
                                        ? setSelectedWinnerByGameId((current) => ({
                                            ...current,
                                            [assignmentGameId]: team.key,
                                          }))
                                        : undefined
                                    }
                                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${
                                      selectedWinnerSide === team.key
                                        ? "border-volt/40 bg-volt/10"
                                        : "border-white/8 bg-white/5 hover:border-white/15 hover:bg-white/8"
                                    }`}
                                  >
                                    <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-mist/45">
                                      {selectedWinnerSide === team.key ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-volt" />
                                      ) : null}
                                      {team.label}
                                    </span>
                                    <span className="text-right text-sm font-semibold text-mist">
                                      {formatTeamNames(team.players.map((player) => player.name))}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="text-sm text-mist/65">
                                Elapsed game time:{" "}
                                <span className="font-semibold text-mist">
                                  {formatDuration(
                                    Math.max(
                                      0,
                                      Math.floor(
                                        (nowTick - new Date(court.assignment.startedAt).getTime()) / 1000
                                      )
                                    )
                                  )}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openReplacePlayerModal(court.id)}
                                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-head font-bold text-mist/80 transition-colors hover:bg-white/10 hover:text-mist"
                                >
                                  <Users className="h-4 w-4" />
                                  Swap Player
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleCompleteGame(court.id)}
                                  disabled={!selectedWinnerSide}
                                  className="inline-flex items-center gap-2 rounded-full bg-volt px-4 py-2 text-sm font-head font-bold text-ink disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Complete Game
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-mist/55">
                            Waiting for players to be assigned to this court.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:items-start">
            <div className="rounded-3xl border border-white/10 bg-panel p-5 xl:h-full">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-head text-lg font-black">Queue View</h2>
                  <p className="mt-1 text-sm text-mist/55">
                    The live queue updates as each court finishes and the fairest next assignments are calculated.
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                    event.queueStatus === "running"
                      ? "bg-volt/15 text-volt"
                      : event.queueStatus === "paused"
                      ? "bg-amber-400/10 text-amber-100"
                      : "bg-white/5 text-mist/55"
                  }`}
                >
                  {event.queueStatus}
                </span>
              </div>

              {event.queueStatus === "draft" ? (
                <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-mist/55">
                  The queue will appear here once you click `Start queue`.
                </div>
              ) : queue.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-mist/55">
                  This queue has no players ready for assignment yet.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {queue.map((player) => (
                    <div key={player.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-mist">
                            #{player.position} {player.name}
                          </p>
                          <p className="mt-1 text-xs text-mist/45">
                            {player.skill || "Queue player"} | {player.playerType}
                          </p>
                        </div>
                        <span className="rounded-full bg-volt/10 px-3 py-1 text-xs text-volt">
                          {player.assignedCourt ? resolveCourtName(event, player.assignedCourt) : "Waiting"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-panel p-5 xl:h-full">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="font-head text-lg font-black">Queue Statistics</h2>
                  <p className="mt-1 text-sm text-mist/55">
                    Review player load, fairness, and queue-specific results for this session.
                  </p>
                </div>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-wide text-mist/55">
                  {formatRotationModeLabel(event.rotation)}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatsCard label="Active Now" value={statisticsSummary.activePlayers.toString()} />
                <StatsCard label="Off Court" value={statisticsSummary.offCourtPlayers.toString()} />
                <StatsCard label="Avg Games / Player" value={statisticsSummary.averageGamesPlayed} />
                <StatsCard label="Balance Gap" value={`${statisticsSummary.fairnessGap}`} />
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-mist/60">
                {isWinLoseRotation
                  ? "Latest Result shows the player’s most recent completed game in this queue, while W/L totals show the running count for this session."
                  : "Winner selections still update W/L totals and Latest Result in Random rotation, but the next matchup remains based on games played, waiting time, and repeats."}
              </div>

              {playerStatistics.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-mist/55">
                  No player statistics are available for this queue yet.
                </div>
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  <div className="hidden grid-cols-[minmax(0,1.8fr)_120px_100px_120px_110px] gap-3 border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-mist/40 md:grid">
                    <span>Player</span>
                    <span>Status</span>
                    <span>Games</span>
                    <span>W / L</span>
                    <span>Latest</span>
                  </div>

                  <div className="divide-y divide-white/10">
                    {playerStatistics.map((player) => (
                      <div
                        key={player.id}
                        className="flex flex-col gap-3 px-4 py-4 md:grid md:grid-cols-[minmax(0,1.8fr)_120px_100px_120px_110px] md:items-center"
                      >
                        <div>
                          <p className="font-semibold text-mist">{player.name}</p>
                          <p className="mt-1 text-xs text-mist/45 md:hidden">{player.statusLabel}</p>
                        </div>
                        <div className="hidden md:block text-sm text-mist/70">{player.statusLabel}</div>
                        <div className="text-sm text-mist/80">
                          <span className="md:hidden text-mist/45">Games: </span>
                          {player.gamesPlayed}
                        </div>
                        <div className="text-sm text-mist/80">
                          <span className="md:hidden text-mist/45">W/L: </span>
                          {player.wins} / {player.losses}
                        </div>
                        <div>
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                              player.latestResult === "win"
                                ? "bg-volt/15 text-volt"
                                : player.latestResult === "lose"
                                ? "bg-rose-500/12 text-rose-200"
                                : "bg-white/8 text-mist/55"
                            }`}
                          >
                            {player.latestResult ?? "Unplayed"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </section>
        </div>
      </div>
    </AppRoleGuard>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-3xl border border-white/10 bg-panel p-5">
      <p className="text-xs uppercase tracking-wide text-mist/40">{label}</p>
      <p className="mt-3 break-words font-head text-xl font-black capitalize leading-none md:text-[1.45rem]">
        {value}
      </p>
    </div>
  );
}

function StatsCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-mist/40">{label}</p>
      <p className="mt-3 font-head text-2xl font-black text-mist">{value}</p>
    </div>
  );
}

function IconToolButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-mist/75 transition-colors hover:bg-white/10 hover:text-mist"
    >
      {icon}
    </button>
  );
}

function ModalShell({
  children,
  maxWidthClassName,
  onClose,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  maxWidthClassName: string;
  onClose: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 px-4 py-6 backdrop-blur-sm">
      <div
        className={`w-full overflow-hidden rounded-3xl border border-white/10 bg-panel shadow-2xl shadow-black/40 ${maxWidthClassName}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-mist/40">{title}</p>
            <p className="mt-3 max-w-2xl text-sm text-mist/55">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-mist/70 transition-colors hover:bg-white/10 hover:text-mist"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-2 block text-xs uppercase tracking-wide text-mist/40">{label}</span>
      {children}
    </label>
  );
}

function formatWinRatio(wins: number, losses: number) {
  const totalDecisions = wins + losses;
  if (totalDecisions === 0) {
    return "0%";
  }

  return `${Math.round((wins / totalDecisions) * 100)}%`;
}

function formatLeaderboardRecord(wins: number, losses: number) {
  const totalDecisions = wins + losses;
  if (totalDecisions === 0) {
    return "No results yet";
  }

  return `${formatWinRatio(wins, losses)} - W / L ${wins}-${losses}`;
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function resolveCourtName(event: HostEventRecord, courtId: string) {
  return event.courts.find((court) => court.id === courtId)?.name ?? courtId;
}

function formatMatchup(playerNames: string[], playFormat: HostPlayFormat) {
  if (playFormat !== "doubles") {
    if (playerNames.length === 2) {
      return `${playerNames[0]} vs ${playerNames[1]}`;
    }
    return playerNames.join(", ");
  }

  if (playerNames.length < 4) {
    return playerNames.join(", ");
  }

  const teamOne = formatTeamNames([playerNames[0], playerNames[2]].filter(Boolean));
  const teamTwo = formatTeamNames([playerNames[1], playerNames[3]].filter(Boolean));
  return `${teamOne} vs ${teamTwo}`;
}

function formatTeamNames(playerNames: string[]) {
  return playerNames.join(" / ");
}

function buildCourtTeams(players: Array<{ name: string }>, playFormat: HostPlayFormat) {
  if (playFormat === "single") {
    return [
      {
        key: "left" as const,
        label: "Left Team",
        players: [
          {
            label: "Top",
            name: players[0]?.name ?? "Open",
            filled: Boolean(players[0]),
          },
        ],
      },
      {
        key: "right" as const,
        label: "Right Team",
        players: [
          {
            label: "Bottom",
            name: players[1]?.name ?? "Open",
            filled: Boolean(players[1]),
          },
        ],
      },
    ];
  }

  return [
    {
      key: "left" as const,
      label: "Left Team",
      players: [
        {
          label: "Top Left",
          name: players[0]?.name ?? "Open",
          filled: Boolean(players[0]),
        },
        {
          label: "Bottom Left",
          name: players[2]?.name ?? "Open",
          filled: Boolean(players[2]),
        },
      ],
    },
    {
      key: "right" as const,
      label: "Right Team",
      players: [
        {
          label: "Top Right",
          name: players[1]?.name ?? "Open",
          filled: Boolean(players[1]),
        },
        {
          label: "Bottom Right",
          name: players[3]?.name ?? "Open",
          filled: Boolean(players[3]),
        },
      ],
    },
  ];
}

function buildCourtVisualSlots(
  players: Array<{ name: string }>,
  playFormat: HostPlayFormat
) {
  if (playFormat === "single") {
    return [
      {
        key: "top-center",
        label: "Top",
        name: players[0]?.name ?? "Open",
        filled: Boolean(players[0]),
        positionClassName: "left-[34%] top-[10%] h-[34%] w-[32%]",
      },
      {
        key: "bottom-center",
        label: "Bottom",
        name: players[1]?.name ?? "Open",
        filled: Boolean(players[1]),
        positionClassName: "left-[34%] bottom-[10%] h-[34%] w-[32%]",
      },
    ];
  }

  return [
    {
      key: "top-left",
      label: "Top Left",
      name: players[0]?.name ?? "Open",
      filled: Boolean(players[0]),
      positionClassName: "left-[3%] top-[9%] h-[34%] w-[30%]",
    },
    {
      key: "top-right",
      label: "Top Right",
      name: players[1]?.name ?? "Open",
      filled: Boolean(players[1]),
      positionClassName: "right-[3%] top-[9%] h-[34%] w-[30%]",
    },
    {
      key: "bottom-left",
      label: "Bottom Left",
      name: players[2]?.name ?? "Open",
      filled: Boolean(players[2]),
      positionClassName: "left-[3%] bottom-[9%] h-[34%] w-[30%]",
    },
    {
      key: "bottom-right",
      label: "Bottom Right",
      name: players[3]?.name ?? "Open",
      filled: Boolean(players[3]),
      positionClassName: "right-[3%] bottom-[9%] h-[34%] w-[30%]",
    },
  ];
}
