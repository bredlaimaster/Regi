import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalCount: number;
  pageSize: number;
  /** Base URL path without query params, e.g. "/products" */
  basePath: string;
  /** Extra search params to preserve (e.g. { q: "search" }) */
  extraParams?: Record<string, string>;
}

export function Pagination({ currentPage, totalCount, pageSize, basePath, extraParams }: PaginationProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  if (totalPages <= 1) return null;

  function buildUrl(page: number) {
    const params = new URLSearchParams(extraParams ?? {});
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <p className="text-sm text-muted-foreground">
        Showing {Math.min((currentPage - 1) * pageSize + 1, totalCount)}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount}
      </p>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={currentPage <= 1} asChild={currentPage > 1}>
          {currentPage > 1 ? (
            <Link href={buildUrl(currentPage - 1)}><ChevronLeft className="h-4 w-4" /> Prev</Link>
          ) : (
            <span><ChevronLeft className="h-4 w-4" /> Prev</span>
          )}
        </Button>
        <Button variant="outline" size="sm" disabled={currentPage >= totalPages} asChild={currentPage < totalPages}>
          {currentPage < totalPages ? (
            <Link href={buildUrl(currentPage + 1)}>Next <ChevronRight className="h-4 w-4" /></Link>
          ) : (
            <span>Next <ChevronRight className="h-4 w-4" /></span>
          )}
        </Button>
      </div>
    </div>
  );
}
