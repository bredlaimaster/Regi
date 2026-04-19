"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { formatNzd } from "@/lib/utils";

interface Props {
  data: { name: string; Actual: number; Budget: number; Margin: number }[];
}

export function MonthlySalesChart({ data }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Actual vs Budget vs Gross Margin</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="left"
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip formatter={(v) => [formatNzd(v as number), ""]} />
              <Legend />
              <Bar yAxisId="left" dataKey="Actual" fill="hsl(210 80% 56%)" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="left" dataKey="Budget" fill="hsl(210 30% 75%)" radius={[3, 3, 0, 0]} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="Margin"
                stroke="hsl(142 71% 45%)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
