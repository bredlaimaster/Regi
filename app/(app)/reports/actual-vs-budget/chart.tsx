"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatNzd } from "@/lib/utils";

interface Props {
  data: { name: string; Actual: number; Budget: number }[];
}

export function ActualVsBudgetChart({ data }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Actual vs Budget — Monthly</CardTitle></CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [formatNzd(v as number), ""]} />
              <Legend />
              <Bar dataKey="Actual" fill="hsl(210 80% 56%)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Budget" fill="hsl(210 30% 75%)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
