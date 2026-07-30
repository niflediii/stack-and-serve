import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSessionToken,
  getAdminCookieOptions,
  readAdminSessionFromToken,
  validateAdminCredentials,
} from "@/lib/admin-auth";

export async function GET() {
  const cookieStore = await cookies();
  const session = readAdminSessionFromToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    username: session.username,
    expiresAt: session.expiresAt,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { username?: string; password?: string }
    | null;

  const username = body?.username ?? "";
  const password = body?.password ?? "";

  if (!validateAdminCredentials(username, password)) {
    return NextResponse.json(
      { error: "Invalid admin username or password." },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(
    ADMIN_SESSION_COOKIE_NAME,
    createAdminSessionToken(),
    getAdminCookieOptions()
  );

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, "", {
    ...getAdminCookieOptions(),
    maxAge: 0,
  });
  return response;
}
