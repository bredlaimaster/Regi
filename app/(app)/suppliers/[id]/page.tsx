import { notFound } from "next/navigation";
import { requireSession, assertTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ContactForm } from "@/components/forms/contact-form";
import { upsertSupplier, deleteSupplier } from "@/actions/suppliers";

export default async function EditSupplier({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const s = await prisma.supplier.findUnique({ where: { id } });
  if (!s) notFound();
  assertTenant(s.tenantId, session.tenantId);
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Edit supplier</h1>
      <ContactForm kind="supplier" initial={s} upsert={upsertSupplier} remove={deleteSupplier} listPath="/suppliers" />
    </div>
  );
}
