"use client";

import Link from "next/link";
import {
  Activity,
  Server,
  Brain,
  Zap,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
  Play,
  Clock,
  Target,
  Loader2,
  Info,
} from "lucide-react";
import { useDashboard } from "@/hooks/useDashboard";
import { useAlerts, Alert } from "@/hooks/useAlerts";
import { useModels } from "@/hooks/useModels";
import { useBenchmarks } from "@/hooks/useBenchmarks";
import { EvalSpotlight } from "@/components/EvalSpotlight";
import { getBenchmarkDependency } from "@/lib/benchmark-config";
import { useState, useMemo } from "react";

export default function Dashboard() {
  const { stats, loading: dashboardLoading } = useDashboard();
  const { alerts, summary: alertSummary, loading: alertsLoading } = useAlerts();
  const { models, loading: modelsLoading } = useModels({ limit: 50 });
  const { benchmarks } = useBenchmarks();

  // Quick eval state
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedBenchmark, setSelectedBenchmark] = useState("");
  const [selectedSampleSize, setSelectedSampleSize] = useState("10");

  // Get dependency warning for selected benchmark
  const benchmarkDependency = useMemo(() => {
    if (!selectedBenchmark) return null;
    return getBenchmarkDependency(selectedBenchmark);
  }, [selectedBenchmark]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-in stagger-1">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
          Eval Dashboard
        </h1>
        <p className="text-[var(--text-secondary)]">
          Monitor provider quality, run benchmarks, and make informed routing decisions
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 animate-in stagger-2">
        <StatCard
          label="Active Providers"
          value={stats?.activeProviders ?? "-"}
          icon={<Server className="w-5 h-5" />}
          trend="Live from OpenRouter"
          trendUp={true}
          loading={dashboardLoading}
        />
        <StatCard
          label="Models Tracked"
          value={stats?.totalModels ?? "-"}
          icon={<Brain className="w-5 h-5" />}
          trend="Real-time count"
          trendUp={true}
          loading={dashboardLoading}
        />
        <StatCard
          label="Active Alerts"
          value={alertSummary.total}
          icon={<Target className="w-5 h-5" />}
          trend={`${alertSummary.critical} critical, ${alertSummary.warnings} warnings`}
          trendUp={alertSummary.critical === 0}
          loading={alertsLoading}
        />
        <StatCard
          label="Avg Uptime"
          value={stats?.avgUptime ? `${stats.avgUptime}%` : "-"}
          icon={<Activity className="w-5 h-5" />}
          trend="30-day average"
          trendUp={(stats?.avgUptime ?? 0) >= 99}
          loading={dashboardLoading}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="col-span-2 space-y-6">
          {/* Two Main Questions */}
          <div className="grid grid-cols-2 gap-4 animate-in stagger-3">
            <QuestionCard
              title="Best Provider for Your Model"
              description="Compare how the same model performs across different providers"
              href="/providers"
              icon={<Server className="w-6 h-6" />}
              gradient="from-[var(--signal-blue)] to-[var(--signal-purple)]"
              example="Which provider gives the best Llama 70B for my API?"
            />
            <QuestionCard
              title="Best Model for Your Use Case"
              description="Find the optimal model based on your specific requirements"
              href="/models"
              icon={<Brain className="w-6 h-6" />}
              gradient="from-[var(--signal-green)] to-[var(--signal-blue)]"
              example="What's the best model for code generation?"
            />
          </div>

          {/* Eval Spotlight - Expanded */}
          <div className="animate-in stagger-4">
            <EvalSpotlight expanded />
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Quick Run */}
          <div className="card card-glow p-6 animate-in stagger-3">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
              Quick Eval
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
                  Model
                </label>
                <select
                  className="select w-full"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={modelsLoading}
                >
                  <option value="">Select a model...</option>
                  {models.slice(0, 20).map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
                  Benchmark
                </label>
                <select
                  className="select w-full"
                  value={selectedBenchmark}
                  onChange={(e) => setSelectedBenchmark(e.target.value)}
                >
                  <option value="">Select a benchmark...</option>
                  {benchmarks.slice(0, 15).map((benchmark) => (
                    <option key={benchmark.id} value={benchmark.id}>
                      {benchmark.name} ({benchmark.category})
                    </option>
                  ))}
                </select>
                {/* Dependency warning for selected benchmark */}
                {benchmarkDependency?.warning && (
                  <div className="mt-2 p-2 rounded-md bg-[var(--signal-amber-dim)] border border-[var(--signal-amber)]">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-[var(--signal-amber)] mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-[var(--signal-amber)]">
                        <span className="font-medium">Dependency required:</span>{" "}
                        {benchmarkDependency.warning}
                        {benchmarkDependency.installCmd && (
                          <div className="mt-1 font-mono text-[10px] opacity-80">
                            {benchmarkDependency.installCmd}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
                  Sample Size
                </label>
                <select
                  className="select w-full"
                  value={selectedSampleSize}
                  onChange={(e) => setSelectedSampleSize(e.target.value)}
                >
                  <option value="10">10 questions (fast)</option>
                  <option value="50">50 questions</option>
                  <option value="100">100 questions</option>
                  <option value="0">Full benchmark</option>
                </select>
              </div>
              <Link
                href={`/providers${selectedModel || selectedBenchmark || selectedSampleSize !== "10"
                  ? `?${[
                      selectedModel && `model=${encodeURIComponent(selectedModel)}`,
                      selectedBenchmark && `benchmark=${encodeURIComponent(selectedBenchmark)}`,
                      selectedSampleSize !== "10" && `limit=${selectedSampleSize}`,
                    ].filter(Boolean).join("&")}`
                  : ""}`}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                Run Evaluation
              </Link>
            </div>
          </div>

          {/* Recent Alerts */}
          <div className="card p-6 animate-in stagger-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
              Recent Alerts
            </h2>
            {alertsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
              </div>
            ) : alerts.length > 0 ? (
              <div className="space-y-3">
                {alerts.slice(0, 4).map((alert) => (
                  <AlertRow key={alert.id} alert={alert} />
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-[var(--signal-green-dim)] border border-[var(--signal-green)]">
                <div className="flex items-center gap-2 text-[var(--signal-green)]">
                  <Activity className="w-4 h-4" />
                  <span className="text-sm font-medium">All systems operational</span>
                </div>
              </div>
            )}
          </div>

          {/* Matrix View CTA */}
          <div className="card p-6 animate-in stagger-5 border-[var(--signal-purple)] border-opacity-30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--signal-purple-dim)] flex items-center justify-center">
                <Zap className="w-5 h-5 text-[var(--signal-purple)]" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--text-primary)]">
                  Matrix View
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Comprehensive analysis
                </p>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Compare models across providers and benchmarks in one view. Find the
              optimal combination for your specific requirements.
            </p>
            <Link href="/matrix" className="btn-secondary w-full text-center block">
              Open Matrix View
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  trend,
  trendUp,
  loading = false,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend: string;
  trendUp: boolean;
  loading?: boolean;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[var(--text-muted)]">{icon}</div>
        <div
          className={`flex items-center gap-1 text-xs ${
            trendUp ? "text-[var(--signal-green)]" : "text-[var(--signal-amber)]"
          }`}
        >
          {trendUp ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <Info className="w-3 h-3" />
          )}
          {trend}
        </div>
      </div>
      {loading ? (
        <div className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : (
        <>
          <div className="metric-value text-2xl">{value}</div>
          <div className="metric-label">{label}</div>
        </>
      )}
    </div>
  );
}

function QuestionCard({
  title,
  description,
  href,
  icon,
  gradient,
  example,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  gradient: string;
  example: string;
}) {
  return (
    <Link href={href} className="block group">
      <div className="card p-6 h-full transition-all duration-300 hover:border-[var(--border-accent)] hover:shadow-lg">
        <div
          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
        >
          <div className="text-[var(--void)]">{icon}</div>
        </div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
          {title}
        </h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">{description}</p>
        <div className="text-xs text-[var(--text-muted)] italic border-l-2 border-[var(--border)] pl-3">
          &quot;{example}&quot;
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--signal-blue)] group-hover:gap-3 transition-all">
          Explore <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </Link>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const getTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div
      className={`p-3 rounded-lg border ${
        alert.type === "error"
          ? "bg-[var(--signal-red-dim)] border-[var(--signal-red)]"
          : alert.type === "warning"
          ? "bg-[var(--signal-amber-dim)] border-[var(--signal-amber)]"
          : "bg-[var(--signal-blue-dim)] border-[var(--signal-blue)]"
      }`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={`w-4 h-4 mt-0.5 ${
            alert.type === "error"
              ? "text-[var(--signal-red)]"
              : alert.type === "warning"
              ? "text-[var(--signal-amber)]"
              : "text-[var(--signal-blue)]"
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--text-primary)] truncate">
            {alert.title}
          </div>
          <div className="text-xs text-[var(--text-secondary)] truncate">
            {alert.message}
          </div>
        </div>
        <div className="text-xs text-[var(--text-muted)] flex items-center gap-1 whitespace-nowrap">
          <Clock className="w-3 h-3" />
          {getTimeAgo(alert.timestamp)}
        </div>
      </div>
    </div>
  );
}
