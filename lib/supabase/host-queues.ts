import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyHostEventActivePlayerReplacement,
  applyHostEventCourtAddition,
  applyHostEventCourtRemoval,
  applyHostEventCompleteCourtGame,
  applyHostEventPlayerJoin,
  applyHostEventPlayerRemoval,
  applyHostEventResume,
  applyHostEventStackingState,
  applyHostEventUpdates,
  normalizeHostEventRecord,
  readHostEventByIdForOwner,
  readHostEvents,
  type HostEventRecord,
  type HostJoinedPlayer,
  type WinningTeamSide,
  writeHostEvents,
} from "@/lib/host-events";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const HOST_QUEUES_TABLE = "host_queues";

type HostQueueRow = {
  id: string;
  owner_id: string;
  club_name: string | null;
  event_date: string | null;
  queue_status: string | null;
  visibility: string | null;
  payload: HostEventRecord;
  created_at: string;
  updated_at: string;
};

function getSupabaseClient() {
  return createBrowserSupabaseClient();
}

function shouldFallbackToLocal(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string; message?: string; details?: string };
  const combinedMessage = `${maybeError.message ?? ""} ${maybeError.details ?? ""}`.toLowerCase();

  return (
    combinedMessage.includes("failed to fetch") ||
    combinedMessage.includes("network")
  );
}

function normalizeHostQueuesError(error: unknown) {
  if (error && typeof error === "object") {
    const maybeError = error as { code?: string; message?: string; details?: string };
    const combinedMessage = `${maybeError.message ?? ""} ${maybeError.details ?? ""}`.toLowerCase();

    if (
      maybeError.code === "PGRST205" ||
      combinedMessage.includes("host_queues") ||
      combinedMessage.includes("relation") ||
      combinedMessage.includes("does not exist")
    ) {
      return new Error(
        "Supabase host queue storage is not set up yet. Run the SQL in supabase/migrations/20260629_create_host_queues.sql in the Supabase SQL Editor first."
      );
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error;
  }

  return new Error("Supabase host queue storage is unavailable right now.");
}

function sortEventsNewestFirst(events: HostEventRecord[]) {
  return [...events].sort((left, right) => {
    const leftDate = new Date(left.createdAt ?? left.eventDate).getTime();
    const rightDate = new Date(right.createdAt ?? right.eventDate).getTime();
    return rightDate - leftDate;
  });
}

function toHostQueueRow(event: HostEventRecord): Omit<HostQueueRow, "created_at" | "updated_at"> {
  const normalizedEvent = normalizeHostEventRecord(event);

  if (!normalizedEvent.ownerId) {
    throw new Error("Host queue is missing an owner id.");
  }

  return {
    id: normalizedEvent.id,
    owner_id: normalizedEvent.ownerId,
    club_name: normalizedEvent.clubName,
    event_date: normalizedEvent.eventDate,
    queue_status: normalizedEvent.queueStatus,
    visibility: normalizedEvent.visibility,
    payload: normalizedEvent,
  };
}

function fromHostQueueRow(row: HostQueueRow) {
  return normalizeHostEventRecord({
    ...row.payload,
    id: row.id,
    ownerId: row.owner_id,
    clubName: row.club_name ?? row.payload?.clubName ?? "Queue",
    eventDate: row.event_date ?? row.payload?.eventDate ?? new Date().toISOString().slice(0, 10),
    queueStatus: (row.queue_status as HostEventRecord["queueStatus"] | null) ?? row.payload?.queueStatus ?? "draft",
    visibility: (row.visibility as HostEventRecord["visibility"] | null) ?? row.payload?.visibility ?? "public",
    createdAt: row.payload?.createdAt ?? row.created_at,
  });
}

function readLocalOwnerHostEvents(ownerId: string) {
  return readHostEvents()
    .map(normalizeHostEventRecord)
    .filter((event) => event.ownerId === ownerId);
}

function replaceLocalOwnerHostEvents(ownerId: string, events: HostEventRecord[]) {
  const normalizedOwnerEvents = events
    .map(normalizeHostEventRecord)
    .filter((event) => event.ownerId === ownerId);
  const currentEvents = readHostEvents().map(normalizeHostEventRecord);
  const otherEvents = currentEvents.filter((event) => event.ownerId !== ownerId);
  writeHostEvents([...normalizedOwnerEvents, ...otherEvents]);
}

function upsertLocalOwnerHostEvent(event: HostEventRecord) {
  const normalizedEvent = normalizeHostEventRecord(event);
  const currentEvents = readHostEvents().map(normalizeHostEventRecord);
  const nextEvents = currentEvents.some((entry) => entry.id === normalizedEvent.id)
    ? currentEvents.map((entry) => (entry.id === normalizedEvent.id ? normalizedEvent : entry))
    : [normalizedEvent, ...currentEvents];

  writeHostEvents(nextEvents);
  return normalizedEvent;
}

function removeLocalOwnerHostEvent(eventId: string) {
  const currentEvents = readHostEvents().map(normalizeHostEventRecord);
  const nextEvents = currentEvents.filter((event) => event.id !== eventId);
  writeHostEvents(nextEvents);
}

async function loadOwnerHostQueuesFromSupabase(
  supabase: SupabaseClient,
  ownerId: string
) {
  const { data, error } = await supabase
    .from(HOST_QUEUES_TABLE)
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const ownerEvents = (data ?? []).map((row) => fromHostQueueRow(row as HostQueueRow));
  replaceLocalOwnerHostEvents(ownerId, ownerEvents);
  return ownerEvents;
}

async function loadOwnerHostQueueFromSupabase(
  supabase: SupabaseClient,
  eventId: string,
  ownerId: string
) {
  const { data, error } = await supabase
    .from(HOST_QUEUES_TABLE)
    .select("*")
    .eq("id", eventId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    removeLocalOwnerHostEvent(eventId);
    return null;
  }

  const ownerEvent = fromHostQueueRow(data as HostQueueRow);
  upsertLocalOwnerHostEvent(ownerEvent);
  return ownerEvent;
}

async function upsertOwnerHostQueueToSupabase(
  supabase: SupabaseClient,
  event: HostEventRecord
) {
  const { data, error } = await supabase
    .from(HOST_QUEUES_TABLE)
    .upsert(toHostQueueRow(event), { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const savedEvent = fromHostQueueRow(data as HostQueueRow);
  upsertLocalOwnerHostEvent(savedEvent);
  return savedEvent;
}

async function deleteOwnerHostQueueFromSupabase(
  supabase: SupabaseClient,
  eventId: string,
  ownerId: string
) {
  const { error } = await supabase
    .from(HOST_QUEUES_TABLE)
    .delete()
    .eq("id", eventId)
    .eq("owner_id", ownerId);

  if (error) {
    throw error;
  }

  removeLocalOwnerHostEvent(eventId);
}

export async function listOwnerHostQueues(ownerId: string) {
  const supabase = getSupabaseClient();

  try {
    return await loadOwnerHostQueuesFromSupabase(supabase, ownerId);
  } catch (error) {
    if (!shouldFallbackToLocal(error)) {
      throw normalizeHostQueuesError(error);
    }

    return sortEventsNewestFirst(readLocalOwnerHostEvents(ownerId));
  }
}

export async function loadOwnerHostQueue(eventId: string, ownerId: string) {
  const supabase = getSupabaseClient();

  try {
    return await loadOwnerHostQueueFromSupabase(supabase, eventId, ownerId);
  } catch (error) {
    if (!shouldFallbackToLocal(error)) {
      throw normalizeHostQueuesError(error);
    }

    return readHostEventByIdForOwner(eventId, ownerId);
  }
}

export async function saveOwnerHostQueue(event: HostEventRecord) {
  const normalizedEvent = normalizeHostEventRecord(event);
  const supabase = getSupabaseClient();

  try {
    return await upsertOwnerHostQueueToSupabase(supabase, normalizedEvent);
  } catch (error) {
    if (!shouldFallbackToLocal(error)) {
      throw normalizeHostQueuesError(error);
    }

    return upsertLocalOwnerHostEvent(normalizedEvent);
  }
}

export async function deleteOwnerHostQueue(eventId: string, ownerId: string) {
  const supabase = getSupabaseClient();

  try {
    await deleteOwnerHostQueueFromSupabase(supabase, eventId, ownerId);
  } catch (error) {
    if (!shouldFallbackToLocal(error)) {
      throw normalizeHostQueuesError(error);
    }

    removeLocalOwnerHostEvent(eventId);
  }
}

export async function mutateOwnerHostQueue(
  eventId: string,
  ownerId: string,
  transform: (event: HostEventRecord) => HostEventRecord
) {
  const currentEvent = await loadOwnerHostQueue(eventId, ownerId);
  if (!currentEvent) return null;

  const nextEvent = normalizeHostEventRecord({
    ...transform(currentEvent),
    id: eventId,
    ownerId,
  });

  return saveOwnerHostQueue(nextEvent);
}

export async function saveUpdatedOwnerHostQueue(
  eventId: string,
  ownerId: string,
  updates: Partial<HostEventRecord>
) {
  return mutateOwnerHostQueue(eventId, ownerId, (event) => applyHostEventUpdates(event, updates));
}

export async function startOrStopOwnerHostQueue(
  eventId: string,
  ownerId: string,
  stackingStarted: boolean
) {
  return mutateOwnerHostQueue(eventId, ownerId, (event) =>
    applyHostEventStackingState(event, stackingStarted)
  );
}

export async function resumeOwnerHostQueue(eventId: string, ownerId: string) {
  return mutateOwnerHostQueue(eventId, ownerId, (event) => applyHostEventResume(event));
}

export async function completeOwnerHostQueueCourtGame(
  eventId: string,
  ownerId: string,
  courtId: string,
  winnerSide?: WinningTeamSide
) {
  return mutateOwnerHostQueue(eventId, ownerId, (event) =>
    applyHostEventCompleteCourtGame(event, courtId, winnerSide)
  );
}

export async function addPlayerToOwnerHostQueue(
  eventId: string,
  ownerId: string,
  player: HostJoinedPlayer
) {
  return mutateOwnerHostQueue(eventId, ownerId, (event) => applyHostEventPlayerJoin(event, player));
}

export async function removePlayerFromOwnerHostQueue(
  eventId: string,
  ownerId: string,
  playerId: string
) {
  return mutateOwnerHostQueue(eventId, ownerId, (event) =>
    applyHostEventPlayerRemoval(event, playerId)
  );
}

export async function addCourtToOwnerHostQueue(eventId: string, ownerId: string) {
  return mutateOwnerHostQueue(eventId, ownerId, (event) => applyHostEventCourtAddition(event));
}

export async function removeCourtFromOwnerHostQueue(
  eventId: string,
  ownerId: string,
  courtId: string
) {
  return mutateOwnerHostQueue(eventId, ownerId, (event) =>
    applyHostEventCourtRemoval(event, courtId)
  );
}

export async function replaceActivePlayerOnOwnerHostQueue(
  eventId: string,
  ownerId: string,
  courtId: string,
  currentPlayerId: string,
  replacementPlayerId: string
) {
  return mutateOwnerHostQueue(eventId, ownerId, (event) =>
    applyHostEventActivePlayerReplacement(event, courtId, currentPlayerId, replacementPlayerId)
  );
}
