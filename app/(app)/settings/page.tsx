import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SETTINGS_LINKS = [
  { href: "/settings/users", title: "Users & Roles", desc: "Invite teammates and manage access." },
  { href: "/settings/dimensions", title: "Brands, Channels & Territories", desc: "Dimension tables for reporting and segmentation." },
  { href: "/settings/price-groups", title: "Price Groups", desc: "Named pricing tiers (Retail, Wholesale, Trade) with per-product custom prices." },
  { href: "/settings/tax", title: "Tax Rules", desc: "NZ GST rules per supplier — domestic, import, zero-rated, exempt." },
  { href: "/settings/budgets", title: "Budget Management", desc: "Upload and manage monthly P&L budgets." },
  { href: "/settings/reports", title: "Scheduled Reports", desc: "Automated email delivery for all reports." },
  { href: "/settings/quickbooks", title: "QuickBooks Online", desc: "Connect and monitor sync jobs." },
  { href: "/settings/audit", title: "Audit Trail", desc: "Every stock movement, ever." },
];

export default async function SettingsPage() {
  await requireRole(["ADMIN"]);
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SETTINGS_LINKS.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="hover:border-primary/50 transition-colors h-full cursor-pointer">
              <CardHeader><CardTitle className="text-base">{item.title}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{item.desc}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
