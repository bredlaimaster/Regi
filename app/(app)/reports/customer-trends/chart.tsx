"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { formatNzd } from "@/lib/utils";

interface Props {
  data: { name: string; Sales: number; Units: number; Margin: number }[];
}

export function CustomerTrendChart({ data }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Sales, Units &amp; Gross Margin — Rolling</CardTitle></CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={2} />
              <YAxis yAxisId="left" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} label={{ value: "Units", angle: -90, position: "insideRight", fontSize: 10 }} />
              <Tooltip formatter={(v, name) => name === "Units" ? [v, "Units"] : [formatNzd(v as number), name as string]} />
              <Legend />
              <Bar yAxisId="left" dataKey="Sales" fill="hsl(210 80% 56%)" radius={[3, 3, 0, 0]} />
              <Line yAxisId="left" type="monotone" dataKey="Margin" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="Units" stroke="hsl(38 92% 50%)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
