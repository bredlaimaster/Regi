"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Star } from "lucide-react";
import { upsertPriceGroup, deletePriceGroup, setDefaultPriceGroup } from "@/actions/price-groups";

type Group = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  sortOrder: number;
  customerCount: number;
  priceCount: number;
};

type DraftGroup = {
  id?: string;
  name: string;
  description: string;
  isDefault: boolean;
  sortOrder: string;
};

const EMPTY_DRAFT: DraftGroup = { name: "", description: "", isDefault: false, sortOrder: "0" };

export function PriceGroupManager({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftGroup>(EMPTY_DRAFT);

  function openEditor(g?: Group) {
    if (g) {
      setEditingId(g.id);
      setAdding(false);
      setDraft({
        id: g.id,
        name: g.name,
        description: g.description ?? "",
        isDefault: g.isDefault,
        sortOrder: String(g.sortOrder),
      });
    } else {
      setEditingId(null);
      setAdding(true);
      setDraft(EMPTY_DRAFT);
    }
  }

  function closeEditor() {
    setEditingId(null);
    setAdding(false);
    setDraft(EMPTY_DRAFT);
  }

  function save() {
    if (!draft.name.trim()) { toast.error("Name is required"); return; }
    start(async () => {
      const res = await upsertPriceGroup({
        id: draft.id,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        isDefault: draft.isDefault,
        sortOrder: parseInt(draft.sortOrder) || 0,
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(draft.id ? "Group saved" : "Group created");
      closeEditor();
      router.refresh();
    });
  }

  function remove(g: Group) {
    if (g.isDefault) { toast.error("Cannot delete the default group"); return; }
    if (g.customerCount > 0) {
      toast.error(`${g.customerCount} customer(s) still use this group — reassign them first`);
      return;
    }
    if (!confirm(`Delete price group "${g.name}"? Its ${g.priceCount} product price(s) will also be removed.`)) return;
    start(async () => {
      const res = await deletePriceGroup(g.id);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Group deleted");
      router.refresh();
    });
  }

  function makeDefault(g: Group) {
    if (g.isDefault) return;
    start(async () => {
      const res = await setDefaultPriceGroup(g.id);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`"${g.name}" is now the default`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {groups.length} group{groups.length === 1 ? "" : "s"}
        </p>
        {!adding && editingId === null && (
          <Button onClick={() => openEditor()}>
            <Plus className="h-4 w-4 mr-1" /> Add price group
          </Button>
        )}
      </div>

      {(adding || editingId !== null) && (
        <div className="rounded-md border p-4 bg-muted/30 space-y-4">
          <h2 className="text-base font-semibold">
            {editingId ? "Edit price group" : "New price group"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>*Name</Label>
              <Input
                value={draft.name}
                placeholder="e.g. Wholesale"
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sort order</Label>
              <Input
                type="text" inputMode="numeric" className="text-right" placeholder="0"
                value={draft.sortOrder}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, sortOrder: e.target.value.replace(/[^0-9]/g, "") }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Default</Label>
              <div className="flex items-center gap-3 h-10">
                <Switch
                  checked={draft.isDefault}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, isDefault: v }))}
                />
                <span className="text-sm text-muted-foreground">
                  {draft.isDefault ? "Assigned to new customers" : "Off"}
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={draft.description}
              placeholder="Optional — who this group is for"
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={pending || !draft.name.trim()}>
              {pending ? "Saving..." : editingId ? "Save" : "Create"}
            </Button>
            <Button type="button" variant="ghost" onClick={closeEditor}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Sort</TableHead>
              <TableHead className="text-right">Customers</TableHead>
              <TableHead className="text-right">Product prices</TableHead>
              <TableHead>Default</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No price groups yet — click &quot;Add price group&quot; above.
                </TableCell>
              </TableRow>
            )}
            {groups.map((g) => (
              <TableRow key={g.id} className="hover:bg-muted/50">
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {g.description ?? "—"}
                </TableCell>
                <TableCell className="text-right">{g.sortOrder}</TableCell>
                <TableCell className="text-right">{g.customerCount}</TableCell>
                <TableCell className="text-right">{g.priceCount}</TableCell>
                <TableCell>
                  {g.isDefault ? (
                    <Badge>Default</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => makeDefault(g)}
                      disabled={pending}
                    >
                      <Star className="h-3.5 w-3.5 mr-1" /> Make default
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => openEditor(g)} disabled={pending}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(g)}
                      disabled={pending || g.isDefault || g.customerCount > 0}
                      title={
                        g.isDefault ? "Cannot delete the default group"
                          : g.customerCount > 0 ? `${g.customerCount} customer(s) still use this group`
                          : "Delete"
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
