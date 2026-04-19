"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatNzd } from "@/lib/utils";

const COLORS = [
  "hsl(210 80% 56%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(280 65% 60%)",
  "hsl(0 72% 51%)",
];

interface Props {
  data: { name: string; Sales: number; Margin: number }[];
}

export function BrandChart({ data }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Sales &amp; Margin by Brand</CardTitle></CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [formatNzd(v as number), ""]} />
              <Legend />
              <Bar dataKey="Sales" fill={COLORS[0]} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Margin" fill={COLORS[1]} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
