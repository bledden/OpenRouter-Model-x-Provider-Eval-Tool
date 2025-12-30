#!/usr/bin/env python3
"""
Benchmark CLI - A better alternative to OpenBench

Usage:
    bench run mmlu --model openai/gpt-4o --limit 10
    bench run mmlu --models gpt-4o,claude-3-opus,llama-3 --parallel
    bench run mmlu --model gpt-4o --epochs 3 --seed 42
    bench run mmlu --model gpt-4o --provider openai          # Direct OpenAI
    bench run mmlu --model gpt-4o --providers openrouter,openai  # Compare providers
    bench list [--category coding]
    bench describe mmlu
    bench providers                                           # List available providers
    bench cost mmlu --model openai/gpt-4o --limit 100
    bench compare mmlu --models gpt-4o,claude-3-opus
    bench retry <run_id>
    bench view [run_id]
    bench history
"""

import os
import sys
import json
import asyncio
import argparse
import time
import random
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path
import httpx
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich.live import Live
from rich.panel import Panel
from rich.layout import Layout
from rich.markdown import Markdown
from rich import box
from dotenv import load_dotenv

load_dotenv()

console = Console()
BENCHMARK_SERVICE_URL = os.getenv("BENCHMARK_SERVICE_URL", "http://localhost:8000")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
RESULTS_DIR = Path("./benchmark_results")
RESULTS_DIR.mkdir(exist_ok=True)

# Pricing per 1M tokens (approximate, fetched dynamically when possible)
MODEL_PRICING = {
    "openai/gpt-4o": {"input": 2.50, "output": 10.00},
    "openai/gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "openai/gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "anthropic/claude-3-opus": {"input": 15.00, "output": 75.00},
    "anthropic/claude-3-sonnet": {"input": 3.00, "output": 15.00},
    "anthropic/claude-3-haiku": {"input": 0.25, "output": 1.25},
    "anthropic/claude-3.5-sonnet": {"input": 3.00, "output": 15.00},
    "google/gemini-pro-1.5": {"input": 2.50, "output": 10.00},
    "meta-llama/llama-3-70b-instruct": {"input": 0.80, "output": 0.80},
    "meta-llama/llama-3.1-405b-instruct": {"input": 3.00, "output": 3.00},
    "mistralai/mistral-large": {"input": 3.00, "output": 9.00},
}

# Average tokens per question for each benchmark type
BENCHMARK_TOKENS = {
    "mmlu": {"input": 150, "output": 50},
    "gsm8k": {"input": 200, "output": 150},
    "humaneval": {"input": 300, "output": 500},
    "gpqa": {"input": 400, "output": 100},
    "arc": {"input": 100, "output": 30},
    "hellaswag": {"input": 200, "output": 30},
    "truthfulqa": {"input": 150, "output": 50},
    "swe_bench": {"input": 2000, "output": 1000},
    "default": {"input": 200, "output": 100},
}


def estimate_cost(model: str, benchmark: str, limit: int) -> Dict[str, float]:
    """Estimate the cost of running a benchmark."""
    pricing = MODEL_PRICING.get(model, {"input": 1.00, "output": 2.00})
    tokens = BENCHMARK_TOKENS.get(benchmark, BENCHMARK_TOKENS["default"])

    total_input_tokens = tokens["input"] * limit
    total_output_tokens = tokens["output"] * limit

    input_cost = (total_input_tokens / 1_000_000) * pricing["input"]
    output_cost = (total_output_tokens / 1_000_000) * pricing["output"]

    return {
        "input_tokens": total_input_tokens,
        "output_tokens": total_output_tokens,
        "input_cost": input_cost,
        "output_cost": output_cost,
        "total_cost": input_cost + output_cost,
    }


async def fetch_benchmarks(category: Optional[str] = None) -> List[Dict]:
    """Fetch available benchmarks from the service."""
    async with httpx.AsyncClient() as client:
        params = {"category": category} if category else {}
        response = await client.get(f"{BENCHMARK_SERVICE_URL}/benchmarks", params=params)
        if response.status_code == 200:
            return response.json()["benchmarks"]
        else:
            console.print(f"[red]Error fetching benchmarks: {response.status_code}[/red]")
            return []


async def fetch_providers() -> List[Dict]:
    """Fetch available providers from the service."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BENCHMARK_SERVICE_URL}/providers")
        if response.status_code == 200:
            return response.json()["providers"]
        else:
            console.print(f"[red]Error fetching providers: {response.status_code}[/red]")
            return []


def cmd_providers(args):
    """List available providers."""
    providers = asyncio.run(fetch_providers())

    if not providers:
        # Fallback to local provider list if service is down
        console.print("[yellow]Could not fetch from service, showing local config[/yellow]\n")
        providers = [
            {"id": "openrouter", "name": "OpenRouter", "description": "Unified access to 200+ models", "configured": bool(os.getenv("OPENROUTER_API_KEY"))},
            {"id": "openai", "name": "OpenAI", "description": "Direct OpenAI API", "configured": bool(os.getenv("OPENAI_API_KEY"))},
            {"id": "anthropic", "name": "Anthropic", "description": "Direct Anthropic API", "configured": bool(os.getenv("ANTHROPIC_API_KEY"))},
            {"id": "google", "name": "Google AI", "description": "Direct Google AI (Gemini)", "configured": bool(os.getenv("GOOGLE_API_KEY"))},
            {"id": "together", "name": "Together AI", "description": "Fast open-source inference", "configured": bool(os.getenv("TOGETHER_API_KEY"))},
            {"id": "fireworks", "name": "Fireworks AI", "description": "Fast model inference", "configured": bool(os.getenv("FIREWORKS_API_KEY"))},
        ]

    table = Table(title="Available Providers", box=box.ROUNDED)
    table.add_column("Provider", style="cyan")
    table.add_column("Name", style="white")
    table.add_column("Status", justify="center")
    table.add_column("Description")

    for p in providers:
        status = "[green]Configured[/green]" if p.get("configured") else "[red]Not configured[/red]"
        table.add_row(p["id"], p["name"], status, p.get("description", ""))

    console.print(table)

    configured_count = sum(1 for p in providers if p.get("configured"))
    console.print(f"\n[dim]{configured_count}/{len(providers)} providers configured[/dim]")

    if configured_count < len(providers):
        console.print("\n[dim]To configure a provider, set its API key in .env:[/dim]")
        console.print("[dim]  OPENROUTER_API_KEY=sk-...[/dim]")
        console.print("[dim]  OPENAI_API_KEY=sk-...[/dim]")
        console.print("[dim]  ANTHROPIC_API_KEY=sk-ant-...[/dim]")


async def run_single_benchmark(
    model: str,
    benchmark: str,
    limit: int,
    progress: Progress,
    task_id: int,
    provider: str = "openrouter",
) -> Dict[str, Any]:
    """Run a single benchmark and return results."""
    results = {
        "model": model,
        "benchmark": benchmark,
        "provider": provider,
        "limit": limit,
        "status": "running",
        "score": 0,
        "correct": 0,
        "total": 0,
        "duration_seconds": 0,
        "started_at": datetime.now().isoformat(),
    }

    try:
        async with httpx.AsyncClient(timeout=600) as client:
            async with client.stream(
                "POST",
                f"{BENCHMARK_SERVICE_URL}/run/stream",
                json={"model": model, "benchmark": benchmark, "limit": limit, "provider": provider},
            ) as response:
                if response.status_code != 200:
                    results["status"] = "error"
                    results["error"] = f"HTTP {response.status_code}"
                    return results

                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        try:
                            data = json.loads(line[6:])

                            if data.get("type") == "progress":
                                progress.update(task_id, description=f"[cyan]{model}[/cyan]: {data.get('message', 'Running...')}")

                            elif data.get("type") == "result":
                                q_num = data.get("question", 0)
                                total = data.get("total", limit)
                                running_score = data.get("running_score", 0)
                                progress.update(
                                    task_id,
                                    completed=q_num,
                                    total=total,
                                    description=f"[cyan]{model}[/cyan]: {running_score*100:.1f}%"
                                )

                            elif data.get("type") == "complete":
                                results["status"] = "complete"
                                results["score"] = data.get("score", 0)
                                results["correct"] = data.get("correct", 0)
                                results["total"] = data.get("total", limit)
                                results["duration_seconds"] = data.get("duration_seconds", 0)
                                results["completed_at"] = datetime.now().isoformat()
                                progress.update(task_id, completed=results["total"], total=results["total"])

                            elif data.get("type") == "error":
                                results["status"] = "error"
                                results["error"] = data.get("error", "Unknown error")

                        except json.JSONDecodeError:
                            pass

    except Exception as e:
        results["status"] = "error"
        results["error"] = str(e)

    return results


async def run_parallel_benchmarks(
    models: List[str],
    benchmark: str,
    limit: int,
    provider: str = "openrouter",
) -> List[Dict[str, Any]]:
    """Run benchmarks for multiple models in parallel - NO LIMIT on concurrency!"""

    console.print(f"[bold green]Running {len(models)} models in parallel via {provider}[/bold green] (500 RPS available)\n")

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
    ) as progress:
        tasks = {}
        for model in models:
            task_id = progress.add_task(f"[cyan]{model}[/cyan]: Starting...", total=limit)
            tasks[model] = task_id

        # Run ALL models in parallel - no artificial limits!
        coroutines = [
            run_single_benchmark(model, benchmark, limit, progress, tasks[model], provider)
            for model in models
        ]
        results = await asyncio.gather(*coroutines)

    return results


async def run_parallel_providers(
    model: str,
    benchmark: str,
    limit: int,
    providers: List[str],
) -> List[Dict[str, Any]]:
    """Run the same model across multiple providers in parallel to compare."""

    console.print(f"[bold green]Running {model} across {len(providers)} providers in parallel[/bold green]\n")

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
    ) as progress:
        tasks = {}
        for provider in providers:
            task_id = progress.add_task(f"[cyan]{provider}[/cyan]: Starting...", total=limit)
            tasks[provider] = task_id

        # Run same model across all providers in parallel
        coroutines = [
            run_single_benchmark(model, benchmark, limit, progress, tasks[provider], provider)
            for provider in providers
        ]
        results = await asyncio.gather(*coroutines)

    return results


def display_comparison_table(results: List[Dict[str, Any]], benchmark: str):
    """Display a comparison table of results."""
    table = Table(
        title=f"[bold]Benchmark Results: {benchmark.upper()}[/bold]",
        box=box.ROUNDED,
        show_header=True,
        header_style="bold magenta",
    )

    table.add_column("Rank", style="dim", width=4)
    table.add_column("Model", style="cyan", min_width=30)
    table.add_column("Score", justify="right", style="green")
    table.add_column("Correct", justify="right")
    table.add_column("Duration", justify="right")
    table.add_column("Status", justify="center")

    # Sort by score descending
    sorted_results = sorted(results, key=lambda x: x.get("score", 0), reverse=True)

    for i, result in enumerate(sorted_results, 1):
        score = result.get("score", 0)
        score_str = f"{score*100:.1f}%"

        # Color based on score
        if score >= 0.8:
            score_str = f"[green]{score_str}[/green]"
        elif score >= 0.6:
            score_str = f"[yellow]{score_str}[/yellow]"
        else:
            score_str = f"[red]{score_str}[/red]"

        status = result.get("status", "unknown")
        status_icon = "✓" if status == "complete" else "✗" if status == "error" else "?"
        status_color = "green" if status == "complete" else "red" if status == "error" else "yellow"

        duration = result.get("duration_seconds", 0)
        duration_str = f"{duration:.1f}s" if duration else "-"

        table.add_row(
            str(i),
            result.get("model", "Unknown"),
            score_str,
            f"{result.get('correct', 0)}/{result.get('total', 0)}",
            duration_str,
            f"[{status_color}]{status_icon}[/{status_color}]",
        )

    console.print(table)


def display_leaderboard(results: List[Dict[str, Any]], benchmark: str):
    """Display a fancy leaderboard with medals."""
    console.print()

    sorted_results = sorted(results, key=lambda x: x.get("score", 0), reverse=True)

    medals = ["🥇", "🥈", "🥉"]

    for i, result in enumerate(sorted_results[:3]):
        medal = medals[i] if i < 3 else "  "
        score = result.get("score", 0) * 100
        model = result.get("model", "Unknown")
        console.print(f"  {medal} [bold]{model}[/bold]: [green]{score:.1f}%[/green]")

    console.print()


def save_results(results: List[Dict[str, Any]], benchmark: str) -> str:
    """Save results to a JSON file."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{benchmark}_{timestamp}.json"
    filepath = RESULTS_DIR / filename

    run_data = {
        "benchmark": benchmark,
        "timestamp": datetime.now().isoformat(),
        "results": results,
        "summary": {
            "total_models": len(results),
            "successful": sum(1 for r in results if r.get("status") == "complete"),
            "best_score": max((r.get("score", 0) for r in results), default=0),
            "best_model": max(results, key=lambda x: x.get("score", 0)).get("model") if results else None,
        }
    }

    with open(filepath, "w") as f:
        json.dump(run_data, f, indent=2)

    return str(filepath)


def save_results_with_metadata(
    results: List[Dict[str, Any]],
    benchmark: str,
    seed: Optional[int],
    epochs: int,
    all_epoch_results: List[Dict[str, Any]]
) -> str:
    """Save results to a JSON file with seed and epochs metadata."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{benchmark}_{timestamp}.json"
    filepath = RESULTS_DIR / filename

    run_data = {
        "benchmark": benchmark,
        "timestamp": datetime.now().isoformat(),
        "seed": seed,
        "epochs": epochs,
        "results": results,
        "all_epoch_results": all_epoch_results if epochs > 1 else None,
        "summary": {
            "total_models": len(results),
            "successful": sum(1 for r in results if r.get("status") == "complete"),
            "best_score": max((r.get("score", 0) for r in results), default=0),
            "best_model": max(results, key=lambda x: x.get("score", 0)).get("model") if results else None,
        }
    }

    # Remove None values
    run_data = {k: v for k, v in run_data.items() if v is not None}

    with open(filepath, "w") as f:
        json.dump(run_data, f, indent=2)

    return str(filepath)


async def fetch_benchmark_details(benchmark_id: str) -> Optional[Dict]:
    """Fetch detailed info about a specific benchmark."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BENCHMARK_SERVICE_URL}/benchmarks/{benchmark_id}")
        if response.status_code == 200:
            return response.json()
        return None


def cmd_describe(args):
    """Show detailed information about a benchmark."""
    benchmark_id = args.benchmark

    # First try to fetch from service
    details = asyncio.run(fetch_benchmark_details(benchmark_id))

    if details:
        # Display from service response
        console.print(Panel(
            f"[bold cyan]{details.get('name', benchmark_id.upper())}[/bold cyan]\n\n"
            f"[bold]ID:[/bold] {details.get('id', benchmark_id)}\n"
            f"[bold]Category:[/bold] {details.get('category', 'unknown')}\n"
            f"[bold]Description:[/bold] {details.get('description', 'No description available')}\n\n"
            f"[bold]Estimated tokens per sample:[/bold]\n"
            f"  Input: ~{BENCHMARK_TOKENS.get(benchmark_id, BENCHMARK_TOKENS['default'])['input']} tokens\n"
            f"  Output: ~{BENCHMARK_TOKENS.get(benchmark_id, BENCHMARK_TOKENS['default'])['output']} tokens\n",
            title=f"Benchmark: {benchmark_id}",
            border_style="cyan"
        ))
    else:
        # Fallback to local info
        tokens = BENCHMARK_TOKENS.get(benchmark_id, BENCHMARK_TOKENS["default"])
        console.print(Panel(
            f"[bold cyan]{benchmark_id.upper()}[/bold cyan]\n\n"
            f"[bold]ID:[/bold] {benchmark_id}\n"
            f"[bold]Inspect Task:[/bold] inspect_evals/{benchmark_id}\n\n"
            f"[bold]Estimated tokens per sample:[/bold]\n"
            f"  Input: ~{tokens['input']} tokens\n"
            f"  Output: ~{tokens['output']} tokens\n\n"
            f"[dim]Run 'bench list' to see all available benchmarks[/dim]",
            title=f"Benchmark: {benchmark_id}",
            border_style="cyan"
        ))

    # Show cost estimate for common models
    console.print("\n[bold]Cost Estimates (10 samples):[/bold]")
    table = Table(box=box.SIMPLE)
    table.add_column("Model", style="cyan")
    table.add_column("Est. Cost", justify="right", style="green")

    common_models = [
        "openai/gpt-4o",
        "anthropic/claude-3.5-sonnet",
        "google/gemini-pro-1.5",
        "meta-llama/llama-3.1-405b-instruct",
    ]
    for model in common_models:
        est = estimate_cost(model, benchmark_id, 10)
        table.add_row(model, f"${est['total_cost']:.4f}")

    console.print(table)


def cmd_retry(args):
    """Retry/resume a failed or partial benchmark run."""
    run_id = args.run_id
    filepath = RESULTS_DIR / f"{run_id}.json"

    if not filepath.exists():
        console.print(f"[red]Error: Run '{run_id}' not found[/red]")
        console.print(f"[dim]Run 'bench history' to see available runs[/dim]")
        return

    with open(filepath) as f:
        data = json.load(f)

    benchmark = data.get("benchmark")
    results = data.get("results", [])

    # Find failed or incomplete models
    failed_models = [r["model"] for r in results if r.get("status") != "complete"]
    successful_models = [r["model"] for r in results if r.get("status") == "complete"]

    if not failed_models:
        console.print(f"[green]All models completed successfully in run '{run_id}'[/green]")
        display_comparison_table(results, benchmark)
        return

    console.print(f"\n[bold]Retrying run: {run_id}[/bold]")
    console.print(f"[yellow]Found {len(failed_models)} failed/incomplete model(s):[/yellow]")
    for model in failed_models:
        console.print(f"  - {model}")

    console.print(f"\n[green]Keeping {len(successful_models)} successful result(s)[/green]")

    # Get limit from original run
    limit = results[0].get("limit", 10) if results else 10

    if not args.yes:
        confirm = console.input("\n[yellow]Retry failed models? [Y/n]: [/yellow]")
        if confirm.lower() == "n":
            console.print("[dim]Aborted.[/dim]")
            return

    # Run only the failed models
    start_time = time.time()
    new_results = asyncio.run(run_parallel_benchmarks(failed_models, benchmark, limit))
    total_time = time.time() - start_time

    # Merge with successful results from original run
    successful_results = [r for r in results if r.get("status") == "complete"]
    combined_results = successful_results + new_results

    # Display combined results
    console.print()
    display_leaderboard(combined_results, benchmark)
    display_comparison_table(combined_results, benchmark)

    # Save updated results (overwrite original)
    data["results"] = combined_results
    data["summary"] = {
        "total_models": len(combined_results),
        "successful": sum(1 for r in combined_results if r.get("status") == "complete"),
        "best_score": max((r.get("score", 0) for r in combined_results), default=0),
        "best_model": max(combined_results, key=lambda x: x.get("score", 0)).get("model") if combined_results else None,
    }
    data["retry_timestamp"] = datetime.now().isoformat()

    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)

    console.print(f"\n[dim]Updated results saved to: {filepath}[/dim]")
    console.print(f"[dim]Retry took: {total_time:.1f}s[/dim]")


def cmd_list(args):
    """List available benchmarks."""
    benchmarks = asyncio.run(fetch_benchmarks(args.category))

    if not benchmarks:
        console.print("[yellow]No benchmarks found. Is the benchmark service running?[/yellow]")
        console.print("[dim]Start it with: cd benchmark-service && python main.py[/dim]")
        return

    # Group by category
    by_category = {}
    for b in benchmarks:
        cat = b.get("category", "other")
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(b)

    console.print(f"\n[bold]Available Benchmarks: {len(benchmarks)} total[/bold]\n")

    for category, items in sorted(by_category.items()):
        table = Table(title=f"[bold]{category.upper()}[/bold] ({len(items)})", box=box.SIMPLE)
        table.add_column("ID", style="cyan", min_width=20)
        table.add_column("Name", style="green")
        table.add_column("Description")

        for b in sorted(items, key=lambda x: x["id"]):
            table.add_row(b["id"], b["name"], b.get("description", "")[:50])

        console.print(table)
        console.print()


def cmd_cost(args):
    """Estimate the cost of running a benchmark."""
    models = [m.strip() for m in args.models.split(",")] if args.models else [args.model] if args.model else []

    if not models:
        console.print("[red]Error: Specify --model or --models[/red]")
        return

    table = Table(title=f"[bold]Cost Estimate: {args.benchmark.upper()} ({args.limit} samples)[/bold]", box=box.ROUNDED)
    table.add_column("Model", style="cyan")
    table.add_column("Input Tokens", justify="right")
    table.add_column("Output Tokens", justify="right")
    table.add_column("Estimated Cost", justify="right", style="green")

    total_cost = 0
    for model in models:
        estimate = estimate_cost(model, args.benchmark, args.limit)
        total_cost += estimate["total_cost"]

        table.add_row(
            model,
            f"{estimate['input_tokens']:,}",
            f"{estimate['output_tokens']:,}",
            f"${estimate['total_cost']:.4f}",
        )

    if len(models) > 1:
        table.add_row("", "", "[bold]TOTAL[/bold]", f"[bold]${total_cost:.4f}[/bold]")

    console.print(table)
    console.print(f"\n[dim]Note: Estimates are approximate. Actual costs may vary.[/dim]")


def cmd_run(args):
    """Run a benchmark."""
    models = [m.strip() for m in args.models.split(",")] if args.models else [args.model] if args.model else []

    if not models:
        console.print("[red]Error: No model specified. Use --model or --models[/red]")
        return

    # Handle provider(s)
    provider = getattr(args, 'provider', 'openrouter')
    providers_arg = getattr(args, 'providers', None)

    # If --providers is specified, we're comparing the same model across multiple providers
    if providers_arg:
        providers = [p.strip() for p in providers_arg.split(",")]
        if len(models) > 1:
            console.print("[yellow]Warning: --providers compares one model across providers. Using first model only.[/yellow]")
        return cmd_run_multi_provider(args, models[0], providers)

    # Handle seed for reproducibility
    seed = getattr(args, 'seed', None)
    if seed is not None:
        random.seed(seed)
        console.print(f"[dim]Using seed: {seed} for reproducibility[/dim]")

    # Handle epochs for repeated runs
    epochs = getattr(args, 'epochs', 1) or 1

    # Calculate total cost across all epochs
    total_samples = args.limit * epochs
    total_cost = sum(estimate_cost(m, args.benchmark, total_samples)["total_cost"] for m in models)

    # Show run info
    console.print(f"\n[bold]Running {args.benchmark.upper()}[/bold] on {len(models)} model(s)")
    console.print(f"  Provider: {provider}")
    console.print(f"  Samples: {args.limit}" + (f" x {epochs} epochs = {total_samples} total" if epochs > 1 else ""))
    if seed is not None:
        console.print(f"  Seed: {seed}")
    console.print(f"  [dim]Estimated cost: ${total_cost:.4f}[/dim]\n")

    if not args.yes:
        confirm = console.input("[yellow]Proceed? [Y/n]: [/yellow]")
        if confirm.lower() == "n":
            console.print("[dim]Aborted.[/dim]")
            return

    all_epoch_results = []
    start_time = time.time()

    for epoch in range(epochs):
        if epochs > 1:
            console.print(f"\n[bold cyan]Epoch {epoch + 1}/{epochs}[/bold cyan]")

        # Run benchmarks for this epoch
        epoch_results = asyncio.run(run_parallel_benchmarks(models, args.benchmark, args.limit, provider))

        # Tag results with epoch number
        for result in epoch_results:
            result["epoch"] = epoch + 1
            result["seed"] = seed

        all_epoch_results.extend(epoch_results)

        if epochs > 1:
            display_leaderboard(epoch_results, args.benchmark)

    total_time = time.time() - start_time

    # For multiple epochs, calculate aggregate statistics
    if epochs > 1:
        console.print(f"\n[bold]Aggregate Results ({epochs} epochs)[/bold]")

        # Calculate average scores per model
        model_scores = {}
        for result in all_epoch_results:
            model = result.get("model")
            if model not in model_scores:
                model_scores[model] = []
            model_scores[model].append(result.get("score", 0))

        # Create aggregated results
        aggregated_results = []
        for model, scores in model_scores.items():
            avg_score = sum(scores) / len(scores)
            min_score = min(scores)
            max_score = max(scores)
            aggregated_results.append({
                "model": model,
                "score": avg_score,
                "min_score": min_score,
                "max_score": max_score,
                "epochs": len(scores),
                "correct": int(avg_score * args.limit),
                "total": args.limit,
                "status": "complete",
            })

        display_leaderboard(aggregated_results, args.benchmark)
        display_comparison_table(aggregated_results, args.benchmark)

        # Show variance info
        console.print("\n[bold]Score Variance:[/bold]")
        table = Table(box=box.SIMPLE)
        table.add_column("Model", style="cyan")
        table.add_column("Avg", justify="right", style="green")
        table.add_column("Min", justify="right")
        table.add_column("Max", justify="right")
        table.add_column("Range", justify="right", style="yellow")

        for r in sorted(aggregated_results, key=lambda x: x["score"], reverse=True):
            range_val = r["max_score"] - r["min_score"]
            table.add_row(
                r["model"],
                f"{r['score']*100:.1f}%",
                f"{r['min_score']*100:.1f}%",
                f"{r['max_score']*100:.1f}%",
                f"{range_val*100:.1f}%"
            )
        console.print(table)

        results_to_save = aggregated_results
    else:
        # Single epoch - display and save as before
        console.print()
        display_leaderboard(all_epoch_results, args.benchmark)
        display_comparison_table(all_epoch_results, args.benchmark)
        results_to_save = all_epoch_results

    # Save results
    filepath = save_results_with_metadata(results_to_save, args.benchmark, seed, epochs, all_epoch_results)
    console.print(f"\n[dim]Results saved to: {filepath}[/dim]")
    console.print(f"[dim]Total time: {total_time:.1f}s for {len(models)} models" + (f" x {epochs} epochs" if epochs > 1 else "") + "[/dim]")


def display_provider_comparison(results: List[Dict[str, Any]], model: str, benchmark: str):
    """Display comparison of same model across different providers."""
    table = Table(
        title=f"[bold]Provider Comparison: {model} on {benchmark.upper()}[/bold]",
        box=box.ROUNDED,
        show_header=True,
        header_style="bold magenta",
    )

    table.add_column("Rank", style="dim", width=4)
    table.add_column("Provider", style="cyan", min_width=15)
    table.add_column("Score", justify="right", style="green")
    table.add_column("Correct", justify="right")
    table.add_column("Duration", justify="right")
    table.add_column("Status", justify="center")

    # Sort by score descending, then by duration ascending
    sorted_results = sorted(results, key=lambda x: (-x.get("score", 0), x.get("duration_seconds", float('inf'))))

    for i, result in enumerate(sorted_results, 1):
        score = result.get("score", 0)
        score_str = f"{score*100:.1f}%"

        if score >= 0.8:
            score_str = f"[green]{score_str}[/green]"
        elif score >= 0.6:
            score_str = f"[yellow]{score_str}[/yellow]"
        else:
            score_str = f"[red]{score_str}[/red]"

        status = result.get("status", "unknown")
        status_icon = "✓" if status == "complete" else "✗" if status == "error" else "?"
        status_color = "green" if status == "complete" else "red" if status == "error" else "yellow"

        duration = result.get("duration_seconds", 0)
        duration_str = f"{duration:.1f}s" if duration else "-"

        provider = result.get("provider", "unknown")
        table.add_row(
            str(i),
            provider,
            score_str,
            f"{result.get('correct', 0)}/{result.get('total', 0)}",
            duration_str,
            f"[{status_color}]{status_icon}[/{status_color}]",
        )

    console.print(table)

    # Show latency comparison if scores are similar
    if len(sorted_results) >= 2:
        fastest = min(sorted_results, key=lambda x: x.get("duration_seconds", float('inf')))
        slowest = max(sorted_results, key=lambda x: x.get("duration_seconds", 0))
        if fastest.get("duration_seconds") and slowest.get("duration_seconds"):
            speedup = slowest["duration_seconds"] / fastest["duration_seconds"]
            console.print(f"\n[dim]Fastest: {fastest['provider']} ({speedup:.1f}x faster than {slowest['provider']})[/dim]")


def cmd_run_multi_provider(args, model: str, providers: List[str]):
    """Run the same model across multiple providers to compare."""
    console.print(f"\n[bold]Comparing {model} across {len(providers)} providers[/bold]")
    console.print(f"  Benchmark: {args.benchmark}")
    console.print(f"  Samples: {args.limit}")
    console.print(f"  Providers: {', '.join(providers)}\n")

    if not args.yes:
        confirm = console.input("[yellow]Proceed? [Y/n]: [/yellow]")
        if confirm.lower() == "n":
            console.print("[dim]Aborted.[/dim]")
            return

    start_time = time.time()
    results = asyncio.run(run_parallel_providers(model, args.benchmark, args.limit, providers))
    total_time = time.time() - start_time

    console.print()
    display_provider_comparison(results, model, args.benchmark)

    # Save results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{args.benchmark}_provider_compare_{timestamp}.json"
    filepath = RESULTS_DIR / filename

    run_data = {
        "benchmark": args.benchmark,
        "model": model,
        "comparison_type": "provider",
        "timestamp": datetime.now().isoformat(),
        "results": results,
        "summary": {
            "total_providers": len(results),
            "successful": sum(1 for r in results if r.get("status") == "complete"),
            "best_score": max((r.get("score", 0) for r in results), default=0),
            "fastest_provider": min(results, key=lambda x: x.get("duration_seconds", float('inf'))).get("provider") if results else None,
        }
    }

    with open(filepath, "w") as f:
        json.dump(run_data, f, indent=2)

    console.print(f"\n[dim]Results saved to: {filepath}[/dim]")
    console.print(f"[dim]Total time: {total_time:.1f}s for {len(providers)} providers[/dim]")


def cmd_compare(args):
    """Compare multiple models on a benchmark."""
    models = [m.strip() for m in args.models.split(",")]

    if len(models) < 2:
        console.print("[red]Error: Need at least 2 models to compare. Use --models model1,model2,model3[/red]")
        return

    args.model = None
    cmd_run(args)


def cmd_history(args):
    """Show benchmark history."""
    results_files = sorted(RESULTS_DIR.glob("*.json"), reverse=True)

    if not results_files:
        console.print("[yellow]No benchmark history found.[/yellow]")
        return

    table = Table(title="[bold]Benchmark History[/bold]", box=box.ROUNDED)
    table.add_column("ID", style="dim")
    table.add_column("Benchmark", style="cyan")
    table.add_column("Models", style="green")
    table.add_column("Best Score", justify="right")
    table.add_column("Winner", style="yellow")
    table.add_column("Date")

    for i, filepath in enumerate(results_files[:20], 1):
        try:
            with open(filepath) as f:
                data = json.load(f)

            summary = data.get("summary", {})
            results = data.get("results", [])

            table.add_row(
                filepath.stem,
                data.get("benchmark", "?"),
                f"{summary.get('total_models', len(results))} model(s)",
                f"{summary.get('best_score', 0)*100:.1f}%",
                summary.get("best_model", "?")[:25],
                data.get("timestamp", "?")[:10],
            )
        except json.JSONDecodeError:
            console.print(f"[dim]Skipping corrupted file: {filepath.name}[/dim]")
        except PermissionError:
            console.print(f"[dim]Cannot read: {filepath.name}[/dim]")
        except Exception as e:
            console.print(f"[dim]Error reading {filepath.name}: {e}[/dim]")

    console.print(table)


def cmd_view(args):
    """View detailed results from a run."""
    if args.run_id:
        filepath = RESULTS_DIR / f"{args.run_id}.json"
    else:
        # Get most recent
        results_files = sorted(RESULTS_DIR.glob("*.json"), reverse=True)
        if not results_files:
            console.print("[yellow]No results found.[/yellow]")
            return
        filepath = results_files[0]

    if not filepath.exists():
        console.print(f"[red]Results file not found: {filepath}[/red]")
        return

    with open(filepath) as f:
        data = json.load(f)

    summary = data.get("summary", {})

    console.print(Panel(
        f"[bold]Benchmark:[/bold] {data.get('benchmark', '?').upper()}\n"
        f"[bold]Date:[/bold] {data.get('timestamp', '?')}\n"
        f"[bold]Models:[/bold] {summary.get('total_models', '?')}\n"
        f"[bold]Best Score:[/bold] {summary.get('best_score', 0)*100:.1f}%\n"
        f"[bold]Winner:[/bold] 🏆 {summary.get('best_model', '?')}",
        title="Benchmark Results",
    ))

    display_comparison_table(data.get("results", []), data.get("benchmark", ""))


def main():
    parser = argparse.ArgumentParser(
        prog="bench",
        description="Benchmark CLI - Run LLM benchmarks faster than OpenBench",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  bench list                                              List all 117 benchmarks
  bench list --category coding                            List coding benchmarks
  bench describe mmlu                                     Show benchmark details
  bench providers                                         Show available providers
  bench cost mmlu --model openai/gpt-4o                   Estimate cost
  bench run mmlu --model openai/gpt-4o                    Run single model
  bench run mmlu --models gpt-4o,claude-3-opus,llama-3    Run multiple in parallel
  bench run mmlu --model gpt-4o --seed 42                 Reproducible run with seed
  bench run mmlu --model gpt-4o --epochs 3                Run 3 times for variance
  bench compare mmlu --models gpt-4o,claude-3,gemini      Compare models
  bench retry mmlu_20241217_143022                        Retry failed models from a run
  bench history                                           Show past runs
  bench view                                              View latest results

Provider options:
  bench run mmlu --model gpt-4o --provider openai         Use OpenAI directly
  bench run mmlu --model gpt-4o --providers openrouter,openai,together
                                                          Compare same model across providers

Parallel execution:
  No limit on concurrent models! With a funded OpenRouter account,
  you can run 50+ models simultaneously at 500 RPS.

Reproducibility:
  Use --seed for deterministic question sampling across runs.
  Use --epochs for statistical significance with variance analysis.
        """
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # list
    list_parser = subparsers.add_parser("list", help="List available benchmarks")
    list_parser.add_argument("--category", "-c", help="Filter by category")

    # providers
    subparsers.add_parser("providers", help="List available providers")

    # cost
    cost_parser = subparsers.add_parser("cost", help="Estimate benchmark cost")
    cost_parser.add_argument("benchmark", help="Benchmark to estimate")
    cost_parser.add_argument("--model", "-m", help="Model to use")
    cost_parser.add_argument("--models", "-M", help="Comma-separated models")
    cost_parser.add_argument("--limit", "-l", type=int, default=10, help="Number of samples")

    # describe
    describe_parser = subparsers.add_parser("describe", help="Show benchmark details")
    describe_parser.add_argument("benchmark", help="Benchmark ID to describe")

    # run
    run_parser = subparsers.add_parser("run", help="Run a benchmark")
    run_parser.add_argument("benchmark", help="Benchmark to run")
    run_parser.add_argument("--model", "-m", help="Model to use")
    run_parser.add_argument("--models", "-M", help="Comma-separated models for parallel run")
    run_parser.add_argument("--provider", "-p", default="openrouter", help="Provider to use (openrouter, openai, anthropic, google, together, fireworks)")
    run_parser.add_argument("--providers", "-P", help="Comma-separated providers for parallel provider comparison")
    run_parser.add_argument("--limit", "-l", type=int, default=10, help="Number of samples")
    run_parser.add_argument("--seed", "-s", type=int, help="Random seed for reproducibility")
    run_parser.add_argument("--epochs", "-e", type=int, default=1, help="Number of repeated runs for variance estimation")
    run_parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation")

    # compare
    compare_parser = subparsers.add_parser("compare", help="Compare multiple models")
    compare_parser.add_argument("benchmark", help="Benchmark to run")
    compare_parser.add_argument("--models", "-M", required=True, help="Comma-separated models")
    compare_parser.add_argument("--limit", "-l", type=int, default=10, help="Number of samples")
    compare_parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation")

    # retry
    retry_parser = subparsers.add_parser("retry", help="Retry failed models from a run")
    retry_parser.add_argument("run_id", help="Run ID to retry (from history)")
    retry_parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation")

    # history
    history_parser = subparsers.add_parser("history", help="Show benchmark history")

    # view
    view_parser = subparsers.add_parser("view", help="View results from a run")
    view_parser.add_argument("run_id", nargs="?", help="Run ID (default: latest)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    commands = {
        "list": cmd_list,
        "providers": cmd_providers,
        "describe": cmd_describe,
        "cost": cmd_cost,
        "run": cmd_run,
        "compare": cmd_compare,
        "retry": cmd_retry,
        "history": cmd_history,
        "view": cmd_view,
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()
