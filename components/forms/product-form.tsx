"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { upsertProduct, uploadProductImage, deleteProduct } from "@/actions/products";

type Initial = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  sellPriceNzd: number;
  reorderPoint: number;
  imageUrl: string | null;
  notes: string | null;
  supplierId: string | null;
};

export function ProductForm({
  suppliers,
  initial,
}: {
  suppliers: { id: string; name: string }[];
  initial?: Initial;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<Partial<Initial>>(
    initial ?? { unit: "EA", sellPriceNzd: 0, reorderPoint: 0 }
  );

  function setField<K extends keyof Initial>(k: K, v: Initial[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadProductImage(fd);
    if (!res.ok) return toast.error(res.error);
    setField("imageUrl", res.data.url);
    toast.success("Image uploaded");
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await upsertProduct(form);
          if (!res.ok) return toast.error(res.error);
          toast.success("Saved");
          router.push("/products");
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>SKU</Label>
          <Input value={form.sku ?? ""} onChange={(e) => setField("sku", e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={form.name ?? ""} onChange={(e) => setField("name", e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Sell price (NZD)</Label>
          <Input
            type="number"
            step="0.01"
            value={form.sellPriceNzd ?? 0}
            onChange={(e) => setField("sellPriceNzd", Number(e.target.value))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Reorder point</Label>
          <Input
            type="number"
            value={form.reorderPoint ?? 0}
            onChange={(e) => setField("reorderPoint", Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label>Unit</Label>
          <Input value={form.unit ?? "EA"} onChange={(e) => setField("unit", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Supplier</Label>
          <Select
            value={form.supplierId ?? ""}
            onValueChange={(v) => setField("supplierId", v || null)}
          >
            <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={form.description ?? ""} onChange={(e) => setField("description", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Image</Label>
        <Input type="file" accept="image/*" onChange={onUpload} />
        {form.imageUrl && <img src={form.imageUrl} alt="" className="mt-2 h-24 w-24 rounded object-cover border" />}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
        {initial && (
          <Button
            type="button"
            variant="destructive"
            onClick={() =>
              start(async () => {
                if (!confirm("Delete this product?")) return;
                const res = await deleteProduct(initial.id);
                if (!res.ok) return toast.error(res.error);
                router.push("/products");
                router.refresh();
              })
            }
          >
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
