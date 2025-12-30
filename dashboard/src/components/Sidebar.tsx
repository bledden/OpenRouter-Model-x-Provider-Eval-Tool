"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Server,
  Brain,
  Grid3X3,
  Settings,
  Activity,
  Zap
} from "lucide-react";
import { CustomWatchlists } from "./CustomWatchlist";

const navItems = [
  {
    name: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    description: "System overview",
  },
  {
    name: "Provider Evals",
    href: "/providers",
    icon: Server,
    description: "Best provider for a model",
  },
  {
    name: "Model Evals",
    href: "/models",
    icon: Brain,
    description: "Best model for your use case",
  },
  {
    name: "Matrix View",
    href: "/matrix",
    icon: Grid3X3,
    description: "Full comparison grid",
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col z-50">
      {/* Logo */}
      <div className="p-6 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--signal-blue)] to-[var(--signal-green)] flex items-center justify-center">
            <Zap className="w-5 h-5 text-[var(--void)]" />
          </div>
          <div>
            <h1 className="font-semibold text-[var(--text-primary)] text-sm">OpenRouter</h1>
            <p className="text-xs text-[var(--text-muted)]">Eval Dashboard</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200
                ${isActive
                  ? "bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-lg"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                }
              `}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-[var(--signal-blue)]" : ""}`} />
              <div className="flex-1">
                <div className="font-medium text-sm">{item.name}</div>
                <div className="text-xs text-[var(--text-muted)]">{item.description}</div>
              </div>
              {isActive && (
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--signal-green)]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* System Status */}
      <div className="p-4 border-t border-[var(--border)] overflow-y-auto max-h-[300px]">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-[var(--signal-green)]" />
            <span className="text-xs font-medium text-[var(--text-secondary)]">SYSTEM STATUS</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)]">API</span>
              <div className="flex items-center gap-2">
                <span className="text-[var(--signal-green)]">Connected</span>
                <div className="status-dot healthy" />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)]">Providers</span>
              <span className="text-[var(--text-primary)] font-mono">All active</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)]">Last sync</span>
              <span className="text-[var(--text-muted)] font-mono">Live</span>
            </div>
          </div>
        </div>

        {/* Custom Watchlists */}
        <CustomWatchlists />
      </div>

      {/* Settings */}
      <div className="p-4 border-t border-[var(--border)]">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-4 py-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span className="text-sm">Settings</span>
        </Link>
      </div>
    </aside>
  );
}
