import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE_NAME, readAdminSessionFromToken } from "@/lib/admin-auth";
import { normalizeHostEventRecord, type HostEventRecord } from "@/lib/host-events";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type HostQueueRow = {
  id: string;
  owner_id: string;
  club_name: string | null;
  event_date: string | null;
  queue_status: string | null;
  visibility: string | null;
  payload: HostEventRecord;
  created_at: string;
};

function mapQueueRow(row: HostQueueRow) {
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

export async function GET() {
  const cookieStore = await cookies();
  const session = readAdminSessionFromToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const [{ data: queueRows, error: queueError }, { data: usersData, error: usersError }] =
      await Promise.all([
        supabase.from("host_queues").select("*").order("created_at", { ascending: false }),
        supabase.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        }),
      ]);

    if (queueError) {
      throw queueError;
    }

    if (usersError) {
      throw usersError;
    }

    const ownersById = new Map(
      (usersData?.users ?? []).map((user) => [
        user.id,
        {
          id: user.id,
          email: user.email ?? "",
          name:
            (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
            (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
            user.email ||
            "Host user",
        },
      ])
    );

    const sessions = (queueRows ?? []).map((row) => {
      const sessionRecord = mapQueueRow(row as HostQueueRow);
      const owner = ownersById.get(sessionRecord.ownerId ?? "");

      return {
        ...sessionRecord,
        ownerName: owner?.name ?? "Host user",
        ownerEmail: owner?.email ?? "",
      };
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "Could not load admin queues.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
