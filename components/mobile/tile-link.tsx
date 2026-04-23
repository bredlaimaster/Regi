import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Large touch-target tile used on the mobile home screen. ~88px tall so it
 * comfortably hits Fitts's-law recommendations for thumb use with gloves on.
 */
export function TileLink({
  href,
  icon: Icon,
  title,
  subtitle,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-xl border bg-card p-4 active:bg-accent transition-colors min-h-[88px] shadow-sm"
    >
      <div className="flex-shrink-0 h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <div className="font-semibold">{title}</div>
        {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
      </div>
    </Link>
  );
}
