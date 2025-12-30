import { eq, desc, and, gte, sql } from "drizzle-orm";
import { db, evalResults, NewEvalResult, EvalResult } from "../client";

export interface EvalResultFilters {
  userId?: string;
  modelId?: string;
  benchmark?: string;
  provider?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

/**
 * Create a new eval result
 */
export async function createEvalResult(
  data: NewEvalResult
): Promise<EvalResult> {
  const [result] = await db.insert(evalResults).values(data).returning();
  return result;
}

/**
 * Get eval result by ID
 */
export async function getEvalResultById(
  id: string
): Promise<EvalResult | null> {
  const [result] = await db
    .select()
    .from(evalResults)
    .where(eq(evalResults.id, id));
  return result || null;
}

/**
 * Get eval results with optional filters and pagination
 */
export async function getEvalResults(
  filters: EvalResultFilters = {},
  pagination: PaginationOptions = {}
): Promise<{ results: EvalResult[]; total: number }> {
  const { limit = 50, offset = 0 } = pagination;

  // Build conditions
  const conditions = [];

  if (filters.userId) {
    conditions.push(eq(evalResults.userId, filters.userId));
  }
  if (filters.modelId) {
    conditions.push(eq(evalResults.modelId, filters.modelId));
  }
  if (filters.benchmark) {
    conditions.push(eq(evalResults.benchmark, filters.benchmark));
  }
  if (filters.provider) {
    conditions.push(eq(evalResults.provider, filters.provider));
  }
  if (filters.startDate) {
    conditions.push(gte(evalResults.createdAt, filters.startDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get results with pagination
  const results = await db
    .select()
    .from(evalResults)
    .where(whereClause)
    .orderBy(desc(evalResults.createdAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(evalResults)
    .where(whereClause);

  return { results, total: count };
}

/**
 * Get latest eval result for a model/benchmark combination
 */
export async function getLatestEvalResult(
  modelId: string,
  benchmark: string,
  userId?: string
): Promise<EvalResult | null> {
  const conditions = [
    eq(evalResults.modelId, modelId),
    eq(evalResults.benchmark, benchmark),
  ];

  if (userId) {
    conditions.push(eq(evalResults.userId, userId));
  }

  const [result] = await db
    .select()
    .from(evalResults)
    .where(and(...conditions))
    .orderBy(desc(evalResults.createdAt))
    .limit(1);

  return result || null;
}

/**
 * Get eval results grouped by model for comparison
 */
export async function getEvalResultsByBenchmark(
  benchmark: string,
  limit: number = 100
): Promise<EvalResult[]> {
  return db
    .select()
    .from(evalResults)
    .where(eq(evalResults.benchmark, benchmark))
    .orderBy(desc(evalResults.score))
    .limit(limit);
}

/**
 * Get user's recent evaluations
 */
export async function getUserRecentEvals(
  userId: string,
  limit: number = 10
): Promise<EvalResult[]> {
  return db
    .select()
    .from(evalResults)
    .where(eq(evalResults.userId, userId))
    .orderBy(desc(evalResults.createdAt))
    .limit(limit);
}

/**
 * Delete eval result by ID
 */
export async function deleteEvalResult(id: string): Promise<boolean> {
  const result = await db
    .delete(evalResults)
    .where(eq(evalResults.id, id))
    .returning({ id: evalResults.id });

  return result.length > 0;
}

/**
 * Get aggregate stats for a model
 */
export async function getModelEvalStats(modelId: string): Promise<{
  totalEvals: number;
  avgScore: number;
  benchmarks: string[];
}> {
  const results = await db
    .select({
      totalEvals: sql<number>`count(*)::int`,
      avgScore: sql<number>`avg(score)::float`,
      benchmarks: sql<string[]>`array_agg(distinct benchmark)`,
    })
    .from(evalResults)
    .where(eq(evalResults.modelId, modelId));

  const stats = results[0];
  return {
    totalEvals: stats?.totalEvals || 0,
    avgScore: stats?.avgScore || 0,
    benchmarks: stats?.benchmarks || [],
  };
}
