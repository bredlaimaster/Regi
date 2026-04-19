"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { uploadBudget } from "@/actions/budgets";

/**
 * Budget paste format (TSV or CSV):
 * period | lineType | amountNzd | brandName? | channelName? | territoryName? | repEmail?
 *
 * period: 1–12 (1=April) or month name (Apr, May, ...)
 * lineType: SALES, COGS, GROSS_MARGIN, FREIGHT_IN, etc.
 * amountNzd: number
 * rest are optional filter dimensions
 */
interface Props {
  fiscalYear: number;
}

const TEMPLATE = `period\tlineType\tamountNzd\tbrandName\tchannelName
1\tSALES\t50000\tSilkymit\tPharmacy
1\tSALES\t30000\tHask\tSalon
2\tSALES\t55000\tSilkymit\t
2\tCOGS\t25000\t\t`;

export function BudgetUpload({ fiscalYear }: Props) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function handleUpload() {
    if (!text.trim()) { toast.error("Paste budget data first"); return; }
    start(async () => {
      const res = await uploadBudget({ fiscalYear, tsv: text });
      if (!res.ok) { toast.error(res.error); return; }
      const d = (res as { ok: true; data: { inserted: number; skipped: number } }).data;
      toast.success(`Uploaded: ${d.inserted} lines inserted, ${d.skipped} skipped`);
      setText("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upload / Paste Budgets</CardTitle>
        <CardDescription>
          Paste tab-separated data. Columns: period, lineType, amountNzd, brandName (optional), channelName (optional)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Template (copy and fill in Excel, then paste back)</Label>
          <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">{TEMPLATE}</pre>
        </div>
        <div className="space-y-1">
          <Label>Paste data here</Label>
          <Textarea
            rows={8}
            placeholder="period&#9;lineType&#9;amountNzd&#9;brandName&#9;channelName..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <Button onClick={handleUpload} disabled={pending || !text.trim()}>
          {pending ? "Uploading..." : "Upload Budgets"}
        </Button>
      </CardContent>
    </Card>
  );
}
