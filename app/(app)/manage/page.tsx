"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { X, CalendarRange, Plus, Shuffle, Trash2, Trophy, Users } from "lucide-react";
import { AppRoleGuard } from "@/components/auth/app-role-guard";
import {
  formatRotationModeLabel,
  formatTimeRange,
  type HostEventCourt,
  type HostEventRecord,
  type HostGenderGroup,
  type HostPlayFormat,
  type HostRotationMode,
} from "@/lib/host-events";
import {
  deleteOwnerHostQueue,
  listOwnerHostQueues,
  saveOwnerHostQueue,
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

export default function ManageDashboard() {
  const defaultSchedule = getDefaultQueueSchedule();
  const [clubName, setClubName] = useState("New Queue");
  const [startTime, setStartTime] = useState(defaultSchedule.startTime);
  const [endTime, setEndTime] = useState(defaultSchedule.endTime);
  const [numberOfPlayers, setNumberOfPlayers] = useState(24);
  const [genderGroup, setGenderGroup] = useState<HostGenderGroup>("mixed");
  const [playFormat, setPlayFormat] = useState<HostPlayFormat>("doubles");
  const [rotation, setRotation] = useState<HostRotationMode>("random");
  const [playerNamesInput, setPlayerNamesInput] = useState("");
  const [courts, setCourts] = useState<HostEventCourt[]>([]);
  const [events, setEvents] = useState<HostEventRecord[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createQueueMessage, setCreateQueueMessage] = useState("");

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let isMounted = true;

    setCourts([
      { id: crypto.randomUUID(), name: "Court 1", genderGroup: "mixed" },
      { id: crypto.randomUUID(), name: "Court 2", genderGroup: "mixed" },
    ]);

    async function syncOwnerEvents() {
      try {
        const { data } = await supabase.auth.getSession();
        const currentOwnerId = data.session?.user?.id ?? null;
        const currentUser = data.session?.user ?? null;

        if (!isMounted) return;
        setOwnerId(currentOwnerId);

        if (!currentOwnerId) {
          setEvents([]);
          return;
        }

        const ownerEvents = await listOwnerHostQueues(currentOwnerId);
        if (!isMounted) return;
        setEvents(ownerEvents);
      } catch (error) {
        if (!isMounted) return;
        setCreateQueueMessage(
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "We couldn't load your queues right now. Please refresh and try again."
        );
      }
    }

    void syncOwnerEvents();
    window.addEventListener("focus", syncOwnerEvents);
    window.addEventListener("storage", syncOwnerEvents);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", syncOwnerEvents);
      window.removeEventListener("storage", syncOwnerEvents);
    };
  }, []);

  const ownedEvents = useMemo(
    () => (ownerId ? events.filter((event) => event.ownerId === ownerId) : []),
    [events, ownerId]
  );

  function addCourt() {
    setCourts((current) => [
      ...current,
      { id: crypto.randomUUID(), name: `Court ${current.length + 1}`, genderGroup: "mixed" },
    ]);
  }

  function updateCourt(id: string, name: string) {
    setCourts((current) => current.map((court) => (court.id === id ? { ...court, name } : court)));
  }

  function removeCourt(id: string) {
    setCourts((current) => (current.length === 1 ? current : current.filter((court) => court.id !== id)));
  }

  function resetForm() {
    const nextDefaultSchedule = getDefaultQueueSchedule();
    setClubName("New Queue");
    setStartTime(nextDefaultSchedule.startTime);
    setEndTime(nextDefaultSchedule.endTime);
    setNumberOfPlayers(24);
    setGenderGroup("mixed");
    setPlayFormat("doubles");
    setRotation("random");
    setPlayerNamesInput("");
    setCreateQueueMessage("");
    setCourts([
      { id: crypto.randomUUID(), name: "Court 1", genderGroup: "mixed" },
      { id: crypto.randomUUID(), name: "Court 2", genderGroup: "mixed" },
    ]);
  }

  async function createEvent() {
    if (!ownerId) {
      setCreateQueueMessage("We couldn't identify the signed-in host account. Please sign in again.");
      return;
    }

    const enteredPlayerNames = parseUniquePlayerNames(playerNamesInput);
    if (enteredPlayerNames.length > numberOfPlayers) {
      setCreateQueueMessage(
        `You entered ${enteredPlayerNames.length} player names, but the queue only allows ${numberOfPlayers}. Remove a few names, then try again.`
      );
      return;
    }

    const playerNames = sanitizePlayerNames(playerNamesInput, numberOfPlayers);
    const queueDurationMinutes = getDurationMinutes(startTime, endTime);
    const queueDate = getDefaultQueueSchedule().eventDate;
    const queuePlayers = playerNames.map((name) => ({
      id: crypto.randomUUID(),
      name,
      gamesPlayed: 0,
      status: "waiting" as const,
    }));

    const nextEvent: HostEventRecord = {
      id: crypto.randomUUID(),
      ownerId,
      clubName: clubName.trim() || "New Queue",
      location: "",
      eventDate: queueDate,
      time: formatTimeRange(startTime, endTime),
      numberOfPlayers,
      joinedCount: playerNames.length,
      skillFocus: "",
      genderGroup,
      playFormat,
      rotation,
      costPerHead: 0,
      visibility: "public",
      durationMinutes: queueDurationMinutes,
      courts: courts.map((court) => ({
        ...court,
        name: court.name.trim() || "Court",
      })),
      players: queuePlayers,
      activeCourtAssignments: [],
      completedGames: [],
      queueStatus: "draft",
      totalPausedMs: 0,
      joinedPlayers: queuePlayers.map((player) => ({
        id: player.id,
        name: player.name,
        joinedAt: new Date().toISOString(),
        playerType: playFormat === "single" ? "Solo" : "Group",
        skill: "",
      })),
      stackingStarted: false,
      createdAt: new Date().toISOString(),
    };

    try {
      const savedEvent = await saveOwnerHostQueue(nextEvent);
      setEvents((current) => [savedEvent, ...current.filter((event) => event.id !== savedEvent.id)]);
      resetForm();
      setIsCreateModalOpen(false);
    } catch (error) {
      setCreateQueueMessage(
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "We couldn't save this queue right now. Please try again."
      );
    }
  }

  async function removeEvent(id: string) {
    if (!ownerId) return;

    try {
      await deleteOwnerHostQueue(id, ownerId);
      setEvents((current) => current.filter((event) => event.id !== id));
    } catch (error) {
      setCreateQueueMessage(
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "We couldn't delete this queue right now. Please try again."
      );
    }
  }

  function handlePlayerNamesChange(value: string) {
    setPlayerNamesInput(value);

    const enteredPlayerNames = parseUniquePlayerNames(value);
    if (enteredPlayerNames.length > numberOfPlayers) {
      setCreateQueueMessage(
        `Only ${numberOfPlayers} players are allowed for this queue. You currently entered ${enteredPlayerNames.length} names.`
      );
      return;
    }

    setCreateQueueMessage("");
  }

  return (
    <AppRoleGuard allowedRoles={["host"]}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-mist/45">Queue Workspace</p>
            <h1 className="mt-2 font-head text-2xl font-black sm:text-3xl">User dashboard</h1>
            <p className="mt-2 text-sm text-mist/55">
              Create live queues, define the court setup, and open a dedicated stacking page for each queue.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-panel px-4 py-3 text-sm text-mist/65">
              Live queues: <span className="font-semibold text-mist">{ownedEvents.length}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-volt px-5 py-3 text-sm font-head font-bold text-ink"
            >
              <Plus className="h-4 w-4" />
              Create new queue
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <section className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-panel p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-head text-lg font-black">Current Queues</h2>
                  <p className="mt-1 text-sm text-mist/55">
                    Each queue opens its own page where you can edit details, inspect players, and start stacking.
                  </p>
                </div>
                <span className="rounded-full bg-volt/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-volt">
                  {ownedEvents.length} total
                </span>
              </div>

              {ownedEvents.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-mist/55">
                  No queues yet for this signed-in host. Click `Create new queue` to set up your first live queue.
                </div>
              ) : (
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  {ownedEvents.map((event) => (
                    <div key={event.id} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.22em] text-mist/40">Live queue</p>
                          <h3 className="mt-2 font-head text-2xl font-black">{event.clubName}</h3>
                          <div className="mt-4 space-y-2 text-sm text-mist/58">
                            <p className="flex items-center gap-2">
                              <CalendarRange className="h-4 w-4 text-volt" />
                              {new Date(event.eventDate).toLocaleDateString()}
                            </p>
                            <p className="flex items-center gap-2">
                              <CalendarRange className="h-4 w-4 text-volt" />
                              {event.time}
                            </p>
                            <p className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-volt" />
                              {event.numberOfPlayers} players
                            </p>
                            <p className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-volt" />
                              {event.genderGroup} players
                            </p>
                            <p className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-volt" />
                              {event.playFormat}
                            </p>
                            <p className="flex items-center gap-2">
                              <Shuffle className="h-4 w-4 text-volt" />
                              {formatRotationModeLabel(event.rotation)} rotation
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/manage/${event.id}`}
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-mist/70 hover:bg-white/10"
                          >
                            Open queue
                          </Link>
                          <button
                            type="button"
                            onClick={() => void removeEvent(event.id)}
                            className="rounded-full border border-white/10 p-2 text-mist/60 hover:bg-white/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 rounded-2xl border border-white/10 bg-panel/50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-mist/40">Courts</p>
                          <span className="text-xs text-mist/45">{event.joinedPlayers.length} joined</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {event.courts.map((court) => (
                            <span
                              key={court.id}
                              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-mist/75"
                            >
                              {court.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 px-4 py-6 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-panel p-5 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-mist/45">New Queue</p>
                  <h2 className="mt-2 font-head text-2xl font-black">Create Queue</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-full border border-white/10 p-2 text-mist/60 hover:bg-white/5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <FormField label="Queue name">
                  <input
                    value={clubName}
                    onChange={(event) => setClubName(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist outline-none focus:border-volt"
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Start time">
                    <input
                      type="time"
                      value={startTime}
                      onChange={(event) => setStartTime(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist outline-none focus:border-volt"
                    />
                  </FormField>

                  <FormField label="End time">
                    <input
                      type="time"
                      value={endTime}
                      onChange={(event) => setEndTime(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist outline-none focus:border-volt"
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Number of players">
                    <input
                      type="number"
                      min={2}
                      value={numberOfPlayers}
                      onChange={(event) => setNumberOfPlayers(Number(event.target.value) || 2)}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist outline-none focus:border-volt"
                    />
                  </FormField>

                  <FormField label="Player mix">
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
                  </FormField>
                </div>

                <FormField label="Player names">
                  <textarea
                    value={playerNamesInput}
                    onChange={(event) => handlePlayerNamesChange(event.target.value)}
                    placeholder="Enter one player per line"
                    rows={6}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist outline-none placeholder:text-mist/30 focus:border-volt"
                  />
                </FormField>

                {createQueueMessage && (
                  <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {createQueueMessage}
                  </div>
                )}
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
                <p className="text-xs uppercase tracking-wide text-mist/40">Rotation mode</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-mist/40">Courts</p>
                  <button
                    type="button"
                    onClick={addCourt}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-mist/70"
                  >
                    Add court
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {courts.map((court, index) => (
                    <div key={court.id} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <input
                        value={court.name}
                        onChange={(event) => updateCourt(court.id, event.target.value)}
                        placeholder={`Court ${index + 1}`}
                        className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist outline-none focus:border-volt"
                      />
                      <button
                        type="button"
                        onClick={() => removeCourt(court.id)}
                        className="rounded-xl border border-white/10 p-3 text-mist/55 hover:bg-white/5"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-full border border-white/10 px-5 py-3 text-sm font-head font-bold text-mist/75 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void createEvent()}
                  className="inline-flex items-center gap-2 rounded-full bg-volt px-5 py-3 text-sm font-head font-bold text-ink"
                >
                  <Plus className="h-4 w-4" />
                  Create Queue
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppRoleGuard>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-mist/40">{label}</p>
      {children}
    </div>
  );
}

function sanitizePlayerNames(rawValue: string, expectedCount: number) {
  return parseUniquePlayerNames(rawValue).slice(0, expectedCount);
}

function parseUniquePlayerNames(rawValue: string) {
  return rawValue
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry, index, array) => array.indexOf(entry) === index);
}

function getDefaultQueueSchedule() {
  const now = new Date();
  const nextSlot = new Date(now);
  nextSlot.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0);

  if (nextSlot.getTime() <= now.getTime()) {
    nextSlot.setMinutes(nextSlot.getMinutes() + 30);
  }

  const endSlot = new Date(nextSlot);
  endSlot.setHours(endSlot.getHours() + 2);

  return {
    eventDate: formatDateInput(nextSlot),
    startTime: formatTimeInput(nextSlot),
    endTime: formatTimeInput(endSlot),
  };
}

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeInput(value: Date) {
  const hours = `${value.getHours()}`.padStart(2, "0");
  const minutes = `${value.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getDurationMinutes(startTime: string, endTime: string) {
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);
  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;
  const rawDuration = endTotalMinutes - startTotalMinutes;

  if (Number.isNaN(rawDuration) || rawDuration <= 0) {
    return 60;
  }

  return rawDuration;
}
