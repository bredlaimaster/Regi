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
import { Trash2, Plus, Star, Upload, ImageIcon } from "lucide-react";
import {
  upsertProduct,
  deleteProduct,
  saveProductPrices,
  addProductImage,
  deleteProductImage,
  setPrimaryProductImage,
} from "@/actions/products";

// ───── Types ─────
type ProductInitial = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  sellPriceNzd: number;
  reorderPoint: number;
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

type ProductImageMeta = {
  id: string;
  filename: string | null;
  contentType: string;
  size: number;
  order: number;
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
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ───── Main tabs component ─────
export function ProductDetailTabs({
  initial,
  suppliers,
  brands,
  priceGroups,
  existingPrices,
  images = [],
}: {
  initial?: ProductInitial;
  suppliers: Supplier[];
  brands: Brand[];
  priceGroups: PriceGroup[];
  existingPrices?: { priceGroupId: string; unitPrice: number; minQty: number }[];
  images?: ProductImageMeta[];
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

  function addPriceRow() {
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

  // ───── Image tab handlers ─────
  const [uploading, setUploading] = useState(false);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file
    if (files.length === 0 || !initial?.id) return;

    setUploading(true);
    try {
      // Sequential uploads: simpler error handling, and each row is small.
      let okCount = 0;
      let firstError: string | null = null;
      for (const file of files) {
        const fd = new FormData();
        fd.append("productId", initial.id);
        fd.append("file", file);
        const res = await addProductImage(fd);
        if (!res.ok) {
          if (!firstError) firstError = `${file.name}: ${res.error}`;
          continue;
        }
        okCount += 1;
      }
      if (okCount > 0) {
        toast.success(
          okCount === 1
            ? "Image uploaded"
            : `Uploaded ${okCount} images`,
        );
      }
      if (firstError) toast.error(firstError);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  function onDeleteImage(id: string) {
    if (!confirm("Delete this image?")) return;
    start(async () => {
      const res = await deleteProductImage({ id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Image deleted");
      router.refresh();
    });
  }

  function onSetPrimary(imageId: string) {
    if (!initial?.id) return;
    start(async () => {
      const res = await setPrimaryProductImage({ productId: initial.id, imageId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Primary image updated");
      router.refresh();
    });
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
          <Button onClick={saveAll} disabled={pending || uploading}>
            {pending ? "Saving..." : (isNew ? "Create Product" : "Save")}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="pricing">Pricing{priceRows.length > 0 ? ` (${priceRows.length})` : ""}</TabsTrigger>
          <TabsTrigger value="images">
            Images{images.length > 0 ? ` (${images.length})` : ""}
          </TabsTrigger>
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
                Set the base sell price and per-group custom prices in the <b>Pricing</b> tab. Upload product photos in the <b>Images</b> tab.
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

        {/* ───── IMAGES ───── */}
        <TabsContent value="images">
          <div className="max-w-4xl space-y-4">
            {isNew ? (
              <div className="rounded-md border border-dashed p-8 text-sm text-muted-foreground text-center">
                <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Save the product first, then come back here to upload images.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="product-image-input">Add images</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="product-image-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      multiple
                      onChange={onUpload}
                      disabled={uploading || pending}
                    />
                    {uploading && (
                      <span className="text-sm text-muted-foreground">
                        <Upload className="h-4 w-4 inline animate-pulse" /> Uploading…
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    JPEG, PNG, WebP, or GIF — max 5 MB each. Pick multiple files at
                    once to upload them in one go. The first image is the primary
                    one shown in lists.
                  </p>
                </div>

                {images.length === 0 ? (
                  <div className="rounded-md border border-dashed p-8 text-sm text-muted-foreground text-center">
                    <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No images yet. Drop one in above.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {images.map((img, idx) => {
                      const isPrimary = idx === 0;
                      return (
                        <div
                          key={img.id}
                          className="rounded-md border overflow-hidden bg-card flex flex-col"
                        >
                          <div className="relative aspect-square bg-muted/30">
                            {/* Plain <img> — Next/Image isn't worth the same-origin */}
                            {/* dance for one-tenant low-traffic catalogue. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/product-images/${img.id}`}
                              alt={img.filename ?? "Product image"}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            {isPrimary && (
                              <Badge
                                variant="success"
                                className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5"
                              >
                                <Star className="h-3 w-3 mr-1 fill-current" /> Primary
                              </Badge>
                            )}
                          </div>
                          <div className="p-2 space-y-1">
                            <div
                              className="text-xs truncate"
                              title={img.filename ?? ""}
                            >
                              {img.filename ?? "(no filename)"}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {fmtBytes(img.size)}
                            </div>
                            <div className="flex gap-1 pt-1">
                              {!isPrimary && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs flex-1"
                                  onClick={() => onSetPrimary(img.id)}
                                  disabled={pending || uploading}
                                  title="Use as primary image"
                                >
                                  <Star className="h-3 w-3 mr-1" /> Primary
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => onDeleteImage(img.id)}
                                disabled={pending || uploading}
                                title="Delete image"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
