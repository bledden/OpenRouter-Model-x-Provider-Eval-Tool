# OpenRouter Eval Dashboard vs Groq OpenBench

A comprehensive feature comparison between our evaluation platform and [Groq's OpenBench](https://github.com/groq/openbench).

## Executive Summary

| Aspect | OpenBench (Groq) | OpenRouter Eval Dashboard |
|--------|------------------|---------------------------|
| **Primary Focus** | Reproducible evals, Groq showcase | OpenRouter integration, parallel execution |
| **Benchmark Count** | 95+ | 117+ (via Inspect AI) |
| **Max Parallelism** | Limited by provider | **Unlimited (500 RPS via OpenRouter)** |
| **Web UI** | `bench view` (log viewer) | **Full-featured dashboard** |
| **Provider Comparison** | Manual | **Built-in parallel comparison** |
| **Multi-Model Parallel** | Sequential or limited | **Unlimited concurrent models** |

---

## Feature Comparison Matrix

### CLI Features

| Feature | OpenBench | Our CLI | Advantage |
|---------|-----------|---------|-----------|
| List benchmarks | `bench list` | `bench list` | Tie |
| Describe benchmark | `bench describe` | `bench describe` | Tie |
| Run evaluation | `bench eval` | `bench run` | Tie |
| View results | `bench view` | `bench view` | Tie |
| Cache management | `bench cache` | - | OpenBench |
| Cost estimation | - | `bench cost` | **Ours** |
| Retry failed runs | - | `bench retry <run_id>` | **Ours** |
| Run history | - | `bench history` | **Ours** |
| List providers | - | `bench providers` | **Ours** |
| Seed for reproducibility | `--seed` | `--seed` | Tie |
| Epochs/repeated runs | - | `--epochs` | **Ours** |
| Multi-model parallel | Limited | `--models a,b,c` (unlimited) | **Ours** |
| Multi-provider parallel | - | `--providers a,b,c` | **Ours** |
| Debug mode | `--debug` | - | OpenBench |
| Alpha benchmarks | `--alpha` | - | OpenBench |

### Web Interface

| Feature | OpenBench | Our Dashboard | Advantage |
|---------|-----------|---------------|-----------|
| Results viewer | Basic log viewer | Full dashboard | **Ours** |
| Real-time progress | - | SSE streaming | **Ours** |
| Benchmark explorer | - | Category-grouped grid | **Ours** |
| Model selection UI | - | Multi-select by category | **Ours** |
| Provider selection | - | Dropdown + multi-select | **Ours** |
| Run configuration modal | - | Full config (seed, epochs, samples) | **Ours** |
| Export results | HF datasets | JSON, CSV, clipboard | **Ours** |
| Share results | - | Copy to clipboard | **Ours** |
| Cost estimation | - | Live cost preview | **Ours** |
| Retry from UI | - | One-click retry | **Ours** |

### Parallelism & Performance

| Capability | OpenBench | Our Platform | Advantage |
|------------|-----------|--------------|-----------|
| Max concurrent models | Provider-limited | **Unlimited** | **Ours** |
| Max RPS | Provider-limited | **500 RPS (OpenRouter)** | **Ours** |
| Multi-provider comparison | Manual runs | **Parallel execution** | **Ours** |
| Batch processing | Sequential | **All parallel** | **Ours** |

### Provider Support

| Provider | OpenBench | Our Platform |
|----------|-----------|--------------|
| OpenRouter | Yes | **Primary** |
| OpenAI | Yes | Yes |
| Anthropic | Yes | Yes |
| Google | Yes | Yes |
| Groq | **Primary** | Via OpenRouter |
| Together AI | Yes | Yes |
| Fireworks AI | - | Yes |
| AWS Bedrock | Yes | Via OpenRouter |
| Azure | Yes | Via OpenRouter |
| Ollama (local) | Yes | - |
| vLLM | Yes | - |

### Benchmark Coverage

| Category | OpenBench | Our Platform |
|----------|-----------|--------------|
| Total benchmarks | 95+ | **117+** |
| Knowledge (MMLU, etc.) | Yes | Yes |
| Math (GSM8K, AIME) | Yes | Yes |
| Coding (HumanEval, SWE-bench) | Yes | Yes |
| Reasoning (ARC, GPQA) | Yes | Yes |
| Safety | Yes | Yes |
| Multimodal | Yes | Yes |
| Custom/local evals | Yes | Yes |
| Long-context | Yes | Yes |

---

## Key Differentiators

### Where We Win

1. **Unlimited Parallelism**
   - OpenBench: Limited by individual provider rate limits
   - Ours: 500 RPS via OpenRouter, run 50+ models simultaneously

2. **Full Web Dashboard**
   - OpenBench: CLI-focused with basic `bench view` log viewer
   - Ours: Production-ready web UI with real-time streaming

3. **Multi-Provider Comparison**
   - OpenBench: Must run separately for each provider
   - Ours: `--providers openrouter,openai,together` runs in parallel

4. **Cost Visibility**
   - OpenBench: No cost estimation
   - Ours: Pre-run cost estimates, live cost tracking

5. **Retry Failed Runs**
   - OpenBench: Re-run entire benchmark
   - Ours: `bench retry <run_id>` retries only failed models

6. **Statistical Analysis**
   - OpenBench: Single runs
   - Ours: `--epochs 3` for variance analysis across repeated runs

### Where OpenBench Wins

1. **Local Model Support**
   - OpenBench: Native Ollama/vLLM integration
   - Ours: Cloud-focused (could add via OpenRouter local tunneling)

2. **HuggingFace Integration**
   - OpenBench: Direct export to HF datasets
   - Ours: JSON/CSV export (HF integration could be added)

3. **Debug Mode**
   - OpenBench: `--debug` for troubleshooting
   - Ours: Standard logging only

4. **Alpha Benchmarks**
   - OpenBench: `--alpha` flag for experimental evals
   - Ours: All benchmarks from Inspect AI stable releases

5. **Cache Management**
   - OpenBench: `bench cache` command
   - Ours: No explicit cache management

---

## Architecture Comparison

### OpenBench
```
CLI (openbench) → Inspect AI → Provider APIs
                      ↓
               Local log files → bench view
```

### Our Platform
```
CLI (bench) ────────────────→ Benchmark Service → Provider APIs
     ↑                              ↓
Web Dashboard ←─── SSE Stream ←────┘
     ↓
Results Page (JSON/CSV export)
```

---

## Model Coverage Comparison

### OpenBench Default Models
Limited to what each provider offers natively.

### Our Platform (35+ models, expandable)
```
OpenAI:      gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, o1-preview, o1-mini
Anthropic:   claude-3.5-sonnet, claude-3-opus, claude-3-sonnet, claude-3-haiku
Google:      gemini-pro-1.5, gemini-flash-1.5, gemini-2.0-flash-exp
Meta Llama:  llama-3.1-405b, llama-3.1-70b, llama-3.1-8b, llama-3.2-90b-vision, llama-3.2-11b-vision
Mistral:     mistral-large, mistral-medium, mixtral-8x22b, mixtral-8x7b, codestral
Qwen:        qwen-2.5-72b, qwen-2.5-coder-32b, qwq-32b-preview
DeepSeek:    deepseek-chat, deepseek-coder
Cohere:      command-r-plus, command-r
Other:       perplexity/sonar, x-ai/grok-beta, databricks/dbrx
```

Plus 200+ more via OpenRouter API.

---

## Usage Comparison

### Running MMLU on 5 Models

**OpenBench:**
```bash
# Must run sequentially or with limited parallelism
bench eval mmlu --model groq/llama-3.3-70b-versatile --limit 100
bench eval mmlu --model openai/gpt-4o --limit 100
bench eval mmlu --model anthropic/claude-3.5-sonnet --limit 100
# ... repeat for each model
```

**Our Platform:**
```bash
# All 5 models run simultaneously
bench run mmlu --models llama-3.1-70b,gpt-4o,claude-3.5-sonnet,gemini-pro-1.5,mistral-large --limit 100
```

### Comparing Providers

**OpenBench:**
```bash
# Manual comparison, run each separately
bench eval mmlu --model groq/llama-3.3-70b-versatile --limit 100
bench eval mmlu --model openrouter/meta-llama/llama-3.3-70b-instruct --limit 100
# Compare logs manually
```

**Our Platform:**
```bash
# Single command, parallel execution, formatted comparison table
bench run mmlu --model llama-3.1-70b --providers groq,openrouter,together --limit 100
```

---

## Conclusion

| Use Case | Better Choice |
|----------|---------------|
| Quick single-model eval | Either |
| Large-scale model comparison | **Our Platform** |
| Provider latency comparison | **Our Platform** |
| Local model testing | OpenBench |
| Production dashboarding | **Our Platform** |
| HuggingFace publishing | OpenBench |
| Cost-conscious evaluation | **Our Platform** |
| Statistical significance testing | **Our Platform** |

**Bottom Line:** Our platform is optimized for OpenRouter's strengths (high throughput, many models, unified API) while OpenBench is optimized for Groq's strengths (low latency, local models). For enterprise evaluation workflows requiring parallel execution, cost tracking, and a web interface, our platform provides significant advantages.

---

## Sources

- [OpenBench GitHub Repository](https://github.com/groq/openbench)
- [OpenBench Official Site](https://openbench.dev)
- [Groq Blog: OpenBench Announcement](https://groq.com/blog/openbench-open-reproducible-evals)
