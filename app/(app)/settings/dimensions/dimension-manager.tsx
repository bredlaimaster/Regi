"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import type { ActionResult } from "@/lib/types";

interface Item { id: string; name: string }

interface Props {
  label: string;
  items: Item[];
  upsert: (input: { name: string; id?: string }) => Promise<ActionResult>;
  remove: (id: string) => Promise<ActionResult>;
}

export function DimensionManager({ label, items: initial, upsert, remove }: Props) {
  const [items, setItems] = useState<Item[]>(initial);
  const [newName, setNewName] = useState("");
  const [pending, start] = useTransition();

  function addItem() {
    if (!newName.trim()) return;
    start(async () => {
      const res = await upsert({ name: newName.trim() });
      if (!res.ok) { toast.error(res.error); return; }
      const created = res.data as Item;
      setItems((xs) => [...xs, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      toast.success(`${label} added`);
    });
  }

  function removeItem(id: string) {
    start(async () => {
      const res = await remove(id);
      if (!res.ok) { toast.error(res.error); return; }
      setItems((xs) => xs.filter((x) => x.id !== id));
      toast.success(`${label} removed`);
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">No {label.toLowerCase()}s yet</p>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between py-1 border-b last:border-0">
            <span className="text-sm">{item.name}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => removeItem(item.id)}
              disabled={pending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder={`New ${label.toLowerCase()}...`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          className="h-8 text-sm"
        />
        <Button size="sm" variant="outline" onClick={addItem} disabled={pending || !newName.trim()}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}
