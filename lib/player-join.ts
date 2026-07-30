export const PLAYER_JOIN_STORAGE_KEY = "stack-serve-player-join";

export interface PlayerJoinRecord {
  playerId: string;
  playerName: string;
  playerEmail?: string;
  hostSlug: string;
  hostName: string;
  venue: string;
  timeLabel: string;
  startHour: number;
  endHour: number;
  skill: string;
  playerType: string;
  visibility: string;
}

export function readPlayerJoinRecord() {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(PLAYER_JOIN_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PlayerJoinRecord;
  } catch {
    window.localStorage.removeItem(PLAYER_JOIN_STORAGE_KEY);
    return null;
  }
}

export function writePlayerJoinRecord(record: PlayerJoinRecord) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAYER_JOIN_STORAGE_KEY, JSON.stringify(record));
}

export function clearPlayerJoinRecord() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PLAYER_JOIN_STORAGE_KEY);
}
