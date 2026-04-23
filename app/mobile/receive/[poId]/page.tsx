import { notFound } from "next/navigation";
import { getReceiveSheet } from "@/actions/mobile";
import { ReceiveView } from "./receive-view";

export const dynamic = "force-dynamic";

export default async function ReceiveDetailPage({
  params,
}: {
  params: Promise<{ poId: string }>;
}) {
  const { poId } = await params;
  const res = await getReceiveSheet({ id: poId });
  if (!res.ok) return notFound();
  return <ReceiveView sheet={res.data} />;
}
