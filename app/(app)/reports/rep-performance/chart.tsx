"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatNzd } from "@/lib/utils";

interface Props {
  data: { name: string; Sales: number; Margin: number }[];
}

export function RepPerformanceChart({ data }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Sales &amp; Margin by Rep</CardTitle></CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 80, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
              <Tooltip formatter={(v) => [formatNzd(v as number), ""]} />
              <Legend />
              <Bar dataKey="Sales" fill="hsl(210 80% 56%)" radius={[0, 3, 3, 0]} />
              <Bar dataKey="Margin" fill="hsl(142 71% 45%)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
