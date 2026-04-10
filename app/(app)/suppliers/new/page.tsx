import { ContactForm } from "@/components/forms/contact-form";
import { upsertSupplier, deleteSupplier } from "@/actions/suppliers";

export default function NewSupplierPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">New supplier</h1>
      <ContactForm kind="supplier" upsert={upsertSupplier} remove={deleteSupplier} listPath="/suppliers" />
    </div>
  );
}
