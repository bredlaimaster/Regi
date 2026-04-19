"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currentFiscalYear } from "@/lib/reports/margin";

interface Props {
  current: number;
}

export function FySelector({ current }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const thisFy = currentFiscalYear();
  const years = Array.from({ length: 5 }, (_, i) => thisFy - i);

  function onChange(val: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("fy", val);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={String(current)} onValueChange={onChange}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {years.map((y) => (
          <SelectItem key={y} value={String(y)}>
            FY{y} ({y}/{String(y + 1).slice(2)})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
