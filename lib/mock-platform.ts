export type AppRole = "player" | "host" | "admin";
export type SessionVisibility = "public" | "private";
export type RotationMode = "skill" | "random";
export type CourtStatus = "open" | "occupied" | "maintenance";

export interface HostSession {
  slug: string;
  hostName: string;
  venue: string;
  timeLabel: string;
  startHour: number;
  endHour: number;
  visibility: SessionVisibility;
  rotationMode: RotationMode;
  inviteCode?: string;
  playersOnline: number;
  waitingPlayers: number;
  skillFocus: string;
  courts: Array<{
    id: number;
    status: CourtStatus;
    currentPlayers?: string[];
  }>;
}

export const hostSessions: HostSession[] = [
  {
    slug: "ace-point-club",
    hostName: "Ace Point Club",
    venue: "BGC Rooftop Courts",
    timeLabel: "6:00 PM - 8:00 PM",
    startHour: 18,
    endHour: 20,
    visibility: "public",
    rotationMode: "skill",
    playersOnline: 26,
    waitingPlayers: 8,
    skillFocus: "3.5 to 4.5+",
    courts: [
      { id: 1, status: "occupied", currentPlayers: ["J. Reyes", "M. Tan", "R. Lim", "P. Sy"] },
      { id: 2, status: "occupied", currentPlayers: ["A. Cruz", "K. Dela Cruz", "T. Go", "L. Tan"] },
      { id: 3, status: "open" },
      { id: 4, status: "maintenance" },
    ],
  },
  {
    slug: "night-rally-private",
    hostName: "Night Rally Private",
    venue: "Makati Indoor Court",
    timeLabel: "6:30 PM - 8:30 PM",
    startHour: 18.5,
    endHour: 20.5,
    visibility: "private",
    rotationMode: "random",
    inviteCode: "NR-2481",
    playersOnline: 14,
    waitingPlayers: 4,
    skillFocus: "Invite-only mixed play",
    courts: [
      { id: 1, status: "occupied", currentPlayers: ["C. Fernandez", "M. Ong", "R. Yap", "D. Co"] },
      { id: 2, status: "open" },
      { id: 3, status: "occupied", currentPlayers: ["N. David", "S. Lim", "E. Yu", "J. Lao"] },
    ],
  },
  {
    slug: "baseline-social",
    hostName: "Baseline Social",
    venue: "Ortigas Weekend Hub",
    timeLabel: "9:00 PM - 11:00 PM",
    startHour: 21,
    endHour: 23,
    visibility: "public",
    rotationMode: "random",
    playersOnline: 19,
    waitingPlayers: 6,
    skillFocus: "Intro to 4.0",
    courts: [
      { id: 1, status: "occupied", currentPlayers: ["A. Tan", "G. Perez", "M. Cruz", "V. Chan"] },
      { id: 2, status: "open" },
      { id: 3, status: "open" },
    ],
  },
];

export const adminHighlights = {
  totalHosts: hostSessions.length,
  totalPlayers: hostSessions.reduce((sum, host) => sum + host.playersOnline, 0),
  activeCourts: hostSessions.reduce(
    (sum, host) => sum + host.courts.filter((court) => court.status === "occupied").length,
    0
  ),
  publicSessions: hostSessions.filter((host) => host.visibility === "public").length,
};

export const hostDirectory = hostSessions.map((host) => ({
  slug: host.slug,
  hostName: host.hostName,
  venue: host.venue,
  timeLabel: host.timeLabel,
  startHour: host.startHour,
  endHour: host.endHour,
  visibility: host.visibility,
  rotationMode: host.rotationMode,
  waitingPlayers: host.waitingPlayers,
  skillFocus: host.skillFocus,
  inviteCode: host.inviteCode,
  openCourts: host.courts.filter((court) => court.status === "open").length,
  activeCourts: host.courts.filter((court) => court.status === "occupied").length,
}));

export function sessionsConflict(
  a: { startHour: number; endHour: number },
  b: { startHour: number; endHour: number }
) {
  return a.startHour < b.endHour && b.startHour < a.endHour;
}
