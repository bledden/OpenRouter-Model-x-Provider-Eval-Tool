"use client";

import { useState, useEffect } from "react";
import { Plus, X, Trash2, Activity, Check, Search, Loader2 } from "lucide-react";

interface WatchlistProvider {
  id: string;
  name: string;
  tag: string;
}

interface WatchlistItem {
  id: string;
  name: string;
  providers: WatchlistProvider[];
  createdAt: string;
}

interface ProviderStatus {
  name: string;
  tag: string;
  status: "healthy" | "warning" | "error";
  uptime: number;
}

const WATCHLIST_KEY = "provider-watchlists";

function getWatchlists(): WatchlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(WATCHLIST_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveWatchlists(watchlists: WatchlistItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlists));
}

interface CreateWatchlistModalProps {
  onClose: () => void;
  onSave: (watchlist: WatchlistItem) => void;
  availableProviders: ProviderStatus[];
  loading: boolean;
}

function CreateWatchlistModal({ onClose, onSave, availableProviders, loading }: CreateWatchlistModalProps) {
  const [name, setName] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const filteredProviders = availableProviders.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.tag.toLowerCase().includes(search.toLowerCase())
  );

  const toggleProvider = (tag: string) => {
    const newSet = new Set(selectedProviders);
    if (newSet.has(tag)) {
      newSet.delete(tag);
    } else {
      newSet.add(tag);
    }
    setSelectedProviders(newSet);
  };

  const handleSave = () => {
    if (!name.trim() || selectedProviders.size === 0) return;

    const watchlist: WatchlistItem = {
      id: Date.now().toString(),
      name: name.trim(),
      providers: Array.from(selectedProviders).map(tag => {
        const provider = availableProviders.find(p => p.tag === tag);
        return {
          id: tag,
          name: provider?.name || tag,
          tag,
        };
      }),
      createdAt: new Date().toISOString(),
    };

    onSave(watchlist);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="card p-5 w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Create Watchlist
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[var(--surface-hover)] rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Name Input */}
        <div className="mb-4">
          <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">
            Watchlist Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Production Providers"
            className="input w-full"
            autoFocus
          />
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search providers..."
            className="input w-full"
            style={{ paddingLeft: '2.5rem' }}
          />
        </div>

        {/* Provider List */}
        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[300px] border border-[var(--border)] rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--signal-blue)]" />
            </div>
          ) : filteredProviders.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
              No providers found
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredProviders.map((provider) => {
                const isSelected = selectedProviders.has(provider.tag);
                return (
                  <button
                    key={provider.tag}
                    onClick={() => toggleProvider(provider.tag)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg transition-all ${
                      isSelected
                        ? "bg-[var(--signal-blue-dim)] border border-[var(--signal-blue)]"
                        : "hover:bg-[var(--surface-hover)] border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`status-dot ${provider.status}`} />
                      <span className="text-sm text-[var(--text-primary)]">{provider.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)] font-mono">
                        {provider.uptime}%
                      </span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-[var(--signal-blue)]" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected count */}
        <div className="text-xs text-[var(--text-muted)] mt-2">
          {selectedProviders.size} provider{selectedProviders.size !== 1 ? "s" : ""} selected
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-[var(--border)]">
          <button onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || selectedProviders.size === 0}
            className="btn-primary text-sm"
          >
            Create Watchlist
          </button>
        </div>
      </div>
    </div>
  );
}

interface WatchlistCardProps {
  watchlist: WatchlistItem;
  providerStatuses: Map<string, ProviderStatus>;
  onDelete: () => void;
}

function WatchlistCard({ watchlist, providerStatuses, onDelete }: WatchlistCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Calculate overall status
  const statuses = watchlist.providers.map(p => providerStatuses.get(p.tag)?.status || "error");
  const hasError = statuses.includes("error");
  const hasWarning = statuses.includes("warning");
  const overallStatus = hasError ? "error" : hasWarning ? "warning" : "healthy";

  const healthyCount = statuses.filter(s => s === "healthy").length;

  return (
    <div className="card p-3 mt-2">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <div className={`status-dot ${overallStatus}`} />
          <span className="text-xs font-medium text-[var(--text-primary)]">{watchlist.name}</span>
        </div>
        <span className="text-xs text-[var(--text-muted)] font-mono">
          {healthyCount}/{watchlist.providers.length}
        </span>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-1.5">
          {watchlist.providers.map((provider) => {
            const status = providerStatuses.get(provider.tag);
            return (
              <div key={provider.tag} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className={`status-dot ${status?.status || "error"}`} />
                  <span className="text-[var(--text-secondary)]">{provider.name}</span>
                </div>
                <span className="text-[var(--text-muted)] font-mono">
                  {status?.uptime ?? "—"}%
                </span>
              </div>
            );
          })}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex items-center gap-1 text-xs text-[var(--signal-red)] hover:underline mt-2"
          >
            <Trash2 className="w-3 h-3" />
            Delete watchlist
          </button>
        </div>
      )}
    </div>
  );
}

export function CustomWatchlists() {
  const [watchlists, setWatchlists] = useState<WatchlistItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [providerStatuses, setProviderStatuses] = useState<Map<string, ProviderStatus>>(new Map());

  // Load watchlists on mount
  useEffect(() => {
    setWatchlists(getWatchlists());
  }, []);

  // Fetch providers when modal opens
  useEffect(() => {
    if (showModal && availableProviders.length === 0) {
      setLoading(true);
      fetch("/api/providers")
        .then((res) => res.json())
        .then((data) => {
          const providers: ProviderStatus[] = (data.providers || []).map((p: ProviderStatus) => ({
            name: p.name,
            tag: p.tag,
            status: p.status,
            uptime: p.uptime,
          }));
          setAvailableProviders(providers);

          // Update status map
          const statusMap = new Map<string, ProviderStatus>();
          providers.forEach((p) => statusMap.set(p.tag, p));
          setProviderStatuses(statusMap);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [showModal, availableProviders.length]);

  // Refresh provider statuses periodically
  useEffect(() => {
    if (watchlists.length === 0) return;

    const refreshStatuses = () => {
      fetch("/api/providers")
        .then((res) => res.json())
        .then((data) => {
          const statusMap = new Map<string, ProviderStatus>();
          (data.providers || []).forEach((p: ProviderStatus) => {
            statusMap.set(p.tag, {
              name: p.name,
              tag: p.tag,
              status: p.status,
              uptime: p.uptime,
            });
          });
          setProviderStatuses(statusMap);
          if (availableProviders.length === 0) {
            setAvailableProviders(Array.from(statusMap.values()));
          }
        })
        .catch(console.error);
    };

    refreshStatuses();
    const interval = setInterval(refreshStatuses, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [watchlists.length, availableProviders.length]);

  const handleSave = (watchlist: WatchlistItem) => {
    const updated = [...watchlists, watchlist];
    setWatchlists(updated);
    saveWatchlists(updated);
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    const updated = watchlists.filter((w) => w.id !== id);
    setWatchlists(updated);
    saveWatchlists(updated);
  };

  return (
    <div className="mt-3">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
          Watchlists
        </span>
        <button
          onClick={() => setShowModal(true)}
          className="p-1 hover:bg-[var(--surface-hover)] rounded transition-colors"
          title="Create custom watchlist"
        >
          <Plus className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        </button>
      </div>

      {/* Watchlist Cards */}
      {watchlists.length === 0 ? (
        <button
          onClick={() => setShowModal(true)}
          className="w-full p-3 border border-dashed border-[var(--border)] rounded-lg text-xs text-[var(--text-muted)] hover:border-[var(--border-accent)] hover:text-[var(--text-secondary)] transition-colors"
        >
          + Add providers to watch
        </button>
      ) : (
        <div className="space-y-2">
          {watchlists.map((watchlist) => (
            <WatchlistCard
              key={watchlist.id}
              watchlist={watchlist}
              providerStatuses={providerStatuses}
              onDelete={() => handleDelete(watchlist.id)}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <CreateWatchlistModal
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          availableProviders={availableProviders}
          loading={loading}
        />
      )}
    </div>
  );
}
