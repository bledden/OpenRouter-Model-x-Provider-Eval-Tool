"use client";

import { useState, useEffect } from "react";
import { X, Check, RotateCcw } from "lucide-react";
import {
  ALL_CAPABILITIES,
  CAPABILITY_INFO,
  Capability,
  getUserCapabilityOverrides,
  setUserCapabilityOverride,
  removeUserCapabilityOverride,
} from "@/lib/capability-overrides";

interface CapabilityOverrideModalProps {
  modelId: string;
  modelName: string;
  detectedCapabilities: string[];
  onClose: () => void;
  onSave: (capabilities: string[]) => void;
}

export function CapabilityOverrideModal({
  modelId,
  modelName,
  detectedCapabilities,
  onClose,
  onSave,
}: CapabilityOverrideModalProps) {
  const [selectedCapabilities, setSelectedCapabilities] = useState<Set<string>>(
    new Set(detectedCapabilities)
  );
  const [hasUserOverride, setHasUserOverride] = useState(false);

  useEffect(() => {
    // Check if there's an existing user override
    const userOverrides = getUserCapabilityOverrides();
    if (userOverrides[modelId]) {
      setSelectedCapabilities(new Set(userOverrides[modelId]));
      setHasUserOverride(true);
    }
  }, [modelId]);

  const toggleCapability = (cap: Capability) => {
    const newSet = new Set(selectedCapabilities);
    if (newSet.has(cap)) {
      newSet.delete(cap);
    } else {
      newSet.add(cap);
    }
    setSelectedCapabilities(newSet);
  };

  const handleSave = () => {
    const caps = Array.from(selectedCapabilities) as Capability[];
    setUserCapabilityOverride(modelId, caps);
    onSave(caps);
    onClose();
  };

  const handleReset = () => {
    removeUserCapabilityOverride(modelId);
    setSelectedCapabilities(new Set(detectedCapabilities));
    setHasUserOverride(false);
    onSave(detectedCapabilities);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header - fixed */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Edit Capabilities
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {modelName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--surface-hover)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Info */}
          <div className="bg-[var(--surface-elevated)] rounded-lg p-4 mb-6">
            <p className="text-sm text-[var(--text-secondary)]">
              Select which capabilities this model should have. This affects which benchmarks
              and evaluations are available for this model.
            </p>
            {hasUserOverride && (
              <p className="text-xs text-[var(--signal-amber)] mt-2">
                You have a custom override saved for this model.
              </p>
            )}
          </div>

          {/* Capabilities Grid */}
          <div className="space-y-3">
            {ALL_CAPABILITIES.map((cap) => {
              const info = CAPABILITY_INFO[cap];
              const isSelected = selectedCapabilities.has(cap);
              const wasDetected = detectedCapabilities.includes(cap);

              return (
                <button
                  key={cap}
                  onClick={() => toggleCapability(cap)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                    isSelected
                      ? "border-[var(--signal-green)] bg-[var(--signal-green-dim)]"
                      : "border-[var(--border)] hover:border-[var(--border-accent)]"
                  }`}
                >
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text-primary)]">
                        {info.name}
                      </span>
                      {wasDetected && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] text-[var(--text-muted)]">
                          Auto-detected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {info.description}
                    </p>
                  </div>
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isSelected
                        ? "bg-[var(--signal-green)] text-[var(--void)]"
                        : "bg-[var(--surface-elevated)]"
                    }`}
                  >
                    {isSelected && <Check className="w-4 h-4" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions - fixed */}
        <div className="flex items-center justify-between p-6 pt-4 border-t border-[var(--border)]">
          <button
            onClick={handleReset}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Detected
          </button>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="btn-secondary text-sm">
              Cancel
            </button>
            <button onClick={handleSave} className="btn-primary text-sm">
              Save Override
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
