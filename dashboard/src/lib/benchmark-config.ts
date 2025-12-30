// Benchmark and use case definitions for the eval dashboard
// These define the evaluation framework - actual evaluation results come from running evals

// Dependency information for benchmarks with special requirements
export interface BenchmarkDependency {
  package?: string | null;
  installCmd?: string | null;
  requirements: string[];
  description: string;
  warning?: string;  // Warning message to show in UI
}

// Benchmarks that require additional dependencies beyond the base install
export const benchmarkDependencies: Record<string, BenchmarkDependency> = {
  // SWE-bench family - requires swebench package, Docker, and pre-built images
  swe_bench: {
    package: "swebench",
    installCmd: "pip install inspect-evals[swe_bench]",
    requirements: ["Python 3.11+", "Docker", "Pre-built SWE-bench images", "100GB+ disk space"],
    description: "Software engineering benchmark requiring code execution sandbox",
    warning: "⚠️ COMPLEX SETUP: Requires Docker, pre-built SWE-bench environment images, and 100GB+ disk space. First run takes 1+ hours to build images. Not recommended for quick evaluations.",
  },
  swe_bench_verified: {
    package: "swebench",
    installCmd: "pip install inspect-evals[swe_bench]",
    requirements: ["Python 3.11+", "Docker", "Pre-built SWE-bench images", "100GB+ disk space"],
    description: "Verified subset of SWE-bench",
    warning: "⚠️ COMPLEX SETUP: Requires Docker, pre-built SWE-bench environment images, and 100GB+ disk space. First run takes 1+ hours to build images. Not recommended for quick evaluations.",
  },
  // MLE-bench - requires mlebench package
  mle_bench: {
    package: "mlebench",
    installCmd: "pip install inspect-evals[mle_bench]",
    requirements: ["Python 3.11+", "mlebench package"],
    description: "Machine learning engineering benchmark",
    warning: "⚡ SHOULD WORK: Dependencies pre-installed. Requires Python 3.11+ and mlebench package.",
  },
  mle_bench_lite: {
    package: "mlebench",
    installCmd: "pip install inspect-evals[mle_bench]",
    requirements: ["Python 3.11+", "mlebench package"],
    description: "Lite version of MLE-bench",
    warning: "⚡ SHOULD WORK: Dependencies pre-installed. Requires Python 3.11+ and mlebench package.",
  },
  // GAIA - requires playwright for web browsing
  gaia: {
    package: "playwright",
    installCmd: "pip install inspect-evals[gaia] && playwright install",
    requirements: ["Playwright browsers", "Chromium"],
    description: "General AI assistants benchmark with web browsing",
    warning: "⚡ SHOULD WORK: Playwright and Chromium pre-installed. May have issues in containerized environment.",
  },
  gaia_level1: {
    package: "playwright",
    installCmd: "pip install inspect-evals[gaia] && playwright install",
    requirements: ["Playwright browsers", "Chromium"],
    description: "GAIA Level 1 tasks",
    warning: "⚡ SHOULD WORK: Playwright and Chromium pre-installed. May have issues in containerized environment.",
  },
  gaia_level2: {
    package: "playwright",
    installCmd: "pip install inspect-evals[gaia] && playwright install",
    requirements: ["Playwright browsers", "Chromium"],
    description: "GAIA Level 2 tasks",
    warning: "⚡ SHOULD WORK: Playwright and Chromium pre-installed. May have issues in containerized environment.",
  },
  gaia_level3: {
    package: "playwright",
    installCmd: "pip install inspect-evals[gaia] && playwright install",
    requirements: ["Playwright browsers", "Chromium"],
    description: "GAIA Level 3 tasks",
    warning: "⚡ SHOULD WORK: Playwright and Chromium pre-installed. May have issues in containerized environment.",
  },
  // Cybersecurity benchmarks - require Docker with pre-built images
  cybench: {
    package: null,
    installCmd: null,
    requirements: ["Docker", "65GB+ disk space", "40+ pre-built challenge images"],
    description: "Cybersecurity benchmark requiring Docker containers",
    warning: "⚠️ COMPLEX SETUP: Requires Docker with 65GB+ disk space and 40+ challenge-specific container images that must be pre-built. Will fail without extensive setup.",
  },
  gdm_intercode_ctf: {
    package: null,
    installCmd: null,
    requirements: ["Docker", "32GB+ RAM", "Pre-built CTF images"],
    description: "GDM CTF benchmark requiring Docker",
    warning: "⚠️ COMPLEX SETUP: Requires Docker with 32GB+ RAM and pre-built CTF challenge images. Will fail without extensive setup.",
  },
  gdm_in_house_ctf: {
    package: null,
    installCmd: null,
    requirements: ["Docker", "32GB+ RAM", "12+ pre-built challenge images"],
    description: "GDM in-house CTF benchmark requiring Docker",
    warning: "⚠️ COMPLEX SETUP: Requires Docker with 32GB+ RAM and 12+ specialized challenge container images. Will fail without extensive setup.",
  },
  // OSWorld - requires Docker with pre-built OS simulation containers
  osworld: {
    package: null,
    installCmd: null,
    requirements: ["Docker", "Pre-built OS simulation container"],
    description: "OS-level task benchmark requiring Docker",
    warning: "⚠️ COMPLEX SETUP: Requires Docker with pre-built OS simulation containers. Will fail without extensive setup.",
  },
  osworld_small: {
    package: null,
    installCmd: null,
    requirements: ["Docker", "Pre-built OS simulation container"],
    description: "Small subset of OSWorld",
    warning: "⚠️ COMPLEX SETUP: Requires Docker with pre-built OS simulation containers. Will fail without extensive setup.",
  },
  // SciKnowEval - incompatible with Python 3.13+
  sciknoweval: {
    package: "gensim",
    installCmd: "pip install gensim",
    requirements: ["Python 3.10-3.12", "gensim package"],
    description: "Scientific knowledge evaluation (gensim dependency)",
    warning: "⚡ SHOULD WORK: gensim pre-installed on Python 3.12. Incompatible with Python 3.13+.",
  },
};

// Helper function to get dependency info for a benchmark
export function getBenchmarkDependency(benchmarkId: string): BenchmarkDependency | undefined {
  return benchmarkDependencies[benchmarkId];
}

// Helper function to check if a benchmark has dependency requirements
export function hasDependencyRequirements(benchmarkId: string): boolean {
  return benchmarkId in benchmarkDependencies;
}

export interface EvalResult {
  provider: string;
  providerTag: string;
  model: string;
  benchmark: string;
  score: number | null;
  error?: string;
  durationMs: number;
  timestamp: string;
  samplesEvaluated: number;
  metadata?: {
    quantization?: string;
    contextLength?: number;
    pricing?: { input: number; output: number };
    uptime?: number;
  };
}

export interface BenchmarkScore {
  benchmark: string;
  category: string;
  score: number;
  percentile: number;
}

// Available benchmarks - IDs must match the Python eval service (inspect_evals)
// Run `curl http://localhost:8000/benchmarks` to see all available benchmarks
export const availableBenchmarks = [
  // Core Knowledge & Reasoning
  { id: "mmlu", name: "MMLU", category: "Knowledge", description: "Massive Multitask Language Understanding - 57 subjects (0-shot)", capabilities: ["chat"] },
  { id: "mmlu_5_shot", name: "MMLU 5-Shot", category: "Knowledge", description: "MMLU with 5-shot examples for improved accuracy", capabilities: ["chat"] },
  { id: "mmlu_pro", name: "MMLU-Pro", category: "Knowledge", description: "Enhanced knowledge and reasoning evaluation", capabilities: ["chat"] },
  { id: "gpqa", name: "GPQA", category: "Knowledge", description: "Graduate-level science questions", capabilities: ["chat", "reasoning"] },
  { id: "gpqa_diamond", name: "GPQA Diamond", category: "Knowledge", description: "GPQA hardest subset", capabilities: ["chat", "reasoning"] },
  { id: "truthfulqa", name: "TruthfulQA", category: "Safety", description: "Truthfulness and factuality evaluation", capabilities: ["chat"] },
  { id: "hellaswag", name: "HellaSwag", category: "Reasoning", description: "Commonsense reasoning", capabilities: ["chat"] },
  { id: "arc", name: "ARC Challenge", category: "Reasoning", description: "AI2 Reasoning Challenge", capabilities: ["chat"] },
  { id: "simpleqa", name: "SimpleQA", category: "Knowledge", description: "Factual question answering", capabilities: ["chat"] },
  { id: "commonsense_qa", name: "CommonsenseQA", category: "Knowledge", description: "Commonsense reasoning questions", capabilities: ["chat"] },

  // Coding Benchmarks
  { id: "humaneval", name: "HumanEval", category: "Coding", description: "Python programming problems", capabilities: ["coding", "chat"] },
  { id: "swe_bench", name: "SWE-bench", category: "Coding", description: "Real-world software engineering tasks", capabilities: ["coding"] },
  { id: "swe_bench_verified", name: "SWE-bench Verified", category: "Coding", description: "Verified software engineering tasks", capabilities: ["coding"] },
  { id: "bigcodebench", name: "BigCodeBench", category: "Coding", description: "Large-scale code generation", capabilities: ["coding"] },
  { id: "mbpp", name: "MBPP", category: "Coding", description: "Mostly Basic Python Problems", capabilities: ["coding"] },
  { id: "apps", name: "APPS", category: "Coding", description: "Automated Programming Progress Standard", capabilities: ["coding"] },
  { id: "ds1000", name: "DS-1000", category: "Coding", description: "Data science code generation", capabilities: ["coding"] },
  { id: "usaco", name: "USACO", category: "Coding", description: "USA Computing Olympiad problems", capabilities: ["coding", "reasoning"] },
  { id: "class_eval", name: "ClassEval", category: "Coding", description: "Class-level code generation", capabilities: ["coding"] },
  { id: "scicode", name: "SciCode", category: "Coding", description: "Scientific code generation", capabilities: ["coding"] },
  { id: "agent_bench", name: "AgentBench", category: "Coding", description: "Agent benchmark for OS tasks", capabilities: ["coding", "function_calling"] },
  { id: "core_bench", name: "CoreBench", category: "Coding", description: "Core coding benchmark", capabilities: ["coding"] },
  { id: "mle_bench", name: "MLE-Bench", category: "Coding", description: "Machine learning engineering benchmark", capabilities: ["coding"] },
  { id: "mle_bench_lite", name: "MLE-Bench Lite", category: "Coding", description: "MLE-Bench lightweight version", capabilities: ["coding"] },
  { id: "paperbench", name: "PaperBench", category: "Coding", description: "Paper implementation benchmark", capabilities: ["coding"] },

  // Math Benchmarks
  { id: "gsm8k", name: "GSM8K", category: "Math", description: "Grade school math word problems", capabilities: ["chat", "reasoning"] },
  { id: "math", name: "MATH", category: "Math", description: "Competition mathematics problems", capabilities: ["reasoning"] },
  { id: "aime2024", name: "AIME 2024", category: "Math", description: "American Invitational Math Exam 2024", capabilities: ["reasoning"] },
  { id: "aime2025", name: "AIME 2025", category: "Math", description: "American Invitational Math Exam 2025", capabilities: ["reasoning"] },
  { id: "mgsm", name: "MGSM", category: "Math", description: "Multilingual grade school math", capabilities: ["reasoning"] },
  { id: "mathvista", name: "MathVista", category: "Math", description: "Visual math reasoning", capabilities: ["vision", "reasoning"] },

  // Agentic Benchmarks
  { id: "gaia", name: "GAIA", category: "Agentic", description: "General AI Assistants benchmark", capabilities: ["function_calling", "reasoning"] },
  { id: "gaia_level1", name: "GAIA Level 1", category: "Agentic", description: "GAIA easy difficulty", capabilities: ["function_calling"] },
  { id: "gaia_level2", name: "GAIA Level 2", category: "Agentic", description: "GAIA medium difficulty", capabilities: ["function_calling"] },
  { id: "gaia_level3", name: "GAIA Level 3", category: "Agentic", description: "GAIA hard difficulty", capabilities: ["function_calling"] },
  { id: "browse_comp", name: "BrowseComp", category: "Agentic", description: "Web browsing comprehension", capabilities: ["function_calling"] },
  { id: "assistant_bench", name: "AssistantBench", category: "Agentic", description: "General assistant capabilities", capabilities: ["function_calling"] },
  { id: "assistant_bench_closed", name: "AssistantBench Closed", category: "Agentic", description: "Closed-book assistant benchmark", capabilities: ["function_calling"] },
  { id: "assistant_bench_web", name: "AssistantBench Web", category: "Agentic", description: "Web search assistant benchmark", capabilities: ["function_calling"] },
  { id: "mind2web", name: "Mind2Web", category: "Agentic", description: "Web agent benchmark", capabilities: ["function_calling"] },
  { id: "osworld", name: "OSWorld", category: "Agentic", description: "Operating system interaction", capabilities: ["function_calling"] },
  { id: "osworld_small", name: "OSWorld Small", category: "Agentic", description: "OSWorld lightweight version", capabilities: ["function_calling"] },
  { id: "bfcl", name: "BFCL", category: "Agentic", description: "Berkeley Function-Calling Leaderboard", capabilities: ["function_calling"] },
  { id: "gdpval", name: "GDPVal", category: "Agentic", description: "GDP validation benchmark", capabilities: ["function_calling"] },
  { id: "sycophancy", name: "Sycophancy", category: "Agentic", description: "Sycophancy detection benchmark", capabilities: ["chat"] },

  // Instruction & Reasoning
  { id: "ifeval", name: "IFEval", category: "Instruction", description: "Instruction following evaluation", capabilities: ["chat"] },
  { id: "bbh", name: "BBH", category: "Reasoning", description: "Big Bench Hard", capabilities: ["reasoning"] },
  { id: "bbeh", name: "BBEH", category: "Reasoning", description: "Big Bench Extra Hard", capabilities: ["reasoning"] },
  { id: "boolq", name: "BoolQ", category: "Reasoning", description: "Boolean question answering", capabilities: ["chat"] },
  { id: "drop", name: "DROP", category: "Reasoning", description: "Discrete reasoning over paragraphs", capabilities: ["chat", "reasoning"] },
  { id: "winogrande", name: "Winogrande", category: "Reasoning", description: "Commonsense reasoning - pronoun resolution", capabilities: ["chat"] },
  { id: "piqa", name: "PIQA", category: "Reasoning", description: "Physical intuition QA", capabilities: ["chat"] },
  { id: "squad", name: "SQuAD", category: "Reasoning", description: "Stanford Question Answering Dataset", capabilities: ["chat"] },
  { id: "race_h", name: "RACE-H", category: "Reasoning", description: "Reading comprehension (high school)", capabilities: ["chat"] },
  { id: "musr", name: "MuSR", category: "Reasoning", description: "Multi-step soft reasoning", capabilities: ["reasoning"] },
  { id: "paws", name: "PAWS", category: "Reasoning", description: "Paraphrase Adversaries from Word Scrambling", capabilities: ["chat"] },
  { id: "lingoly", name: "Lingoly", category: "Reasoning", description: "Linguistic olympiad problems", capabilities: ["reasoning"] },
  { id: "novelty_bench", name: "NoveltyBench", category: "Reasoning", description: "Novel problem solving benchmark", capabilities: ["reasoning"] },
  { id: "vimgolf", name: "VimGolf", category: "Reasoning", description: "Vim editing challenges", capabilities: ["coding"] },
  { id: "worldsense", name: "WorldSense", category: "Reasoning", description: "World knowledge and reasoning", capabilities: ["reasoning"] },

  // Long Context Benchmarks
  { id: "infinite_bench", name: "InfiniteBench", category: "Long Context", description: "Long context reasoning", capabilities: ["long_context"] },
  { id: "niah", name: "Needle in Haystack", category: "Long Context", description: "Information retrieval in long context", capabilities: ["long_context"] },

  // Vision/Multimodal Benchmarks
  { id: "mmmu", name: "MMMU", category: "Vision", description: "Massive Multi-discipline Multimodal Understanding", capabilities: ["vision"] },
  { id: "docvqa", name: "DocVQA", category: "Vision", description: "Document visual QA", capabilities: ["vision"] },
  { id: "mmiu", name: "MMIU", category: "Vision", description: "Multimodal understanding", capabilities: ["vision"] },
  { id: "vstar_bench", name: "V*Bench", category: "Vision", description: "Vision benchmark", capabilities: ["vision"] },
  { id: "zerobench", name: "ZeroBench", category: "Vision", description: "Zero-shot vision benchmark", capabilities: ["vision"] },

  // Safety & Alignment
  { id: "toxigen", name: "ToxiGen", category: "Safety", description: "Toxicity detection and avoidance", capabilities: ["chat"] },
  { id: "xstest", name: "XSTest", category: "Safety", description: "Safety and refusal evaluation", capabilities: ["chat"] },
  { id: "strong_reject", name: "Strong Reject", category: "Safety", description: "Refusal strength evaluation", capabilities: ["chat"] },
  { id: "wmdp", name: "WMDP", category: "Safety", description: "Weapons of Mass Destruction Proxy", capabilities: ["chat"] },
  { id: "agentharm", name: "AgentHarm", category: "Safety", description: "Agent harm evaluation", capabilities: ["chat"] },
  { id: "agentdojo", name: "AgentDojo", category: "Safety", description: "Agent safety evaluation", capabilities: ["chat"] },
  { id: "ahb", name: "AHB", category: "Safety", description: "Agent harm benchmark", capabilities: ["chat"] },
  { id: "abstention_bench", name: "AbstentionBench", category: "Safety", description: "Appropriate abstention evaluation", capabilities: ["chat"] },
  { id: "fortress", name: "Fortress", category: "Safety", description: "Adversarial robustness benchmark", capabilities: ["chat"] },
  { id: "lab_bench", name: "LabBench", category: "Safety", description: "Laboratory safety benchmark", capabilities: ["chat"] },
  { id: "mask", name: "MASK", category: "Safety", description: "Model accountability and safety knowledge", capabilities: ["chat"] },
  { id: "make_me_pay", name: "MakeMePay", category: "Safety", description: "Manipulation resistance benchmark", capabilities: ["chat"] },
  { id: "makemesay", name: "MakeMeSay", category: "Safety", description: "Prompt injection resistance", capabilities: ["chat"] },
  { id: "mind2web_sc", name: "Mind2Web SC", category: "Safety", description: "Mind2Web safety and compliance", capabilities: ["function_calling"] },
  { id: "coconot", name: "CoCoNot", category: "Safety", description: "Context confusion benchmark", capabilities: ["chat"] },
  { id: "b3", name: "B3", category: "Safety", description: "Bad behavior benchmark", capabilities: ["chat"] },

  // Bias Benchmarks
  { id: "bbq", name: "BBQ", category: "Bias", description: "Bias Benchmark for QA", capabilities: ["chat"] },
  { id: "bold", name: "BOLD", category: "Bias", description: "Bias in Open-ended Language Generation", capabilities: ["chat"] },
  { id: "stereoset", name: "StereoSet", category: "Bias", description: "Stereotype bias evaluation", capabilities: ["chat"] },

  // Cybersecurity Benchmarks
  { id: "cybench", name: "CyBench", category: "Cybersecurity", description: "Cybersecurity benchmark", capabilities: ["coding"] },
  { id: "cyberseceval_3", name: "CyberSecEval 3", category: "Cybersecurity", description: "Cybersecurity evaluation v3", capabilities: ["coding"] },
  { id: "cyberseceval_2", name: "CyberSecEval 2", category: "Cybersecurity", description: "Cybersecurity evaluation v2", capabilities: ["coding"] },
  { id: "sec_qa", name: "SecQA", category: "Cybersecurity", description: "Security Q&A benchmark", capabilities: ["chat"] },
  { id: "cve_bench", name: "CVEBench", category: "Cybersecurity", description: "CVE vulnerability detection", capabilities: ["coding"] },
  { id: "threecb", name: "ThreeCB", category: "Cybersecurity", description: "Threat capability benchmark", capabilities: ["coding"] },
  { id: "cybermetric", name: "CyberMetric", category: "Cybersecurity", description: "Cybersecurity metrics benchmark", capabilities: ["coding"] },
  { id: "gdm_intercode_ctf", name: "GDM InterCode CTF", category: "Cybersecurity", description: "CTF challenge benchmark", capabilities: ["coding"] },
  { id: "gdm_in_house_ctf", name: "GDM In-House CTF", category: "Cybersecurity", description: "In-house CTF challenges", capabilities: ["coding"] },
  { id: "sevenllm", name: "SevenLLM", category: "Cybersecurity", description: "Security evaluation for LLMs", capabilities: ["coding"] },
  { id: "sandboxbench", name: "SandboxBench", category: "Cybersecurity", description: "Sandbox escape benchmark", capabilities: ["coding"] },

  // Knowledge Benchmarks
  { id: "agieval", name: "AGIEval", category: "Knowledge", description: "Human-centric benchmark", capabilities: ["chat"] },
  { id: "medqa", name: "MedQA", category: "Knowledge", description: "Medical question answering", capabilities: ["chat"] },
  { id: "pubmedqa", name: "PubMedQA", category: "Knowledge", description: "Biomedical question answering", capabilities: ["chat"] },
  { id: "hle", name: "HLE", category: "Knowledge", description: "Humanity's Last Exam", capabilities: ["chat"] },
  { id: "livebench", name: "LiveBench", category: "Knowledge", description: "Live updating benchmark", capabilities: ["chat"] },
  { id: "healthbench", name: "HealthBench", category: "Knowledge", description: "Medical knowledge benchmark", capabilities: ["chat"] },
  { id: "chembench", name: "ChemBench", category: "Knowledge", description: "Chemistry knowledge benchmark", capabilities: ["chat"] },
  { id: "air_bench", name: "AIRBench", category: "Knowledge", description: "AI reasoning benchmark", capabilities: ["chat"] },
  { id: "onet", name: "O*NET", category: "Knowledge", description: "Occupational knowledge benchmark", capabilities: ["chat"] },
  { id: "pre_flight", name: "PreFlight", category: "Knowledge", description: "Pre-flight check benchmark", capabilities: ["chat"] },
  { id: "sosbench", name: "SOSBench", category: "Knowledge", description: "Science of science benchmark", capabilities: ["chat"] },
  { id: "sciknoweval", name: "SciKnowEval", category: "Knowledge", description: "Scientific knowledge evaluation", capabilities: ["chat"] },
  { id: "uccb", name: "UCCB", category: "Knowledge", description: "University course content benchmark", capabilities: ["chat"] },

  // Writing Benchmarks
  { id: "writingbench", name: "WritingBench", category: "Writing", description: "Writing quality evaluation", capabilities: ["chat", "creative"] },

  // Scheming/Alignment Benchmarks
  { id: "agentic_misalignment", name: "Agentic Misalignment", category: "Scheming", description: "Agent goal misalignment detection", capabilities: ["reasoning"] },
  { id: "gdm_sp_apps", name: "GDM SP Apps", category: "Scheming", description: "Specification gaming applications", capabilities: ["reasoning"] },
  { id: "gdm_sr_self_reasoning", name: "GDM Self-Reasoning", category: "Scheming", description: "Self-reasoning evaluation", capabilities: ["reasoning"] },
  { id: "gdm_stealth", name: "GDM Stealth", category: "Scheming", description: "Stealth behavior detection", capabilities: ["reasoning"] },

  // Personality Benchmarks
  { id: "personality_bfi", name: "Personality BFI", category: "Personality", description: "Big Five Inventory personality test", capabilities: ["chat"] },
  { id: "personality_trait", name: "Personality Trait", category: "Personality", description: "Personality trait evaluation", capabilities: ["chat"] },
  { id: "personality_prime", name: "Personality Prime", category: "Personality", description: "Personality priming benchmark", capabilities: ["chat"] },
];

// Use case categories for model recommendations
// Benchmark IDs must match the Python eval service (inspect_evals)
export const useCases = [
  {
    id: "coding",
    name: "Code Generation",
    icon: "Code",
    benchmarks: ["swe_bench", "swe_bench_verified", "humaneval", "bigcodebench", "mbpp", "apps", "usaco"],
    primaryBenchmark: "swe_bench_verified",
    primaryBenchmarkName: "SWE-bench Verified",
    description: "Writing, debugging, and reviewing code",
    requiredCapabilities: ["coding"]
  },
  {
    id: "reasoning",
    name: "Complex Reasoning",
    icon: "Brain",
    benchmarks: ["gpqa_diamond", "arc", "hellaswag", "bbh", "winogrande", "drop", "musr"],
    primaryBenchmark: "gpqa_diamond",
    primaryBenchmarkName: "GPQA Diamond",
    description: "Multi-step logical reasoning tasks",
    requiredCapabilities: ["reasoning"]
  },
  {
    id: "math",
    name: "Mathematics",
    icon: "Calculator",
    benchmarks: ["math", "aime2024", "aime2025", "gsm8k", "mgsm"],
    primaryBenchmark: "math",
    primaryBenchmarkName: "MATH",
    description: "Mathematical problem solving",
    requiredCapabilities: ["reasoning"]
  },
  {
    id: "knowledge",
    name: "Knowledge & QA",
    icon: "BookOpen",
    benchmarks: ["mmlu", "mmlu_5_shot", "mmlu_pro", "simpleqa", "truthfulqa", "commonsense_qa"],
    primaryBenchmark: "mmlu",
    primaryBenchmarkName: "MMLU",
    description: "Factual questions and knowledge retrieval",
    requiredCapabilities: ["chat"]
  },
  {
    id: "instruction",
    name: "Instruction Following",
    icon: "ListChecks",
    benchmarks: ["ifeval", "boolq", "squad"],
    primaryBenchmark: "ifeval",
    primaryBenchmarkName: "IFEval",
    description: "Following complex instructions precisely",
    requiredCapabilities: ["chat"]
  },
  {
    id: "agentic",
    name: "Agentic Tasks",
    icon: "Bot",
    benchmarks: ["gaia", "gaia_level1", "gaia_level2", "gaia_level3", "browse_comp", "assistant_bench", "bfcl", "mind2web"],
    primaryBenchmark: "gaia",
    primaryBenchmarkName: "GAIA",
    description: "Tool use and multi-step agent tasks",
    requiredCapabilities: ["function_calling"]
  },
  {
    id: "long-context",
    name: "Long Context",
    icon: "FileText",
    benchmarks: ["infinite_bench", "niah"],
    primaryBenchmark: "infinite_bench",
    primaryBenchmarkName: "InfiniteBench",
    description: "Processing and understanding very long documents",
    requiredCapabilities: ["long_context"]
  },
  {
    id: "vision",
    name: "Vision & Multimodal",
    icon: "Eye",
    benchmarks: ["mmmu", "mathvista", "docvqa", "mmiu", "vstar_bench", "zerobench"],
    primaryBenchmark: "mmmu",
    primaryBenchmarkName: "MMMU",
    description: "Image understanding and visual reasoning",
    requiredCapabilities: ["vision"]
  },
  {
    id: "safety",
    name: "Safety & Alignment",
    icon: "Shield",
    benchmarks: ["truthfulqa", "toxigen", "xstest", "strong_reject", "wmdp", "agentharm"],
    primaryBenchmark: "truthfulqa",
    primaryBenchmarkName: "TruthfulQA",
    description: "Bias detection, toxicity avoidance, and alignment",
    requiredCapabilities: ["chat"]
  },
  {
    id: "cybersecurity",
    name: "Cybersecurity",
    icon: "Lock",
    benchmarks: ["cybench", "cyberseceval_3", "sec_qa", "cve_bench"],
    primaryBenchmark: "cybench",
    primaryBenchmarkName: "CyBench",
    description: "Security analysis and vulnerability detection",
    requiredCapabilities: ["coding"]
  },
  {
    id: "medical",
    name: "Medical & Health",
    icon: "Heart",
    benchmarks: ["medqa", "pubmedqa", "healthbench"],
    primaryBenchmark: "medqa",
    primaryBenchmarkName: "MedQA",
    description: "Medical knowledge and healthcare applications",
    requiredCapabilities: ["chat"]
  },
];
