const ADMIN_SESSION_STORAGE_KEY = "stack-serve-admin-session";

export function readAdminSession() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY) === "true";
}

export function writeAdminSession() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, "true");
}

export function clearAdminSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
}
