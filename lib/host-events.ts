export type HostRotationMode = "skill" | "random" | "winLose";
export type HostEventVisibility = "public" | "private";
export type HostGenderGroup = "male" | "female" | "mixed";
export type HostPlayFormat = "single" | "doubles";
export type QueueStatus = "draft" | "running" | "paused" | "stopped" | "completed";
export type QueuePlayerStatus = "playing" | "waiting" | "resting";
export type QueueLatestResult = "win" | "lose";
export type WinningTeamSide = "left" | "right";
export type QueueMatchGroup = "standard" | "unplayed" | "winners" | "losers" | "fallback-mixed";

export interface HostEventCourt {
  id: string;
  name: string;
  genderGroup: HostGenderGroup;
}

export interface HostQueuePlayer {
  id: string;
  name: string;
  gamesPlayed: number;
  status: QueuePlayerStatus;
  latestResult?: QueueLatestResult | null;
  lastCompletedAt?: string | null;
}

export interface HostJoinedPlayer {
  id: string;
  name: string;
  email?: string;
  skill: string;
  playerType: string;
  joinedAt: string;
}

export interface QueueCourtAssignment {
  courtId: string;
  gameId: string;
  playerIds: string[];
  startedAt: string;
  matchGroup?: QueueMatchGroup;
}

export interface QueueGameHistoryItem {
  id: string;
  courtId: string;
  courtName: string;
  playerIds: string[];
  playerNames: string[];
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  rotationMode?: HostRotationMode;
  matchGroup?: QueueMatchGroup;
  winnerSide?: WinningTeamSide | null;
  leftTeamPlayerIds?: string[];
  rightTeamPlayerIds?: string[];
  winnerPlayerIds?: string[];
  loserPlayerIds?: string[];
}

export interface HostEventRecord {
  id: string;
  ownerId?: string;
  clubName: string;
  location: string;
  eventDate: string;
  time: string;
  numberOfPlayers: number;
  joinedCount: number;
  skillFocus: string;
  genderGroup: HostGenderGroup;
  playFormat: HostPlayFormat;
  rotation: HostRotationMode;
  costPerHead: number;
  visibility: HostEventVisibility;
  durationMinutes: number;
  courts: HostEventCourt[];
  players: HostQueuePlayer[];
  activeCourtAssignments: QueueCourtAssignment[];
  completedGames: QueueGameHistoryItem[];
  queueStatus: QueueStatus;
  startedAt?: string;
  endedAt?: string;
  pausedAt?: string;
  totalPausedMs: number;
  joinedPlayers: HostJoinedPlayer[];
  stackingStarted?: boolean;
  createdAt: string;
}

export const HOST_EVENTS_STORAGE_KEY = "stack-serve-host-events";
export const HOST_EVENT_JOIN_COUNTS_KEY = "stack-serve-host-event-join-counts";

export interface DerivedHostEventSession {
  slug: string;
  hostName: string;
  venue: string;
  eventDate: string;
  timeLabel: string;
  startHour: number;
  endHour: number;
  visibility: HostEventVisibility;
  rotationMode: HostRotationMode;
  inviteCode?: string;
  playersOnline: number;
  waitingPlayers: number;
  playerCapacity: number;
  joinedCount: number;
  skillFocus: string;
  genderGroup: HostGenderGroup;
  playFormat: HostPlayFormat;
  queueStatus: QueueStatus;
  durationMinutes: number;
  completedGames: number;
  courts: Array<{
    id: number;
    name: string;
    genderGroup: HostGenderGroup;
    status: "open" | "occupied" | "maintenance";
    currentPlayers?: string[];
  }>;
}

export function formatRotationModeLabel(rotation: HostRotationMode) {
  switch (rotation) {
    case "skill":
      return "Skill";
    case "winLose":
      return "Win/Lose";
    case "random":
    default:
      return "Random";
  }
}

export function readHostEvents() {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(HOST_EVENTS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as HostEventRecord[];
    return Array.isArray(parsed) ? parsed.map(normalizeHostEventRecord) : [];
  } catch {
    window.localStorage.removeItem(HOST_EVENTS_STORAGE_KEY);
    return [];
  }
}

export function writeHostEvents(events: HostEventRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HOST_EVENTS_STORAGE_KEY, JSON.stringify(events));
}

export function readHostEventById(eventId: string) {
  return readHostEvents().find((event) => event.id === eventId) ?? null;
}

export function readHostEventByIdForOwner(eventId: string, ownerId: string) {
  return readHostEvents().find((event) => event.id === eventId && event.ownerId === ownerId) ?? null;
}

export function claimOwnerlessHostEvents(ownerId: string) {
  const events = readHostEvents();
  let changed = false;

  const updated = events.map((event) => {
    if (event.ownerId) return event;
    changed = true;
    return normalizeHostEventRecord({
      ...event,
      ownerId,
    });
  });

  if (changed) {
    writeHostEvents(updated);
  }

  return updated;
}

export function formatTimeRange(startTime: string, endTime: string) {
  return `${formatSingleTime(startTime)} - ${formatSingleTime(endTime)}`;
}

export function parseTimeLabelToHours(timeLabel: string) {
  const [startRaw, endRaw] = timeLabel.split("-").map((part) => part?.trim());

  return {
    startHour: parseSingleTime(startRaw),
    endHour: parseSingleTime(endRaw),
  };
}

export function deriveHostSessionsFromEvents(events: HostEventRecord[]): DerivedHostEventSession[] {
  const joinCounts = readHostEventJoinCounts();
  const now = Date.now();

  return events.map((event) => {
    const normalizedEvent = syncQueueLifecycle(normalizeHostEventRecord(event), now);
    const { startHour, endHour } = parseTimeLabelToHours(normalizedEvent.time);
    const fallbackJoinedCount = Number.isFinite(normalizedEvent.joinedCount) ? normalizedEvent.joinedCount : 0;
    const eventSlug = `host-event-${normalizedEvent.id}`;
    const joinedCount = Number.isFinite(joinCounts[eventSlug])
      ? joinCounts[eventSlug]
      : fallbackJoinedCount;

    return {
      slug: eventSlug,
      hostName: normalizedEvent.clubName,
      venue: normalizedEvent.location,
      eventDate: normalizedEvent.eventDate,
      timeLabel: normalizedEvent.time,
      startHour,
      endHour,
      visibility: normalizedEvent.visibility,
      rotationMode: normalizedEvent.rotation,
      inviteCode:
        normalizedEvent.visibility === "private"
          ? `INV-${normalizedEvent.id.slice(0, 6).toUpperCase()}`
          : undefined,
      playersOnline: normalizedEvent.activeCourtAssignments.reduce(
        (sum, court) => sum + court.playerIds.length,
        0
      ),
      waitingPlayers: normalizedEvent.players.filter((player) => player.status !== "playing").length,
      playerCapacity: normalizedEvent.numberOfPlayers,
      joinedCount,
      skillFocus: normalizedEvent.skillFocus,
      genderGroup: normalizedEvent.genderGroup,
      playFormat: normalizedEvent.playFormat,
      queueStatus: normalizedEvent.queueStatus,
      durationMinutes: normalizedEvent.durationMinutes,
      completedGames: normalizedEvent.completedGames.length,
      courts: normalizedEvent.courts.map((court, index) => {
        const activeAssignment = normalizedEvent.activeCourtAssignments.find(
          (assignment) => assignment.courtId === court.id
        );

        return {
          id: index + 1,
          name: court.name,
          genderGroup: court.genderGroup,
          status: activeAssignment ? ("occupied" as const) : ("open" as const),
          currentPlayers: activeAssignment
            ? activeAssignment.playerIds
                .map((playerId) => normalizedEvent.players.find((player) => player.id === playerId)?.name)
                .filter((playerName): playerName is string => Boolean(playerName))
            : undefined,
        };
      }),
    };
  });
}

export function updateHostEventJoinedCount(slug: string, delta: number) {
  const events = readHostEvents();
  const joinCounts = readHostEventJoinCounts();
  const updated = events.map((event) => {
    const eventSlug = `host-event-${event.id}`;
    if (eventSlug !== slug) return event;

    const normalizedEvent = normalizeHostEventRecord(event);
    const currentCountFromRegistry = Number.isFinite(joinCounts[slug])
      ? joinCounts[slug]
      : normalizedEvent.joinedCount;
    const nextJoinedCount = Math.max(
      0,
      Math.min(normalizedEvent.numberOfPlayers, currentCountFromRegistry + delta)
    );

    joinCounts[slug] = nextJoinedCount;

    return {
      ...normalizedEvent,
      joinedCount: nextJoinedCount,
    };
  });

  writeHostEvents(updated);
  writeHostEventJoinCounts(joinCounts);
  return updated;
}

export function applyHostEventPlayerJoin(event: HostEventRecord, player: HostJoinedPlayer) {
  const normalizedEvent = normalizeHostEventRecord(event);
  const existingPlayers = normalizedEvent.joinedPlayers;
  const withoutDuplicate = existingPlayers.filter((entry) => entry.id !== player.id);
  const cappedPlayers = [...withoutDuplicate, player].slice(0, normalizedEvent.numberOfPlayers);
  const joinedCount = cappedPlayers.length;
  const nextQueuePlayers = mergeJoinedPlayersIntoQueuePlayers(normalizedEvent.players, cappedPlayers);

  return normalizeHostEventRecord({
    ...normalizedEvent,
    joinedCount,
    joinedPlayers: cappedPlayers,
    players: nextQueuePlayers,
  });
}

export function addPlayerToHostEvent(slug: string, player: HostJoinedPlayer) {
  const events = readHostEvents();
  const joinCounts = readHostEventJoinCounts();
  const nextEvents = events.map((event) => {
    const eventSlug = `host-event-${event.id}`;
    if (eventSlug !== slug) return event;

    const nextEvent = applyHostEventPlayerJoin(event, player);

    joinCounts[slug] = nextEvent.joinedCount;

    return nextEvent;
  });

  writeHostEvents(nextEvents);
  writeHostEventJoinCounts(joinCounts);
  return nextEvents;
}

export function applyHostEventPlayerRemoval(event: HostEventRecord, playerId: string) {
  const normalizedEvent = normalizeHostEventRecord(event);
  const joinedPlayers = normalizedEvent.joinedPlayers.filter((entry) => entry.id !== playerId);
  const joinedCount = joinedPlayers.length;

  return normalizeHostEventRecord({
    ...normalizedEvent,
    joinedCount,
    joinedPlayers,
    players: normalizedEvent.players.filter((player) => player.id !== playerId),
    activeCourtAssignments: normalizedEvent.activeCourtAssignments
      .map((assignment) => ({
        ...assignment,
        playerIds: assignment.playerIds.filter((entry) => entry !== playerId),
      }))
      .filter((assignment) => assignment.playerIds.length > 0),
  });
}

export function removePlayerFromHostEvent(slug: string, playerId: string) {
  const events = readHostEvents();
  const joinCounts = readHostEventJoinCounts();
  const updated = events.map((event) => {
    const eventSlug = `host-event-${event.id}`;
    if (eventSlug !== slug) return event;

    const nextEvent = applyHostEventPlayerRemoval(event, playerId);

    joinCounts[slug] = nextEvent.joinedCount;

    return nextEvent;
  });

  writeHostEvents(updated);
  writeHostEventJoinCounts(joinCounts);
  return updated;
}

export function updateHostEventCourt(
  eventId: string,
  courtId: string,
  updates: Partial<HostEventCourt>
) {
  const events = readHostEvents();
  const updated = events.map((event) => {
    if (event.id !== eventId) return event;

    const normalizedEvent = normalizeHostEventRecord(event);
    return {
      ...normalizedEvent,
      courts: normalizedEvent.courts.map((court) =>
        court.id !== courtId ? court : { ...court, ...updates }
      ),
    };
  });

  writeHostEvents(updated);
  return updated;
}

export function applyHostEventUpdates(event: HostEventRecord, updates: Partial<HostEventRecord>) {
  return normalizeHostEventRecord({ ...event, ...updates });
}

export function applyHostEventCourtAddition(event: HostEventRecord) {
  const normalizedEvent = normalizeHostEventRecord(event);
  const nextCourtNumber = normalizedEvent.courts.length + 1;
  const nextCourt: HostEventCourt = {
    id: crypto.randomUUID(),
    name: `Court ${nextCourtNumber}`,
    genderGroup: normalizedEvent.genderGroup ?? "mixed",
  };

  return syncQueueLifecycle(
    normalizeHostEventRecord({
      ...normalizedEvent,
      courts: [...normalizedEvent.courts, nextCourt],
    })
  );
}

export function applyHostEventCourtRemoval(event: HostEventRecord, courtId: string) {
  const normalizedEvent = normalizeHostEventRecord(event);

  if (normalizedEvent.courts.length <= 1) {
    throw new Error("At least one court must remain in the queue.");
  }

  const courtToRemove = normalizedEvent.courts.find((court) => court.id === courtId);
  if (!courtToRemove) {
    return normalizedEvent;
  }

  const hasActiveAssignment = normalizedEvent.activeCourtAssignments.some(
    (assignment) => assignment.courtId === courtToRemove.id
  );

  if (hasActiveAssignment) {
    throw new Error(`Complete or stop ${courtToRemove.name} before removing it from the queue.`);
  }

  return syncQueueLifecycle(
    normalizeHostEventRecord({
      ...normalizedEvent,
      courts: normalizedEvent.courts.filter((court) => court.id !== courtToRemove.id),
      activeCourtAssignments: normalizedEvent.activeCourtAssignments.filter(
        (assignment) => assignment.courtId !== courtToRemove.id
      ),
    })
  );
}

export function applyHostEventActivePlayerReplacement(
  event: HostEventRecord,
  courtId: string,
  currentPlayerId: string,
  replacementPlayerId: string
) {
  const normalizedEvent = normalizeHostEventRecord(event);
  const assignment = normalizedEvent.activeCourtAssignments.find((entry) => entry.courtId === courtId);

  if (!assignment) {
    throw new Error("This court does not have an active matchup yet.");
  }

  if (!assignment.playerIds.includes(currentPlayerId)) {
    throw new Error("The selected player is no longer assigned to this court.");
  }

  if (currentPlayerId === replacementPlayerId) {
    throw new Error("Choose a different player to swap into this matchup.");
  }

  const replacementPlayer = normalizedEvent.players.find((player) => player.id === replacementPlayerId);
  if (!replacementPlayer) {
    throw new Error("The replacement player could not be found in this queue.");
  }

  if (assignment.playerIds.includes(replacementPlayerId)) {
    throw new Error(`${replacementPlayer.name} is already assigned to this court.`);
  }

  // If the replacement is currently playing on another court, this is a two-way swap:
  // the outgoing player takes the replacement's old spot on that other court.
  const otherCourtAssignment = normalizedEvent.activeCourtAssignments.find(
    (entry) => entry.courtId !== courtId && entry.playerIds.includes(replacementPlayerId)
  );

  const nextAssignments = normalizedEvent.activeCourtAssignments.map((entry) => {
    if (entry.courtId === courtId) {
      return {
        ...entry,
        playerIds: entry.playerIds.map((playerId) =>
          playerId === currentPlayerId ? replacementPlayerId : playerId
        ),
      };
    }

    if (otherCourtAssignment && entry.courtId === otherCourtAssignment.courtId) {
      return {
        ...entry,
        playerIds: entry.playerIds.map((playerId) =>
          playerId === replacementPlayerId ? currentPlayerId : playerId
        ),
      };
    }

    return entry;
  });

  return syncQueueLifecycle(
    normalizeHostEventRecord({
      ...normalizedEvent,
      activeCourtAssignments: nextAssignments,
    })
  );
}

export function updateHostEvent(eventId: string, updates: Partial<HostEventRecord>) {
  const events = readHostEvents();
  const updated = events.map((event) => (event.id !== eventId ? event : applyHostEventUpdates(event, updates)));

  writeHostEvents(updated);
  return updated;
}

export function applyHostEventStackingState(event: HostEventRecord, stackingStarted: boolean) {
  const normalizedEvent = normalizeHostEventRecord(event);
  return stackingStarted ? startQueueSession(normalizedEvent) : stopQueueSession(normalizedEvent);
}

export function setHostEventStackingState(eventId: string, stackingStarted: boolean) {
  const normalizedEvents = readHostEvents();
  const updated = normalizedEvents.map((event) => {
    if (event.id !== eventId) return event;
    return applyHostEventStackingState(event, stackingStarted);
  });

  writeHostEvents(updated);
  return updated;
}

export function pauseHostEventQueue(eventId: string) {
  const updated = readHostEvents().map((event) =>
    event.id !== eventId ? event : pauseQueueSession(normalizeHostEventRecord(event))
  );
  writeHostEvents(updated);
  return updated;
}

export function resumeHostEventQueue(eventId: string) {
  const updated = readHostEvents().map((event) => (event.id !== eventId ? event : applyHostEventResume(event)));
  writeHostEvents(updated);
  return updated;
}

export function applyHostEventResume(event: HostEventRecord) {
  return resumeQueueSession(normalizeHostEventRecord(event));
}

export function completeCourtGame(eventId: string, courtId: string, winnerSide?: WinningTeamSide) {
  const updated = readHostEvents().map((event) =>
    event.id !== eventId ? event : applyHostEventCompleteCourtGame(event, courtId, winnerSide)
  );
  writeHostEvents(updated);
  return updated;
}

export function applyHostEventCompleteCourtGame(
  event: HostEventRecord,
  courtId: string,
  winnerSide?: WinningTeamSide
) {
  return completeQueueGameOnCourt(normalizeHostEventRecord(event), courtId, winnerSide);
}

export function parseTimeLabelToTimeInputs(timeLabel: string) {
  const [startRaw, endRaw] = timeLabel.split("-").map((part) => part?.trim());

  return {
    startTime: parseDisplayTimeToInput(startRaw),
    endTime: parseDisplayTimeToInput(endRaw),
  };
}

export function deriveEventQueue(event: HostEventRecord) {
  const normalizedEvent = normalizeHostEventRecord(event);
  const now = Date.now();
  const syncedEvent = syncQueueLifecycle(normalizedEvent, now);
  const currentlyPlayingIds = new Set(
    syncedEvent.activeCourtAssignments.flatMap((assignment) => assignment.playerIds)
  );
  const minGamesPlayed = Math.min(...syncedEvent.players.map((player) => player.gamesPlayed), 0);

  const orderedPlayers = [...syncedEvent.players].sort((left, right) => {
    if (left.gamesPlayed !== right.gamesPlayed) return left.gamesPlayed - right.gamesPlayed;
    return left.name.localeCompare(right.name);
  });

  return orderedPlayers.map((player, index) => ({
    id: player.id,
    name: player.name,
    skill: `${player.gamesPlayed} games${player.latestResult ? ` • ${player.latestResult}` : ""}`,
    playerType: currentlyPlayingIds.has(player.id)
      ? "Playing now"
      : player.gamesPlayed > minGamesPlayed
      ? "Resting"
      : "Waiting",
    position: index + 1,
    assignedCourt:
      syncedEvent.activeCourtAssignments.find((assignment) => assignment.playerIds.includes(player.id))
        ?.courtId ?? null,
  }));
}

export function deriveUpcomingMatchPlayers(event: HostEventRecord) {
  const normalizedEvent = normalizeHostEventRecord(event);
  const syncedEvent = syncQueueLifecycle(normalizedEvent, Date.now());
  return getUpcomingPlayersForAssignment(syncedEvent);
}

export function getQueueSummary(event: HostEventRecord) {
  const normalizedEvent = normalizeHostEventRecord(event);
  const syncedEvent = syncQueueLifecycle(normalizedEvent);
  const elapsedMs = calculateElapsedQueueMs(syncedEvent);
  const totalDurationMs = syncedEvent.durationMinutes * 60 * 1000;

  return {
    totalGamesCompleted: syncedEvent.completedGames.length,
    elapsedMs,
    remainingMs: Math.max(0, totalDurationMs - elapsedMs),
    activePlayers: syncedEvent.activeCourtAssignments.reduce(
      (sum, court) => sum + court.playerIds.length,
      0
    ),
  };
}

export function normalizeHostEventRecord(event: HostEventRecord): HostEventRecord {
  const legacyPlayers = Array.isArray(event.joinedPlayers) ? event.joinedPlayers : [];
  const queuePlayers = Array.isArray(event.players) ? event.players : [];

  return {
    ...event,
    ownerId: typeof event.ownerId === "string" && event.ownerId.trim() ? event.ownerId : undefined,
    eventDate: event.eventDate ?? new Date().toISOString().slice(0, 10),
    durationMinutes: Number.isFinite(event.durationMinutes) ? event.durationMinutes : 120,
    genderGroup: event.genderGroup ?? "mixed",
    playFormat: event.playFormat ?? "doubles",
    rotation: event.rotation ?? "random",
    visibility: event.visibility ?? "public",
    queueStatus: event.queueStatus ?? "draft",
    totalPausedMs: Number.isFinite(event.totalPausedMs) ? event.totalPausedMs : 0,
    courts: Array.isArray(event.courts)
      ? event.courts.map((court, index) => ({
          id: court.id ?? `court-${index + 1}`,
          name: court.name ?? `Court ${index + 1}`,
          genderGroup: court.genderGroup ?? "mixed",
        }))
      : [],
    joinedPlayers: legacyPlayers,
    players: mergeJoinedPlayersIntoQueuePlayers(queuePlayers, legacyPlayers).slice(0, event.numberOfPlayers ?? 24),
    activeCourtAssignments: Array.isArray(event.activeCourtAssignments) ? event.activeCourtAssignments : [],
    completedGames: Array.isArray(event.completedGames) ? event.completedGames : [],
    joinedCount: Number.isFinite(event.joinedCount)
      ? event.joinedCount
      : Array.isArray(event.joinedPlayers)
      ? event.joinedPlayers.length
      : 0,
    stackingStarted: Boolean(event.stackingStarted),
  };
}

function mergeJoinedPlayersIntoQueuePlayers(
  queuePlayers: HostQueuePlayer[],
  joinedPlayers: HostJoinedPlayer[]
) {
  const byId = new Map<string, HostQueuePlayer>();

  queuePlayers.forEach((player) => {
    byId.set(player.id, {
      id: player.id,
      name: player.name,
      gamesPlayed: Number.isFinite(player.gamesPlayed) ? player.gamesPlayed : 0,
      status: player.status ?? "waiting",
      latestResult: player.latestResult ?? null,
      lastCompletedAt: player.lastCompletedAt ?? null,
    });
  });

  joinedPlayers.forEach((player) => {
    if (!byId.has(player.id)) {
      byId.set(player.id, {
        id: player.id,
        name: player.name,
        gamesPlayed: 0,
        status: "waiting",
        latestResult: null,
        lastCompletedAt: null,
      });
    }
  });

  return Array.from(byId.values());
}

function startQueueSession(event: HostEventRecord): HostEventRecord {
  const now = new Date().toISOString();
  const baseEvent =
    event.queueStatus === "paused"
      ? resumeQueueSession(event)
      : {
          ...event,
          queueStatus: "running" as const,
          stackingStarted: true,
          startedAt: event.startedAt ?? now,
          endedAt: undefined,
          pausedAt: undefined,
        };

  return assignCourtsIfNeeded(updateDerivedPlayerStatuses(baseEvent));
}

function pauseQueueSession(event: HostEventRecord): HostEventRecord {
  if (event.queueStatus !== "running") return event;

  return {
      ...event,
      queueStatus: "paused" as QueueStatus,
      pausedAt: new Date().toISOString(),
      stackingStarted: false,
  };
}

function resumeQueueSession(event: HostEventRecord): HostEventRecord {
  if (event.queueStatus !== "paused") return startQueueSession(event);

  const pausedAtMs = event.pausedAt ? new Date(event.pausedAt).getTime() : Date.now();
  const pauseDelta = Math.max(0, Date.now() - pausedAtMs);

  return assignCourtsIfNeeded(
    updateDerivedPlayerStatuses({
      ...event,
      queueStatus: "running",
      pausedAt: undefined,
      totalPausedMs: event.totalPausedMs + pauseDelta,
      stackingStarted: true,
    })
  );
}

function stopQueueSession(event: HostEventRecord): HostEventRecord {
  return updateDerivedPlayerStatuses({
    ...event,
    queueStatus: "stopped" as QueueStatus,
    stackingStarted: false,
    endedAt: event.endedAt ?? new Date().toISOString(),
    activeCourtAssignments: [],
  });
}

function getTeamPlayerIdsForMatch(playFormat: HostPlayFormat, playerIds: string[]) {
  if (playFormat === "single") {
    return {
      leftTeamPlayerIds: playerIds.slice(0, 1),
      rightTeamPlayerIds: playerIds.slice(1, 2),
    };
  }

  return {
    leftTeamPlayerIds: [playerIds[0], playerIds[2]].filter((playerId): playerId is string => Boolean(playerId)),
    rightTeamPlayerIds: [playerIds[1], playerIds[3]].filter((playerId): playerId is string => Boolean(playerId)),
  };
}

function completeQueueGameOnCourt(
  event: HostEventRecord,
  courtId: string,
  winnerSide?: WinningTeamSide
): HostEventRecord {
  const assignment = event.activeCourtAssignments.find((entry) => entry.courtId === courtId);
  if (!assignment) return event;

  const completedAt = new Date().toISOString();
  const completedPlayers = new Set(assignment.playerIds);
  const courtName =
    event.courts.find((court) => court.id === courtId)?.name ?? `Court ${courtId}`;
  const { leftTeamPlayerIds, rightTeamPlayerIds } = getTeamPlayerIdsForMatch(
    event.playFormat,
    assignment.playerIds
  );
  const requiresWinnerSelection = assignment.playerIds.length >= 2;

  if (requiresWinnerSelection && !winnerSide) {
    throw new Error("Select the winning team before completing the game.");
  }

  const winnerPlayerIds =
    requiresWinnerSelection && winnerSide === "left"
      ? leftTeamPlayerIds
      : requiresWinnerSelection && winnerSide === "right"
      ? rightTeamPlayerIds
      : [];
  const loserPlayerIds =
    requiresWinnerSelection && winnerSide === "left"
      ? rightTeamPlayerIds
      : requiresWinnerSelection && winnerSide === "right"
      ? leftTeamPlayerIds
      : [];
  const winnerPlayerSet = new Set(winnerPlayerIds);
  const loserPlayerSet = new Set(loserPlayerIds);

  const nextCompletedGame: QueueGameHistoryItem = {
    id: assignment.gameId,
    courtId,
    courtName,
    playerIds: assignment.playerIds,
    playerNames: assignment.playerIds
      .map((playerId) => event.players.find((player) => player.id === playerId)?.name)
      .filter((entry): entry is string => Boolean(entry)),
    startedAt: assignment.startedAt,
    completedAt,
    durationSeconds: Math.max(
      0,
      Math.round((new Date(completedAt).getTime() - new Date(assignment.startedAt).getTime()) / 1000)
    ),
    rotationMode: event.rotation,
    matchGroup: assignment.matchGroup ?? "standard",
    winnerSide: requiresWinnerSelection ? winnerSide ?? null : null,
    leftTeamPlayerIds,
    rightTeamPlayerIds,
    winnerPlayerIds,
    loserPlayerIds,
  };

  const players = event.players.map((player) => {
    if (!completedPlayers.has(player.id)) {
      return player;
    }

    const nextPlayer: HostQueuePlayer = {
      ...player,
      gamesPlayed: player.gamesPlayed + 1,
      status: "resting",
      lastCompletedAt: completedAt,
    };

    nextPlayer.latestResult = winnerPlayerSet.has(player.id)
      ? "win"
      : loserPlayerSet.has(player.id)
      ? "lose"
      : player.latestResult ?? null;

    return nextPlayer;
  });

  return syncQueueLifecycle(
    {
      ...event,
      players,
      completedGames: [...event.completedGames, nextCompletedGame],
      activeCourtAssignments: event.activeCourtAssignments.filter((entry) => entry.courtId !== courtId),
    },
    Date.now(),
    {
    [courtId]: assignment.playerIds,
    }
  );
}

function assignCourtsIfNeeded(
  event: HostEventRecord,
  preferredExclusionsByCourt: Record<string, string[]> = {}
): HostEventRecord {
  if (event.queueStatus !== "running") return updateDerivedPlayerStatuses(event);

  const playersPerGame = event.playFormat === "single" ? 2 : 4;
  const activePlayerIds = new Set(event.activeCourtAssignments.flatMap((assignment) => assignment.playerIds));
  const nextAssignments = [...event.activeCourtAssignments];
  const randomSeed = Date.now();

  for (const court of event.courts) {
    const alreadyActive = nextAssignments.some((assignment) => assignment.courtId === court.id);
    if (alreadyActive) continue;

    const eligiblePlayers = getEligiblePlayers(
      event.players,
      activePlayerIds,
      randomSeed + nextAssignments.length,
      preferredExclusionsByCourt[court.id] ?? [],
      playersPerGame
    );
    if (eligiblePlayers.length < playersPerGame) continue;

    const matchSelection = selectPlayersForCourt(
      event,
      court.id,
      eligiblePlayers,
      playersPerGame,
      randomSeed + nextAssignments.length
    );
    const selectedPlayers = matchSelection.players;
    if (selectedPlayers.length < playersPerGame) continue;
    selectedPlayers.forEach((player) => activePlayerIds.add(player.id));

    nextAssignments.push({
      courtId: court.id,
      gameId: crypto.randomUUID(),
      playerIds: selectedPlayers.map((player) => player.id),
      startedAt: new Date().toISOString(),
      matchGroup: matchSelection.matchGroup,
    });
  }

  return updateDerivedPlayerStatuses({
    ...event,
    activeCourtAssignments: nextAssignments,
  });
}

function getEligiblePlayers(
  players: HostQueuePlayer[],
  activePlayerIds: Set<string>,
  seed: number,
  excludedPlayerIds: string[] = [],
  requiredCount = 0
) {
  const availablePlayers = players.filter((player) => !activePlayerIds.has(player.id));
  const excludedSet = new Set(excludedPlayerIds);
  const preferredPlayers = availablePlayers.filter((player) => !excludedSet.has(player.id));
  const candidatePool =
    requiredCount > 0 && preferredPlayers.length >= requiredCount ? preferredPlayers : availablePlayers;
  const waitingPlayers = candidatePool.filter((player) => player.status === "waiting");
  const restingPlayers = candidatePool.filter((player) => player.status !== "waiting");

  return [
    ...prioritizePlayers(waitingPlayers, seed),
    ...prioritizePlayers(restingPlayers, seed + 1),
  ];
}

function getUpcomingPlayersForAssignment(event: HostEventRecord) {
  if (event.queueStatus !== "running") return [];

  const playersPerGame = event.playFormat === "single" ? 2 : 4;
  const activePlayerIds = new Set(event.activeCourtAssignments.flatMap((assignment) => assignment.playerIds));
  const seed = stableHash(
    `${event.id}-${event.completedGames.length}-${event.players
      .map((player) => `${player.id}:${player.gamesPlayed}:${player.status}`)
      .join("|")}`
  );

  const eligiblePlayers = getEligiblePlayers(
    event.players,
    activePlayerIds,
    seed,
    [],
    playersPerGame
  );

  if (eligiblePlayers.length < playersPerGame) return [];

  return selectPlayersForUpcomingAssignment(event, eligiblePlayers, playersPerGame, seed).players;
}

function shufflePlayers(players: HostQueuePlayer[], seed: number) {
  return [...players].sort((left, right) => {
    const leftHash = stableHash(`${left.id}-${seed}`);
    const rightHash = stableHash(`${right.id}-${seed}`);
    return leftHash - rightHash;
  });
}

function prioritizePlayers(players: HostQueuePlayer[], seed: number) {
  if (players.length === 0) return [];

  const minGamesPlayed = Math.min(...players.map((player) => player.gamesPlayed), 0);
  const prioritizedPlayers = players.filter((player) => player.gamesPlayed === minGamesPlayed);
  const remainingPlayers = players.filter((player) => player.gamesPlayed !== minGamesPlayed);

  return [...shufflePlayers(prioritizedPlayers, seed), ...shufflePlayers(remainingPlayers, seed + 1)];
}

function prioritizePlayersForWinLose(players: HostQueuePlayer[], seed: number) {
  return [...players].sort((left, right) => {
    if (left.gamesPlayed !== right.gamesPlayed) {
      return left.gamesPlayed - right.gamesPlayed;
    }

    const leftLastCompletedAt = left.lastCompletedAt ? new Date(left.lastCompletedAt).getTime() : 0;
    const rightLastCompletedAt = right.lastCompletedAt ? new Date(right.lastCompletedAt).getTime() : 0;

    if (leftLastCompletedAt !== rightLastCompletedAt) {
      return leftLastCompletedAt - rightLastCompletedAt;
    }

    return stableHash(`${left.id}-${seed}`) - stableHash(`${right.id}-${seed}`);
  });
}

type MatchSelection = {
  players: HostQueuePlayer[];
  matchGroup: QueueMatchGroup;
};

function selectPlayersAvoidingRecentMatchups(
  players: HostQueuePlayer[],
  playersPerGame: number,
  recentMatchupSignatures: Set<string>
) {
  const searchPool = players.slice(0, Math.min(players.length, 10));
  const fallbackSelection = players.slice(0, playersPerGame);

  for (const combination of buildPlayerCombinations(searchPool, playersPerGame)) {
    const signature = createMatchupSignature(combination.map((player) => player.id));
    if (!recentMatchupSignatures.has(signature)) {
      return combination;
    }
  }

  return fallbackSelection;
}

function selectPlayersForWinLoseRotation(
  eligiblePlayers: HostQueuePlayer[],
  playersPerGame: number,
  recentMatchupSignatures: Set<string>,
  seed: number
): MatchSelection {
  const unplayedPlayers = prioritizePlayersForWinLose(
    eligiblePlayers.filter((player) => !player.latestResult),
    seed
  );
  const winnersGroup = prioritizePlayersForWinLose(
    eligiblePlayers.filter((player) => player.latestResult === "win"),
    seed + 1
  );
  const losersGroup = prioritizePlayersForWinLose(
    eligiblePlayers.filter((player) => player.latestResult === "lose"),
    seed + 2
  );

  const groupedPools: Array<{ players: HostQueuePlayer[]; matchGroup: QueueMatchGroup }> = [
    { players: unplayedPlayers, matchGroup: "unplayed" },
    { players: winnersGroup, matchGroup: "winners" },
    { players: losersGroup, matchGroup: "losers" },
  ];

  for (const pool of groupedPools) {
    if (pool.players.length < playersPerGame) {
      continue;
    }

    return {
      players: selectPlayersAvoidingRecentMatchups(
        pool.players,
        playersPerGame,
        recentMatchupSignatures
      ),
      matchGroup: pool.matchGroup,
    };
  }

  const fallbackPool = [
    ...unplayedPlayers,
    ...prioritizePlayersForWinLose([...winnersGroup, ...losersGroup], seed + 3),
  ];

  return {
    players:
      fallbackPool.length >= playersPerGame
        ? selectPlayersAvoidingRecentMatchups(
            fallbackPool,
            playersPerGame,
            recentMatchupSignatures
          )
        : [],
    matchGroup: "fallback-mixed",
  };
}

function selectPlayersForCourt(
  event: HostEventRecord,
  courtId: string,
  eligiblePlayers: HostQueuePlayer[],
  playersPerGame: number,
  seed: number
): MatchSelection {
  const recentMatchupSignatures = new Set(
    event.completedGames
      .filter((game) => game.courtId === courtId)
      .slice(-8)
      .map((game) => createMatchupSignature(game.playerIds))
  );

  if (event.rotation === "winLose") {
    return selectPlayersForWinLoseRotation(
      eligiblePlayers,
      playersPerGame,
      recentMatchupSignatures,
      seed
    );
  }

  return {
    players: selectPlayersAvoidingRecentMatchups(
      eligiblePlayers,
      playersPerGame,
      recentMatchupSignatures
    ),
    matchGroup: "standard",
  };
}

function selectPlayersForUpcomingAssignment(
  event: HostEventRecord,
  eligiblePlayers: HostQueuePlayer[],
  playersPerGame: number,
  seed: number
): MatchSelection {
  const recentMatchupSignatures = new Set(
    event.completedGames
      .slice(-12)
      .map((game) => createMatchupSignature(game.playerIds))
  );

  if (event.rotation === "winLose") {
    return selectPlayersForWinLoseRotation(
      eligiblePlayers,
      playersPerGame,
      recentMatchupSignatures,
      seed
    );
  }

  return {
    players: selectPlayersAvoidingRecentMatchups(
      eligiblePlayers,
      playersPerGame,
      recentMatchupSignatures
    ),
    matchGroup: "standard",
  };
}

function buildPlayerCombinations(players: HostQueuePlayer[], size: number) {
  const combinations: HostQueuePlayer[][] = [];

  function walk(startIndex: number, current: HostQueuePlayer[]) {
    if (current.length === size) {
      combinations.push([...current]);
      return;
    }

    for (let index = startIndex; index <= players.length - (size - current.length); index += 1) {
      current.push(players[index]);
      walk(index + 1, current);
      current.pop();
    }
  }

  walk(0, []);
  return combinations;
}

function createMatchupSignature(playerIds: string[]) {
  return [...playerIds].sort().join("|");
}

function updateDerivedPlayerStatuses(event: HostEventRecord): HostEventRecord {
  const activePlayerIds = new Set(event.activeCourtAssignments.flatMap((assignment) => assignment.playerIds));
  const minGamesPlayed = Math.min(...event.players.map((player) => player.gamesPlayed), 0);

  return {
    ...event,
    players: event.players.map((player) => ({
      ...player,
      status: activePlayerIds.has(player.id)
        ? "playing"
        : player.gamesPlayed > minGamesPlayed
        ? "resting"
        : "waiting",
    })),
  };
}

function syncQueueLifecycle(
  event: HostEventRecord,
  now = Date.now(),
  preferredExclusionsByCourt: Record<string, string[]> = {}
): HostEventRecord {
  if (event.queueStatus !== "running" || !event.startedAt) {
    return updateDerivedPlayerStatuses(event);
  }

  const elapsedMs = calculateElapsedQueueMs(event, now);
  const totalDurationMs = event.durationMinutes * 60 * 1000;

  if (elapsedMs < totalDurationMs) {
    return assignCourtsIfNeeded(updateDerivedPlayerStatuses(event), preferredExclusionsByCourt);
  }

  return updateDerivedPlayerStatuses({
    ...event,
    queueStatus: "completed" as QueueStatus,
    stackingStarted: false,
    endedAt: event.endedAt ?? new Date(now).toISOString(),
    activeCourtAssignments: [],
  });
}

function calculateElapsedQueueMs(event: HostEventRecord, now = Date.now()) {
  if (!event.startedAt) return 0;

  const startedAtMs = new Date(event.startedAt).getTime();
  const pausedWindowMs =
    event.queueStatus === "paused" && event.pausedAt
      ? Math.max(0, now - new Date(event.pausedAt).getTime())
      : 0;

  return Math.max(0, now - startedAtMs - event.totalPausedMs - pausedWindowMs);
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function readHostEventJoinCounts() {
  if (typeof window === "undefined") return {} as Record<string, number>;

  const raw = window.localStorage.getItem(HOST_EVENT_JOIN_COUNTS_KEY);
  if (!raw) return {} as Record<string, number>;

  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    window.localStorage.removeItem(HOST_EVENT_JOIN_COUNTS_KEY);
    return {} as Record<string, number>;
  }
}

function writeHostEventJoinCounts(counts: Record<string, number>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HOST_EVENT_JOIN_COUNTS_KEY, JSON.stringify(counts));
}

function parseSingleTime(value?: string) {
  if (!value) return 0;

  const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return 0;

  const hour = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = match[3].toUpperCase();

  let normalizedHour = hour % 12;
  if (meridiem === "PM") normalizedHour += 12;

  return normalizedHour + minutes / 60;
}

function formatSingleTime(value: string) {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw ?? "0");

  if (!Number.isFinite(hour)) return value;

  const meridiem = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalizedHour}:${minute.toString().padStart(2, "0")} ${meridiem}`;
}

function parseDisplayTimeToInput(value?: string) {
  if (!value) return "18:00";

  const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return "18:00";

  const hour = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = match[3].toUpperCase();

  let normalizedHour = hour % 12;
  if (meridiem === "PM") normalizedHour += 12;
  if (meridiem === "AM" && hour === 12) normalizedHour = 0;

  return `${normalizedHour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}
