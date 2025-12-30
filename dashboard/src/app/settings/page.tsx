"use client";

import { Settings, Key, Bell, Shield } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-in stagger-1">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-8 h-8 text-[var(--signal-blue)]" />
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Settings
          </h1>
        </div>
        <p className="text-[var(--text-secondary)] text-lg">
          Configure your evaluation preferences
        </p>
      </div>

      {/* Settings Sections */}
      <div className="grid gap-6">
        {/* API Keys */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Key className="w-5 h-5 text-[var(--signal-blue)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              API Keys
            </h2>
          </div>
          <p className="text-[var(--text-secondary)]">
            Set your OpenRouter API key in the <code className="px-1.5 py-0.5 bg-[var(--bg-secondary)] rounded text-sm">.env</code> file or <code className="px-1.5 py-0.5 bg-[var(--bg-secondary)] rounded text-sm">OPENROUTER_API_KEY</code> environment variable.
          </p>
        </div>

        {/* Notifications */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="w-5 h-5 text-[var(--signal-blue)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Notifications
            </h2>
          </div>
          <p className="text-[var(--text-secondary)]">
            Notification settings coming soon.
          </p>
        </div>

        {/* Security */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-5 h-5 text-[var(--signal-blue)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Security
            </h2>
          </div>
          <p className="text-[var(--text-secondary)]">
            Security settings coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
