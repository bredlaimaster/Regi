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
import { Trash2, Plus } from "lucide-react";
import { upsertProduct, uploadProductImage, deleteProduct, saveProductPrices } from "@/actions/products";

// ───── Types ─────
type ProductInitial = {
  id: string; // empty when creating
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  sellPriceNzd: number;
  reorderPoint: number;
  imageUrl: string | null;
  notes: string | null;
  supplierId: string | null;
  brandId: string | null;
  costNzd: number | null;
  caseQty: number;
  isTester: boolean;
  active: boolean;
  supplierCode: string | null;
  binLocation: string | null;
  unitBarcode: string | null;
  caseBarcode: string | null;
};

type GroupPriceRow = {
  priceGroupId: string;
  unitPrice: string;
  minQty: string;
};

type Supplier = { id: string; name: string };
type Brand = { id: string; name: string };
type PriceGroup = { id: string; name: string };

// ───── helpers ─────
function fmtCurrency(val: unknown, decimals = 2): string {
  if (val === null || val === undefined || val === "") return "";
  const n = Number(val);
  return isNaN(n) ? "" : n.toFixed(decimals);
}
function toNum(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  return Number(val) || 0;
}

// ───── Main tabs component ─────
export function ProductDetailTabs({
  initial,
  suppliers,
  brands,
  priceGroups,
  existingPrices,
}: {
  initial?: ProductInitial;
  suppliers: Supplier[];
  brands: Brand[];
  priceGroups: PriceGroup[];
  existingPrices?: { priceGroupId: string; unitPrice: number; minQty: number }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [activeTab, setActiveTab] = useState("details");
  const isNew = !initial;

  const [f, setF] = useState<Partial<ProductInitial>>(
    initial ?? {
      unit: "EA",
      caseQty: 1,
      isTester: false,
      active: true,
    }
  );
  const setField = <K extends keyof ProductInitial>(k: K, v: ProductInitial[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  // String state for numeric inputs so fields can be empty
  const [sellPriceStr, setSellPriceStr] = useState(initial ? fmtCurrency(initial.sellPriceNzd) : "");
  const [costStr, setCostStr] = useState(initial?.costNzd != null ? fmtCurrency(initial.costNzd, 4) : "");
  const [reorderStr, setReorderStr] = useState(initial ? String(toNum(initial.reorderPoint)) : "");
  const [caseQtyStr, setCaseQtyStr] = useState(initial ? String(toNum(initial.caseQty)) : "1");

  // Pricing rows (per-group with optional qty breaks)
  const [priceRows, setPriceRows] = useState<GroupPriceRow[]>(
    existingPrices && existingPrices.length > 0
      ? existingPrices.map((p) => ({
          priceGroupId: p.priceGroupId,
          unitPrice: p.unitPrice.toFixed(2),
          minQty: String(p.minQty),
        }))
      : []
  );
  const groupById = Object.fromEntries(priceGroups.map((g) => [g.id, g.name]));

  function addPriceRow() {
    // default to first group not yet used at qty 1, else first group
    const usedAtOne = new Set(priceRows.filter((r) => r.minQty === "1").map((r) => r.priceGroupId));
    const nextGroup = priceGroups.find((g) => !usedAtOne.has(g.id))?.id ?? priceGroups[0]?.id ?? "";
    setPriceRows((xs) => [...xs, { priceGroupId: nextGroup, unitPrice: "", minQty: "1" }]);
  }
  function updatePriceRow(idx: number, field: keyof GroupPriceRow, val: string) {
    setPriceRows((xs) => xs.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
  }
  function removePriceRow(idx: number) {
    setPriceRows((xs) => xs.filter((_, i) => i !== idx));
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadProductImage(fd);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setField("imageUrl", res.data.url);
    toast.success("Image uploaded");
  }

  const saveAll = () =>
    start(async () => {
      if (!f.sku || !f.sku.trim()) {
        toast.error("SKU is required");
        setActiveTab("details");
        return;
      }
      if (!f.name || !f.name.trim()) {
        toast.error("Product name is required");
        setActiveTab("details");
        return;
      }

      const res = await upsertProduct({
        ...f,
        id: isNew ? undefined : initial?.id,
        sellPriceNzd: parseFloat(sellPriceStr) || 0,
        costNzd: costStr ? parseFloat(costStr) : null,
        reorderPoint: parseInt(reorderStr) || 0,
        caseQty: parseInt(caseQtyStr) || 1,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      // For existing products, also save the pricing rows.
      // For new products, we don't have an id yet — upsertProduct currently
      // returns ok without the new id, so staged prices will have to be
      // saved after navigating back into the editor. We still create the
      // product successfully. TODO: return id from upsertProduct.
      if (!isNew && initial?.id) {
        const validPrices = priceRows
          .filter((r) => r.priceGroupId && r.unitPrice && parseFloat(r.unitPrice) > 0)
          .map((r) => ({
            priceGroupId: r.priceGroupId,
            unitPrice: parseFloat(r.unitPrice),
            minQty: parseInt(r.minQty) || 1,
          }));
        const prRes = await saveProductPrices({ productId: initial.id, prices: validPrices });
        if (!prRes.ok) {
          toast.error(prRes.error);
          return;
        }
      }

      toast.success(isNew ? "Product created" : "Product saved");
      router.push("/products");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link href="/products" className="hover:underline">Products</Link>
            {" > "}
            <Link href="/products" className="hover:underline text-primary">
              {isNew ? "New Product" : "View Products"}
            </Link>
          </div>
          <h1 className="text-3xl font-semibold mt-1">
            {isNew ? (f.name || "New Product") : (initial?.name || "Product")}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={saveAll} disabled={pending}>
            {pending ? "Saving..." : (isNew ? "Create Product" : "Save")}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="pricing">Pricing{priceRows.length > 0 ? ` (${priceRows.length})` : ""}</TabsTrigger>
          <TabsTrigger value="image">Image</TabsTrigger>
        </TabsList>

        {/* ───── DETAILS ───── */}
        <TabsContent value="details">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-4 max-w-6xl">
            {/* Left column */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>*SKU</Label>
                <Input value={f.sku ?? ""} onChange={(e) => setField("sku", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>*Name</Label>
                <Input value={f.name ?? ""} onChange={(e) => setField("name", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Brand</Label>
                <Select
                  value={f.brandId ?? "__none__"}
                  onValueChange={(v) => setField("brandId", v === "__none__" ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Select
                  value={f.supplierId ?? "__none__"}
                  onValueChange={(v) => setField("supplierId", v === "__none__" ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Supplier code</Label>
                <Input
                  value={f.supplierCode ?? ""}
                  placeholder="Supplier's part number"
                  onChange={(e) => setField("supplierCode", e.target.value || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea rows={3} value={f.description ?? ""} onChange={(e) => setField("description", e.target.value || null)} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea rows={3} value={f.notes ?? ""} onChange={(e) => setField("notes", e.target.value || null)} />
              </div>
            </div>

            {/* Middle column */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input value={f.unit ?? "EA"} onChange={(e) => setField("unit", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Case qty (units per carton)</Label>
                <Input
                  type="text" inputMode="numeric" className="text-right" placeholder="1"
                  value={caseQtyStr}
                  onChange={(e) => setCaseQtyStr(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Re-order point</Label>
                <Input
                  type="text" inputMode="numeric" className="text-right" placeholder="0"
                  value={reorderStr}
                  onChange={(e) => setReorderStr(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Bin location</Label>
                <Input
                  value={f.binLocation ?? ""}
                  placeholder="e.g. F08B01"
                  onChange={(e) => setField("binLocation", e.target.value || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unit barcode</Label>
                <Input
                  value={f.unitBarcode ?? ""}
                  placeholder="EAN/UPC barcode"
                  onChange={(e) => setField("unitBarcode", e.target.value || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Case barcode</Label>
                <Input
                  value={f.caseBarcode ?? ""}
                  placeholder="Case-level barcode"
                  onChange={(e) => setField("caseBarcode", e.target.value || null)}
                />
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Cost (NZD) — landed average</Label>
                <Input
                  type="text" inputMode="decimal" className="text-right"
                  placeholder="Auto-updated on PO receive"
                  value={costStr}
                  onChange={(e) => setCostStr(e.target.value)}
                  onBlur={() => setCostStr(costStr ? fmtCurrency(costStr, 4) : "")}
                />
                <p className="text-xs text-muted-foreground">Typically maintained by PO receipts, not edited by hand.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Active</Label>
                <div className="flex items-center gap-3">
                  <Switch checked={f.active ?? true} onCheckedChange={(v) => setField("active", v)} />
                  <span className="text-sm">{(f.active ?? true) ? "Active" : "Inactive"}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Tester</Label>
                <div className="flex items-center gap-3">
                  <Switch checked={f.isTester ?? false} onCheckedChange={(v) => setField("isTester", v)} />
                  <span className="text-sm">{(f.isTester ?? false) ? "Tester product" : "Not a tester"}</span>
                </div>
              </div>
              <div className="rounded-md border p-3 text-xs text-muted-foreground bg-muted/30">
                Set the base sell price and per-group custom prices in the <b>Pricing</b> tab. Upload a product photo in the <b>Image</b> tab.
              </div>
            </div>
          </div>

          {/* Delete (edit mode only) */}
          {!isNew && (
            <div className="mt-8 pt-4 border-t">
              <Button
                type="button"
                variant="destructive"
                onClick={() =>
                  start(async () => {
                    if (!confirm(`Delete product "${f.name}"? This cannot be undone.`)) return;
                    const res = await deleteProduct(initial!.id);
                    if (!res.ok) { toast.error(res.error); return; }
                    toast.success("Product deleted");
                    router.push("/products");
                    router.refresh();
                  })
                }
              >
                Delete product
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ───── PRICING ───── */}
        <TabsContent value="pricing">
          <div className="space-y-6 max-w-5xl">
            {/* Base sell price */}
            <div className="space-y-1.5 max-w-sm">
              <Label>*Base sell price (NZD)</Label>
              <Input
                type="text" inputMode="decimal" className="text-right" placeholder="0.00"
                value={sellPriceStr}
                onChange={(e) => setSellPriceStr(e.target.value)}
                onBlur={() => setSellPriceStr(fmtCurrency(sellPriceStr))}
                required
              />
              <p className="text-xs text-muted-foreground">
                Default price used when a customer has no price group, or when no matching group price is set.
              </p>
            </div>

            {/* Per-group pricing */}
            <div className="space-y-2 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Custom prices by price group</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addPriceRow}
                  disabled={priceGroups.length === 0 || isNew}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add row
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Override the base price for customers in specific groups. Use <b>Min qty</b> for quantity breaks
                (e.g. &quot;10+ at $20&quot;). Multiple rows with the same group but different min-qty tiers create
                a quantity ladder.
              </p>

              {priceGroups.length === 0 && (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground text-center">
                  No price groups have been defined yet.{" "}
                  <Link href="/settings/price-groups" className="underline">Create some in Settings →</Link>
                </div>
              )}

              {isNew && priceGroups.length > 0 && (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground text-center">
                  Save the product first, then come back to set per-group prices.
                </div>
              )}

              {!isNew && priceGroups.length > 0 && (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Price group</TableHead>
                        <TableHead className="text-right">Unit price (NZD)</TableHead>
                        <TableHead className="text-right">Min qty</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {priceRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                            No custom prices — the base price above will be used for everyone.
                          </TableCell>
                        </TableRow>
                      )}
                      {priceRows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Select value={r.priceGroupId} onValueChange={(v) => updatePriceRow(i, "priceGroupId", v)}>
                              <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                              <SelectContent>
                                {priceGroups.map((g) => (
                                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="text" inputMode="decimal" className="text-right" placeholder="0.00"
                              value={r.unitPrice}
                              onChange={(e) => updatePriceRow(i, "unitPrice", e.target.value)}
                              onBlur={() =>
                                updatePriceRow(i, "unitPrice", r.unitPrice ? fmtCurrency(r.unitPrice) : "")
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="text" inputMode="numeric" className="text-right" placeholder="1"
                              value={r.minQty}
                              onChange={(e) =>
                                updatePriceRow(i, "minQty", e.target.value.replace(/[^0-9]/g, ""))
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button type="button" variant="ghost" size="icon" onClick={() => removePriceRow(i)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Quick preview by group */}
            {!isNew && priceGroups.length > 0 && (
              <div className="rounded-md border p-4">
                <Label className="text-base font-semibold">Effective prices</Label>
                <p className="text-xs text-muted-foreground mb-3">
                  How the price resolves today at qty = 1 for each group.
                </p>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Price group</TableHead>
                        <TableHead className="text-right">Price at qty 1</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {priceGroups.map((g) => {
                        const best = priceRows
                          .filter((r) => r.priceGroupId === g.id && (parseInt(r.minQty) || 0) <= 1 && parseFloat(r.unitPrice) > 0)
                          .sort((a, b) => (parseInt(b.minQty) || 0) - (parseInt(a.minQty) || 0))[0];
                        const price = best ? parseFloat(best.unitPrice) : parseFloat(sellPriceStr || "0");
                        const isCustom = !!best;
                        return (
                          <TableRow key={g.id}>
                            <TableCell>{g.name}{!isCustom && <span className="text-xs text-muted-foreground ml-2">(using base)</span>}</TableCell>
                            <TableCell className="text-right font-mono">
                              {price > 0 ? `$${price.toFixed(2)}` : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ───── IMAGE ───── */}
        <TabsContent value="image">
          <div className="max-w-xl space-y-4">
            <div className="space-y-2">
              <Label>Product image</Label>
              <Input type="file" accept="image/*" onChange={onUpload} />
              <p className="text-xs text-muted-foreground">JPEG, PNG, WebP, or GIF — max 5 MB.</p>
            </div>
            {f.imageUrl ? (
              <div className="rounded-md border p-3 inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.imageUrl} alt="" className="h-48 w-48 rounded object-cover" />
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground text-center">
                No image uploaded yet.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
