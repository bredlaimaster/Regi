import { notFound } from "next/navigation";
import { getPickSheet } from "@/actions/mobile";
import { PickView } from "./pick-view";

export const dynamic = "force-dynamic";

export default async function PickDetailPage({
  params,
}: {
  params: Promise<{ soId: string }>;
}) {
  const { soId } = await params;
  const res = await getPickSheet({ id: soId });
  if (!res.ok) return notFound();
  return <PickView sheet={res.data} />;
}
