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
import type { Role } from "@prisma/client";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN", "SALES", "WAREHOUSE"] },
  { href: "/products", label: "Products", icon: Package, roles: ["ADMIN", "SALES"] },
  { href: "/inventory", label: "Inventory", icon: Boxes, roles: ["ADMIN", "SALES"] },
  { href: "/purchase-orders", label: "Purchase Orders", icon: ClipboardList, roles: ["ADMIN", "WAREHOUSE"] },
  { href: "/sales-orders", label: "Sales Orders", icon: ShoppingCart, roles: ["ADMIN", "SALES"] },
  { href: "/proforma", label: "Proforma Invoices", icon: FileText, roles: ["ADMIN", "SALES"] },
  { href: "/reservations", label: "Reservations", icon: BookmarkCheck, roles: ["ADMIN", "SALES"] },
  { href: "/suppliers", label: "Suppliers", icon: Truck, roles: ["ADMIN"] },
  { href: "/customers", label: "Customers", icon: Users, roles: ["ADMIN", "SALES"] },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ["ADMIN", "SALES"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["ADMIN"] },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = NAV.filter((item) => item.roles.includes(role));
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r bg-card">
      <div className="h-14 flex items-center px-4 border-b font-semibold text-primary">NZ Inventory</div>
      <nav className="flex-1 p-2 space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
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
