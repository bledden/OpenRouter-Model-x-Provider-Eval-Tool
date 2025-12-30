#!/bin/bash

# Benchmark Service Startup Script

set -e

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Install inspect-evals for pre-built benchmarks (117+ benchmarks)
echo "Installing inspect-evals..."
pip install inspect-evals || echo "Warning: Could not install inspect-evals"

# Install package in development mode (enables 'bench' CLI)
echo "Installing benchmark-service CLI..."
pip install -e .

# Check for .env file
if [ ! -f ".env" ]; then
    echo "Warning: No .env file found. Copy .env.example to .env and add your OPENROUTER_API_KEY"
    cp .env.example .env
fi

echo ""
echo "============================================"
echo "  Benchmark Service - Better than OpenBench"
echo "============================================"
echo ""
echo "CLI Commands:"
echo "  bench list                    - List 117 benchmarks"
echo "  bench run mmlu --model X      - Run benchmark"
echo "  bench compare mmlu --models X,Y,Z  - Compare models"
echo "  bench cost mmlu --model X     - Estimate cost"
echo ""
echo "Starting server on http://localhost:8000"
echo "API docs: http://localhost:8000/docs"
echo ""
python main.py
