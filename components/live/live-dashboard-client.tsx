"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Lock,
  MapPin,
  MinusCircle,
  Search,
  ShieldCheck,
  Shuffle,
  Timer,
  Users,
} from "lucide-react";
import { AppRoleGuard } from "@/components/auth/app-role-guard";
import {
  deriveHostSessionsFromEvents,
  formatRotationModeLabel,
  readHostEvents,
  removePlayerFromHostEvent,
  type DerivedHostEventSession,
} from "@/lib/host-events";
import { sessionsConflict } from "@/lib/mock-platform";
import {
  clearPlayerJoinRecord,
  readPlayerJoinRecord,
  type PlayerJoinRecord,
} from "@/lib/player-join";

type FilterState = {
  search: string;
  location: string;
  time: string;
  skill: string;
  rotation: string;
};

const timeFilterOptions = [
  { value: "", label: "All times" },
  { value: "6:00 PM - 8:00 PM", label: "6:00 PM - 8:00 PM" },
  { value: "6:30 PM - 8:30 PM", label: "6:30 PM - 8:30 PM" },
  { value: "7:00 PM - 9:00 PM", label: "7:00 PM - 9:00 PM" },
  { value: "8:00 PM - 10:00 PM", label: "8:00 PM - 10:00 PM" },
  { value: "9:00 PM - 11:00 PM", label: "9:00 PM - 11:00 PM" },
];

const skillFilterOptions = [
  { value: "", label: "All skill levels" },
  { value: "Intro to 3.0", label: "Intro to 3.0" },
  { value: "3.0 to 3.5", label: "3.0 to 3.5" },
  { value: "3.5 to 4.0", label: "3.5 to 4.0" },
  { value: "3.5 to 4.5+", label: "3.5 to 4.5+" },
  { value: "4.0 to 4.5+", label: "4.0 to 4.5+" },
  { value: "Invite-only mixed play", label: "Invite-only mixed play" },
  { value: "Open all levels", label: "Open all levels" },
];

const initialFilters: FilterState = {
  search: "",
  location: "",
  time: "",
  skill: "",
  rotation: "all",
};

export function LiveDashboardClient() {
  const [joinedHost, setJoinedHost] = useState<PlayerJoinRecord | null>(null);
  const [conflictMessage, setConflictMessage] = useState("");
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [visibleHosts, setVisibleHosts] = useState<DerivedHostEventSession[]>([]);

  useEffect(() => {
    function syncFromStorage() {
      setJoinedHost(readPlayerJoinRecord());
      setVisibleHosts(deriveHostSessionsFromEvents(readHostEvents()));
    }

    syncFromStorage();

    window.addEventListener("focus", syncFromStorage);
    window.addEventListener("storage", syncFromStorage);
    document.addEventListener("visibilitychange", syncFromStorage);

    return () => {
      window.removeEventListener("focus", syncFromStorage);
      window.removeEventListener("storage", syncFromStorage);
      document.removeEventListener("visibilitychange", syncFromStorage);
    };
  }, []);

  const filteredHosts = useMemo(() => {
    return visibleHosts
      .filter((host) => getEventStatus(host) !== "past")
      .filter((host) => {
      const search = filters.search.trim().toLowerCase();
      const location = filters.location.trim().toLowerCase();
      const time = filters.time.trim().toLowerCase();
      const skill = filters.skill.trim().toLowerCase();
      const rotation = filters.rotation;

      if (search && !host.hostName.toLowerCase().includes(search)) return false;
      if (location && !host.venue.toLowerCase().includes(location)) return false;
      if (time && !host.timeLabel.toLowerCase().includes(time)) return false;
      if (skill && !host.skillFocus.toLowerCase().includes(skill)) return false;
      if (rotation !== "all" && host.rotationMode !== rotation) return false;

      return true;
      })
      .sort((left, right) => {
        const leftStatus = getEventStatus(left);
        const rightStatus = getEventStatus(right);

        if (leftStatus !== rightStatus) {
          return leftStatus === "ongoing" ? -1 : 1;
        }

        return getEventStartDate(left).getTime() - getEventStartDate(right).getTime();
      });
  }, [filters, visibleHosts]);

  function removeJoinedHost() {
    if (joinedHost?.playerId) {
      removePlayerFromHostEvent(joinedHost.hostSlug, joinedHost.playerId);
      setVisibleHosts(deriveHostSessionsFromEvents(readHostEvents()));
    }
    clearPlayerJoinRecord();
    setJoinedHost(null);
    setConflictMessage("");
  }

  function handleInviteLookup() {
    const normalizedInvite = inviteCode.trim().toUpperCase();
    if (!normalizedInvite) {
      setInviteMessage("Enter the private invite code first.");
      return;
    }

    const match = visibleHosts.find(
      (host) => host.visibility === "private" && host.inviteCode?.toUpperCase() === normalizedInvite
    );

    if (!match) {
      setInviteMessage("No private host matched that invite code.");
      return;
    }

    window.location.href = `/join?host=${match.slug}&invite=${match.inviteCode}`;
  }

  return (
    <AppRoleGuard allowedRoles={["player", "host", "admin"]}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-head text-2xl font-black sm:text-3xl">Host Directory</h1>
            <p className="mt-1 text-sm text-mist/50">
              Players can browse all active events, with ongoing sessions first and upcoming sessions right after.
            </p>
          </div>
          <div className="hidden rounded-full border border-white/10 bg-panel/80 px-4 py-2 text-xs text-mist/60 sm:flex sm:items-center sm:gap-2">
            <Activity className="h-3.5 w-3.5 text-volt" />
            Live stack visibility
          </div>
        </div>

        <div className="mb-4 grid gap-3 rounded-3xl border border-white/10 bg-panel p-4 lg:grid-cols-[1.2fr_1fr_1fr_1fr_180px]">
          <label className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist/75">
            <span className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-mist/40">
              <Search className="h-3.5 w-3.5" />
              Club name
            </span>
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search club"
              className="w-full bg-transparent outline-none placeholder:text-mist/30"
            />
          </label>

          <InputFilter
            label="Location"
            value={filters.location}
            placeholder="Filter location"
            onChange={(value) => setFilters((current) => ({ ...current, location: value }))}
          />

          <SelectFilter
            label="Time"
            value={filters.time}
            options={timeFilterOptions}
            onChange={(value) => setFilters((current) => ({ ...current, time: value }))}
          />

          <SelectFilter
            label="Skills"
            value={filters.skill}
            options={skillFilterOptions}
            onChange={(value) => setFilters((current) => ({ ...current, skill: value }))}
          />

          <label className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist/75">
            <span className="mb-2 block text-xs uppercase tracking-wide text-mist/40">Rotation</span>
            <select
              value={filters.rotation}
              onChange={(event) => setFilters((current) => ({ ...current, rotation: event.target.value }))}
              className="w-full bg-transparent text-mist outline-none"
            >
              <option value="all" className="bg-panel text-mist">All</option>
              <option value="skill" className="bg-panel text-mist">Skill</option>
              <option value="random" className="bg-panel text-mist">Random</option>
              <option value="winLose" className="bg-panel text-mist">Win/Lose</option>
            </select>
          </label>
        </div>

        <div className="mb-6 flex flex-col gap-3 rounded-3xl border border-white/10 bg-panel p-4 sm:flex-row sm:items-end">
          <label className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist/75">
            <span className="mb-2 block text-xs uppercase tracking-wide text-mist/40">Private invite code</span>
            <input
              value={inviteCode}
              onChange={(event) => {
                setInviteCode(event.target.value);
                setInviteMessage("");
              }}
              placeholder="Enter invite code"
              className="w-full bg-transparent uppercase outline-none placeholder:text-mist/30"
            />
          </label>
          <button
            type="button"
            onClick={handleInviteLookup}
            className="inline-flex items-center justify-center rounded-full bg-volt px-5 py-3 text-sm font-head font-bold text-ink"
          >
            Open private host
          </button>
        </div>

        {inviteMessage && (
          <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {inviteMessage}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-4 md:grid-cols-2">
            {filteredHosts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-panel p-8 text-sm text-mist/55 md:col-span-2">
                No active events match your filters right now. Ask a host to create one or clear the filters above.
              </div>
            ) : (
              filteredHosts.map((host) => {
                const alreadyJoined = joinedHost?.hostSlug === host.slug;
                const eventStatus = getEventStatus(host);
                const conflictingTime =
                  !alreadyJoined &&
                  joinedHost !== null &&
                  sessionsConflict(
                    { startHour: host.startHour, endHour: host.endHour },
                    { startHour: joinedHost.startHour, endHour: joinedHost.endHour }
                  );

                return (
                  <div key={host.slug} className="rounded-3xl border border-white/10 bg-panel p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-mist/40">
                          {eventStatus === "ongoing" ? "Ongoing" : "Upcoming"}
                        </p>
                        <h2 className="mt-2 font-head text-xl font-black">{host.hostName}</h2>
                        <p className="mt-2 flex items-center gap-2 text-sm text-mist/50">
                          <MapPin className="h-4 w-4" />
                          {host.venue}
                        </p>
                        <p className="mt-2 flex items-center gap-2 text-sm text-mist/50">
                          <Timer className="h-4 w-4" />
                          {new Date(host.eventDate).toLocaleDateString()}
                        </p>
                        <p className="mt-2 flex items-center gap-2 text-sm text-mist/50">
                          <Timer className="h-4 w-4" />
                          {host.timeLabel}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            eventStatus === "ongoing"
                              ? "bg-volt/15 text-volt"
                              : "bg-sky-400/10 text-sky-200"
                          }`}
                        >
                          {eventStatus}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            host.visibility === "public"
                              ? "bg-volt/15 text-volt"
                              : "bg-white/10 text-mist/75"
                          }`}
                        >
                          {host.visibility}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                      <StatCard label="Open courts" value={host.courts.filter((court) => court.status === "open").length.toString()} />
                      <StatCard label="Active courts" value={host.courts.filter((court) => court.status === "occupied").length.toString()} />
                      <StatCard label="Head count" value={`${host.joinedCount}/${host.playerCapacity}`} />
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2 text-xs text-mist/60">
                      <span className="rounded-full border border-white/10 px-3 py-1.5">
                        Skill focus: {host.skillFocus}
                      </span>
                      <span className="rounded-full border border-white/10 px-3 py-1.5">
                        Rotation: {formatRotationModeLabel(host.rotationMode)}
                      </span>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm text-mist/55">
                        {host.visibility === "public" ? (
                          <ShieldCheck className="h-4 w-4 text-volt" />
                        ) : (
                          <Lock className="h-4 w-4 text-mist/60" />
                        )}
                        {host.visibility === "public"
                          ? "Anyone can view and join"
                          : `Invite required${host.inviteCode ? `: ${host.inviteCode}` : ""}`}
                      </div>

                      {alreadyJoined ? (
                        <span className="inline-flex items-center gap-2 rounded-full border border-volt/30 bg-volt/10 px-4 py-2 text-sm font-head font-bold text-volt">
                          <CheckCircle2 className="h-4 w-4" />
                          Already joined
                        </span>
                      ) : conflictingTime ? (
                        <button
                          type="button"
                          onClick={() =>
                            setConflictMessage(
                              `${host.hostName} overlaps with your current session. Select another time or remove your current host first.`
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-head font-bold text-amber-200"
                        >
                          Select another time
                        </button>
                      ) : (
                        <Link
                          href={
                            host.visibility === "private" && host.inviteCode
                              ? `/join?host=${host.slug}&invite=${host.inviteCode}`
                              : `/join?host=${host.slug}`
                          }
                          className="inline-flex items-center gap-2 rounded-full bg-volt px-4 py-2 text-sm font-head font-bold text-ink"
                        >
                          Select host
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-panel p-5">
              <h2 className="font-head text-sm font-bold uppercase tracking-[0.2em] text-mist/60">
                Joined Host Summary
              </h2>

              {joinedHost ? (
                <div className="mt-4 space-y-3 text-sm">
                  <div className="rounded-2xl border border-volt/20 bg-volt/10 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-volt/70">Current host</p>
                    <h3 className="mt-2 font-head text-xl font-black text-mist">{joinedHost.hostName}</h3>
                    <p className="mt-2 flex items-center gap-2 text-mist/60">
                      <MapPin className="h-4 w-4" />
                      {joinedHost.venue}
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-mist/60">
                      <Timer className="h-4 w-4" />
                      {joinedHost.timeLabel}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-mist/65">
                    <p>
                      Skill: <span className="font-semibold text-mist">{joinedHost.skill}</span>
                    </p>
                    <p className="mt-2">
                      Type: <span className="font-semibold text-mist">{joinedHost.playerType}</span>
                    </p>
                    <p className="mt-2 capitalize">
                      Session: <span className="font-semibold text-mist">{joinedHost.visibility}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={removeJoinedHost}
                    className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-head font-bold text-rose-200"
                  >
                    <MinusCircle className="h-4 w-4" />
                    Remove from this host
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-sm text-mist/55">
                  You have not joined a host yet. Once you join one, it will be summarized here and disabled in the list.
                </p>
              )}

              {conflictMessage && (
                <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                  {conflictMessage}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-panel p-5">
              <h2 className="font-head text-sm font-bold uppercase tracking-[0.2em] text-mist/60">
                Access Rules
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-mist/55">
                <li className="flex gap-3">
                  <Users className="mt-0.5 h-4 w-4 text-volt" />
                  Players can filter hosts by club, location, time, skill focus, and rotation.
                </li>
                <li className="flex gap-3">
                  <Shuffle className="mt-0.5 h-4 w-4 text-volt" />
                  Head count shows how many players have already joined each event.
                </li>
                <li className="flex gap-3">
                  <Lock className="mt-0.5 h-4 w-4 text-mist/70" />
                  Private sessions only open through the matching invite code.
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </AppRoleGuard>
  );
}

function InputFilter({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist/75">
      <span className="mb-2 block text-xs uppercase tracking-wide text-mist/40">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent outline-none placeholder:text-mist/30"
      />
    </label>
  );
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist/75">
      <span className="mb-2 block text-xs uppercase tracking-wide text-mist/40">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-transparent text-mist outline-none"
      >
        {options.map((option) => (
          <option key={option.label} value={option.value} className="bg-panel text-mist">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs uppercase tracking-wide text-mist/40">{label}</p>
      <p className="mt-2 font-head text-2xl font-black">{value}</p>
    </div>
  );
}

function getEventStatus(host: DerivedHostEventSession) {
  const now = new Date();
  const eventStart = getEventStartDate(host);
  const eventEnd = getEventEndDate(host);

  if (now > eventEnd) return "past";
  if (now >= eventStart) return "ongoing";
  return "upcoming";
}

function getEventStartDate(host: DerivedHostEventSession) {
  const eventDate = new Date(`${host.eventDate}T00:00:00`);
  eventDate.setHours(Math.floor(host.startHour), (host.startHour % 1) * 60, 0, 0);
  return eventDate;
}

function getEventEndDate(host: DerivedHostEventSession) {
  const eventDate = new Date(`${host.eventDate}T00:00:00`);
  eventDate.setHours(Math.floor(host.endHour), (host.endHour % 1) * 60, 0, 0);
  return eventDate;
}
