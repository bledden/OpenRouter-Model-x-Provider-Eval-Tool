"""
Eval Service - FastAPI server wrapping Inspect AI for LLM evaluations
"""

import os
import asyncio
import json
import logging
import time
import uuid
from typing import Optional, List, AsyncGenerator, Dict, Any, Tuple
from datetime import datetime
from collections import defaultdict

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, validator
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Eval Service",
    description="LLM Evaluation API powered by Inspect AI - 100+ benchmarks",
    version="2.0.0",
)

# Configurable CORS origins from environment
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:3001"
).split(",")

# CORS for Next.js frontend - restrict methods and headers for security
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "X-Request-ID"],
)

# Simple in-memory rate limiting
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "10"))  # requests per window
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))  # window in seconds
rate_limit_store: Dict[str, List[float]] = defaultdict(list)


def check_rate_limit(client_ip: str) -> Tuple[bool, int, int]:
    """
    Check if client has exceeded rate limit.
    Returns (allowed, remaining, reset_time_seconds).
    """
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW

    # Clean old entries
    rate_limit_store[client_ip] = [
        t for t in rate_limit_store[client_ip] if t > window_start
    ]

    current_count = len(rate_limit_store[client_ip])
    remaining = max(0, RATE_LIMIT_REQUESTS - current_count)

    # Calculate reset time (seconds until oldest request expires)
    if rate_limit_store[client_ip]:
        oldest = min(rate_limit_store[client_ip])
        reset_time = int(oldest + RATE_LIMIT_WINDOW - now)
    else:
        reset_time = RATE_LIMIT_WINDOW

    # Check if under limit
    if current_count >= RATE_LIMIT_REQUESTS:
        return False, 0, reset_time

    # Add current request
    rate_limit_store[client_ip].append(now)
    return True, remaining - 1, reset_time


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Add request ID for tracing"""
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    # Store request ID in state for logging
    request.state.request_id = request_id

    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Rate limiting middleware for expensive endpoints with headers"""
    # Rate limit /run and /run/stream endpoints
    if request.url.path.startswith("/run"):
        client_ip = request.client.host if request.client else "unknown"
        request_id = getattr(request.state, "request_id", "unknown")

        allowed, remaining, reset_time = check_rate_limit(client_ip)

        if not allowed:
            logger.warning(f"[{request_id}] Rate limit exceeded for {client_ip}")
            response = Response(
                content=json.dumps({
                    "detail": f"Rate limit exceeded. Maximum {RATE_LIMIT_REQUESTS} evaluation requests per {RATE_LIMIT_WINDOW} seconds."
                }),
                status_code=429,
                media_type="application/json"
            )
            response.headers["X-RateLimit-Limit"] = str(RATE_LIMIT_REQUESTS)
            response.headers["X-RateLimit-Remaining"] = "0"
            response.headers["X-RateLimit-Reset"] = str(reset_time)
            response.headers["Retry-After"] = str(reset_time)
            return response

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(RATE_LIMIT_REQUESTS)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_time)
        return response

    return await call_next(request)

# All 100+ benchmarks from inspect-evals
# See: https://github.com/UKGovernmentBEIS/inspect_evals
AVAILABLE_BENCHMARKS = {
    # ============== CODING (15) ==============
    "apps": {
        "name": "APPS",
        "description": "Automated Programming Progress Standard",
        "category": "coding",
        "inspect_task": "inspect_evals/apps",
    },
    "agent_bench": {
        "name": "AgentBench",
        "description": "Agent capabilities benchmark",
        "category": "coding",
        "inspect_task": "inspect_evals/agent_bench",
    },
    "bigcodebench": {
        "name": "BigCodeBench",
        "description": "Large-scale code generation benchmark",
        "category": "coding",
        "inspect_task": "inspect_evals/bigcodebench",
    },
    "core_bench": {
        "name": "CORE-Bench",
        "description": "Code reasoning benchmark",
        "category": "coding",
        "inspect_task": "inspect_evals/core_bench",
    },
    "class_eval": {
        "name": "ClassEval",
        "description": "Class-level code generation",
        "category": "coding",
        "inspect_task": "inspect_evals/class_eval",
    },
    "ds1000": {
        "name": "DS-1000",
        "description": "Data science code generation",
        "category": "coding",
        "inspect_task": "inspect_evals/ds1000",
    },
    "humaneval": {
        "name": "HumanEval",
        "description": "Python programming problems",
        "category": "coding",
        "inspect_task": "inspect_evals/humaneval",
    },
    "mbpp": {
        "name": "MBPP",
        "description": "Mostly Basic Python Problems",
        "category": "coding",
        "inspect_task": "inspect_evals/mbpp",
    },
    "mle_bench": {
        "name": "MLE-bench",
        "description": "Machine learning engineering benchmark",
        "category": "coding",
        "inspect_task": "inspect_evals/mle_bench",
    },
    "mle_bench_lite": {
        "name": "MLE-bench Lite",
        "description": "Lightweight ML engineering benchmark",
        "category": "coding",
        "inspect_task": "inspect_evals/mle_bench_lite",
    },
    "paperbench": {
        "name": "PaperBench",
        "description": "Research paper implementation benchmark",
        "category": "coding",
        "inspect_task": "inspect_evals/paperbench",
    },
    "swe_bench": {
        "name": "SWE-bench",
        "description": "Real-world software engineering tasks",
        "category": "coding",
        "inspect_task": "inspect_evals/swe_bench",
    },
    "swe_bench_verified": {
        "name": "SWE-bench Verified",
        "description": "Verified software engineering tasks",
        "category": "coding",
        "inspect_task": "inspect_evals/swe_bench_verified",
    },
    "scicode": {
        "name": "SciCode",
        "description": "Scientific code generation",
        "category": "coding",
        "inspect_task": "inspect_evals/scicode",
    },
    "usaco": {
        "name": "USACO",
        "description": "USA Computing Olympiad problems",
        "category": "coding",
        "inspect_task": "inspect_evals/usaco",
    },

    # ============== ASSISTANTS (14) ==============
    "assistant_bench": {
        "name": "AssistantBench",
        "description": "General assistant capabilities",
        "category": "assistant",
        "inspect_task": "inspect_evals/assistant_bench",
    },
    "assistant_bench_closed": {
        "name": "AssistantBench (Closed)",
        "description": "Closed-book assistant evaluation",
        "category": "assistant",
        "inspect_task": "inspect_evals/assistant_bench_closed_book",
    },
    "assistant_bench_web": {
        "name": "AssistantBench (Web)",
        "description": "Web search assistant evaluation",
        "category": "assistant",
        "inspect_task": "inspect_evals/assistant_bench_web_search",
    },
    "bfcl": {
        "name": "BFCL",
        "description": "Berkeley Function-Calling Leaderboard",
        "category": "assistant",
        "inspect_task": "inspect_evals/bfcl",
    },
    "browse_comp": {
        "name": "BrowseComp",
        "description": "Web browsing comprehension",
        "category": "assistant",
        "inspect_task": "inspect_evals/browse_comp",
    },
    "gaia": {
        "name": "GAIA",
        "description": "General AI Assistants benchmark",
        "category": "assistant",
        "inspect_task": "inspect_evals/gaia",
    },
    "gaia_level1": {
        "name": "GAIA Level 1",
        "description": "GAIA easy difficulty",
        "category": "assistant",
        "inspect_task": "inspect_evals/gaia_level1",
    },
    "gaia_level2": {
        "name": "GAIA Level 2",
        "description": "GAIA medium difficulty",
        "category": "assistant",
        "inspect_task": "inspect_evals/gaia_level2",
    },
    "gaia_level3": {
        "name": "GAIA Level 3",
        "description": "GAIA hard difficulty",
        "category": "assistant",
        "inspect_task": "inspect_evals/gaia_level3",
    },
    "gdpval": {
        "name": "GDPval",
        "description": "GDP validation benchmark",
        "category": "assistant",
        "inspect_task": "inspect_evals/gdpval",
    },
    "mind2web": {
        "name": "Mind2Web",
        "description": "Web agent benchmark",
        "category": "assistant",
        "inspect_task": "inspect_evals/mind2web",
    },
    "osworld": {
        "name": "OSWorld",
        "description": "Operating system interaction benchmark",
        "category": "assistant",
        "inspect_task": "inspect_evals/osworld",
    },
    "osworld_small": {
        "name": "OSWorld (Small)",
        "description": "Lightweight OS interaction benchmark",
        "category": "assistant",
        "inspect_task": "inspect_evals/osworld_small",
    },
    "sycophancy": {
        "name": "Sycophancy",
        "description": "Sycophancy evaluation",
        "category": "assistant",
        "inspect_task": "inspect_evals/sycophancy",
    },

    # ============== CYBERSECURITY (11) ==============
    "cve_bench": {
        "name": "CVEBench",
        "description": "CVE vulnerability detection",
        "category": "cybersecurity",
        "inspect_task": "inspect_evals/cve_bench",
    },
    "cyberseceval_3": {
        "name": "CyberSecEval 3",
        "description": "Cybersecurity evaluation v3",
        "category": "cybersecurity",
        "inspect_task": "inspect_evals/cyberseceval_3",
    },
    "cyberseceval_2": {
        "name": "CyberSecEval 2",
        "description": "Cybersecurity evaluation v2",
        "category": "cybersecurity",
        "inspect_task": "inspect_evals/cyberseceval_2",
    },
    "threecb": {
        "name": "3CB",
        "description": "Catastrophic Cyber Capabilities Benchmark",
        "category": "cybersecurity",
        "inspect_task": "inspect_evals/threecb",
    },
    "cybench": {
        "name": "CyBench",
        "description": "Cybersecurity benchmark",
        "category": "cybersecurity",
        "inspect_task": "inspect_evals/cybench",
    },
    "cybermetric": {
        "name": "CyberMetric",
        "description": "Cybersecurity metrics evaluation",
        "category": "cybersecurity",
        "inspect_task": "inspect_evals/cybermetric",
    },
    "gdm_intercode_ctf": {
        "name": "InterCode CTF",
        "description": "CTF challenge benchmark",
        "category": "cybersecurity",
        "inspect_task": "inspect_evals/gdm_intercode_ctf",
    },
    "gdm_in_house_ctf": {
        "name": "In-House CTF",
        "description": "Custom CTF challenges",
        "category": "cybersecurity",
        "inspect_task": "inspect_evals/gdm_in_house_ctf",
    },
    "sevenllm": {
        "name": "7LLM",
        "description": "Security evaluation benchmark",
        "category": "cybersecurity",
        "inspect_task": "inspect_evals/sevenllm",
    },
    "sandboxbench": {
        "name": "SandboxBench",
        "description": "Sandbox escape evaluation",
        "category": "cybersecurity",
        "inspect_task": "inspect_evals/sandboxbench",
    },
    "sec_qa": {
        "name": "SecQA",
        "description": "Security Q&A benchmark",
        "category": "cybersecurity",
        "inspect_task": "inspect_evals/sec_qa",
    },

    # ============== SAFEGUARDS (17) ==============
    "ahb": {
        "name": "AHB",
        "description": "Adversarial Helpfulness Benchmark",
        "category": "safety",
        "inspect_task": "inspect_evals/ahb",
    },
    "abstention_bench": {
        "name": "Abstention Bench",
        "description": "Appropriate abstention evaluation",
        "category": "safety",
        "inspect_task": "inspect_evals/abstention_bench",
    },
    "agentdojo": {
        "name": "AgentDojo",
        "description": "Agent safety evaluation",
        "category": "safety",
        "inspect_task": "inspect_evals/agentdojo",
    },
    "agentharm": {
        "name": "AgentHarm",
        "description": "Agent harm evaluation",
        "category": "safety",
        "inspect_task": "inspect_evals/agentharm",
    },
    "fortress": {
        "name": "Fortress",
        "description": "Robustness evaluation",
        "category": "safety",
        "inspect_task": "inspect_evals/fortress",
    },
    "lab_bench": {
        "name": "LabBench",
        "description": "Laboratory safety benchmark",
        "category": "safety",
        "inspect_task": "inspect_evals/lab_bench",
    },
    "mask": {
        "name": "MASK",
        "description": "Safety masking evaluation",
        "category": "safety",
        "inspect_task": "inspect_evals/mask",
    },
    "make_me_pay": {
        "name": "Make Me Pay",
        "description": "Persuasion resistance evaluation",
        "category": "safety",
        "inspect_task": "inspect_evals/make_me_pay",
    },
    "makemesay": {
        "name": "Make Me Say",
        "description": "Prompt injection resistance",
        "category": "safety",
        "inspect_task": "inspect_evals/makemesay",
    },
    "mind2web_sc": {
        "name": "Mind2Web Safety",
        "description": "Web agent safety evaluation",
        "category": "safety",
        "inspect_task": "inspect_evals/mind2web_sc",
    },
    "stereoset": {
        "name": "StereoSet",
        "description": "Stereotype bias evaluation",
        "category": "safety",
        "inspect_task": "inspect_evals/stereoset",
    },
    "strong_reject": {
        "name": "Strong Reject",
        "description": "Refusal strength evaluation",
        "category": "safety",
        "inspect_task": "inspect_evals/strong_reject",
    },
    "coconot": {
        "name": "CoCoNot",
        "description": "Constraint compliance evaluation",
        "category": "safety",
        "inspect_task": "inspect_evals/coconot",
    },
    "wmdp": {
        "name": "WMDP",
        "description": "Weapons of Mass Destruction Proxy",
        "category": "safety",
        "inspect_task": "inspect_evals/wmdp",
    },
    "b3": {
        "name": "B3",
        "description": "Biosecurity benchmark",
        "category": "safety",
        "inspect_task": "inspect_evals/b3",
    },
    "toxigen": {
        "name": "ToxiGen",
        "description": "Toxicity detection and avoidance",
        "category": "safety",
        "inspect_task": "inspect_evals/toxigen",
    },
    "xstest": {
        "name": "XSTest",
        "description": "Safety and refusal evaluation",
        "category": "safety",
        "inspect_task": "inspect_evals/xstest",
    },

    # ============== MATHEMATICS (6) ==============
    "aime2024": {
        "name": "AIME 2024",
        "description": "American Invitational Math Exam 2024",
        "category": "math",
        "inspect_task": "inspect_evals/aime2024",
    },
    "aime2025": {
        "name": "AIME 2025",
        "description": "American Invitational Math Exam 2025",
        "category": "math",
        "inspect_task": "inspect_evals/aime2025",
    },
    "gsm8k": {
        "name": "GSM8K",
        "description": "Grade school math word problems",
        "category": "math",
        "inspect_task": "inspect_evals/gsm8k",
    },
    "math": {
        "name": "MATH",
        "description": "Competition mathematics problems",
        "category": "math",
        "inspect_task": "inspect_evals/math",
    },
    "mgsm": {
        "name": "MGSM",
        "description": "Multilingual grade school math",
        "category": "math",
        "inspect_task": "inspect_evals/mgsm",
    },
    "mathvista": {
        "name": "MathVista",
        "description": "Visual math reasoning",
        "category": "math",
        "inspect_task": "inspect_evals/mathvista",
    },

    # ============== REASONING (20) ==============
    "arc": {
        "name": "ARC Challenge",
        "description": "AI2 Reasoning Challenge",
        "category": "reasoning",
        "inspect_task": "inspect_evals/arc_challenge",
    },
    "bbh": {
        "name": "BBH",
        "description": "Big Bench Hard",
        "category": "reasoning",
        "inspect_task": "inspect_evals/bbh",
    },
    "bbeh": {
        "name": "BBEH",
        "description": "Big Bench Extra Hard",
        "category": "reasoning",
        "inspect_task": "inspect_evals/bbeh",
    },
    "boolq": {
        "name": "BoolQ",
        "description": "Boolean question answering",
        "category": "reasoning",
        "inspect_task": "inspect_evals/boolq",
    },
    "drop": {
        "name": "DROP",
        "description": "Discrete reasoning over paragraphs",
        "category": "reasoning",
        "inspect_task": "inspect_evals/drop",
    },
    "hellaswag": {
        "name": "HellaSwag",
        "description": "Commonsense reasoning",
        "category": "reasoning",
        "inspect_task": "inspect_evals/hellaswag",
    },
    "ifeval": {
        "name": "IFEval",
        "description": "Instruction following evaluation",
        "category": "reasoning",
        "inspect_task": "inspect_evals/ifeval",
    },
    "lingoly": {
        "name": "Lingoly",
        "description": "Linguistic olympiad problems",
        "category": "reasoning",
        "inspect_task": "inspect_evals/lingoly",
    },
    "mmmu": {
        "name": "MMMU",
        "description": "Massive Multi-discipline Multimodal Understanding",
        "category": "reasoning",
        "inspect_task": "inspect_evals/mmmu",
    },
    "musr": {
        "name": "MuSR",
        "description": "Multi-step soft reasoning",
        "category": "reasoning",
        "inspect_task": "inspect_evals/musr",
    },
    "niah": {
        "name": "NIAH",
        "description": "Needle in a Haystack",
        "category": "reasoning",
        "inspect_task": "inspect_evals/niah",
    },
    "novelty_bench": {
        "name": "NoveltyBench",
        "description": "Novel reasoning evaluation",
        "category": "reasoning",
        "inspect_task": "inspect_evals/novelty_bench",
    },
    "paws": {
        "name": "PAWS",
        "description": "Paraphrase Adversaries from Word Scrambling",
        "category": "reasoning",
        "inspect_task": "inspect_evals/paws",
    },
    "piqa": {
        "name": "PIQA",
        "description": "Physical intuition QA",
        "category": "reasoning",
        "inspect_task": "inspect_evals/piqa",
    },
    "race_h": {
        "name": "RACE-H",
        "description": "Reading comprehension (high school)",
        "category": "reasoning",
        "inspect_task": "inspect_evals/race_h",
    },
    "squad": {
        "name": "SQuAD",
        "description": "Stanford Question Answering Dataset",
        "category": "reasoning",
        "inspect_task": "inspect_evals/squad",
    },
    "vimgolf": {
        "name": "VimGolf",
        "description": "Vim editing challenges",
        "category": "reasoning",
        "inspect_task": "inspect_evals/vimgolf",
    },
    "winogrande": {
        "name": "Winogrande",
        "description": "Commonsense reasoning - pronoun resolution",
        "category": "reasoning",
        "inspect_task": "inspect_evals/winogrande",
    },
    "worldsense": {
        "name": "WorldSense",
        "description": "World knowledge reasoning",
        "category": "reasoning",
        "inspect_task": "inspect_evals/worldsense",
    },
    "infinite_bench": {
        "name": "InfiniteBench",
        "description": "Long context reasoning",
        "category": "reasoning",
        "inspect_task": "inspect_evals/infinite_bench",
    },

    # ============== KNOWLEDGE (20) ==============
    "agieval": {
        "name": "AGIEval",
        "description": "Human-centric benchmark",
        "category": "knowledge",
        "inspect_task": "inspect_evals/agieval",
    },
    "air_bench": {
        "name": "AIR-Bench",
        "description": "AI safety research benchmark",
        "category": "knowledge",
        "inspect_task": "inspect_evals/air_bench",
    },
    "chembench": {
        "name": "ChemBench",
        "description": "Chemistry knowledge benchmark",
        "category": "knowledge",
        "inspect_task": "inspect_evals/chembench",
    },
    "commonsense_qa": {
        "name": "CommonsenseQA",
        "description": "Commonsense reasoning questions",
        "category": "knowledge",
        "inspect_task": "inspect_evals/commonsense_qa",
    },
    "gpqa": {
        "name": "GPQA",
        "description": "Graduate-level science questions",
        "category": "knowledge",
        "inspect_task": "inspect_evals/gpqa",
    },
    "gpqa_diamond": {
        "name": "GPQA Diamond",
        "description": "GPQA hardest subset",
        "category": "knowledge",
        "inspect_task": "inspect_evals/gpqa_diamond",
    },
    "healthbench": {
        "name": "HealthBench",
        "description": "Medical knowledge benchmark",
        "category": "knowledge",
        "inspect_task": "inspect_evals/healthbench",
    },
    "hle": {
        "name": "HLE",
        "description": "Humanity's Last Exam",
        "category": "knowledge",
        "inspect_task": "inspect_evals/hle",
    },
    "livebench": {
        "name": "LiveBench",
        "description": "Live updating benchmark",
        "category": "knowledge",
        "inspect_task": "inspect_evals/livebench",
    },
    "mmlu_pro": {
        "name": "MMLU-Pro",
        "description": "Extended MMLU with harder questions",
        "category": "knowledge",
        "inspect_task": "inspect_evals/mmlu_pro",
    },
    "mmlu": {
        "name": "MMLU",
        "description": "Massive Multitask Language Understanding (0-shot)",
        "category": "knowledge",
        "inspect_task": "inspect_evals/mmlu_0_shot",
    },
    "mmlu_5_shot": {
        "name": "MMLU 5-Shot",
        "description": "MMLU with 5-shot examples for improved accuracy",
        "category": "knowledge",
        "inspect_task": "inspect_evals/mmlu_5_shot",
    },
    "medqa": {
        "name": "MedQA",
        "description": "Medical question answering",
        "category": "knowledge",
        "inspect_task": "inspect_evals/medqa",
    },
    "onet": {
        "name": "O*NET",
        "description": "Occupational knowledge benchmark",
        "category": "knowledge",
        "inspect_task": "inspect_evals/onet",
    },
    "pre_flight": {
        "name": "PreFlight",
        "description": "Pre-deployment evaluation",
        "category": "knowledge",
        "inspect_task": "inspect_evals/pre_flight",
    },
    "pubmedqa": {
        "name": "PubMedQA",
        "description": "Biomedical question answering",
        "category": "knowledge",
        "inspect_task": "inspect_evals/pubmedqa",
    },
    "sosbench": {
        "name": "SOSBench",
        "description": "Science of science benchmark",
        "category": "knowledge",
        "inspect_task": "inspect_evals/sosbench",
    },
    "sciknoweval": {
        "name": "SciKnowEval",
        "description": "Scientific knowledge evaluation",
        "category": "knowledge",
        "inspect_task": "inspect_evals/sciknoweval",
    },
    "simpleqa": {
        "name": "SimpleQA",
        "description": "Simple factual QA",
        "category": "knowledge",
        "inspect_task": "inspect_evals/simpleqa",
    },
    "truthfulqa": {
        "name": "TruthfulQA",
        "description": "Truthfulness and factuality evaluation",
        "category": "knowledge",
        "inspect_task": "inspect_evals/truthfulqa",
    },
    "uccb": {
        "name": "UCCB",
        "description": "UC Berkeley benchmark",
        "category": "knowledge",
        "inspect_task": "inspect_evals/uccb",
    },

    # ============== SCHEMING (4) ==============
    "agentic_misalignment": {
        "name": "Agentic Misalignment",
        "description": "Agent goal misalignment detection",
        "category": "scheming",
        "inspect_task": "inspect_evals/agentic_misalignment",
    },
    "gdm_sp_apps": {
        "name": "Self-Proliferation",
        "description": "Self-replication evaluation",
        "category": "scheming",
        "inspect_task": "inspect_evals/gdm_sp_apps",
    },
    "gdm_sr_self_reasoning": {
        "name": "Self-Reasoning",
        "description": "Self-reasoning evaluation",
        "category": "scheming",
        "inspect_task": "inspect_evals/gdm_sr_self_reasoning",
    },
    "gdm_stealth": {
        "name": "Stealth",
        "description": "Stealth behavior detection",
        "category": "scheming",
        "inspect_task": "inspect_evals/gdm_stealth",
    },

    # ============== MULTIMODAL (4) ==============
    "docvqa": {
        "name": "DocVQA",
        "description": "Document visual QA",
        "category": "multimodal",
        "inspect_task": "inspect_evals/docvqa",
    },
    "mmiu": {
        "name": "MMIU",
        "description": "Multimodal understanding",
        "category": "multimodal",
        "inspect_task": "inspect_evals/mmiu",
    },
    "vstar_bench": {
        "name": "V*Bench",
        "description": "Vision benchmark",
        "category": "multimodal",
        "inspect_task": "inspect_evals/vstar_bench",
    },
    "zerobench": {
        "name": "ZeroBench",
        "description": "Zero-shot vision benchmark",
        "category": "multimodal",
        "inspect_task": "inspect_evals/zerobench",
    },

    # ============== BIAS (2) ==============
    "bbq": {
        "name": "BBQ",
        "description": "Bias Benchmark for QA",
        "category": "bias",
        "inspect_task": "inspect_evals/bbq",
    },
    "bold": {
        "name": "BOLD",
        "description": "Bias in Open-ended Language Generation",
        "category": "bias",
        "inspect_task": "inspect_evals/bold",
    },

    # ============== PERSONALITY (3) ==============
    "personality_bfi": {
        "name": "Personality BFI",
        "description": "Big Five Inventory personality",
        "category": "personality",
        "inspect_task": "inspect_evals/personality_bfi",
    },
    "personality_trait": {
        "name": "Personality Trait",
        "description": "Personality trait evaluation",
        "category": "personality",
        "inspect_task": "inspect_evals/personality_trait",
    },
    "personality_prime": {
        "name": "Personality Prime",
        "description": "Personality priming evaluation",
        "category": "personality",
        "inspect_task": "inspect_evals/personality_prime",
    },

    # ============== WRITING (1) ==============
    "writingbench": {
        "name": "WritingBench",
        "description": "Writing quality evaluation",
        "category": "writing",
        "inspect_task": "inspect_evals/writingbench",
    },
}


class EvalRequest(BaseModel):
    """Request to run an evaluation"""
    model: str = Field(..., description="Model identifier (e.g., 'gpt-4o', 'claude-3-5-sonnet')")
    benchmark: str = Field(..., description="Benchmark ID (e.g., 'mmlu', 'humaneval')")
    provider: Optional[str] = Field(default="openrouter", description="Provider (openrouter, openai, anthropic, google, together, fireworks)")
    limit: Optional[int] = Field(default=10, ge=1, le=10000, description="Number of samples to run (1-10000)")
    temperature: Optional[float] = Field(default=0.0, ge=0.0, le=2.0, description="Sampling temperature (0-2)")
    max_tokens: Optional[int] = Field(default=1024, ge=1, le=32000, description="Maximum tokens for generation")
    seed: Optional[int] = Field(default=None, ge=0, description="Random seed for reproducibility")
    epochs: Optional[int] = Field(default=1, ge=1, le=100, description="Number of repeated runs for variance analysis (1-100)")

    @validator('model')
    def validate_model(cls, v):
        if not v or not v.strip():
            raise ValueError('Model identifier cannot be empty')
        return v.strip()

    @validator('provider')
    def validate_provider(cls, v):
        if v:
            v = v.lower()
            valid_providers = ["openrouter", "openai", "anthropic", "google", "together", "fireworks"]
            if v not in valid_providers:
                raise ValueError(f"Invalid provider. Must be one of: {', '.join(valid_providers)}")
        return v


class EvalResult(BaseModel):
    """Result of an evaluation"""
    model: str
    benchmark: str
    score: float
    total_samples: int
    correct: int
    duration_seconds: float
    timestamp: str
    details: Optional[dict] = None


@app.get("/")
async def root():
    """API info and basic status"""
    return {
        "service": "Eval Service",
        "version": "2.0.0",
        "benchmarks_available": len(AVAILABLE_BENCHMARKS),
        "categories": list(set(b["category"] for b in AVAILABLE_BENCHMARKS.values())),
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health_check():
    """
    Comprehensive health check with dependency status.

    Returns:
        - status: "healthy", "degraded", or "unhealthy"
        - checks: individual dependency status
    """
    checks = {
        "inspect_ai": False,
        "inspect_evals": False,
        "providers_configured": False,
        "provider_count": 0,
    }

    # Check if Inspect AI is importable
    try:
        from inspect_runner import is_inspect_available, get_available_providers
        checks["inspect_ai"] = is_inspect_available()

        # Check for inspect_evals
        try:
            import inspect_evals
            checks["inspect_evals"] = True
        except ImportError:
            checks["inspect_evals"] = False

        # Check for configured providers
        providers = get_available_providers()
        configured = [p for p in providers if p.get("configured")]
        checks["provider_count"] = len(configured)
        checks["providers_configured"] = len(configured) > 0
        checks["configured_providers"] = [p["id"] for p in configured]

    except ImportError as e:
        logger.error(f"Health check failed - import error: {e}")

    # Determine overall status
    if checks["inspect_ai"] and checks["providers_configured"]:
        status = "healthy"
    elif checks["inspect_ai"] or checks["providers_configured"]:
        status = "degraded"
    else:
        status = "unhealthy"

    return {
        "status": status,
        "version": "2.0.0",
        "checks": checks,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@app.get("/benchmarks")
async def list_benchmarks(category: Optional[str] = None):
    """List all available benchmarks"""
    from inspect_runner import get_benchmark_dependency_info

    benchmarks = AVAILABLE_BENCHMARKS

    if category:
        benchmarks = {
            k: v for k, v in benchmarks.items()
            if v["category"] == category
        }

    # Add dependency info to each benchmark
    benchmark_list = []
    for k, v in benchmarks.items():
        benchmark_data = {"id": k, **v}
        dep_info = get_benchmark_dependency_info(k)
        if dep_info:
            benchmark_data["requires_dependencies"] = True
            benchmark_data["dependency_info"] = dep_info
        else:
            benchmark_data["requires_dependencies"] = False
        benchmark_list.append(benchmark_data)

    return {
        "benchmarks": benchmark_list,
        "categories": list(set(b["category"] for b in AVAILABLE_BENCHMARKS.values())),
        "total": len(benchmarks),
    }


@app.get("/benchmarks/{benchmark_id}")
async def get_benchmark(benchmark_id: str):
    """Get details about a specific benchmark"""
    from inspect_runner import get_benchmark_dependency_info

    if benchmark_id not in AVAILABLE_BENCHMARKS:
        raise HTTPException(status_code=404, detail=f"Benchmark '{benchmark_id}' not found")

    result = {
        "id": benchmark_id,
        **AVAILABLE_BENCHMARKS[benchmark_id],
    }

    # Add dependency info if applicable
    dep_info = get_benchmark_dependency_info(benchmark_id)
    if dep_info:
        result["requires_dependencies"] = True
        result["dependency_info"] = dep_info
    else:
        result["requires_dependencies"] = False

    return result


@app.get("/providers")
async def list_providers():
    """List all available providers with their configuration status"""
    from inspect_runner import get_available_providers

    providers = get_available_providers()

    return {
        "providers": providers,
        "configured": [p for p in providers if p["configured"]],
        "total": len(providers),
    }


async def run_inspect_evaluation(
    model: str,
    benchmark: str,
    limit: int = 10,
    provider: str = "openrouter",
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    seed: Optional[int] = None,
    epochs: int = 1,
) -> AsyncGenerator[str, None]:
    """
    Run an Inspect AI evaluation and stream results.

    Args:
        model: Model identifier
        benchmark: Benchmark to run
        limit: Number of samples
        provider: Provider to use (openrouter, openai, anthropic, google, together, fireworks)
        temperature: Sampling temperature (0-2)
        max_tokens: Maximum tokens for generation
        seed: Random seed for reproducibility
        epochs: Number of repeated runs for variance analysis
    """
    from inspect_runner import is_inspect_available, run_with_inspect_ai, get_supported_benchmarks, PROVIDERS

    logger.info(f"Starting evaluation: model={model}, benchmark={benchmark}, limit={limit}, provider={provider}, seed={seed}, epochs={epochs}")

    benchmark_config = AVAILABLE_BENCHMARKS.get(benchmark)
    if not benchmark_config:
        yield f"data: {json.dumps({'type': 'error', 'code': 'BENCHMARK_NOT_FOUND', 'error': f'Unknown benchmark: {benchmark}'})}\n\n"
        return

    # Normalize provider to lowercase
    provider = provider.lower() if provider else "openrouter"

    # Validate provider
    if provider not in PROVIDERS:
        yield f"data: {json.dumps({'type': 'error', 'code': 'PROVIDER_NOT_FOUND', 'error': f'Unknown provider: {provider}. Available: {list(PROVIDERS.keys())}'})}\n\n"
        return

    provider_config = PROVIDERS[provider]

    # Send start message with provider info
    yield f"data: {json.dumps({'type': 'start', 'model': model, 'benchmark': benchmark, 'limit': limit, 'provider': provider, 'provider_name': provider_config['name'], 'seed': seed, 'epochs': epochs})}\n\n"

    # Check if Inspect AI is available
    if not is_inspect_available():
        yield f"data: {json.dumps({'type': 'error', 'code': 'INSPECT_NOT_INSTALLED', 'error': 'Inspect AI or inspect-evals not installed. Run: pip install inspect-ai inspect-evals'})}\n\n"
        return

    # Check if benchmark is supported
    if benchmark not in get_supported_benchmarks():
        yield f"data: {json.dumps({'type': 'error', 'code': 'BENCHMARK_NOT_FOUND', 'error': f'Benchmark {benchmark} not in supported list'})}\n\n"
        return

    provider_name = provider_config["name"]
    yield f"data: {json.dumps({'type': 'progress', 'message': f'Using Inspect AI via {provider_name} for {benchmark}...'})}\n\n"

    # Run with the specified provider and all parameters
    async for result in run_with_inspect_ai(
        model_id=model,
        benchmark=benchmark,
        limit=limit,
        provider=provider,
        temperature=temperature,
        max_tokens=max_tokens,
        seed=seed,
        epochs=epochs,
    ):
        yield f"data: {json.dumps(result)}\n\n"
        if result.get("type") in ("complete", "error"):
            logger.info(f"Evaluation finished: model={model}, benchmark={benchmark}, type={result.get('type')}")
            return


@app.post("/run/stream")
async def stream_evaluation(request: EvalRequest):
    """
    Run an evaluation and stream results via Server-Sent Events.

    This endpoint streams progress updates as the evaluation runs.
    Supports seed for reproducibility and epochs for variance analysis.
    """
    if request.benchmark not in AVAILABLE_BENCHMARKS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown benchmark: {request.benchmark}. Available: {len(AVAILABLE_BENCHMARKS)} benchmarks"
        )

    logger.info(f"Stream evaluation request: model={request.model}, benchmark={request.benchmark}, provider={request.provider}, seed={request.seed}, epochs={request.epochs}")

    return StreamingResponse(
        run_inspect_evaluation(
            model=request.model,
            benchmark=request.benchmark,
            limit=request.limit or 10,
            provider=request.provider or "openrouter",
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            seed=request.seed,
            epochs=request.epochs or 1,
        ),
        media_type="text/event-stream",
    )


@app.post("/run")
async def run_evaluation_sync(request: EvalRequest) -> EvalResult:
    """
    Run an evaluation and return the final result.

    For non-streaming use cases. Blocks until evaluation completes.
    Supports seed for reproducibility and epochs for variance analysis.
    """
    if request.benchmark not in AVAILABLE_BENCHMARKS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown benchmark: {request.benchmark}"
        )

    logger.info(f"Sync evaluation request: model={request.model}, benchmark={request.benchmark}")

    # Collect all streamed results
    async for chunk in run_inspect_evaluation(
        model=request.model,
        benchmark=request.benchmark,
        limit=request.limit or 10,
        provider=request.provider or "openrouter",
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        seed=request.seed,
        epochs=request.epochs or 1,
    ):
        if chunk.startswith("data: "):
            try:
                data = json.loads(chunk[6:].strip())
                if data.get("type") == "complete":
                    return EvalResult(
                        model=data["model"],
                        benchmark=data["benchmark"],
                        score=data["score"],
                        total_samples=data["total"],
                        correct=data["correct"],
                        duration_seconds=data["duration_seconds"],
                        timestamp=data["timestamp"],
                        details={
                            "seed": data.get("seed"),
                            "epochs": data.get("epochs"),
                            "provider": data.get("provider"),
                            "epoch_results": data.get("epoch_results"),
                        } if data.get("epochs", 1) > 1 else None,
                    )
                elif data.get("type") == "error":
                    raise HTTPException(status_code=500, detail=data["error"])
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse chunk: {chunk[:100]}... Error: {e}")

    raise HTTPException(status_code=500, detail="Evaluation did not complete")


if __name__ == "__main__":
    import uvicorn
    # Default to localhost for local development (use 0.0.0.0 in Docker via environment)
    host = os.getenv("UVICORN_HOST", "127.0.0.1")
    port = int(os.getenv("UVICORN_PORT", "8000"))
    uvicorn.run(app, host=host, port=port)
