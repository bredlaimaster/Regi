"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Truck,
  Users,
  ShoppingCart,
  ClipboardList,
  Boxes,
  BarChart3,
  Settings,
  FileText,
  BookmarkCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/purchase-orders", label: "Purchase Orders", icon: ClipboardList },
  { href: "/sales-orders", label: "Sales Orders", icon: ShoppingCart },
  { href: "/proforma", label: "Proforma Invoices", icon: FileText },
  { href: "/reservations", label: "Reservations", icon: BookmarkCheck },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r bg-card">
      <div className="h-14 flex items-center px-4 border-b font-semibold text-primary">NZ Inventory</div>
      <nav className="flex-1 p-2 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
