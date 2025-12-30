-- OpenRouter Eval Dashboard - Database Schema
-- This migration creates all necessary tables for the application

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    image VARCHAR(512),
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(12) NOT NULL,
    name VARCHAR(255) NOT NULL,
    rate_limit INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

-- Eval Results table
CREATE TABLE IF NOT EXISTS eval_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    model_id VARCHAR(255) NOT NULL,
    provider VARCHAR(255),
    benchmark VARCHAR(100) NOT NULL,
    score DECIMAL(5, 4) NOT NULL,
    samples_evaluated INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    avg_latency_ms DECIMAL(10, 2),
    config JSONB DEFAULT '{}',
    results JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_results_user_id ON eval_results(user_id);
CREATE INDEX IF NOT EXISTS idx_eval_results_model_id ON eval_results(model_id);
CREATE INDEX IF NOT EXISTS idx_eval_results_benchmark ON eval_results(benchmark);
CREATE INDEX IF NOT EXISTS idx_eval_results_created_at ON eval_results(created_at);
CREATE INDEX IF NOT EXISTS idx_eval_results_model_benchmark ON eval_results(model_id, benchmark);

-- Benchmark Runs table
CREATE TABLE IF NOT EXISTS benchmark_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    benchmark VARCHAR(100) NOT NULL,
    model_id VARCHAR(255) NOT NULL,
    provider VARCHAR(255),
    config JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    total_questions INTEGER,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_runs_user_id ON benchmark_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_runs_status ON benchmark_runs(status);

-- Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Cached Models table
CREATE TABLE IF NOT EXISTS cached_models (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    context_length INTEGER,
    pricing_input DECIMAL(10, 6),
    pricing_output DECIMAL(10, 6),
    top_provider VARCHAR(255),
    architecture JSONB DEFAULT '{}',
    capabilities JSONB DEFAULT '{}',
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cached_models_expires_at ON cached_models(expires_at);

-- Cached Providers table
CREATE TABLE IF NOT EXISTS cached_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id VARCHAR(255) NOT NULL,
    provider_name VARCHAR(255) NOT NULL,
    model_name VARCHAR(255),
    context_length INTEGER,
    pricing_input DECIMAL(10, 6),
    pricing_output DECIMAL(10, 6),
    tag VARCHAR(100),
    quantization VARCHAR(100),
    max_completion_tokens INTEGER,
    supported_parameters TEXT[],
    status INTEGER DEFAULT 0,
    uptime_last_30m DECIMAL(5, 2),
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    UNIQUE(model_id, provider_name)
);

CREATE INDEX IF NOT EXISTS idx_cached_providers_model_id ON cached_providers(model_id);
CREATE INDEX IF NOT EXISTS idx_cached_providers_expires_at ON cached_providers(expires_at);

-- Baseline Scores table
CREATE TABLE IF NOT EXISTS baseline_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id VARCHAR(255) NOT NULL,
    benchmark_category VARCHAR(100) NOT NULL,
    score DECIMAL(5, 2) NOT NULL,
    source VARCHAR(255),
    source_url TEXT,
    version VARCHAR(50) DEFAULT 'v1',
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(model_id, benchmark_category, version)
);

CREATE INDEX IF NOT EXISTS idx_baseline_scores_model_id ON baseline_scores(model_id);
CREATE INDEX IF NOT EXISTS idx_baseline_scores_category ON baseline_scores(benchmark_category);

-- Model Capability Overrides table
CREATE TABLE IF NOT EXISTS model_capability_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model_id VARCHAR(255) NOT NULL,
    capabilities JSONB NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_capability_overrides_user_id ON model_capability_overrides(user_id);

-- Provider Watchlists table
CREATE TABLE IF NOT EXISTS provider_watchlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    providers TEXT[] NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_watchlists_user_id ON provider_watchlists(user_id);
