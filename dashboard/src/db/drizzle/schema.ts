import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  decimal,
  jsonb,
  inet,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }),
    image: varchar("image", { length: 512 }),
    role: varchar("role", { length: 50 }).default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_users_email").on(table.email)]
);

// API Keys table
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyHash: varchar("key_hash", { length: 255 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    rateLimit: integer("rate_limit").default(100),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_api_keys_user_id").on(table.userId),
    index("idx_api_keys_key_hash").on(table.keyHash),
    index("idx_api_keys_prefix").on(table.keyPrefix),
  ]
);

// Eval Results table
export const evalResults = pgTable(
  "eval_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    modelId: varchar("model_id", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 255 }),
    benchmark: varchar("benchmark", { length: 100 }).notNull(),
    score: decimal("score", { precision: 5, scale: 4 }).notNull(),
    samplesEvaluated: integer("samples_evaluated").notNull(),
    correctCount: integer("correct_count").notNull(),
    durationMs: integer("duration_ms").notNull(),
    avgLatencyMs: decimal("avg_latency_ms", { precision: 10, scale: 2 }),
    config: jsonb("config").default({}),
    results: jsonb("results").default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_eval_results_user_id").on(table.userId),
    index("idx_eval_results_model_id").on(table.modelId),
    index("idx_eval_results_benchmark").on(table.benchmark),
    index("idx_eval_results_created_at").on(table.createdAt),
    index("idx_eval_results_model_benchmark").on(table.modelId, table.benchmark),
  ]
);

// Benchmark Runs table
export const benchmarkRuns = pgTable(
  "benchmark_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    benchmark: varchar("benchmark", { length: 100 }).notNull(),
    modelId: varchar("model_id", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 255 }),
    config: jsonb("config").default({}),
    status: varchar("status", { length: 50 }).default("pending"),
    progress: integer("progress").default(0),
    totalQuestions: integer("total_questions"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_benchmark_runs_user_id").on(table.userId),
    index("idx_benchmark_runs_status").on(table.status),
  ]
);

// Audit Logs table
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 100 }).notNull(),
    resourceType: varchar("resource_type", { length: 100 }),
    resourceId: varchar("resource_id", { length: 255 }),
    metadata: jsonb("metadata").default({}),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_audit_logs_user_id").on(table.userId),
    index("idx_audit_logs_action").on(table.action),
    index("idx_audit_logs_created_at").on(table.createdAt),
  ]
);

// Cached Models table
export const cachedModels = pgTable(
  "cached_models",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    contextLength: integer("context_length"),
    pricingInput: decimal("pricing_input", { precision: 10, scale: 6 }),
    pricingOutput: decimal("pricing_output", { precision: 10, scale: 6 }),
    topProvider: varchar("top_provider", { length: 255 }),
    architecture: jsonb("architecture").default({}),
    capabilities: jsonb("capabilities").default({}),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [index("idx_cached_models_expires_at").on(table.expiresAt)]
);

// Cached Providers table
export const cachedProviders = pgTable(
  "cached_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: varchar("model_id", { length: 255 }).notNull(),
    providerName: varchar("provider_name", { length: 255 }).notNull(),
    modelName: varchar("model_name", { length: 255 }),
    contextLength: integer("context_length"),
    pricingInput: decimal("pricing_input", { precision: 10, scale: 6 }),
    pricingOutput: decimal("pricing_output", { precision: 10, scale: 6 }),
    tag: varchar("tag", { length: 100 }),
    quantization: varchar("quantization", { length: 100 }),
    maxCompletionTokens: integer("max_completion_tokens"),
    supportedParameters: text("supported_parameters").array(),
    status: integer("status").default(0),
    uptimeLast30m: decimal("uptime_last_30m", { precision: 5, scale: 2 }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_cached_providers_model_id").on(table.modelId),
    index("idx_cached_providers_expires_at").on(table.expiresAt),
    unique("cached_providers_model_provider_unique").on(
      table.modelId,
      table.providerName
    ),
  ]
);

// Baseline Scores table
export const baselineScores = pgTable(
  "baseline_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: varchar("model_id", { length: 255 }).notNull(),
    benchmarkCategory: varchar("benchmark_category", { length: 100 }).notNull(),
    score: decimal("score", { precision: 5, scale: 2 }).notNull(),
    source: varchar("source", { length: 255 }),
    sourceUrl: text("source_url"),
    version: varchar("version", { length: 50 }).default("v1"),
    isVerified: boolean("is_verified").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_baseline_scores_model_id").on(table.modelId),
    index("idx_baseline_scores_category").on(table.benchmarkCategory),
    unique("baseline_scores_model_category_version_unique").on(
      table.modelId,
      table.benchmarkCategory,
      table.version
    ),
  ]
);

// Model Capability Overrides table
export const modelCapabilityOverrides = pgTable(
  "model_capability_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    modelId: varchar("model_id", { length: 255 }).notNull(),
    capabilities: jsonb("capabilities").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_capability_overrides_user_id").on(table.userId),
    unique("capability_overrides_user_model_unique").on(
      table.userId,
      table.modelId
    ),
  ]
);

// Provider Watchlists table
export const providerWatchlists = pgTable(
  "provider_watchlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    providers: text("providers").array().notNull(),
    isDefault: boolean("is_default").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_provider_watchlists_user_id").on(table.userId)]
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  apiKeys: many(apiKeys),
  evalResults: many(evalResults),
  benchmarkRuns: many(benchmarkRuns),
  auditLogs: many(auditLogs),
  capabilityOverrides: many(modelCapabilityOverrides),
  watchlists: many(providerWatchlists),
}));

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
  auditLogs: many(auditLogs),
}));

export const evalResultsRelations = relations(evalResults, ({ one }) => ({
  user: one(users, {
    fields: [evalResults.userId],
    references: [users.id],
  }),
}));

export const benchmarkRunsRelations = relations(benchmarkRuns, ({ one }) => ({
  user: one(users, {
    fields: [benchmarkRuns.userId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
  apiKey: one(apiKeys, {
    fields: [auditLogs.apiKeyId],
    references: [apiKeys.id],
  }),
}));

export const modelCapabilityOverridesRelations = relations(
  modelCapabilityOverrides,
  ({ one }) => ({
    user: one(users, {
      fields: [modelCapabilityOverrides.userId],
      references: [users.id],
    }),
  })
);

export const providerWatchlistsRelations = relations(
  providerWatchlists,
  ({ one }) => ({
    user: one(users, {
      fields: [providerWatchlists.userId],
      references: [users.id],
    }),
  })
);

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type EvalResult = typeof evalResults.$inferSelect;
export type NewEvalResult = typeof evalResults.$inferInsert;
export type BenchmarkRun = typeof benchmarkRuns.$inferSelect;
export type NewBenchmarkRun = typeof benchmarkRuns.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type CachedModel = typeof cachedModels.$inferSelect;
export type NewCachedModel = typeof cachedModels.$inferInsert;
export type CachedProvider = typeof cachedProviders.$inferSelect;
export type NewCachedProvider = typeof cachedProviders.$inferInsert;
export type BaselineScore = typeof baselineScores.$inferSelect;
export type NewBaselineScore = typeof baselineScores.$inferInsert;
export type ModelCapabilityOverride = typeof modelCapabilityOverrides.$inferSelect;
export type NewModelCapabilityOverride = typeof modelCapabilityOverrides.$inferInsert;
export type ProviderWatchlist = typeof providerWatchlists.$inferSelect;
export type NewProviderWatchlist = typeof providerWatchlists.$inferInsert;
