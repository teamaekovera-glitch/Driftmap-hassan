"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/play", label: "Explore" },
  { href: "/memory", label: "Remember" },
  { href: "/replay", label: "Replay" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-lg tracking-wide">
          Driftmap
        </Link>
        <nav aria-label="Primary" className="flex gap-6 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={
                pathname === link.href
                  ? "text-accent"
                  : "text-muted hover:text-ivory"
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
