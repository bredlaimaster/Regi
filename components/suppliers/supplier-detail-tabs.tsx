"use client";
import { useState, useTransition } from "react";
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
import { Trash2, Plus, Copy } from "lucide-react";
import { upsertSupplier, deleteSupplier } from "@/actions/suppliers";
import { upsertSupplierContact, deleteSupplierContact } from "@/actions/supplier-contacts";
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

type SupplierContact = {
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

type SupplierInitial = {
  id: string; // empty string when creating a new supplier
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  currency: string;
  acctCode?: string | null;
  paymentTerms?: string | null;
  taxRule: string;
  // Phase C
  gstVatNumber?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  bankAccount?: string | null;
  minimumOrderValue?: number | null;
  deliveryLeadDays?: number | null;
  notes?: string | null;
  postalAddress?: Address | null;
  physicalAddress?: Address | null;
};

type Po = {
  id: string;
  poNumber: string;
  createdAt: string;
  eta?: string | null;
  status: string;
  currency: string;
  totalCostNzd?: number | null;
};

type Costing = {
  productId: string;
  sku: string;
  name: string;
  qtyReceived: number;
  landedUnitNzd: number;
  receivedAt: string;
  poNumber: string;
};

const PRESET_TERMS = ["7 days", "14 days", "20th month", "30 days", "45 days", "60 days", "60 days invoice", "90 days", "End of month following", "COD", "Prepaid"];

const COUNTRIES = [
  "New Zealand", "Australia", "United States", "United Kingdom",
  "China", "Germany", "France", "Japan", "South Korea", "Singapore",
];

// ───── Address fields ─────
function AddressFields({ value, onChange }: { value: Address; onChange: (a: Address) => void }) {
  const upd = (k: keyof Address, v: string) => onChange({ ...value, [k]: v || null });
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Address Name</Label>
        <Input value={value.name ?? ""} onChange={(e) => upd("name", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Address Line 1</Label>
        <Input value={value.line1 ?? ""} onChange={(e) => upd("line1", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Address Line 2</Label>
        <Input value={value.line2 ?? ""} onChange={(e) => upd("line2", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Suburb</Label>
          <Input value={value.suburb ?? ""} onChange={(e) => upd("suburb", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input value={value.city ?? ""} onChange={(e) => upd("city", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>State/Region</Label>
          <Input value={value.state ?? ""} onChange={(e) => upd("state", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Postal Code</Label>
          <Input value={value.postcode ?? ""} onChange={(e) => upd("postcode", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Country</Label>
        <Select value={value.country ?? "New Zealand"} onValueChange={(v) => upd("country", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ───── Contact editor row ─────
function ContactEditor({
  supplierId,
  contact,
  onClose,
  onStageSave,
  onStageDelete,
}: {
  supplierId: string; // empty string = staged (not yet persisted)
  contact: SupplierContact;
  onClose: () => void;
  onStageSave?: (c: SupplierContact) => void;
  onStageDelete?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [c, setC] = useState<SupplierContact>(contact);
  const upd = <K extends keyof SupplierContact>(k: K, v: SupplierContact[K]) => setC((p) => ({ ...p, [k]: v }));
  const isStaging = !supplierId; // no supplier id yet — stage locally

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
          <Label>Purchasing</Label>
          <div className="flex items-center gap-2 h-10">
            <Switch checked={c.isPurchasing ?? false} onCheckedChange={(v) => upd("isPurchasing", v)} />
            <span className="text-sm text-muted-foreground">{c.isPurchasing ? "Yes" : "No"}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            if (isStaging) {
              onStageSave?.(c);
              onClose();
              return;
            }
            start(async () => {
              const res = await upsertSupplierContact({ ...c, supplierId });
              if (!res.ok) { toast.error(res.error); return; }
              toast.success("Contact saved");
              onClose();
              router.refresh();
            });
          }}
        >{pending ? "Saving..." : (c.id ? "Save" : "Add")}</Button>
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        {(c.id || isStaging) && (
          <Button
            type="button"
            variant="destructive"
            className="ml-auto"
            onClick={() => {
              if (!confirm("Delete this contact?")) return;
              if (isStaging) {
                onStageDelete?.();
                onClose();
                return;
              }
              start(async () => {
                const res = await deleteSupplierContact(c.id!);
                if (!res.ok) { toast.error(res.error); return; }
                toast.success("Deleted");
                onClose();
                router.refresh();
              });
            }}
          >Delete</Button>
        )}
      </div>
    </div>
  );
}

// ───── Main tabs component ─────
export function SupplierDetailTabs({
  initial,
  contacts,
  purchases,
  costings,
}: {
  initial: SupplierInitial;
  contacts: SupplierContact[];
  purchases: Po[];
  costings: Costing[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [activeTab, setActiveTab] = useState("details");
  const isNew = !initial.id;

  // Supplier form state
  const [f, setF] = useState<SupplierInitial>(initial);
  const setField = <K extends keyof SupplierInitial>(k: K, v: SupplierInitial[K]) => setF((p) => ({ ...p, [k]: v }));
  const isCustomTerms = f.paymentTerms != null && f.paymentTerms !== "" && !PRESET_TERMS.includes(f.paymentTerms);
  const [showCustomTerms, setShowCustomTerms] = useState(isCustomTerms);

  // Address state
  const [postal, setPostal] = useState<Address>(initial.postalAddress ?? { country: "New Zealand" });
  const [physical, setPhysical] = useState<Address>(initial.physicalAddress ?? { country: "New Zealand" });

  // Contacts edit state
  const [editingContactIdx, setEditingContactIdx] = useState<number | null>(null);
  const [addingContact, setAddingContact] = useState(false);
  // Staged contacts (create mode only — persisted after supplier is created)
  const [pendingContacts, setPendingContacts] = useState<SupplierContact[]>([]);
  const visibleContacts: SupplierContact[] = isNew ? pendingContacts : contacts;

  // PO status filter
  const [poStatusFilter, setPoStatusFilter] = useState<string>("All");
  const filteredPurchases = poStatusFilter === "All"
    ? purchases
    : purchases.filter((p) => p.status === poStatusFilter.toUpperCase());

  const saveAll = () => start(async () => {
    if (!f.name || !f.name.trim()) { toast.error("Supplier name is required"); return; }
    const res = await upsertSupplier({
      ...f,
      id: isNew ? undefined : f.id,
      postalAddress: postal,
      physicalAddress: physical,
    });
    if (!res.ok) { toast.error(res.error); return; }

    if (isNew && res.data?.id) {
      const newId = res.data.id;
      // Persist any staged contacts
      if (pendingContacts.length > 0) {
        for (const c of pendingContacts) {
          const cr = await upsertSupplierContact({ ...c, supplierId: newId });
          if (!cr.ok) {
            toast.error(`Supplier created, but a contact failed: ${cr.error}`);
          }
        }
      }
      toast.success("Supplier created");
      router.push(`/suppliers/${newId}`);
    } else {
      toast.success("Supplier saved");
      router.refresh();
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link href="/suppliers" className="hover:underline">Suppliers</Link>
            {" > "}
            <Link href="/suppliers" className="hover:underline text-primary">
              {isNew ? "New Supplier" : "View Suppliers"}
            </Link>
          </div>
          <h1 className="text-3xl font-semibold mt-1">
            {isNew ? (f.name || "New Supplier") : (initial.name || "Supplier")}
          </h1>
        </div>
        <div className="flex gap-2">
          {!isNew && (
            <Button asChild variant="outline">
              <Link href={`/purchase-orders/new?supplierId=${initial.id}`}>Add Purchase</Link>
            </Button>
          )}
          <Button onClick={saveAll} disabled={pending}>
            {pending ? "Saving..." : (isNew ? "Create Supplier" : "Save")}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="address">Address</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({visibleContacts.length})</TabsTrigger>
          {!isNew && <TabsTrigger value="purchases">Purchases ({purchases.length})</TabsTrigger>}
          {!isNew && <TabsTrigger value="returns">Returns</TabsTrigger>}
          {!isNew && <TabsTrigger value="costings">Costings</TabsTrigger>}
        </TabsList>

        {/* ───── DETAILS ───── */}
        <TabsContent value="details">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-4 max-w-6xl">
            {/* Left column */}
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>*Supplier Code</Label><Input value={f.acctCode ?? ""} onChange={(e) => setField("acctCode", e.target.value || null)} placeholder="e.g. MURRELL, BURTS" /></div>
              <div className="space-y-1.5"><Label>*Supplier Name</Label><Input value={f.name} onChange={(e) => setField("name", e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>GST/VAT Number</Label><Input value={f.gstVatNumber ?? ""} onChange={(e) => setField("gstVatNumber", e.target.value || null)} /></div>
              <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={5} value={f.notes ?? ""} onChange={(e) => setField("notes", e.target.value || null)} /></div>
              <div className="space-y-1.5">
                <Label>Taxable</Label>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={f.taxRule !== "EXEMPT"}
                    onCheckedChange={(v) => setField("taxRule", v ? "GST15" : "EXEMPT")}
                  />
                  <span className="text-sm">{f.taxRule !== "EXEMPT" ? "Yes" : "No (Exempt)"}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Tax Rule</Label>
                <Select value={f.taxRule ?? "GST15"} onValueChange={(v) => setField("taxRule", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GST15">GST 15% — NZ domestic</SelectItem>
                    <SelectItem value="ZERO">Zero rated — Exports / financial</SelectItem>
                    <SelectItem value="IMPORT_GST">Import GST — Overseas, GST at border</SelectItem>
                    <SelectItem value="EXEMPT">Exempt — No GST</SelectItem>
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
                    <SelectItem value="GBP">GBP — Great British Pound</SelectItem>
                    <SelectItem value="USD">USD — US Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Bank Name</Label><Input value={f.bankName ?? ""} onChange={(e) => setField("bankName", e.target.value || null)} /></div>
              <div className="space-y-1.5"><Label>Bank Branch</Label><Input value={f.bankBranch ?? ""} onChange={(e) => setField("bankBranch", e.target.value || null)} /></div>
              <div className="space-y-1.5"><Label>Bank Account</Label><Input value={f.bankAccount ?? ""} onChange={(e) => setField("bankAccount", e.target.value || null)} /></div>
              <div className="space-y-1.5">
                <Label>Payment Term Description</Label>
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
                  {showCustomTerms && (
                    <Input className="w-1/2" value={f.paymentTerms ?? ""} placeholder="Custom terms" onChange={(e) => setField("paymentTerms", e.target.value || null)} />
                  )}
                </div>
              </div>
              <div className="space-y-1.5"><Label>Minimum Order Value</Label><Input type="text" inputMode="decimal" className="text-right" placeholder="0.00" value={f.minimumOrderValue != null ? String(f.minimumOrderValue) : ""} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); setField("minimumOrderValue", v ? parseFloat(v) : null); }} /></div>
              <div className="space-y-1.5"><Label>Delivery Lead Time (days)</Label><Input type="text" inputMode="numeric" className="text-right" placeholder="0" value={f.deliveryLeadDays != null ? String(f.deliveryLeadDays) : ""} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setField("deliveryLeadDays", v ? parseInt(v) : null); }} /></div>
            </div>

            {/* Right column — placeholders */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Primary Email (legacy)</Label>
                <Input type="email" value={f.email ?? ""} onChange={(e) => setField("email", e.target.value || null)} placeholder="Used when no contact is flagged for purchasing" />
              </div>
              <div className="space-y-1.5">
                <Label>Primary Phone (legacy)</Label>
                <Input value={f.phone ?? ""} onChange={(e) => setField("phone", e.target.value || null)} />
              </div>
              <div className="rounded-md border p-3 text-xs text-muted-foreground bg-muted/30">
                Tip: Add per-role contacts in the <b>Contacts</b> tab (purchasing, accounts, sales).
                The purchasing flag lets you pick which contact receives PO emails.
              </div>
            </div>
          </div>

          {/* Delete button (edit mode only) */}
          {!isNew && (
            <div className="mt-8 pt-4 border-t">
              <Button
                type="button"
                variant="destructive"
                onClick={() => start(async () => {
                  if (!confirm(`Delete supplier "${f.name}"? This cannot be undone.`)) return;
                  const res = await deleteSupplier(initial.id);
                  if (!res.ok) { toast.error(res.error); return; }
                  toast.success("Supplier deleted");
                  router.push("/suppliers");
                  router.refresh();
                })}
              >Delete supplier</Button>
            </div>
          )}
          {isNew && (
            <div className="mt-8 pt-4 border-t text-xs text-muted-foreground">
              After creating this supplier you&apos;ll be able to add contacts, view purchase history, returns, and costings.
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
                <Button type="button" variant="ghost" size="sm" onClick={() => setPhysical({ ...postal })}>
                  <Copy className="h-4 w-4 mr-1" /> Copy from postal
                </Button>
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
                Multiple contacts can be assigned to a supplier. Flag one as &quot;Purchasing&quot; to route PO emails to them.
                {isNew && " Contacts you add here will be saved when you click \"Create Supplier\"."}
              </p>
              {!addingContact && editingContactIdx === null && (
                <Button type="button" onClick={() => setAddingContact(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add contact
                </Button>
              )}
            </div>

            {addingContact && (
              <ContactEditor
                supplierId={initial.id}
                contact={{}}
                onClose={() => setAddingContact(false)}
                onStageSave={(c) => setPendingContacts((prev) => [...prev, c])}
              />
            )}

            {editingContactIdx !== null && visibleContacts[editingContactIdx] && (
              <ContactEditor
                supplierId={initial.id}
                contact={visibleContacts[editingContactIdx]}
                onClose={() => setEditingContactIdx(null)}
                onStageSave={(c) => setPendingContacts((prev) => prev.map((pc, i) => i === editingContactIdx ? c : pc))}
                onStageDelete={() => setPendingContacts((prev) => prev.filter((_, i) => i !== editingContactIdx))}
              />
            )}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Purchasing</TableHead>
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
                        <TableCell>
                          <Button type="button" variant="ghost" size="sm">Edit</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ───── PURCHASES ───── */}
        <TabsContent value="purchases">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Label>Order Status</Label>
              <Select value={poStatusFilter} onValueChange={setPoStatusFilter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Ordered">Ordered</SelectItem>
                  <SelectItem value="Received">Received</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order No.</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Delivery Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Total (NZD)</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPurchases.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No data to paginate</TableCell></TableRow>
                  )}
                  {filteredPurchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono">
                        <Link href={`/purchase-orders/${p.id}`} className="text-primary hover:underline">{p.poNumber}</Link>
                      </TableCell>
                      <TableCell>{formatNzDate(new Date(p.createdAt))}</TableCell>
                      <TableCell>{p.eta ? formatNzDate(new Date(p.eta)) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "RECEIVED" ? "success" : p.status === "CANCELLED" ? "destructive" : "secondary"}>
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{p.currency}</TableCell>
                      <TableCell className="text-right">{p.totalCostNzd ? formatNzd(p.totalCostNzd) : "—"}</TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/purchase-orders/${p.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ───── RETURNS ───── */}
        <TabsContent value="returns">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Supplier returns will appear here. Currently returns are recorded as stock adjustments with supplier reference.</p>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Return No.</TableHead>
                    <TableHead>Return Date</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No supplier returns recorded yet</TableCell></TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ───── COSTINGS ───── */}
        <TabsContent value="costings">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Landed cost per receipt — reflects unit price plus pro-rata freight and duty from PO receipts.</p>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>PO</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Landed unit cost (NZD)</TableHead>
                    <TableHead className="text-right">Line value (NZD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costings.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No receipts yet from this supplier</TableCell></TableRow>
                  )}
                  {costings.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell>{formatNzDate(new Date(c.receivedAt))}</TableCell>
                      <TableCell className="font-mono text-sm">{c.poNumber}</TableCell>
                      <TableCell className="font-mono">{c.sku}</TableCell>
                      <TableCell>{c.name}</TableCell>
                      <TableCell className="text-right">{c.qtyReceived}</TableCell>
                      <TableCell className="text-right">{formatNzd(c.landedUnitNzd)}</TableCell>
                      <TableCell className="text-right">{formatNzd(c.landedUnitNzd * c.qtyReceived)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
