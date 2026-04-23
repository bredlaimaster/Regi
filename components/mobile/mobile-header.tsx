"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Compact header used on every non-home mobile screen. Thumb-reachable back
 * button on the left; screen title center-left; right slot for actions.
 */
export function MobileHeader({
  title,
  backHref,
  right,
}: {
  title: string;
  backHref?: string;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b flex items-center gap-2 px-2 h-14">
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Back"
          className="h-10 w-10 flex items-center justify-center rounded-md active:bg-accent"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
      ) : (
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="h-10 w-10 flex items-center justify-center rounded-md active:bg-accent"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      <h1 className="flex-1 text-base font-semibold truncate">{title}</h1>
      {right}
    </header>
  );
}
