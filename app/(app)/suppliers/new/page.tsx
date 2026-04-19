import { requireSession } from "@/lib/auth";
import { SupplierDetailTabs } from "@/components/suppliers/supplier-detail-tabs";

export default async function NewSupplierPage() {
  await requireSession();

  return (
    <SupplierDetailTabs
      initial={{
        id: "",
        name: "",
        contactName: null,
        email: null,
        phone: null,
        currency: "NZD",
        acctCode: null,
        paymentTerms: null,
        taxRule: "GST15",
        gstVatNumber: null,
        bankName: null,
        bankBranch: null,
        bankAccount: null,
        minimumOrderValue: null,
        deliveryLeadDays: null,
        notes: null,
        postalAddress: null,
        physicalAddress: null,
      }}
      contacts={[]}
      purchases={[]}
      costings={[]}
    />
  );
}
