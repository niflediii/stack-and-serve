import { HostEventDetailClient } from "@/components/manage/host-event-detail-client";

export default async function HostEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  return <HostEventDetailClient eventId={eventId} />;
}
