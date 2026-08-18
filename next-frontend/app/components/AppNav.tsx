// app/components/AppNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/app", label: "Home" },
    { href: "/app/assist", label: "Assist" },
  { href: "/app/lawyers", label: "Lawyers" },
  { href: "/app/messages", label: "Messages" },
  { href: "/app/settings/profile", label: "Profile" },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center justify-between">
      <Link href="/" className="font-bold tracking-[-0.01em]">
        Legal Assistant
      </Link>
      <nav className="flex items-center gap-2">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded-md border transition
                ${active
                  ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]"
                  : "border-[color:var(--color-border)] hover:bg-[color:var(--color-panel)]"
                }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
