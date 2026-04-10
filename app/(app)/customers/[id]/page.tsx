import { notFound } from "next/navigation";
import { requireSession, assertTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ContactForm } from "@/components/forms/contact-form";
import { upsertCustomer, deleteCustomer } from "@/actions/customers";

export default async function EditCustomer({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const c = await prisma.customer.findUnique({ where: { id } });
  if (!c) notFound();
  assertTenant(c.tenantId, session.tenantId);
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Edit customer</h1>
      <ContactForm kind="customer" initial={c} upsert={upsertCustomer} remove={deleteCustomer} listPath="/customers" />
    </div>
  );
}
