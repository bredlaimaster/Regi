"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createScheduledReport } from "@/actions/scheduled-reports";

const CRON_PRESETS = [
  { label: "1st of month, 8am", value: "0 8 1 * *" },
  { label: "Every Monday 8am", value: "0 8 * * 1" },
  { label: "Daily 7am", value: "0 7 * * *" },
  { label: "Weekly (Fri 5pm)", value: "0 17 * * 5" },
];

interface Props {
  reportKeys: { key: string; label: string }[];
}

export function ScheduledReportForm({ reportKeys }: Props) {
  const [pending, start] = useTransition();
  const [reportKey, setReportKey] = useState("");
  const [cronExpr, setCronExpr] = useState("0 8 1 * *");
  const [recipientsRaw, setRecipientsRaw] = useState("");

  function handleSubmit() {
    if (!reportKey || !cronExpr || !recipientsRaw.trim()) {
      toast.error("Fill in all fields");
      return;
    }
    const recipients = recipientsRaw
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      toast.error("At least one recipient required");
      return;
    }
    start(async () => {
      const res = await createScheduledReport({ reportKey, cronExpr, recipients });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Schedule created");
      setReportKey("");
      setRecipientsRaw("");
    });
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Add Schedule</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Report</Label>
            <Select value={reportKey} onValueChange={setReportKey}>
              <SelectTrigger><SelectValue placeholder="Select report" /></SelectTrigger>
              <SelectContent>
                {reportKeys.map((r) => (
                  <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Frequency</Label>
            <div className="flex gap-2">
              <Select value={cronExpr} onValueChange={setCronExpr}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CRON_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="w-40 font-mono text-xs"
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="cron expr"
              />
            </div>
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>Recipients (email addresses, comma or newline separated)</Label>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm font-mono resize-none h-20"
              value={recipientsRaw}
              onChange={(e) => setRecipientsRaw(e.target.value)}
              placeholder="john@example.com&#10;jane@example.com"
            />
          </div>
        </div>

        <Button
          className="mt-3"
          onClick={handleSubmit}
          disabled={pending || !reportKey || !recipientsRaw.trim()}
        >
          {pending ? "Creating..." : "Create Schedule"}
        </Button>
      </CardContent>
    </Card>
  );
}
