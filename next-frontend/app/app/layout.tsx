// app/app/layout.tsx
import type { ReactNode } from "react";
import AppNav from "../components/AppNav";

export const metadata = {
  title: "Dashboard · Legal Assistant",
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-page text-foreground">
      <header className="sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b border-[color:var(--color-border)]">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <AppNav />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        {children}
      </main>
    </div>
  );
}
