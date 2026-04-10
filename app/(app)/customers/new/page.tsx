import { ContactForm } from "@/components/forms/contact-form";
import { upsertCustomer, deleteCustomer } from "@/actions/customers";

export default function NewCustomerPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">New customer</h1>
      <ContactForm kind="customer" upsert={upsertCustomer} remove={deleteCustomer} listPath="/customers" />
    </div>
  );
}
