"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface Props {
  href: string;
  label?: string;
}

export function ExportButton({ href, label = "Export XLSX" }: Props) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} download>
        <Download className="h-4 w-4 mr-1" />
        {label}
      </a>
    </Button>
  );
}
