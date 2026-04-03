"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Nadzorna plošča", href: "/dashboard" },
  { label: "Analitika", href: "/dashboard/analytics" },
  { label: "Nastavitve", href: "/dashboard/settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full border-b border-[#e5e7eb] bg-white/80 backdrop-blur lg:w-72 lg:min-w-72 lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col px-4 py-4 sm:px-6 sm:py-5 lg:px-6 lg:py-8">
        <div className="mb-4 lg:mb-10">
          <div className="text-2xl font-semibold tracking-tight">
            Finance
          </div>
          <div className="mt-1 text-sm text-gray-500">
            Osebna nadzorna plošča
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block shrink-0 rounded-xl px-4 py-3 text-sm transition lg:w-full ${
                  isActive
                    ? "bg-[#f3f4f6] font-medium text-[#111827]"
                    : "text-gray-500 hover:bg-[#f9fafb] hover:text-[#111827]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 hidden rounded-2xl border border-[#eceff3] bg-[#fafafa] p-4 lg:mt-auto lg:block">
          <div className="text-xs uppercase tracking-[0.18em] text-gray-400">
            Povzetek
          </div>
          <div className="mt-3 text-sm text-gray-500">
            Stanje, mesečni denarni tok, dolgovi in naročnine na enem mestu.
          </div>
        </div>
      </div>
    </aside>
  );
}
