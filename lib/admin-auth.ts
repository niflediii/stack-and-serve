import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE_NAME = "stack_serve_admin_session";

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "#1Admin@2026";
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12;

function getAdminUsername() {
  return process.env.ADMIN_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME;
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
}

function getAdminSessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    `${getAdminUsername()}::${getAdminPassword()}::stack-serve-admin-session`
  );
}

function signValue(value: string) {
  return createHmac("sha256", getAdminSessionSecret()).update(value).digest("base64url");
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function validateAdminCredentials(username: string, password: string) {
  return safeCompare(username.trim(), getAdminUsername()) && safeCompare(password, getAdminPassword());
}

export function createAdminSessionToken() {
  const payload = Buffer.from(
    JSON.stringify({
      sub: "admin",
      username: getAdminUsername(),
      exp: Date.now() + ADMIN_SESSION_TTL_MS,
    })
  ).toString("base64url");

  const signature = signValue(payload);
  return `${payload}.${signature}`;
}

export function readAdminSessionFromToken(token?: string | null) {
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = signValue(payload);
  if (!safeCompare(signature, expectedSignature)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: string;
      username?: string;
      exp?: number;
    };

    if (parsed.sub !== "admin") return null;
    if (typeof parsed.exp !== "number" || parsed.exp <= Date.now()) return null;

    return {
      username: typeof parsed.username === "string" && parsed.username.trim()
        ? parsed.username.trim()
        : getAdminUsername(),
      expiresAt: parsed.exp,
    };
  } catch {
    return null;
  }
}

export function getAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_MS / 1000,
  };
}
