"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Lock, Timer, User, Users } from "lucide-react";
import { AppRoleGuard } from "@/components/auth/app-role-guard";
import { sessionsConflict } from "@/lib/mock-platform";
import {
  addPlayerToHostEvent,
  deriveHostSessionsFromEvents,
  formatRotationModeLabel,
  readHostEvents,
} from "@/lib/host-events";
import {
  readPlayerJoinRecord,
  writePlayerJoinRecord,
  type PlayerJoinRecord,
} from "@/lib/player-join";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const skillLevels = ["Intro", "3.0", "3.5", "4.0", "4.5+"] as const;
type SkillLevel = (typeof skillLevels)[number];
type PlayerType = "Solo" | "Group";

const steps = ["Host", "Skill", "Type", "Confirm"];

export function JoinQueueClient({
  hostSlug,
  inviteCode,
}: {
  hostSlug: string;
  inviteCode: string;
}) {
  const router = useRouter();
  const [savedHosts, setSavedHosts] = useState(() => deriveHostSessionsFromEvents(readHostEvents()));

  useEffect(() => {
    setSavedHosts(deriveHostSessionsFromEvents(readHostEvents()));
  }, []);

  const host = useMemo(() => {
    return savedHosts.find((session) => session.slug === hostSlug) ?? null;
  }, [hostSlug, savedHosts]);
  const hasInviteAccess =
    !host || host.visibility === "public" || (inviteCode && inviteCode === host.inviteCode);

  const [step, setStep] = useState(0);
  const [skill, setSkill] = useState<SkillLevel | null>(null);
  const [playerType, setPlayerType] = useState<PlayerType | null>(null);
  const [joined, setJoined] = useState(false);
  const [existingJoin, setExistingJoin] = useState<PlayerJoinRecord | null>(null);
  const [playerIdentity, setPlayerIdentity] = useState<{
    id: string;
    name: string;
    email?: string;
  } | null>(null);

  useEffect(() => {
    setExistingJoin(readPlayerJoinRecord());
    const supabase = createBrowserSupabaseClient();

    void supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) return;

      setPlayerIdentity({
        id: user.id,
        name:
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          user.email ??
          "Player",
        email: user.email,
      });
    });
  }, []);

  const hasTimeConflict =
    host !== null &&
    existingJoin !== null &&
    existingJoin.hostSlug !== host.slug &&
    sessionsConflict(
      { startHour: host.startHour, endHour: host.endHour },
      { startHour: existingJoin.startHour, endHour: existingJoin.endHour }
    );

  const canAdvance = [host !== null && hasInviteAccess, skill !== null, playerType !== null, true];

  function next() {
    if (step < steps.length - 1 && canAdvance[step]) {
      setStep(step + 1);
      return;
    }

    if (step === steps.length - 1 && host && skill && playerType && playerIdentity) {
      if (hasTimeConflict) {
        return;
      }

      writePlayerJoinRecord({
        playerId: playerIdentity.id,
        playerName: playerIdentity.name,
        playerEmail: playerIdentity.email,
        hostSlug: host.slug,
        hostName: host.hostName,
        venue: host.venue,
        timeLabel: host.timeLabel,
        startHour: host.startHour,
        endHour: host.endHour,
        skill,
        playerType,
        visibility: host.visibility,
      });
      addPlayerToHostEvent(host.slug, {
        id: playerIdentity.id,
        name: playerIdentity.name,
        email: playerIdentity.email,
        skill,
        playerType,
        joinedAt: new Date().toISOString(),
      });
      setJoined(true);
    }
  }

  const finalStepReady = step === steps.length - 1 ? Boolean(playerIdentity) : canAdvance[step];

  return (
    <AppRoleGuard allowedRoles={["player"]}>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="font-head text-2xl font-black sm:text-3xl">Join a Host Queue</h1>
        <p className="mb-8 mt-1 text-sm text-mist/50">
          Players can select any host from the list. Private sessions need the correct invite link.
        </p>

        {!host ? (
          <div className="rounded-3xl border border-white/10 bg-panel p-8 text-center">
            <h2 className="font-head text-xl font-black">Choose a host first</h2>
            <p className="mt-3 text-sm text-mist/55">
              Go back to the host directory and pick the session you want to join.
            </p>
            <Link
              href="/live"
              className="mt-6 inline-flex rounded-full bg-volt px-5 py-3 text-sm font-head font-bold text-ink"
            >
              Back to hosts
            </Link>
          </div>
        ) : !hasInviteAccess ? (
          <div className="rounded-3xl border border-white/10 bg-panel p-8 text-center">
            <Lock className="mx-auto h-10 w-10 text-mist/70" />
            <h2 className="mt-4 font-head text-xl font-black">Private host access required</h2>
            <p className="mt-3 text-sm text-mist/55">
              This host only accepts invited players. Open the private invite link to continue.
            </p>
          </div>
        ) : hasTimeConflict && host && existingJoin ? (
          <div className="rounded-3xl border border-amber-400/30 bg-panel p-8">
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5 text-amber-100">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-200/80">Schedule conflict</p>
              <h2 className="mt-2 font-head text-xl font-black">Select another time</h2>
              <p className="mt-3 text-sm text-amber-50/90">
                {host.hostName} overlaps with your current session in {existingJoin.hostName}. Remove your current
                host or pick a different time slot before joining again.
              </p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-mist/40">Current host</p>
                <h3 className="mt-2 font-head text-lg font-black">{existingJoin.hostName}</h3>
                <p className="mt-2 text-sm text-mist/55">{existingJoin.venue}</p>
                <p className="mt-3 flex items-center gap-2 text-sm text-mist/55">
                  <Timer className="h-4 w-4" />
                  {existingJoin.timeLabel}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-mist/40">Requested host</p>
                <h3 className="mt-2 font-head text-lg font-black">{host.hostName}</h3>
                <p className="mt-2 text-sm text-mist/55">{host.venue}</p>
                <p className="mt-3 flex items-center gap-2 text-sm text-mist/55">
                  <Timer className="h-4 w-4" />
                  {host.timeLabel}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/live"
                className="inline-flex items-center gap-2 rounded-full bg-volt px-5 py-3 text-sm font-head font-bold text-ink"
              >
                Back to host list
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={
                  host.visibility === "private" && host.inviteCode
                    ? `/join?host=${host.slug}&invite=${host.inviteCode}`
                    : `/join?host=${host.slug}`
                }
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-3 text-sm font-head font-bold text-mist/75"
              >
                Refresh this session
              </Link>
            </div>
          </div>
        ) : !joined ? (
          <>
            <div className="mb-10 flex items-center">
              {steps.map((label, index) => (
                <div key={label} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold transition-colors ${
                        index < step
                          ? "border-volt bg-volt text-ink"
                          : index === step
                          ? "border-volt text-volt"
                          : "border-white/15 text-mist/30"
                      }`}
                    >
                      {index < step ? <Check className="h-4 w-4" /> : index + 1}
                    </div>
                    <span className={`text-xs ${index <= step ? "text-mist" : "text-mist/30"}`}>{label}</span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`mx-2 mb-5 h-px flex-1 ${index < step ? "bg-volt" : "bg-white/10"}`} />
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-white/10 bg-panel p-6 sm:p-8">
              {step === 0 && (
                <div>
                  <h2 className="font-head text-lg font-bold">Selected host</h2>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-mist/40">{host.visibility} session</p>
                    <h3 className="mt-2 font-head text-xl font-black">{host.hostName}</h3>
                    <p className="mt-2 text-sm text-mist/55">{host.venue}</p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-mist/55">
                      <Timer className="h-4 w-4" />
                      {host.timeLabel}
                    </p>
                    <p className="mt-3 text-sm text-mist/55">
                      Rotation mode: <span className="font-semibold text-mist">{formatRotationModeLabel(host.rotationMode)}</span>
                    </p>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div>
                  <h2 className="font-head text-lg font-bold">What&apos;s your skill level?</h2>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {skillLevels.map((level) => (
                      <button
                        key={level}
                        onClick={() => setSkill(level)}
                        className={`rounded-xl border py-4 text-sm font-semibold transition-all ${
                          skill === level
                            ? "border-volt bg-volt/10 text-volt"
                            : "border-white/10 text-mist/70 hover:border-white/30"
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h2 className="font-head text-lg font-bold">Playing solo or with a group?</h2>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {(["Solo", "Group"] as PlayerType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => setPlayerType(type)}
                        className={`rounded-xl border py-6 transition-all ${
                          playerType === type
                            ? "border-volt bg-volt/10 text-volt"
                            : "border-white/10 text-mist/70 hover:border-white/30"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-2">
                          {type === "Solo" ? <User className="h-6 w-6" /> : <Users className="h-6 w-6" />}
                          <span className="font-semibold text-sm">{type}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <h2 className="font-head text-lg font-bold">Confirm your spot</h2>
                  <ul className="mt-4 space-y-3 text-sm">
                    <li className="flex justify-between border-b border-white/10 pb-3">
                      <span className="text-mist/50">Host</span>
                      <span className="font-semibold">{host.hostName}</span>
                    </li>
                    <li className="flex justify-between border-b border-white/10 pb-3">
                      <span className="text-mist/50">Skill level</span>
                      <span className="font-semibold text-volt">{skill}</span>
                    </li>
                    <li className="flex justify-between border-b border-white/10 pb-3">
                      <span className="text-mist/50">Time</span>
                      <span className="font-semibold">{host.timeLabel}</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-mist/50">Player type</span>
                      <span className="font-semibold">{playerType}</span>
                    </li>
                  </ul>
                </div>
              )}

              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => setStep((current) => Math.max(0, current - 1))}
                  disabled={step === 0}
                  className="text-sm text-mist/50 transition-colors hover:text-mist disabled:opacity-0"
                >
                  Back
                </button>
                <button
                  onClick={next}
                  disabled={!finalStepReady}
                  className="flex items-center gap-2 rounded-lg bg-volt px-6 py-3 text-sm font-head font-bold text-ink transition-colors hover:bg-volt/90 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {step === steps.length - 1 ? "Join Queue" : "Continue"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-3xl border border-volt/40 bg-volt/5 p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-volt/15">
              <Check className="h-7 w-7 text-volt" />
            </div>
            <h2 className="font-head text-xl font-black">You&apos;re in {host.hostName}</h2>
            <p className="mt-2 text-sm text-mist/50">
              You joined as a <span className="font-semibold text-mist">{playerType}</span> player in the{" "}
              <span className="font-semibold text-volt">{skill}</span> band.
            </p>
            <p className="mt-2 text-sm text-mist/50">Session time: {host.timeLabel}</p>
            <Link
              href="/live"
              onClick={() => router.refresh()}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-volt px-5 py-3 text-sm font-head font-bold text-ink"
            >
              Back to host list
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </AppRoleGuard>
  );
}
