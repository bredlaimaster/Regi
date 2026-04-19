"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { formatNzd } from "@/lib/utils";

interface Props {
  data: Record<string, string | number>[];
  channels: { name: string; color: string }[];
}

export function ChannelTrendChart({ data, channels }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Rolling Sales by Channel</CardTitle></CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <defs>
                {channels.map((c) => (
                  <linearGradient key={c.name} id={`grad-${c.name}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={c.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={c.color} stopOpacity={0.05} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [formatNzd(v as number), ""]} />
              <Legend />
              {channels.map((c) => (
                <Area
                  key={c.name}
                  type="monotone"
                  dataKey={c.name}
                  stroke={c.color}
                  strokeWidth={2}
                  fill={`url(#grad-${c.name})`}
                  dot={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
