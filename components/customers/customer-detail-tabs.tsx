"use client";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Copy, Trash2 } from "lucide-react";
import { upsertCustomer, deleteCustomer } from "@/actions/customers";
import { upsertCustomerContact, deleteCustomerContact } from "@/actions/customer-contacts";
import { formatNzd, formatNzDate } from "@/lib/utils";

// ───── Types ─────
type Address = {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  suburb?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
};

type DeliveryAddress = {
  label?: string | null;
  line1?: string | null;
  line2?: string | null;
  suburb?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
  instructions?: string | null;
  obsolete?: boolean;
};

type CustomerContact = {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  website?: string | null;
  tollFreeNo?: string | null;
  phone?: string | null;
  fax?: string | null;
  mobilePhone?: string | null;
  officePhone?: string | null;
  ddi?: string | null;
  comments?: string | null;
  isPurchasing?: boolean;
};

type CustomerInitial = {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  channelId?: string | null;
  territoryId?: string | null;
  salesRepId?: string | null;
  creditLimit?: number | null;
  paymentTerms?: string | null;
  priceGroupId?: string | null;
  acctCode?: string | null;
  currency?: string;
  taxNumber?: string | null;
  taxRule?: string;
  notes?: string | null;
  postalAddress?: Address | null;
  physicalAddress?: Address | null;
  shipTos?: DeliveryAddress[] | null;
};

type Quote = {
  id: string;
  pfNumber: string;
  issuedAt: string;
  expiresAt?: string | null;
  status: string;
  currency: string;
  totalNzd?: number | null;
  soId: string;
};

type Order = {
  id: string;
  soNumber: string;
  orderDate: string;
  requiredDate?: string | null;
  customerRef?: string | null;
  warehouse?: string | null;
  status: string;
  currency: string;
  totalNzd?: number | null;
};

type Credit = {
  id: string;
  cnNumber: string;
  issuedAt: string;
  status: string;
  currency: string;
  amountNzd: number;
};

type Channel = { id: string; name: string };
type Territory = { id: string; name: string };
type SalesRep = { id: string; name: string | null; email: string };
type PriceGroup = { id: string; name: string };

const PRESET_TERMS = ["7 days", "14 days", "20th month", "30 days", "45 days", "60 days", "60 days invoice", "90 days", "End of month following", "COD", "Prepaid"];
const COUNTRIES = ["New Zealand", "Australia", "United States", "United Kingdom", "China", "Germany", "France", "Japan", "South Korea", "Singapore"];

// ───── Address fields ─────
function AddressFields({ value, onChange }: { value: Address; onChange: (a: Address) => void }) {
  const upd = (k: keyof Address, v: string) => onChange({ ...value, [k]: v || null });
  return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>Address Name</Label><Input value={value.name ?? ""} onChange={(e) => upd("name", e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Address Line 1</Label><Input value={value.line1 ?? ""} onChange={(e) => upd("line1", e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Address Line 2</Label><Input value={value.line2 ?? ""} onChange={(e) => upd("line2", e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Suburb</Label><Input value={value.suburb ?? ""} onChange={(e) => upd("suburb", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>City</Label><Input value={value.city ?? ""} onChange={(e) => upd("city", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>State/Region</Label><Input value={value.state ?? ""} onChange={(e) => upd("state", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Postal Code</Label><Input value={value.postcode ?? ""} onChange={(e) => upd("postcode", e.target.value)} /></div>
      </div>
      <div className="space-y-1.5">
        <Label>Country</Label>
        <Select value={value.country ?? "New Zealand"} onValueChange={(v) => upd("country", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ───── Contact editor ─────
function ContactEditor({
  customerId,
  contact,
  onClose,
  onStageSave,
  onStageDelete,
}: {
  customerId: string;
  contact: CustomerContact;
  onClose: () => void;
  onStageSave?: (c: CustomerContact) => void;
  onStageDelete?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [c, setC] = useState<CustomerContact>(contact);
  const upd = <K extends keyof CustomerContact>(k: K, v: CustomerContact[K]) => setC((p) => ({ ...p, [k]: v }));
  const isStaging = !customerId;

  return (
    <div className="rounded-md border p-4 bg-muted/30 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="space-y-1.5"><Label>First Name</Label><Input value={c.firstName ?? ""} onChange={(e) => upd("firstName", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Last Name</Label><Input value={c.lastName ?? ""} onChange={(e) => upd("lastName", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={c.email ?? ""} onChange={(e) => upd("email", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Website</Label><Input value={c.website ?? ""} onChange={(e) => upd("website", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Toll Free No.</Label><Input value={c.tollFreeNo ?? ""} onChange={(e) => upd("tollFreeNo", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="space-y-1.5"><Label>Phone</Label><Input value={c.phone ?? ""} onChange={(e) => upd("phone", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Fax</Label><Input value={c.fax ?? ""} onChange={(e) => upd("fax", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Mobile Phone</Label><Input value={c.mobilePhone ?? ""} onChange={(e) => upd("mobilePhone", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Office Phone</Label><Input value={c.officePhone ?? ""} onChange={(e) => upd("officePhone", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>DDI</Label><Input value={c.ddi ?? ""} onChange={(e) => upd("ddi", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="space-y-1.5 md:col-span-2"><Label>Comments</Label><Textarea rows={2} value={c.comments ?? ""} onChange={(e) => upd("comments", e.target.value)} /></div>
        <div className="space-y-1.5 flex flex-col justify-end pb-2">
          <Label>Primary billing contact</Label>
          <div className="flex items-center gap-2 h-10">
            <Switch checked={c.isPurchasing ?? false} onCheckedChange={(v) => upd("isPurchasing", v)} />
            <span className="text-sm text-muted-foreground">{c.isPurchasing ? "Yes" : "No"}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={pending} onClick={() => {
          if (isStaging) { onStageSave?.(c); onClose(); return; }
          start(async () => {
            const res = await upsertCustomerContact({ ...c, customerId });
            if (!res.ok) { toast.error(res.error); return; }
            toast.success("Contact saved");
            onClose();
            router.refresh();
          });
        }}>{pending ? "Saving..." : (c.id ? "Save" : "Add")}</Button>
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        {(c.id || isStaging) && (
          <Button type="button" variant="destructive" className="ml-auto" onClick={() => {
            if (!confirm("Delete this contact?")) return;
            if (isStaging) { onStageDelete?.(); onClose(); return; }
            start(async () => {
              const res = await deleteCustomerContact(c.id!);
              if (!res.ok) { toast.error(res.error); return; }
              toast.success("Deleted");
              onClose();
              router.refresh();
            });
          }}>Delete</Button>
        )}
      </div>
    </div>
  );
}

// ───── Main tabs component ─────
export function CustomerDetailTabs({
  initial,
  contacts,
  quotes,
  orders,
  credits,
  channels,
  territories,
  salesReps,
  priceGroups,
}: {
  initial: CustomerInitial;
  contacts: CustomerContact[];
  quotes: Quote[];
  orders: Order[];
  credits: Credit[];
  channels: Channel[];
  territories: Territory[];
  salesReps: SalesRep[];
  priceGroups: PriceGroup[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [activeTab, setActiveTab] = useState("details");
  const isNew = !initial.id;

  // Customer form state
  const [f, setF] = useState<CustomerInitial>(initial);
  const setField = <K extends keyof CustomerInitial>(k: K, v: CustomerInitial[K]) => setF((p) => ({ ...p, [k]: v }));
  const isCustomTerms = f.paymentTerms != null && f.paymentTerms !== "" && !PRESET_TERMS.includes(f.paymentTerms);
  const [showCustomTerms, setShowCustomTerms] = useState(isCustomTerms);

  // Address state
  const [postal, setPostal] = useState<Address>(initial.postalAddress ?? { country: "New Zealand" });
  const [physical, setPhysical] = useState<Address>(initial.physicalAddress ?? { country: "New Zealand" });

  // Delivery addresses
  const [deliveryAddrs, setDeliveryAddrs] = useState<DeliveryAddress[]>(initial.shipTos ?? []);
  const [showObsolete, setShowObsolete] = useState(false);
  const [newDelivery, setNewDelivery] = useState<DeliveryAddress>({ country: "New Zealand" });

  // Contacts
  const [editingContactIdx, setEditingContactIdx] = useState<number | null>(null);
  const [addingContact, setAddingContact] = useState(false);
  const [pendingContacts, setPendingContacts] = useState<CustomerContact[]>([]);
  const visibleContacts: CustomerContact[] = isNew ? pendingContacts : contacts;

  // Filters
  const [quoteStatusFilter, setQuoteStatusFilter] = useState<string>("Open");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("Open");
  const [creditStatusFilter, setCreditStatusFilter] = useState<string>("Parked");

  const filteredQuotes = useMemo(() => {
    if (quoteStatusFilter === "All") return quotes;
    return quotes.filter((q) => q.status.toUpperCase() === quoteStatusFilter.toUpperCase());
  }, [quotes, quoteStatusFilter]);
  const filteredOrders = useMemo(() => {
    if (orderStatusFilter === "All") return orders;
    if (orderStatusFilter === "Open") return orders.filter((o) => ["DRAFT", "CONFIRMED", "PICKED"].includes(o.status));
    return orders.filter((o) => o.status.toUpperCase() === orderStatusFilter.toUpperCase());
  }, [orders, orderStatusFilter]);
  const filteredCredits = useMemo(() => {
    if (creditStatusFilter === "All") return credits;
    return credits.filter((c) => c.status.toUpperCase() === creditStatusFilter.toUpperCase());
  }, [credits, creditStatusFilter]);

  const saveAll = () => start(async () => {
    if (!f.name || !f.name.trim()) { toast.error("Customer name is required"); return; }

    const res = await upsertCustomer({
      ...f,
      id: isNew ? undefined : f.id,
      postalAddress: postal,
      physicalAddress: physical,
      shipTos: deliveryAddrs,
    });
    if (!res.ok) { toast.error(res.error); return; }

    const resultId = res.data?.id ?? f.id;

    // Persist staged contacts for new customers
    if (isNew && resultId && pendingContacts.length > 0) {
      for (const c of pendingContacts) {
        const cr = await upsertCustomerContact({ ...c, customerId: resultId });
        if (!cr.ok) toast.error(`Contact failed: ${cr.error}`);
      }
    }

    if (isNew && resultId) {
      toast.success("Customer created");
      router.push(`/customers/${resultId}`);
    } else {
      toast.success("Customer saved");
      router.refresh();
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link href="/customers" className="hover:underline">Customers</Link>
            {" > "}
            <Link href="/customers" className="hover:underline text-primary">{isNew ? "Add Customer" : "View Customers"}</Link>
          </div>
          <h1 className="text-3xl font-semibold mt-1">{isNew ? (f.name || "Add Customer") : (initial.name || "Customer")}</h1>
        </div>
        <div className="flex gap-2">
          {!isNew && (
            <Button asChild variant="outline">
              <Link href={`/sales-orders/new?customerId=${initial.id}`}>Add Order</Link>
            </Button>
          )}
          <Button onClick={saveAll} disabled={pending}>{pending ? "Saving..." : (isNew ? "Create Customer" : "Save")}</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="address">Address</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({visibleContacts.length})</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          {!isNew && <TabsTrigger value="quotes">Quotes ({quotes.length})</TabsTrigger>}
          {!isNew && <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>}
          {!isNew && <TabsTrigger value="credits">Credits ({credits.length})</TabsTrigger>}
        </TabsList>

        {/* ───── DETAILS ───── */}
        <TabsContent value="details">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-4 max-w-6xl">
            {/* Left column */}
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>*Customer Code</Label><Input value={f.acctCode ?? ""} onChange={(e) => setField("acctCode", e.target.value || null)} placeholder="e.g. JOHN01" /></div>
              <div className="space-y-1.5"><Label>*Customer Name</Label><Input value={f.name} onChange={(e) => setField("name", e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Legacy Contact Name</Label><Input value={f.contactName ?? ""} onChange={(e) => setField("contactName", e.target.value || null)} /></div>
              <div className="space-y-1.5"><Label>GST/VAT Number</Label><Input value={f.taxNumber ?? ""} onChange={(e) => setField("taxNumber", e.target.value || null)} /></div>
              <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={4} value={f.notes ?? ""} onChange={(e) => setField("notes", e.target.value || null)} /></div>
              <div className="space-y-1.5">
                <Label>Tax Rule</Label>
                <Select value={f.taxRule ?? "GST15"} onValueChange={(v) => setField("taxRule", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GST15">GST 15% — NZ domestic</SelectItem>
                    <SelectItem value="ZERO">Zero rated — Exports / overseas customers</SelectItem>
                    <SelectItem value="EXEMPT">Exempt / Out of scope</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Middle column */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={f.currency ?? "NZD"} onValueChange={(v) => setField("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NZD">NZD — New Zealand Dollar</SelectItem>
                    <SelectItem value="AUD">AUD — Australian Dollar</SelectItem>
                    <SelectItem value="EUR">EUR — Euro</SelectItem>
                    <SelectItem value="GBP">GBP — British Pound</SelectItem>
                    <SelectItem value="USD">USD — US Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Price Group</Label>
                <Select value={f.priceGroupId ?? "__none__"} onValueChange={(v) => setField("priceGroupId", v === "__none__" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {priceGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Prices for this group are set on each product, under the Pricing tab.
                </p>
              </div>
              <div className="space-y-1.5"><Label>Credit Limit (NZD)</Label><Input type="text" inputMode="decimal" className="text-right" placeholder="0.00" value={f.creditLimit != null ? String(f.creditLimit) : ""} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); setField("creditLimit", v ? parseFloat(v) : null); }} /></div>
              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <div className="flex gap-2">
                  <Select
                    value={showCustomTerms ? "__custom__" : (f.paymentTerms ?? "__none__")}
                    onValueChange={(v) => {
                      if (v === "__custom__") { setShowCustomTerms(true); setField("paymentTerms", ""); }
                      else if (v === "__none__") { setShowCustomTerms(false); setField("paymentTerms", null); }
                      else { setShowCustomTerms(false); setField("paymentTerms", v); }
                    }}
                  >
                    <SelectTrigger className={showCustomTerms ? "w-1/2" : "w-full"}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {PRESET_TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      <SelectItem value="__custom__">Custom...</SelectItem>
                    </SelectContent>
                  </Select>
                  {showCustomTerms && <Input className="w-1/2" placeholder="Custom terms" value={f.paymentTerms ?? ""} onChange={(e) => setField("paymentTerms", e.target.value || null)} />}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Sales Channel</Label>
                <Select value={f.channelId ?? "__none__"} onValueChange={(v) => setField("channelId", v === "__none__" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Territory</Label>
                <Select value={f.territoryId ?? "__none__"} onValueChange={(v) => setField("territoryId", v === "__none__" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {territories.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sales Rep</Label>
                <Select value={f.salesRepId ?? "__none__"} onValueChange={(v) => setField("salesRepId", v === "__none__" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {salesReps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name ?? r.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Primary Email (legacy)</Label><Input type="email" value={f.email ?? ""} onChange={(e) => setField("email", e.target.value || null)} /></div>
              <div className="space-y-1.5"><Label>Primary Phone (legacy)</Label><Input value={f.phone ?? ""} onChange={(e) => setField("phone", e.target.value || null)} /></div>
              <div className="rounded-md border p-3 text-xs text-muted-foreground bg-muted/30">
                Tip: Add per-role contacts in the <b>Contacts</b> tab. The primary billing contact receives invoices and statements.
              </div>
            </div>
          </div>

          {!isNew && (
            <div className="mt-8 pt-4 border-t">
              <Button type="button" variant="destructive" onClick={() => start(async () => {
                if (!confirm(`Delete customer "${f.name}"? This cannot be undone.`)) return;
                const res = await deleteCustomer(initial.id);
                if (!res.ok) { toast.error(res.error); return; }
                toast.success("Customer deleted");
                router.push("/customers");
                router.refresh();
              })}>Delete customer</Button>
            </div>
          )}
        </TabsContent>

        {/* ───── ADDRESS ───── */}
        <TabsContent value="address">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-5xl">
            <div>
              <h2 className="text-xl font-semibold mb-4">Postal Address</h2>
              <AddressFields value={postal} onChange={setPostal} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Physical Address</h2>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPhysical({ ...postal })}><Copy className="h-4 w-4 mr-1" /> Copy from postal</Button>
              </div>
              <AddressFields value={physical} onChange={setPhysical} />
            </div>
          </div>
        </TabsContent>

        {/* ───── CONTACTS ───── */}
        <TabsContent value="contacts">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Multiple contacts can be assigned. Flag one as the primary billing contact.
                {isNew && " Contacts you add here will be saved when you click \"Create Customer\"."}
              </p>
              {!addingContact && editingContactIdx === null && (
                <Button type="button" onClick={() => setAddingContact(true)}><Plus className="h-4 w-4 mr-1" /> Add contact</Button>
              )}
            </div>
            {addingContact && (
              <ContactEditor customerId={initial.id} contact={{}} onClose={() => setAddingContact(false)}
                onStageSave={(c) => setPendingContacts((prev) => [...prev, c])} />
            )}
            {editingContactIdx !== null && visibleContacts[editingContactIdx] && (
              <ContactEditor customerId={initial.id} contact={visibleContacts[editingContactIdx]} onClose={() => setEditingContactIdx(null)}
                onStageSave={(c) => setPendingContacts((prev) => prev.map((pc, i) => i === editingContactIdx ? c : pc))}
                onStageDelete={() => setPendingContacts((prev) => prev.filter((_, i) => i !== editingContactIdx))} />
            )}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Billing</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleContacts.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No contacts yet — click &quot;Add contact&quot; above.</TableCell></TableRow>
                  )}
                  {visibleContacts.map((c, i) => {
                    const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || "(unnamed)";
                    return (
                      <TableRow key={c.id ?? `staged-${i}`} className="hover:bg-muted/50 cursor-pointer" onClick={() => setEditingContactIdx(i)}>
                        <TableCell className="font-medium">
                          {name}
                          {isNew && <Badge variant="secondary" className="ml-2">pending</Badge>}
                        </TableCell>
                        <TableCell>{c.email ?? "—"}</TableCell>
                        <TableCell>{c.phone ?? "—"}</TableCell>
                        <TableCell>{c.mobilePhone ?? "—"}</TableCell>
                        <TableCell>{c.isPurchasing ? <Badge>Yes</Badge> : <span className="text-muted-foreground text-sm">—</span>}</TableCell>
                        <TableCell><Button type="button" variant="ghost" size="sm">Edit</Button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ───── DELIVERY ───── */}
        <TabsContent value="delivery">
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Multiple delivery addresses can be stored and selected when creating orders.
              {isNew && " Addresses will be saved when you click \"Create Customer\"."}
            </p>

            <div className="rounded-md border p-4 bg-muted/30 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="space-y-1.5"><Label>Address Name</Label><Input value={newDelivery.label ?? ""} onChange={(e) => setNewDelivery({ ...newDelivery, label: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Address Line 1</Label><Input value={newDelivery.line1 ?? ""} onChange={(e) => setNewDelivery({ ...newDelivery, line1: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Address Line 2</Label><Input value={newDelivery.line2 ?? ""} onChange={(e) => setNewDelivery({ ...newDelivery, line2: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Suburb</Label><Input value={newDelivery.suburb ?? ""} onChange={(e) => setNewDelivery({ ...newDelivery, suburb: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Town/City</Label><Input value={newDelivery.city ?? ""} onChange={(e) => setNewDelivery({ ...newDelivery, city: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>State/Region</Label><Input value={newDelivery.state ?? ""} onChange={(e) => setNewDelivery({ ...newDelivery, state: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                <div className="space-y-1.5"><Label>Postal Code</Label><Input value={newDelivery.postcode ?? ""} onChange={(e) => setNewDelivery({ ...newDelivery, postcode: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label>Country</Label>
                  <Select value={newDelivery.country ?? "New Zealand"} onValueChange={(v) => setNewDelivery({ ...newDelivery, country: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-3"><Label>Delivery Instruction</Label><Input value={newDelivery.instructions ?? ""} onChange={(e) => setNewDelivery({ ...newDelivery, instructions: e.target.value })} /></div>
                <Button type="button" disabled={!newDelivery.line1} onClick={() => {
                  setDeliveryAddrs((prev) => [...prev, newDelivery]);
                  setNewDelivery({ country: "New Zealand" });
                }}><Plus className="h-4 w-4 mr-1" /> Add</Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={showObsolete} onCheckedChange={setShowObsolete} />
              <Label className="cursor-pointer" onClick={() => setShowObsolete(!showObsolete)}>Show Obsolete</Label>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Postcode</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Instructions</TableHead>
                    <TableHead></TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryAddrs.filter((a) => showObsolete || !a.obsolete).length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No delivery addresses yet.</TableCell></TableRow>
                  )}
                  {deliveryAddrs.map((a, i) => (showObsolete || !a.obsolete) && (
                    <TableRow key={i} className={a.obsolete ? "opacity-50" : ""}>
                      <TableCell className="font-medium">{a.label ?? "—"}</TableCell>
                      <TableCell>{[a.line1, a.line2].filter(Boolean).join(", ") || "—"}</TableCell>
                      <TableCell>{a.city ?? "—"}</TableCell>
                      <TableCell>{a.postcode ?? "—"}</TableCell>
                      <TableCell>{a.country ?? "—"}</TableCell>
                      <TableCell className="text-xs">{a.instructions ?? "—"}</TableCell>
                      <TableCell>
                        <Button type="button" variant="ghost" size="sm" onClick={() => {
                          setDeliveryAddrs((prev) => prev.map((x, idx) => idx === i ? { ...x, obsolete: !x.obsolete } : x));
                        }}>{a.obsolete ? "Restore" : "Mark obsolete"}</Button>
                      </TableCell>
                      <TableCell>
                        <Button type="button" variant="ghost" size="sm" onClick={() => {
                          if (confirm("Remove this delivery address?")) {
                            setDeliveryAddrs((prev) => prev.filter((_, idx) => idx !== i));
                          }
                        }}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ───── QUOTES ───── */}
        {!isNew && (
          <TabsContent value="quotes">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Label>Quote Status</Label>
                <Select value={quoteStatusFilter} onValueChange={setQuoteStatusFilter}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Confirmed">Confirmed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quote No.</TableHead>
                      <TableHead>Quote Date</TableHead>
                      <TableHead>Quote Expiry Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right">Total (NZD)</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuotes.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No data to display</TableCell></TableRow>
                    )}
                    {filteredQuotes.map((q) => (
                      <TableRow key={q.id}>
                        <TableCell className="font-mono">
                          <Link href={`/proforma/${q.id}`} className="text-primary hover:underline">{q.pfNumber}</Link>
                        </TableCell>
                        <TableCell>{formatNzDate(new Date(q.issuedAt))}</TableCell>
                        <TableCell>{q.expiresAt ? formatNzDate(new Date(q.expiresAt)) : "—"}</TableCell>
                        <TableCell><Badge variant="secondary">{q.status}</Badge></TableCell>
                        <TableCell>{q.currency}</TableCell>
                        <TableCell className="text-right">{q.totalNzd ? formatNzd(q.totalNzd) : "—"}</TableCell>
                        <TableCell>
                          <Button asChild variant="ghost" size="sm"><Link href={`/proforma/${q.id}`}>View</Link></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
        )}

        {/* ───── ORDERS ───── */}
        {!isNew && (
          <TabsContent value="orders">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Label>Order Status</Label>
                <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                    <SelectItem value="PICKED">Picked</SelectItem>
                    <SelectItem value="SHIPPED">Shipped</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order No.</TableHead>
                      <TableHead>Order Date</TableHead>
                      <TableHead>Required Date</TableHead>
                      <TableHead>Customer Ref</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right">Total (NZD)</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No data to display</TableCell></TableRow>
                    )}
                    {filteredOrders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono"><Link href={`/sales-orders/${o.id}`} className="text-primary hover:underline">{o.soNumber}</Link></TableCell>
                        <TableCell>{formatNzDate(new Date(o.orderDate))}</TableCell>
                        <TableCell>{o.requiredDate ? formatNzDate(new Date(o.requiredDate)) : "—"}</TableCell>
                        <TableCell>{o.customerRef ?? "—"}</TableCell>
                        <TableCell>{o.warehouse ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={o.status === "SHIPPED" ? "success" : o.status === "CANCELLED" ? "destructive" : "secondary"}>{o.status}</Badge>
                        </TableCell>
                        <TableCell>{o.currency}</TableCell>
                        <TableCell className="text-right">{o.totalNzd ? formatNzd(o.totalNzd) : "—"}</TableCell>
                        <TableCell><Button asChild variant="ghost" size="sm"><Link href={`/sales-orders/${o.id}`}>View</Link></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
        )}

        {/* ───── CREDITS ───── */}
        {!isNew && (
          <TabsContent value="credits">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Label>Credit Status</Label>
                <Select value={creditStatusFilter} onValueChange={setCreditStatusFilter}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="Parked">Parked</SelectItem>
                    <SelectItem value="Issued">Issued</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Credit Note No.</TableHead>
                      <TableHead>Credit Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right">Total (NZD)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCredits.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No data to display</TableCell></TableRow>
                    )}
                    {filteredCredits.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono">{c.cnNumber}</TableCell>
                        <TableCell>{formatNzDate(new Date(c.issuedAt))}</TableCell>
                        <TableCell><Badge variant="secondary">{c.status}</Badge></TableCell>
                        <TableCell>{c.currency}</TableCell>
                        <TableCell className="text-right">{formatNzd(c.amountNzd)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
        )}

      </Tabs>
    </div>
  );
}
