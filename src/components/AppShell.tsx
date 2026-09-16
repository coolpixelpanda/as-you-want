"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, MessageSquareText, Puzzle, UserRound } from "lucide-react";

const nav = [
  { href: "/profiles", label: "Profiles", icon: UserRound },
  { href: "/answers", label: "Answers", icon: MessageSquareText },
  { href: "/extension", label: "Extension", icon: Puzzle },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-[#efe8da] lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-5 lg:block">
          <Link href="/profiles" className="block">
            <p className="font-serif text-2xl italic tracking-tight">JobLink</p>
            <p className="mt-1 text-xs text-muted">Paste a link. We apply.</p>
          </Link>
          <nav className="flex gap-1 lg:mt-8 lg:flex-col">
            {nav.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-white/60 hover:text-ink ${
                    active ? "bg-ink text-paper hover:bg-ink hover:text-paper" : "text-muted"
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="hidden px-5 pb-6 lg:block">
          <div className="rounded-xl border border-line bg-card p-3 text-xs text-muted">
            <FileText size={14} className="mb-2" />
            Profile answers are reused across Greenhouse, Lever, Ashby, Workday, and other boards.
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-5 py-8 sm:px-8 lg:px-12">{children}</main>
    </div>
  );
}
