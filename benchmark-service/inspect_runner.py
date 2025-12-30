"""
Inspect AI Runner - Uses pre-built inspect-evals tasks for proper benchmark evaluation

Supports multiple providers:
- openrouter: OpenRouter API (default) - unified access to all models
- openai: Direct OpenAI API
- anthropic: Direct Anthropic API
- google: Direct Google AI API
- together: Together AI
- fireworks: Fireworks AI
"""

import os
import subprocess
import json
import logging
import re
import zipfile
from typing import Optional, List, Dict, Any, AsyncGenerator
from datetime import datetime
from enum import Enum

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ErrorCode(Enum):
    """Standardized error codes for better error handling"""
    INSPECT_NOT_INSTALLED = "INSPECT_NOT_INSTALLED"
    EVALS_NOT_INSTALLED = "EVALS_NOT_INSTALLED"
    BENCHMARK_NOT_FOUND = "BENCHMARK_NOT_FOUND"
    PROVIDER_NOT_FOUND = "PROVIDER_NOT_FOUND"
    API_KEY_MISSING = "API_KEY_MISSING"
    EVALUATION_TIMEOUT = "EVALUATION_TIMEOUT"
    EVALUATION_FAILED = "EVALUATION_FAILED"
    INVALID_PARAMETER = "INVALID_PARAMETER"
    PARSE_ERROR = "PARSE_ERROR"

# Check if inspect-ai is available
try:
    import inspect_ai
    INSPECT_AI_AVAILABLE = True
except ImportError:
    INSPECT_AI_AVAILABLE = False

# Check if inspect-evals is available
try:
    import inspect_evals
    INSPECT_EVALS_AVAILABLE = True
except ImportError:
    INSPECT_EVALS_AVAILABLE = False


# Provider configurations
PROVIDERS = {
    "openrouter": {
        "name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "api_key_env": "OPENROUTER_API_KEY",
        "model_prefix": "openai/",  # OpenRouter uses openai-compatible API
        "description": "Unified access to 200+ models via OpenRouter",
    },
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "api_key_env": "OPENAI_API_KEY",
        "model_prefix": "openai/",
        "description": "Direct OpenAI API access",
    },
    "anthropic": {
        "name": "Anthropic",
        "base_url": None,  # Anthropic uses its own client
        "api_key_env": "ANTHROPIC_API_KEY",
        "model_prefix": "anthropic/",
        "description": "Direct Anthropic API access",
    },
    "google": {
        "name": "Google AI",
        "base_url": None,  # Google uses its own client
        "api_key_env": "GOOGLE_API_KEY",
        "model_prefix": "google/",
        "description": "Direct Google AI (Gemini) API access",
    },
    "together": {
        "name": "Together AI",
        "base_url": "https://api.together.xyz/v1",
        "api_key_env": "TOGETHER_API_KEY",
        "model_prefix": "openai/",
        "description": "Together AI - fast open-source model inference",
    },
    "fireworks": {
        "name": "Fireworks AI",
        "base_url": "https://api.fireworks.ai/inference/v1",
        "api_key_env": "FIREWORKS_API_KEY",
        "model_prefix": "openai/",
        "description": "Fireworks AI - fast model inference",
    },
}


def get_available_providers() -> List[Dict[str, Any]]:
    """Get list of available providers with their API key status"""
    providers = []
    for provider_id, config in PROVIDERS.items():
        has_key = bool(os.getenv(config["api_key_env"]))
        providers.append({
            "id": provider_id,
            "name": config["name"],
            "description": config["description"],
            "configured": has_key,
            "api_key_env": config["api_key_env"],
        })
    return providers


# All 100+ benchmarks supported via inspect-evals package
# See: https://github.com/UKGovernmentBEIS/inspect_evals
SUPPORTED_BENCHMARKS = {
    # ============== CODING ==============
    "apps": "inspect_evals/apps",
    "agent_bench": "inspect_evals/agent_bench",
    "bigcodebench": "inspect_evals/bigcodebench",
    "core_bench": "inspect_evals/core_bench",
    "class_eval": "inspect_evals/class_eval",
    "ds1000": "inspect_evals/ds1000",
    "humaneval": "inspect_evals/humaneval",
    "mbpp": "inspect_evals/mbpp",
    "mle_bench": "inspect_evals/mle_bench",
    "mle_bench_lite": "inspect_evals/mle_bench_lite",
    "paperbench": "inspect_evals/paperbench",
    "swe_bench": "inspect_evals/swe_bench",
    "swe_bench_verified": "inspect_evals/swe_bench_verified",
    "scicode": "inspect_evals/scicode",
    "usaco": "inspect_evals/usaco",

    # ============== ASSISTANTS ==============
    "assistant_bench": "inspect_evals/assistant_bench",
    "assistant_bench_closed": "inspect_evals/assistant_bench_closed_book",
    "assistant_bench_web": "inspect_evals/assistant_bench_web_search",
    "bfcl": "inspect_evals/bfcl",
    "browse_comp": "inspect_evals/browse_comp",
    "gaia": "inspect_evals/gaia",
    "gaia_level1": "inspect_evals/gaia_level1",
    "gaia_level2": "inspect_evals/gaia_level2",
    "gaia_level3": "inspect_evals/gaia_level3",
    "gdpval": "inspect_evals/gdpval",
    "mind2web": "inspect_evals/mind2web",
    "osworld": "inspect_evals/osworld",
    "osworld_small": "inspect_evals/osworld_small",
    "sycophancy": "inspect_evals/sycophancy",

    # ============== CYBERSECURITY ==============
    "cve_bench": "inspect_evals/cve_bench",
    "cyberseceval_3": "inspect_evals/cyberseceval_3",
    "cyberseceval_2": "inspect_evals/cyberseceval_2",
    "threecb": "inspect_evals/threecb",
    "cybench": "inspect_evals/cybench",
    "cybermetric": "inspect_evals/cybermetric",
    "gdm_intercode_ctf": "inspect_evals/gdm_intercode_ctf",
    "gdm_in_house_ctf": "inspect_evals/gdm_in_house_ctf",
    "sevenllm": "inspect_evals/sevenllm",
    "sandboxbench": "inspect_evals/sandboxbench",
    "sec_qa": "inspect_evals/sec_qa",

    # ============== SAFEGUARDS ==============
    "ahb": "inspect_evals/ahb",
    "abstention_bench": "inspect_evals/abstention_bench",
    "agentdojo": "inspect_evals/agentdojo",
    "agentharm": "inspect_evals/agentharm",
    "fortress": "inspect_evals/fortress",
    "lab_bench": "inspect_evals/lab_bench",
    "mask": "inspect_evals/mask",
    "make_me_pay": "inspect_evals/make_me_pay",
    "makemesay": "inspect_evals/makemesay",
    "mind2web_sc": "inspect_evals/mind2web_sc",
    "stereoset": "inspect_evals/stereoset",
    "strong_reject": "inspect_evals/strong_reject",
    "coconot": "inspect_evals/coconot",
    "wmdp": "inspect_evals/wmdp",
    "b3": "inspect_evals/b3",
    "toxigen": "inspect_evals/toxigen",
    "xstest": "inspect_evals/xstest",

    # ============== MATHEMATICS ==============
    "aime2024": "inspect_evals/aime2024",
    "aime2025": "inspect_evals/aime2025",
    "gsm8k": "inspect_evals/gsm8k",
    "math": "inspect_evals/math",
    "mgsm": "inspect_evals/mgsm",
    "mathvista": "inspect_evals/mathvista",

    # ============== REASONING ==============
    "arc": "inspect_evals/arc_challenge",
    "bbh": "inspect_evals/bbh",
    "bbeh": "inspect_evals/bbeh",
    "boolq": "inspect_evals/boolq",
    "drop": "inspect_evals/drop",
    "hellaswag": "inspect_evals/hellaswag",
    "ifeval": "inspect_evals/ifeval",
    "lingoly": "inspect_evals/lingoly",
    "mmmu": "inspect_evals/mmmu",
    "musr": "inspect_evals/musr",
    "niah": "inspect_evals/niah",
    "novelty_bench": "inspect_evals/novelty_bench",
    "paws": "inspect_evals/paws",
    "piqa": "inspect_evals/piqa",
    "race_h": "inspect_evals/race_h",
    "squad": "inspect_evals/squad",
    "vimgolf": "inspect_evals/vimgolf",
    "winogrande": "inspect_evals/winogrande",
    "worldsense": "inspect_evals/worldsense",
    "infinite_bench": "inspect_evals/infinite_bench",

    # ============== KNOWLEDGE ==============
    "agieval": "inspect_evals/agieval",
    "air_bench": "inspect_evals/air_bench",
    "chembench": "inspect_evals/chembench",
    "commonsense_qa": "inspect_evals/commonsense_qa",
    "gpqa": "inspect_evals/gpqa",
    "gpqa_diamond": "inspect_evals/gpqa_diamond",
    "healthbench": "inspect_evals/healthbench",
    "hle": "inspect_evals/hle",
    "livebench": "inspect_evals/livebench",
    "mmlu_pro": "inspect_evals/mmlu_pro",
    "mmlu": "inspect_evals/mmlu_0_shot",  # Use 0-shot variant for standard MMLU
    "mmlu_5_shot": "inspect_evals/mmlu_5_shot",  # 5-shot variant
    "medqa": "inspect_evals/medqa",
    "onet": "inspect_evals/onet",
    "pre_flight": "inspect_evals/pre_flight",
    "pubmedqa": "inspect_evals/pubmedqa",
    "sosbench": "inspect_evals/sosbench",
    "sciknoweval": "inspect_evals/sciknoweval",
    "simpleqa": "inspect_evals/simpleqa",
    "truthfulqa": "inspect_evals/truthfulqa",
    "uccb": "inspect_evals/uccb",

    # ============== SCHEMING ==============
    "agentic_misalignment": "inspect_evals/agentic_misalignment",
    "gdm_sp_apps": "inspect_evals/gdm_sp_apps",
    "gdm_sr_self_reasoning": "inspect_evals/gdm_sr_self_reasoning",
    "gdm_stealth": "inspect_evals/gdm_stealth",

    # ============== MULTIMODAL ==============
    "docvqa": "inspect_evals/docvqa",
    "mmiu": "inspect_evals/mmiu",
    "vstar_bench": "inspect_evals/vstar_bench",
    "zerobench": "inspect_evals/zerobench",

    # ============== BIAS ==============
    "bbq": "inspect_evals/bbq",
    "bold": "inspect_evals/bold",

    # ============== PERSONALITY ==============
    "personality_bfi": "inspect_evals/personality_bfi",
    "personality_trait": "inspect_evals/personality_trait",
    "personality_prime": "inspect_evals/personality_prime",

    # ============== WRITING ==============
    "writingbench": "inspect_evals/writingbench",
}

# Benchmarks that require additional dependencies beyond the base install
# Format: benchmark_id -> {package, install_cmd, requirements, description}
BENCHMARK_DEPENDENCIES = {
    # SWE-bench family - requires swebench package and Docker
    "swe_bench": {
        "package": "swebench",
        "install_cmd": "pip install inspect-evals[swe_bench]",
        "requirements": ["Python 3.11+", "Docker"],
        "description": "Software engineering benchmark requiring code execution sandbox",
    },
    "swe_bench_verified": {
        "package": "swebench",
        "install_cmd": "pip install inspect-evals[swe_bench]",
        "requirements": ["Python 3.11+", "Docker"],
        "description": "Verified subset of SWE-bench",
    },
    # MLE-bench - requires mlebench package
    "mle_bench": {
        "package": "mlebench",
        "install_cmd": "pip install inspect-evals[mle_bench]",
        "requirements": ["Python 3.11+"],
        "description": "Machine learning engineering benchmark",
    },
    "mle_bench_lite": {
        "package": "mlebench",
        "install_cmd": "pip install inspect-evals[mle_bench]",
        "requirements": ["Python 3.11+"],
        "description": "Lite version of MLE-bench",
    },
    # GAIA - requires playwright for web browsing
    "gaia": {
        "package": "playwright",
        "install_cmd": "pip install inspect-evals[gaia] && playwright install",
        "requirements": ["Playwright browsers"],
        "description": "General AI assistants benchmark with web browsing",
    },
    "gaia_level1": {
        "package": "playwright",
        "install_cmd": "pip install inspect-evals[gaia] && playwright install",
        "requirements": ["Playwright browsers"],
        "description": "GAIA Level 1 tasks",
    },
    "gaia_level2": {
        "package": "playwright",
        "install_cmd": "pip install inspect-evals[gaia] && playwright install",
        "requirements": ["Playwright browsers"],
        "description": "GAIA Level 2 tasks",
    },
    "gaia_level3": {
        "package": "playwright",
        "install_cmd": "pip install inspect-evals[gaia] && playwright install",
        "requirements": ["Playwright browsers"],
        "description": "GAIA Level 3 tasks",
    },
    # Cybersecurity benchmarks - require Docker
    "cybench": {
        "package": None,
        "install_cmd": None,
        "requirements": ["Docker", "65GB+ disk space"],
        "description": "Cybersecurity benchmark requiring Docker containers",
    },
    "gdm_intercode_ctf": {
        "package": None,
        "install_cmd": None,
        "requirements": ["Docker", "32GB+ RAM"],
        "description": "GDM CTF benchmark requiring Docker",
    },
    "gdm_in_house_ctf": {
        "package": None,
        "install_cmd": None,
        "requirements": ["Docker", "32GB+ RAM"],
        "description": "GDM in-house CTF benchmark requiring Docker",
    },
    # OSWorld - requires Docker
    "osworld": {
        "package": None,
        "install_cmd": None,
        "requirements": ["Docker"],
        "description": "OS-level task benchmark requiring Docker",
    },
    "osworld_small": {
        "package": None,
        "install_cmd": None,
        "requirements": ["Docker"],
        "description": "Small subset of OSWorld",
    },
    # SciKnowEval - incompatible with Python 3.13+
    "sciknoweval": {
        "package": "gensim",
        "install_cmd": "pip install gensim",
        "requirements": ["Python 3.10-3.12 (not 3.13+)"],
        "description": "Scientific knowledge evaluation (gensim dependency)",
    },
}


def get_benchmark_dependency_info(benchmark: str) -> Optional[Dict[str, Any]]:
    """Get dependency information for a benchmark, if any special requirements exist."""
    return BENCHMARK_DEPENDENCIES.get(benchmark)


def is_inspect_available() -> bool:
    """Check if Inspect AI and inspect-evals are available"""
    return INSPECT_AI_AVAILABLE and INSPECT_EVALS_AVAILABLE


def get_supported_benchmarks() -> List[str]:
    """Get list of all supported benchmarks"""
    return list(SUPPORTED_BENCHMARKS.keys())


def create_error(code: ErrorCode, message: str, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create a standardized error response with data wrapper for frontend compatibility"""
    data = {
        "code": code.value,
        "error": message,
        "message": message,  # Alias for frontend compatibility
    }
    if details:
        data["details"] = details
    logger.error(f"{code.value}: {message}", extra=details or {})
    return {"type": "error", "data": data}


def create_progress(message: str, **extra) -> Dict[str, Any]:
    """Create a progress event with data wrapper for frontend compatibility"""
    return {"type": "progress", "data": {"message": message, **extra}}


def create_result(question: int, total: int, correct: bool, running_score: float, latency_ms: float = 0, **extra) -> Dict[str, Any]:
    """Create a result event with data wrapper for frontend compatibility"""
    return {
        "type": "result",
        "data": {
            "question": question,
            "currentQuestion": question,  # Alias for frontend
            "questionIndex": question - 1,  # Zero-indexed alias
            "total": total,
            "correct": correct,
            "runningScore": running_score,
            "running_score": running_score,  # Snake case alias
            "latencyMs": latency_ms,
            "latency_ms": latency_ms,  # Snake case alias
            **extra
        }
    }


def create_complete(score: float, correct: int, total: int, **extra) -> Dict[str, Any]:
    """Create a complete event with data wrapper for frontend compatibility"""
    return {
        "type": "complete",
        "data": {
            "score": score,
            "correct": correct,
            "total": total,
            **extra
        }
    }


def validate_parameters(
    model_id: str,
    benchmark: str,
    limit: int,
    provider: str,
    temperature: Optional[float] = None,
    seed: Optional[int] = None,
    epochs: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """
    Validate all input parameters.
    Returns None if valid, or an error dict if invalid.
    """
    # Validate model_id format
    if not model_id or not isinstance(model_id, str) or len(model_id.strip()) == 0:
        return create_error(
            ErrorCode.INVALID_PARAMETER,
            "Model ID must be a non-empty string",
            {"parameter": "model_id", "value": model_id}
        )

    # Validate model_id characters - only allow alphanumeric, hyphens, underscores, dots, slashes, and colons
    # This covers formats like: gpt-4o, claude-3-5-sonnet, openai/gpt-4, meta-llama/llama-3.1-8b:free
    model_id_pattern = re.compile(r'^[a-zA-Z0-9._:/-]+$')
    if not model_id_pattern.match(model_id) or len(model_id) > 200:
        return create_error(
            ErrorCode.INVALID_PARAMETER,
            "Model ID contains invalid characters or is too long (max 200 chars)",
            {"parameter": "model_id", "value": model_id[:50]}
        )

    # Validate limit
    if not isinstance(limit, int) or limit < 1:
        return create_error(
            ErrorCode.INVALID_PARAMETER,
            "Limit must be a positive integer",
            {"parameter": "limit", "value": limit}
        )

    if limit > 10000:
        return create_error(
            ErrorCode.INVALID_PARAMETER,
            "Limit cannot exceed 10,000 samples",
            {"parameter": "limit", "value": limit}
        )

    # Validate temperature
    if temperature is not None:
        if not isinstance(temperature, (int, float)) or temperature < 0 or temperature > 2:
            return create_error(
                ErrorCode.INVALID_PARAMETER,
                "Temperature must be between 0 and 2",
                {"parameter": "temperature", "value": temperature}
            )

    # Validate seed
    if seed is not None:
        if not isinstance(seed, int) or seed < 0:
            return create_error(
                ErrorCode.INVALID_PARAMETER,
                "Seed must be a non-negative integer",
                {"parameter": "seed", "value": seed}
            )

    # Validate epochs
    if epochs is not None:
        if not isinstance(epochs, int) or epochs < 1 or epochs > 100:
            return create_error(
                ErrorCode.INVALID_PARAMETER,
                "Epochs must be between 1 and 100",
                {"parameter": "epochs", "value": epochs}
            )

    # Validate provider (case-insensitive)
    provider_lower = provider.lower()
    if provider_lower not in PROVIDERS:
        return create_error(
            ErrorCode.PROVIDER_NOT_FOUND,
            f"Unknown provider '{provider}'. Available providers: {', '.join(PROVIDERS.keys())}",
            {"parameter": "provider", "value": provider, "available": list(PROVIDERS.keys())}
        )

    # Validate benchmark
    if benchmark not in SUPPORTED_BENCHMARKS:
        return create_error(
            ErrorCode.BENCHMARK_NOT_FOUND,
            f"Benchmark '{benchmark}' not supported. Available: {len(SUPPORTED_BENCHMARKS)} benchmarks",
            {"parameter": "benchmark", "value": benchmark}
        )

    return None


def is_reasoning_model(model_id: str) -> bool:
    """Check if a model is a reasoning model that requires special handling.

    Reasoning models have special API requirements:
    - They may not support temperature parameter
    - They may require specific reasoning/thinking parameters
    - Their reasoning content may be encrypted/redacted via some providers

    Supported reasoning models:
    - OpenAI: o1, o3, gpt-5.x series
    - Anthropic: Claude 3.7+ with extended thinking, Claude 4
    - DeepSeek: R1 series
    - Google: Gemini 2.5+, Gemini 3 with thinking mode
    - Microsoft: Phi-4-reasoning
    - Any model with "-reasoning" or "-thinking" suffix
    """
    model_lower = model_id.lower()
    reasoning_patterns = [
        # OpenAI reasoning models
        "o1", "o3", "gpt-5",
        # Anthropic extended thinking (Claude 3.7+, Claude 4)
        "claude-3-7", "claude-3.7", "claude-4",
        # DeepSeek R1 reasoning models
        "deepseek-r1", "deepseek/r1",
        # Google Gemini thinking models
        "gemini-2.5", "gemini-3", "deep-think", "deepthink",
        # Microsoft reasoning models
        "phi-4-reasoning", "phi-reasoning",
        # Generic patterns
        "-reasoning", "-thinking", "_reasoning", "_thinking",
    ]
    return any(pattern in model_lower for pattern in reasoning_patterns)


def build_inspect_command(
    task_name: str,
    model_id: str,
    limit: int,
    provider: str,
    provider_config: Dict[str, Any],
    temperature: Optional[float] = None,
    seed: Optional[int] = None,
    max_tokens: Optional[int] = None,
    reasoning_effort: Optional[str] = None,
) -> List[str]:
    """Build the inspect eval CLI command based on parameters

    Args:
        task_name: The inspect-evals task to run (e.g., "inspect_evals/mmlu_0_shot")
        model_id: Model identifier (e.g., "gpt-4o", "o3-mini")
        limit: Number of samples to run
        provider: Provider name (openrouter, openai, anthropic, etc.)
        provider_config: Provider configuration dict
        temperature: Sampling temperature (0-2), skipped for reasoning models
        seed: Random seed for reproducibility
        max_tokens: Maximum tokens for generation
        reasoning_effort: Reasoning effort level for reasoning models (low|medium|high)
    """

    # Check if this is a reasoning model
    is_reasoning = is_reasoning_model(model_id)
    if is_reasoning:
        logger.info(f"Detected reasoning model: {model_id} - using reasoning mode parameters")

    if provider == "anthropic":
        cmd = [
            "inspect", "eval", task_name,
            "--model", f"anthropic/{model_id}",
            "--limit", str(limit),
            "--log-format", "json",
        ]
    elif provider == "google":
        cmd = [
            "inspect", "eval", task_name,
            "--model", f"google/{model_id}",
            "--limit", str(limit),
            "--log-format", "json",
        ]
    else:
        # OpenAI-compatible providers (openrouter, openai, together, fireworks)
        cmd = [
            "inspect", "eval", task_name,
            "--model", f"{provider_config['model_prefix']}{model_id}",
            "--limit", str(limit),
            "--log-format", "json",
        ]
        # Add base URL if not default OpenAI
        if provider_config["base_url"] and provider != "openai":
            cmd.extend(["--model-base-url", provider_config["base_url"]])

    # Handle reasoning models specially based on provider
    if is_reasoning:
        # Different providers handle reasoning models differently:
        #
        # OpenRouter: OpenAI reasoning models (o1, o3, gpt-5.x) return encrypted
        # reasoning content, making responses unparseable. Use reasoning_effort=none
        # to force text-only responses. Other providers' models via OpenRouter
        # (Claude, DeepSeek, Gemini) may work with reasoning enabled.
        #
        # Direct providers: Reasoning content is typically accessible.
        # - OpenAI: reasoning_effort parameter
        # - Anthropic: extended_thinking with budget_tokens
        # - Google: thinkingLevel parameter
        # - DeepSeek: reasoning_content in response

        # Check if this is an OpenAI reasoning model (needs special handling)
        is_openai_reasoning = any(p in model_id.lower() for p in ["o1", "o3", "gpt-5"])

        if provider == "openrouter" and is_openai_reasoning:
            # OpenAI models via OpenRouter: disable reasoning for parseable responses
            effort = reasoning_effort if reasoning_effort is not None else "none"
            cmd.extend(["--reasoning-effort", effort])
            logger.info(f"OpenAI reasoning model via OpenRouter: effort={effort} (for parseable responses)")
        elif provider == "openrouter":
            # Non-OpenAI reasoning models via OpenRouter (Claude, DeepSeek, Gemini)
            # These may return accessible reasoning content
            if reasoning_effort:
                cmd.extend(["--reasoning-effort", reasoning_effort])
            logger.info(f"Reasoning model via OpenRouter: {model_id}")
        elif provider == "openai":
            # Direct OpenAI API - reasoning content is accessible
            effort = reasoning_effort or "medium"
            cmd.extend(["--reasoning-effort", effort])
            cmd.extend(["--reasoning-summary", "auto"])
            logger.info(f"OpenAI reasoning model: effort={effort}, summary=auto")
        elif provider == "anthropic":
            # Anthropic extended thinking - returns thinking summaries
            # Claude 3.7+ and Claude 4 support extended thinking
            logger.info(f"Anthropic extended thinking model: {model_id}")
            # Note: Inspect AI handles Anthropic extended thinking automatically
        elif provider == "google":
            # Google Gemini thinking models
            # thinkingLevel: minimal, low, medium, high (for Gemini 3 Flash)
            # thinkingLevel: low, high (for Gemini 3 Pro)
            logger.info(f"Google Gemini thinking model: {model_id}")
            # Note: Inspect AI handles Gemini thinking automatically
        else:
            # Other providers (together, fireworks, etc.)
            if reasoning_effort:
                cmd.extend(["--reasoning-effort", reasoning_effort])
            logger.info(f"Reasoning model via {provider}: {model_id}")
    else:
        # Non-reasoning models use temperature
        if temperature is not None:
            cmd.extend(["--temperature", str(temperature)])

    if seed is not None:
        # Reproducible mode: use provided seed for both model and sample shuffle
        cmd.extend(["--seed", str(seed)])
        cmd.extend(["--sample-shuffle", str(seed)])
    else:
        # Random mode: shuffle samples randomly each run (no fixed seed)
        # This ensures different samples are selected each time when limit < total
        cmd.append("--sample-shuffle")

    # Always set a minimum max_tokens to prevent truncation issues
    # Some benchmarks (like MMLU non-CoT) set very low max_tokens (5),
    # which causes issues with models that explain before answering
    effective_max_tokens = max_tokens if max_tokens is not None else 1024
    cmd.extend(["--max-tokens", str(effective_max_tokens)])

    # Pass max_non_cot_tokens as a task argument for MMLU benchmarks
    # This overrides the default max_tokens=5 that causes truncation
    cmd.extend(["-T", f"max_non_cot_tokens={effective_max_tokens}"])

    return cmd


def parse_log_results(log_path: str) -> Optional[Dict[str, Any]]:
    """Parse results from Inspect AI log file (.eval is a ZIP archive)

    Args:
        log_path: Path to the log file (must be within logs/ directory)

    Returns:
        Parsed log data or None if parsing fails
    """
    # Path traversal protection: ensure log_path is within the expected logs directory
    # Resolve the absolute path and check it's within allowed directory
    logs_dir = os.path.abspath("logs")
    resolved_path = os.path.abspath(log_path)

    if not resolved_path.startswith(logs_dir + os.sep) and resolved_path != logs_dir:
        logger.error(f"Path traversal attempt detected: {log_path} resolves outside logs directory")
        return None

    try:
        # .eval files are ZIP archives containing JSON files
        if log_path.endswith('.eval') and zipfile.is_zipfile(log_path):
            with zipfile.ZipFile(log_path, 'r') as zf:
                # Look for samples files and header
                samples = []
                header_data = {}

                for name in zf.namelist():
                    if name.startswith('samples/') and name.endswith('.json'):
                        with zf.open(name) as f:
                            sample_data = json.load(f)
                            samples.append(sample_data)
                    elif name == 'header.json':
                        with zf.open(name) as f:
                            header_data = json.load(f)

                # Build a result dict similar to the old JSON format
                return {
                    "status": header_data.get("status", "success"),
                    "results": header_data.get("results", {}),
                    "samples": samples,
                }
        else:
            # Plain JSON file
            with open(log_path, 'r') as f:
                return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError, PermissionError, zipfile.BadZipFile) as e:
        logger.error(f"Failed to parse log file {log_path}: {e}")
        return None


async def run_with_inspect_ai(
    model_id: str,
    benchmark: str,
    limit: int = 10,
    api_key: Optional[str] = None,
    provider: str = "openrouter",
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    seed: Optional[int] = None,
    epochs: int = 1,
    timeout: Optional[int] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Run evaluation using Inspect AI with pre-built inspect-evals tasks.

    Args:
        model_id: Model identifier (e.g., "gpt-4o", "claude-3-5-sonnet")
        benchmark: Benchmark to run (e.g., "mmlu", "humaneval")
        limit: Number of samples to run (1-10000)
        api_key: Optional API key override
        provider: Provider to use (openrouter, openai, anthropic, google, together, fireworks)
        temperature: Sampling temperature (0-2)
        max_tokens: Maximum tokens for generation
        seed: Random seed for reproducibility
        epochs: Number of repeated runs for variance analysis (1-100)
        timeout: Timeout in seconds (default: from EVAL_TIMEOUT env var or 600)

    Yields:
        Dict with type: "progress", "result", "complete", or "error"

    Uses the `inspect eval` CLI command for proper execution.
    """
    # Normalize provider to lowercase
    provider = provider.lower()

    # Check dependencies
    if not INSPECT_AI_AVAILABLE:
        yield create_error(ErrorCode.INSPECT_NOT_INSTALLED, "inspect-ai not installed. Run: pip install inspect-ai")
        return

    if not INSPECT_EVALS_AVAILABLE:
        yield create_error(ErrorCode.EVALS_NOT_INSTALLED, "inspect-evals not installed. Run: pip install inspect-evals")
        return

    # Validate all parameters
    validation_error = validate_parameters(
        model_id=model_id,
        benchmark=benchmark,
        limit=limit,
        provider=provider,
        temperature=temperature,
        seed=seed,
        epochs=epochs,
    )
    if validation_error:
        yield validation_error
        return

    task_name = SUPPORTED_BENCHMARKS[benchmark]
    provider_config = PROVIDERS[provider]

    # Get API key for the provider
    api_key = api_key or os.getenv(provider_config["api_key_env"])
    if not api_key:
        yield create_error(
            ErrorCode.API_KEY_MISSING,
            f"API key not configured for provider '{provider}'. Please set {provider_config['api_key_env']} environment variable.",
            {"provider": provider, "env_var": provider_config["api_key_env"]}
        )
        return

    # Get timeout from env or use default
    # Different benchmarks and models need different timeout settings
    base_timeout = timeout or int(os.getenv("EVAL_TIMEOUT", "600"))

    # Benchmarks that require Docker containers (SWE-bench, cybench, etc.) need much longer
    # First run can take 30+ minutes to build Docker images
    docker_benchmarks = {"swe_bench", "swe_bench_verified", "cybench", "gdm_intercode_ctf",
                         "gdm_in_house_ctf", "osworld", "osworld_small"}

    if benchmark in docker_benchmarks:
        # Docker benchmarks: at least 30 minutes, plus 5 min per sample
        eval_timeout = max(1800, 1800 + limit * 300)
        logger.info(f"Extended timeout for Docker benchmark {benchmark}: {eval_timeout}s ({eval_timeout // 60} min)")
    elif is_reasoning_model(model_id):
        # For reasoning models: at least 60 seconds per question
        eval_timeout = max(base_timeout, limit * 60)
        logger.info(f"Extended timeout for reasoning model: {eval_timeout}s ({eval_timeout // 60} min)")
    else:
        eval_timeout = base_timeout

    logger.info(f"Starting evaluation: model={model_id}, benchmark={benchmark}, limit={limit}, provider={provider}, epochs={epochs}, seed={seed}")

    yield create_progress(
        f"Running {task_name} via {provider_config['name']} with limit={limit}" + (f", seed={seed}" if seed else "") + (f", epochs={epochs}" if epochs > 1 else "") + "...",
        provider=provider,
        seed=seed,
        epochs=epochs,
    )

    all_epoch_results = []
    start_time = datetime.now()

    for epoch in range(epochs):
        if epochs > 1:
            yield create_progress(f"Starting epoch {epoch + 1}/{epochs}...")

        # Build environment with API key
        env = os.environ.copy()
        if provider in ("anthropic",):
            env["ANTHROPIC_API_KEY"] = api_key
        elif provider in ("google",):
            env["GOOGLE_API_KEY"] = api_key
        else:
            env["OPENAI_API_KEY"] = api_key

        # Build command using helper function
        cmd = build_inspect_command(
            task_name=task_name,
            model_id=model_id,
            limit=limit,
            provider=provider,
            provider_config=provider_config,
            temperature=temperature,
            seed=seed,
            max_tokens=max_tokens,
        )

        logger.info(f"Executing command: {' '.join(cmd)}")
        yield create_progress(f"Executing: {' '.join(cmd[:5])}...")

        try:
            # Run the evaluation with configurable timeout
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                env=env,
                timeout=eval_timeout,
            )

            if result.returncode != 0:
                error_msg = result.stderr or result.stdout or "Unknown error"
                logger.error(f"Inspect eval failed: {error_msg}")

                # Check for common dependency-related errors
                dep_info = get_benchmark_dependency_info(benchmark)
                error_lower = error_msg.lower()

                # Patterns that indicate missing dependencies
                dependency_error_patterns = [
                    "please install",
                    "modulenotfounderror",
                    "no module named",
                    "importerror",
                    "docker",
                    "package not found",
                    "swebench",
                    "mlebench",
                    "playwright",
                    "gensim",
                ]

                is_dependency_error = any(pattern in error_lower for pattern in dependency_error_patterns)

                if is_dependency_error and dep_info:
                    # Build a helpful error message with install instructions
                    user_message = f"Benchmark '{benchmark}' requires additional dependencies.\n\n"
                    if dep_info.get("description"):
                        user_message += f"Description: {dep_info['description']}\n"
                    if dep_info.get("requirements"):
                        user_message += f"Requirements: {', '.join(dep_info['requirements'])}\n"
                    if dep_info.get("install_cmd"):
                        user_message += f"\nTo install: {dep_info['install_cmd']}\n"
                    else:
                        user_message += "\nThis benchmark requires system-level dependencies (Docker). Please ensure Docker is installed and running.\n"

                    yield create_error(
                        ErrorCode.EVALUATION_FAILED,
                        user_message,
                        {"stderr": error_msg[:1000], "returncode": result.returncode, "dependency_info": dep_info}
                    )
                elif is_dependency_error:
                    # Generic dependency error for unknown benchmark
                    yield create_error(
                        ErrorCode.EVALUATION_FAILED,
                        f"Benchmark '{benchmark}' failed due to missing dependencies. Check the error details for more information.",
                        {"stderr": error_msg[:1000], "returncode": result.returncode}
                    )
                else:
                    # Generic error
                    yield create_error(
                        ErrorCode.EVALUATION_FAILED,
                        f"Benchmark evaluation failed. Please check your API key and try again.",
                        {"stderr": error_msg[:1000], "returncode": result.returncode}
                    )
                return

            # Parse the JSON output
            # Find the log file path from output
            # Inspect AI outputs: "Log: logs/2025-12-24T18-37-37+00-00_hellaswag_xxx.eval"
            # Strip ANSI escape codes first
            ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
            clean_output = ansi_escape.sub('', result.stdout)
            output_lines = clean_output.strip().split("\n")
            log_path = None
            for line in output_lines:
                if "Log:" in line or ("logs/" in line.lower() and (".eval" in line or ".json" in line)):
                    # Match paths like "logs/2025-12-24T18-37-37+00-00_hellaswag_xxx.eval"
                    match = re.search(r'(logs/[\w\-\+\.]+\.(?:eval|json))', line)
                    if match:
                        log_path = match.group(1)
                        logger.info(f"Found log path: {log_path}")
                        break

            epoch_result = {"epoch": epoch + 1, "score": 0, "correct": 0, "total": 0}

            if log_path and os.path.exists(log_path):
                log_data = parse_log_results(log_path)
                if not log_data:
                    yield create_error(ErrorCode.PARSE_ERROR, f"Failed to parse results from {log_path}")
                    return

                # Extract results from log
                samples = log_data.get("samples", [])
                total = len(samples)

                # Helper to extract predicted answer from sample
                # Handles reasoning models where scorer may fail to parse properly
                def extract_predicted(s):
                    valid_answers = {"A", "B", "C", "D", "E"}

                    # FIRST: Check raw message content - most reliable source
                    # This is especially important for reasoning models where the scorer
                    # may not correctly parse the response
                    output = s.get("output", {})
                    choices = output.get("choices", [])
                    if choices:
                        content = choices[0].get("message", {}).get("content", [])
                        if isinstance(content, list):
                            for block in content:
                                # Check text blocks for answer
                                if isinstance(block, dict) and block.get("type") == "text":
                                    text = block.get("text", "")
                                    answer_match = re.search(r'(?:ANSWER|Answer|answer)[:\s]*([A-Ea-e])\b', text)
                                    if answer_match:
                                        return answer_match.group(1).upper()
                                # Check reasoning summary for answer
                                elif isinstance(block, dict) and block.get("type") == "reasoning":
                                    summary = block.get("summary", "")
                                    if summary:
                                        answer_match = re.search(r'(?:ANSWER|Answer|answer)[:\s]*([A-Ea-e])\b', summary)
                                        if answer_match:
                                            return answer_match.group(1).upper()
                        elif isinstance(content, str):
                            answer_match = re.search(r'(?:ANSWER|Answer|answer)[:\s]*([A-Ea-e])\b', content)
                            if answer_match:
                                return answer_match.group(1).upper()

                    # Check raw completion field
                    completion = output.get("completion", "")
                    if completion:
                        answer_match = re.search(r'(?:ANSWER|Answer|answer)[:\s]*([A-Ea-e])\b', completion)
                        if answer_match:
                            return answer_match.group(1).upper()

                    # SECOND: Check the scores from Inspect AI's choice scorer
                    # Note: scorer's 'answer' field is the EXPECTED answer, not predicted
                    # The 'value' field should be the extracted answer, but can be unreliable
                    # The 'explanation' field often contains the raw model response
                    scores = s.get("scores", {})
                    if "choice" in scores:
                        choice_data = scores["choice"]
                        explanation = choice_data.get("explanation", "")
                        value = choice_data.get("value", "")

                        # Try to extract from explanation first (contains raw response)
                        if explanation:
                            answer_match = re.search(r'(?:ANSWER|Answer|answer)[:\s]*([A-Ea-e])\b', explanation)
                            if answer_match:
                                return answer_match.group(1).upper()

                        # If value is a valid answer letter, use it as last resort
                        if value and value.upper() in valid_answers:
                            return value.upper()

                    return ""

                # Helper to extract expected answer from sample
                def extract_expected(s):
                    # Always prefer the target field as ground truth
                    target = s.get("target", "")
                    if target:
                        return str(target).strip()

                    # Fallback to scores.choice.answer
                    scores = s.get("scores", {})
                    if "choice" in scores:
                        return scores["choice"].get("answer", "")

                    return ""

                # Helper to check if sample is correct
                # New format: compare extracted predicted vs expected
                # Old format: score.value == 1
                def is_sample_correct(s):
                    # Try new format first (scores with 'choice' key)
                    scores = s.get("scores", {})
                    if "choice" in scores:
                        predicted = extract_predicted(s)
                        expected = extract_expected(s)
                        # Case-insensitive comparison
                        return predicted.upper() == expected.upper() if predicted and expected else False
                    # Fall back to old format
                    score = s.get("score", {})
                    if isinstance(score, dict):
                        return score.get("value") == 1
                    return False

                correct = sum(1 for s in samples if is_sample_correct(s))
                epoch_result = {"epoch": epoch + 1, "score": correct / total if total > 0 else 0, "correct": correct, "total": total}

                # Yield individual results (only for first epoch to avoid spam)
                if epoch == 0:
                    for i, sample in enumerate(samples):
                        sample_correct = is_sample_correct(sample)

                        # Extract predicted and expected values using helper functions
                        predicted = extract_predicted(sample)
                        expected = extract_expected(sample)

                        running_correct = sum(1 for s in samples[:i+1] if is_sample_correct(s))

                        # Extract latency from sample timestamps or model usage
                        latency_ms = 0.0
                        # Try to get latency from model_usage (if available)
                        model_usage = sample.get("model_usage", {})
                        if model_usage:
                            # Some providers include timing info
                            latency_ms = model_usage.get("latency_ms", 0) or model_usage.get("latency", 0) * 1000

                        # Try to calculate from timestamps if available
                        if latency_ms == 0:
                            created_at = sample.get("created_at") or sample.get("started_at")
                            completed_at = sample.get("completed_at") or sample.get("finished_at")
                            if created_at and completed_at:
                                try:
                                    # Parse ISO format timestamps (datetime already imported at module level)
                                    start = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                                    end = datetime.fromisoformat(completed_at.replace('Z', '+00:00'))
                                    latency_ms = (end - start).total_seconds() * 1000
                                except (ValueError, TypeError):
                                    pass

                        yield create_result(
                            question=i + 1,
                            total=total,
                            correct=sample_correct,
                            running_score=running_correct / (i + 1),
                            latency_ms=latency_ms,
                            predicted=str(predicted)[:50],
                            expected=str(expected)[:50],
                            epoch=epoch + 1,
                        )
            else:
                # Fallback: parse stdout for results
                yield create_progress("Parsing results from output...")

                score_match = re.search(r'accuracy[:\s]+([0-9.]+)', result.stdout, re.IGNORECASE)
                if score_match:
                    score = float(score_match.group(1))
                    if score > 1:
                        score = score / 100  # Convert percentage to decimal
                    epoch_result = {"epoch": epoch + 1, "score": score, "correct": int(score * limit), "total": limit}
                else:
                    yield create_error(
                        ErrorCode.PARSE_ERROR,
                        "Could not parse benchmark results",
                        {"output_preview": result.stdout[:500]}
                    )
                    return

            all_epoch_results.append(epoch_result)

            if epochs > 1:
                yield create_progress(f"Epoch {epoch + 1} complete: {epoch_result['score']*100:.1f}%")

        except subprocess.TimeoutExpired:
            yield create_error(
                ErrorCode.EVALUATION_TIMEOUT,
                f"Evaluation timed out after {eval_timeout // 60} minutes. Consider reducing the sample limit or using a faster model.",
                {"timeout_seconds": eval_timeout}
            )
            return
        except json.JSONDecodeError as e:
            yield create_error(ErrorCode.PARSE_ERROR, f"Failed to parse JSON results: {e}")
            return
        except PermissionError as e:
            yield create_error(ErrorCode.EVALUATION_FAILED, f"Permission denied accessing log files: {e}")
            return
        except Exception as e:
            logger.exception(f"Unexpected error during evaluation: {e}")
            yield create_error(ErrorCode.EVALUATION_FAILED, f"Evaluation failed unexpectedly: {str(e)}")
            return

    # Aggregate results across epochs
    duration = (datetime.now() - start_time).total_seconds()

    if epochs > 1:
        # Calculate average, min, max scores
        scores = [r["score"] for r in all_epoch_results]
        avg_score = sum(scores) / len(scores)
        min_score = min(scores)
        max_score = max(scores)
        total_correct = sum(r["correct"] for r in all_epoch_results)
        total_samples = sum(r["total"] for r in all_epoch_results)

        yield create_complete(
            score=avg_score,
            correct=total_correct,
            total=total_samples,
            model=model_id,
            benchmark=benchmark,
            provider=provider,
            provider_name=provider_config["name"],
            min_score=min_score,
            max_score=max_score,
            score_variance=max_score - min_score,
            epochs=epochs,
            epoch_results=all_epoch_results,
            duration_seconds=duration,
            timestamp=datetime.now().isoformat(),
            seed=seed,
        )
    else:
        # Single epoch result
        result_data = all_epoch_results[0] if all_epoch_results else {"score": 0, "correct": 0, "total": limit}
        yield create_complete(
            score=result_data["score"],
            correct=result_data["correct"],
            total=result_data["total"],
            model=model_id,
            benchmark=benchmark,
            provider=provider,
            provider_name=provider_config["name"],
            duration_seconds=duration,
            timestamp=datetime.now().isoformat(),
            seed=seed,
        )

    logger.info(f"Evaluation complete: model={model_id}, benchmark={benchmark}, score={all_epoch_results[-1]['score'] if all_epoch_results else 0}")
