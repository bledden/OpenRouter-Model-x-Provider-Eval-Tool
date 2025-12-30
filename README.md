# OpenRouter Eval Dashboard

A comprehensive evaluation platform for comparing LLM models across 90+ benchmarks. Built with Next.js, FastAPI, and Inspect AI.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start (Docker)](#quick-start-docker)
- [Local Development Setup](#local-development-setup)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

## Features

- **90+ Benchmarks**: MMLU, HumanEval, GPQA, MATH, ARC, HellaSwag, and more
- **Real-time Streaming**: Live progress updates during evaluations
- **Model Comparison**: Compare multiple models head-to-head
- **Provider Evaluation**: Test different inference providers for the same model
- **Reasoning Model Support**: Special handling for o1, o3, o4-mini, and GPT-4.x/5.x models
- **Export Results**: Download results as CSV, JSON, Markdown, or TXT
- **Cost Estimation**: Track estimated costs per evaluation

## Prerequisites

- **Node.js 18+** for the dashboard
- **Python 3.11+** for the benchmark service (3.12 recommended)
- **Docker and Docker Compose** (recommended)
- **OpenRouter API Key** from [openrouter.ai/keys](https://openrouter.ai/keys)

## Quick Start (Docker)

The fastest way to get running:

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd eval-dashboard

# 2. Set up environment variables
cp .env.example .env

# 3. Add your OpenRouter API key to .env
# Edit .env and set: OPENROUTER_API_KEY=sk-or-v1-your-key-here

# 4. Start all services
docker compose up

# 5. Open the dashboard at http://localhost:3000
```

The Docker setup includes:
- **Dashboard** at http://localhost:3000
- **Benchmark API** at http://localhost:8000
- **PostgreSQL** database for result storage

## Local Development Setup

For development with hot-reload, follow these steps:

### Step 1: Clone the Repository

```bash
git clone <your-repo-url>
cd eval-dashboard
```

### Step 2: Set Up the Benchmark Service (Backend)

```bash
cd benchmark-service

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install inspect-evals (contains 90+ pre-built benchmarks)
pip install inspect-evals

# Copy environment template
cp .env.example .env
```

### Step 3: Configure API Keys

Edit `benchmark-service/.env` and add your API key:

```bash
# Required
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Optional: For direct provider access
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

### Step 4: Start the Backend

With the virtual environment activated:

```bash
cd benchmark-service
source .venv/bin/activate  # If not already activated

# Option A: Use the start script
./start.sh

# Option B: Start manually
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Verify it's running:
```bash
curl http://localhost:8000/health
# Should return: {"status":"healthy",...}
```

### Step 5: Set Up the Dashboard (Frontend)

Open a new terminal:

```bash
cd dashboard

# Install Node.js dependencies
npm install

# Copy environment template
cp .env.example .env
```

Edit `dashboard/.env`:

```bash
# Points to your local benchmark service
NEXT_PUBLIC_EVAL_SERVICE_URL=http://localhost:8000

# Required for OpenRouter API calls
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

### Step 6: Start the Dashboard

```bash
cd dashboard
npm run dev
```

Open http://localhost:3000 in your browser.

### Step 7: (Optional) Docker Backend with Local Frontend

If you prefer Docker for the backend but want hot-reload on the frontend:

```bash
# Terminal 1: Start backend services with Docker
docker compose up benchmark-service postgres

# Terminal 2: Run frontend locally
cd dashboard
npm run dev
```

## Configuration

### Environment Variables

Create a `.env` file in the project root (for Docker) or in each service directory (for local development):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | Yes | - | Your OpenRouter API key |
| `NEXT_PUBLIC_EVAL_SERVICE_URL` | No | `http://localhost:8000` | Backend API URL |
| `POSTGRES_USER` | No | `eval` | Database username |
| `POSTGRES_PASSWORD` | No | `evalpass` | Database password |
| `POSTGRES_DB` | No | `eval_db` | Database name |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Allowed CORS origins |

### Optional Direct Provider Keys

For direct API access (bypassing OpenRouter):

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
TOGETHER_API_KEY=...
FIREWORKS_API_KEY=...
```

## Usage

### Running an Evaluation

1. Navigate to **Models** or **Matrix View** in the sidebar
2. Select a model (e.g., `gpt-4o`, `claude-3-5-sonnet`)
3. Choose a benchmark (e.g., `MMLU`, `HumanEval`)
4. Set the sample size (number of questions to run)
5. Click **Start Eval**

### Matrix Evaluation

Compare multiple models across multiple benchmarks:

1. Go to **Matrix View**
2. Select multiple models
3. Select one or more benchmarks
4. Click **Run Matrix Evaluation**
5. View results in the comparison grid

### Exporting Results

After an evaluation completes, use the export buttons to download:
- **CSV**: Spreadsheet format
- **JSON**: Raw data
- **Markdown**: Documentation format
- **TXT**: Plain text report

## API Reference

### Benchmark Service (port 8000)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/benchmarks` | GET | List all 90+ benchmarks |
| `/providers` | GET | List available providers |
| `/run` | POST | Run evaluation (blocking) |
| `/run/stream` | POST | Run evaluation with SSE streaming |

### Dashboard API (port 3000)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/models` | GET | Fetch models from OpenRouter |
| `/api/providers` | GET | Get providers for a model |
| `/api/benchmarks` | GET | List configured benchmarks |
| `/api/eval/stream` | GET | Stream evaluation results |

### Example API Call

```bash
curl -X POST http://localhost:8000/run/stream \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o",
    "benchmark": "mmlu",
    "limit": 10,
    "provider": "openrouter"
  }'
```

## Project Structure

```
eval-dashboard/
├── benchmark-service/     # Python FastAPI backend
│   ├── main.py           # FastAPI app entry point
│   ├── inspect_runner.py # Inspect AI evaluation runner
│   ├── requirements.txt  # Python dependencies
│   └── Dockerfile
├── dashboard/            # Next.js frontend
│   ├── src/
│   │   ├── app/         # Next.js app router pages
│   │   ├── components/  # React components
│   │   ├── hooks/       # Custom React hooks
│   │   └── lib/         # Utilities and configs
│   └── package.json
├── provider-eval/        # CLI alternative (incomplete)
├── database/            # SQL migrations
├── docker-compose.yml   # Full stack deployment
└── .env.example         # Environment template
```

## CLI Alternative (provider-eval)

The `provider-eval/` directory contains an incomplete TypeScript CLI tool intended as an alternative to the web dashboard. It provides a lightweight way to run evaluations from the command line without the full stack.

**Status**: Incomplete

The CLI currently supports basic MMLU evaluations but lacks:
- Full benchmark support (only MMLU implemented)
- Streaming output
- Result persistence
- Multi-provider comparison

If you're interested in contributing, explore the source in `provider-eval/src/`.

## Troubleshooting

### Backend won't start

```bash
# Check if port 8000 is in use
lsof -i :8000

# Try a different port
uvicorn main:app --port 8001
```

### "API key not configured" error

Make sure `OPENROUTER_API_KEY` is set in your `.env` file and the file is in the correct directory:
- For Docker: `.env` in the project root
- For local development: `.env` in both `benchmark-service/` and `dashboard/`

### Evaluation times out

Reasoning models (o1, o3, o4-mini, GPT-4.x/5.x) take longer. The timeout automatically extends for these models, but you can also:
- Reduce the sample size
- Use a faster model for testing

### Docker containers won't start

```bash
# Check logs
docker compose logs

# Rebuild containers
docker compose build --no-cache

# Clean up and restart
docker compose down -v
docker compose up
```

### Frontend can't connect to backend

1. Verify the backend is running: `curl http://localhost:8000/health`
2. Check `NEXT_PUBLIC_EVAL_SERVICE_URL` in `dashboard/.env`
3. If using Docker, the dashboard connects to `http://benchmark-service:8000` internally

## Testing Status

This platform is under active development.

**Tested:**
- Basic evaluation flow with small sample sizes (10-50 questions)
- Streaming results display
- Model and benchmark selection UI
- Export functionality (CSV, JSON, Markdown, TXT)
- Provider switching
- Reasoning models (o1, o3, GPT-5.x) with answer parsing via OpenRouter

**Not yet fully tested:**
- Full evaluations (100+ questions) across all 90+ benchmarks
- All model/provider combinations via OpenRouter
- Direct provider integrations (Anthropic, Google, Together, Fireworks)
- Matrix evaluation with multiple models simultaneously
- Database persistence of results across sessions
- Production deployment at scale

**Known Limitations:**
- Latency measurements may show 0ms for providers that don't report timing
- Some benchmarks require specific model capabilities (code execution, vision)

## Benchmark Dependencies

Most benchmarks (75+) work out of the box. Some specialized benchmarks require additional setup:

| Benchmark | Requirements | Install Command |
|-----------|-------------|-----------------|
| SWE-bench | Docker, Python 3.11+, 100GB+ disk | `pip install inspect-evals[swe_bench]` |
| MLE-bench | Python 3.11+ | `pip install inspect-evals[mle_bench]` |
| GAIA | Playwright + browsers | `pip install inspect-evals[gaia] && playwright install` |
| Cybench, CTF | Docker, 32-65GB+ disk | Docker must be running |
| OSWorld | Docker | Docker must be running |
| SciKnowEval | Python 3.10-3.12 | `pip install gensim` |

The API displays helpful error messages with install instructions if you run a benchmark with missing dependencies.

## Reasoning Model Support

- **OpenAI via OpenRouter** (o1, o3, GPT-5.x): Automatically sets `reasoning_effort=none` for parseable responses
- **OpenAI Direct API**: Full reasoning support with configurable `reasoning_effort`
- **Anthropic** (Claude 3.7+, Claude 4): Extended thinking with accessible summaries
- **DeepSeek** (R1 series): Reasoning content in `reasoning_content` field
- **Google** (Gemini 2.5+, Gemini 3): Thinking models with configurable `thinkingLevel`
- **Microsoft** (Phi-4-reasoning): Reasoning models supported

Contributions and testing feedback are welcome.

## Tech Stack

- **Frontend**: Next.js 15, React 19, TailwindCSS, Recharts
- **Backend**: FastAPI, Inspect AI, Python 3.12+
- **Database**: PostgreSQL 16
- **Deployment**: Docker Compose

## License

MIT
