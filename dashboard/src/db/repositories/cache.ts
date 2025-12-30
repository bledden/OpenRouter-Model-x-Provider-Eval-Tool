import { eq, lt, sql } from "drizzle-orm";
import {
  db,
  cachedModels,
  cachedProviders,
  CachedModel,
  NewCachedModel,
  CachedProvider,
  NewCachedProvider,
} from "../client";

const MODEL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const PROVIDER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached model by ID
 */
export async function getCachedModel(id: string): Promise<CachedModel | null> {
  const [model] = await db
    .select()
    .from(cachedModels)
    .where(eq(cachedModels.id, id));

  // Check if expired
  if (model && model.expiresAt && new Date(model.expiresAt) < new Date()) {
    return null;
  }

  return model || null;
}

/**
 * Get all cached models (non-expired)
 */
export async function getAllCachedModels(): Promise<CachedModel[]> {
  return db
    .select()
    .from(cachedModels)
    .where(sql`${cachedModels.expiresAt} > NOW() OR ${cachedModels.expiresAt} IS NULL`);
}

/**
 * Cache a model
 */
export async function cacheModel(data: NewCachedModel): Promise<CachedModel> {
  const expiresAt = new Date(Date.now() + MODEL_CACHE_TTL_MS);

  const [model] = await db
    .insert(cachedModels)
    .values({ ...data, expiresAt })
    .onConflictDoUpdate({
      target: cachedModels.id,
      set: {
        name: data.name,
        description: data.description,
        contextLength: data.contextLength,
        pricingInput: data.pricingInput,
        pricingOutput: data.pricingOutput,
        topProvider: data.topProvider,
        architecture: data.architecture,
        capabilities: data.capabilities,
        fetchedAt: new Date(),
        expiresAt,
      },
    })
    .returning();

  return model;
}

/**
 * Cache multiple models
 */
export async function cacheModels(models: NewCachedModel[]): Promise<void> {
  const expiresAt = new Date(Date.now() + MODEL_CACHE_TTL_MS);

  for (const model of models) {
    await db
      .insert(cachedModels)
      .values({ ...model, expiresAt })
      .onConflictDoUpdate({
        target: cachedModels.id,
        set: {
          name: model.name,
          description: model.description,
          contextLength: model.contextLength,
          pricingInput: model.pricingInput,
          pricingOutput: model.pricingOutput,
          topProvider: model.topProvider,
          architecture: model.architecture,
          capabilities: model.capabilities,
          fetchedAt: new Date(),
          expiresAt,
        },
      });
  }
}

/**
 * Get cached providers for a model
 */
export async function getCachedProviders(
  modelId: string
): Promise<CachedProvider[]> {
  return db
    .select()
    .from(cachedProviders)
    .where(
      sql`${cachedProviders.modelId} = ${modelId} AND (${cachedProviders.expiresAt} > NOW() OR ${cachedProviders.expiresAt} IS NULL)`
    );
}

/**
 * Cache a provider
 */
export async function cacheProvider(
  data: NewCachedProvider
): Promise<CachedProvider> {
  const expiresAt = new Date(Date.now() + PROVIDER_CACHE_TTL_MS);

  const [provider] = await db
    .insert(cachedProviders)
    .values({ ...data, expiresAt })
    .onConflictDoUpdate({
      target: [cachedProviders.modelId, cachedProviders.providerName],
      set: {
        modelName: data.modelName,
        contextLength: data.contextLength,
        pricingInput: data.pricingInput,
        pricingOutput: data.pricingOutput,
        tag: data.tag,
        quantization: data.quantization,
        maxCompletionTokens: data.maxCompletionTokens,
        supportedParameters: data.supportedParameters,
        status: data.status,
        uptimeLast30m: data.uptimeLast30m,
        fetchedAt: new Date(),
        expiresAt,
      },
    })
    .returning();

  return provider;
}

/**
 * Cache multiple providers for a model
 */
export async function cacheProviders(
  providers: NewCachedProvider[]
): Promise<void> {
  const expiresAt = new Date(Date.now() + PROVIDER_CACHE_TTL_MS);

  for (const provider of providers) {
    await db
      .insert(cachedProviders)
      .values({ ...provider, expiresAt })
      .onConflictDoUpdate({
        target: [cachedProviders.modelId, cachedProviders.providerName],
        set: {
          modelName: provider.modelName,
          contextLength: provider.contextLength,
          pricingInput: provider.pricingInput,
          pricingOutput: provider.pricingOutput,
          tag: provider.tag,
          quantization: provider.quantization,
          maxCompletionTokens: provider.maxCompletionTokens,
          supportedParameters: provider.supportedParameters,
          status: provider.status,
          uptimeLast30m: provider.uptimeLast30m,
          fetchedAt: new Date(),
          expiresAt,
        },
      });
  }
}

/**
 * Clean expired cache entries
 */
export async function cleanExpiredCache(): Promise<{
  modelsDeleted: number;
  providersDeleted: number;
}> {
  const modelsResult = await db
    .delete(cachedModels)
    .where(lt(cachedModels.expiresAt, new Date()))
    .returning({ id: cachedModels.id });

  const providersResult = await db
    .delete(cachedProviders)
    .where(lt(cachedProviders.expiresAt, new Date()))
    .returning({ id: cachedProviders.id });

  return {
    modelsDeleted: modelsResult.length,
    providersDeleted: providersResult.length,
  };
}

/**
 * Invalidate model cache
 */
export async function invalidateModelCache(modelId?: string): Promise<void> {
  if (modelId) {
    await db.delete(cachedModels).where(eq(cachedModels.id, modelId));
  } else {
    await db.delete(cachedModels);
  }
}

/**
 * Invalidate provider cache for a model
 */
export async function invalidateProviderCache(modelId?: string): Promise<void> {
  if (modelId) {
    await db.delete(cachedProviders).where(eq(cachedProviders.modelId, modelId));
  } else {
    await db.delete(cachedProviders);
  }
}
