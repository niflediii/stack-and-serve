import { JoinQueueClient } from "@/components/join/join-queue-client";

export default async function JoinQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const host = typeof params.host === "string" ? params.host : "";
  const invite = typeof params.invite === "string" ? params.invite : "";

  return <JoinQueueClient hostSlug={host} inviteCode={invite} />;
}
