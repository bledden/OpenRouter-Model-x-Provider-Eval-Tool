#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { config } from "dotenv";
import { OpenRouterClient } from "./openrouter.js";
import {
  runMMLUDirect,
  runAllProvidersEval,
  loadMMLUSample,
} from "./eval-runner.js";
import type { EvalResult, ProviderEndpoint } from "./types.js";

// Load environment variables
config();

const program = new Command();

program
  .name("provider-eval")
  .description("Run evaluations across OpenRouter providers for the same model")
  .version("1.0.0");

// ============================================================================
// MODELS COMMAND
// ============================================================================
program
  .command("models")
  .description("List available models from OpenRouter")
  .option("-s, --search <pattern>", "Search models by name pattern")
  .option("-l, --limit <n>", "Limit number of results", "20")
  .action(async (options) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error(chalk.red("Error: OPENROUTER_API_KEY not set in .env"));
      process.exit(1);
    }

    const spinner = ora("Fetching models...").start();
    try {
      const client = new OpenRouterClient(apiKey);
      let models = options.search
        ? await client.searchModels(options.search)
        : await client.getModels();

      models = models.slice(0, parseInt(options.limit));

      spinner.stop();

      console.log(chalk.bold("\nAvailable Models:\n"));
      for (const model of models) {
        console.log(
          chalk.cyan(model.id) +
            chalk.gray(` (ctx: ${model.context_length.toLocaleString()})`)
        );
      }
      console.log(chalk.gray(`\nShowing ${models.length} models`));
    } catch (e) {
      spinner.fail("Failed to fetch models");
      console.error(chalk.red(String(e)));
      process.exit(1);
    }
  });

// ============================================================================
// ENDPOINTS COMMAND - List provider endpoints for a model
// ============================================================================
program
  .command("endpoints")
  .description("List all provider endpoints for a specific model")
  .argument("<model>", "Model ID (e.g., meta-llama/llama-3.1-70b-instruct)")
  .option("--tools", "Only show endpoints that support tool/function calling")
  .action(async (modelId, options) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error(chalk.red("Error: OPENROUTER_API_KEY not set in .env"));
      process.exit(1);
    }

    const spinner = ora(`Fetching endpoints for ${modelId}...`).start();
    try {
      const client = new OpenRouterClient(apiKey);

      let endpoints: ProviderEndpoint[];
      if (options.tools) {
        endpoints = await client.getToolCapableEndpoints(modelId);
      } else {
        const result = await client.getModelEndpoints(modelId);
        if (!result) {
          spinner.fail(`Model not found: ${modelId}`);
          process.exit(1);
        }
        endpoints = result.endpoints;
      }

      spinner.stop();

      if (endpoints.length === 0) {
        console.log(chalk.yellow(`\nNo endpoints found for ${modelId}`));
        if (options.tools) {
          console.log(chalk.gray("(Try without --tools flag)"));
        }
        return;
      }

      console.log(chalk.bold(`\nProvider Endpoints for ${chalk.cyan(modelId)}:\n`));

      // Table header
      console.log(
        chalk.gray(
          "Provider".padEnd(15) +
            "Tag".padEnd(20) +
            "Quant".padEnd(8) +
            "Context".padEnd(12) +
            "Uptime".padEnd(10) +
            "$/1M tokens"
        )
      );
      console.log(chalk.gray("─".repeat(80)));

      for (const ep of endpoints) {
        const status = ep.status === 0 ? chalk.green("●") : chalk.red("●");
        const uptime = `${ep.uptime_last_30m.toFixed(1)}%`;
        const price = `$${(parseFloat(ep.pricing.prompt) * 1_000_000).toFixed(2)}`;

        console.log(
          status +
            " " +
            chalk.cyan(ep.provider_name.padEnd(14)) +
            ep.tag.padEnd(20) +
            ep.quantization.padEnd(8) +
            ep.context_length.toLocaleString().padEnd(12) +
            uptime.padEnd(10) +
            price
        );

        // Show supported features
        const features: string[] = [];
        if (ep.supported_parameters.includes("tools")) features.push("tools");
        if (ep.supported_parameters.includes("response_format"))
          features.push("json");
        if (features.length > 0) {
          console.log(chalk.gray(`   └─ ${features.join(", ")}`));
        }
      }

      console.log(chalk.gray(`\n${endpoints.length} endpoints total`));
    } catch (e) {
      spinner.fail("Failed to fetch endpoints");
      console.error(chalk.red(String(e)));
      process.exit(1);
    }
  });

// ============================================================================
// EVAL COMMAND - Simple single-model evaluation
// ============================================================================
program
  .command("eval")
  .description("Run MMLU evaluation on a model (default OpenRouter routing)")
  .argument("<model>", "Model ID (e.g., anthropic/claude-sonnet-4)")
  .option("-l, --limit <n>", "Number of questions to evaluate", "10")
  .option("-o, --output <file>", "Output results to JSON file")
  .action(async (modelId, options) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error(chalk.red("Error: OPENROUTER_API_KEY not set in .env"));
      process.exit(1);
    }

    const limit = parseInt(options.limit);
    console.log(
      chalk.bold(`\nRunning MMLU evaluation on ${chalk.cyan(modelId)}\n`)
    );
    console.log(chalk.gray(`Questions: ${limit}`));
    console.log(chalk.gray(`Routing: OpenRouter default\n`));

    const questions = await loadMMLUSample(limit);

    const spinner = ora("Running evaluation...").start();
    const startTime = Date.now();

    try {
      const result = await runMMLUDirect({
        model: modelId,
        apiKey,
        limit,
        questions,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      spinner.stop();

      console.log(chalk.bold("\nResults:\n"));
      printResult(result);
      console.log(chalk.gray(`\nCompleted in ${elapsed}s`));

      if (options.output) {
        const fs = await import("fs");
        fs.writeFileSync(options.output, JSON.stringify([result], null, 2));
        console.log(chalk.green(`\nResults saved to ${options.output}`));
      }
    } catch (e) {
      spinner.fail("Evaluation failed");
      console.error(chalk.red(String(e)));
      process.exit(1);
    }
  });

// ============================================================================
// EVAL-PROVIDERS COMMAND - Evaluate across all providers for a model
// ============================================================================
program
  .command("eval-providers")
  .description("Run MMLU evaluation across ALL provider endpoints for a model")
  .argument("<model>", "Model ID (e.g., meta-llama/llama-3.1-70b-instruct)")
  .option("-l, --limit <n>", "Number of questions per provider", "10")
  .option("-p, --providers <tags>", "Comma-separated provider tags to test")
  .option("-o, --output <file>", "Output results to JSON file")
  .action(async (modelId, options) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error(chalk.red("Error: OPENROUTER_API_KEY not set in .env"));
      process.exit(1);
    }

    const limit = parseInt(options.limit);
    const providerTags = options.providers
      ? options.providers.split(",").map((s: string) => s.trim())
      : undefined;

    console.log(
      chalk.bold(`\nEvaluating ${chalk.cyan(modelId)} across providers\n`)
    );
    console.log(chalk.gray(`Questions per provider: ${limit}`));
    if (providerTags) {
      console.log(chalk.gray(`Providers: ${providerTags.join(", ")}`));
    }

    // First, show available endpoints
    const client = new OpenRouterClient(apiKey);
    const modelData = await client.getModelEndpoints(modelId);

    if (!modelData) {
      console.error(chalk.red(`Model not found: ${modelId}`));
      process.exit(1);
    }

    const activeEndpoints = modelData.endpoints.filter((e) => e.status === 0);
    console.log(
      chalk.gray(`\nFound ${activeEndpoints.length} active endpoints:\n`)
    );

    for (const ep of activeEndpoints) {
      const selected =
        !providerTags || providerTags.includes(ep.tag) ? "→" : " ";
      console.log(
        chalk.gray(selected) +
          ` ${chalk.cyan(ep.provider_name)} (${ep.tag}, ${ep.quantization})`
      );
    }

    console.log("");

    // Load questions once for fair comparison
    const questions = await loadMMLUSample(limit);

    const results: EvalResult[] = [];
    const startTime = Date.now();

    // Run evaluations with progress updates
    try {
      const allResults = await runAllProvidersEval({
        model: modelId,
        apiKey,
        questions,
        providerTags,
        onProgress: (result, index, total) => {
          const scoreStr = formatScore(result.score);
          const status = result.error ? chalk.red("✗") : chalk.green("✓");
          console.log(
            `${status} [${index}/${total}] ${chalk.cyan(result.provider.padEnd(15))} ${scoreStr} (${(result.duration_ms / 1000).toFixed(1)}s)`
          );
        },
      });

      results.push(...allResults);
    } catch (e) {
      console.error(chalk.red(`\nError: ${e}`));
      process.exit(1);
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Print summary table
    console.log(chalk.bold("\n" + "═".repeat(80)));
    console.log(chalk.bold("PROVIDER COMPARISON RESULTS"));
    console.log(chalk.bold("═".repeat(80) + "\n"));

    // Sort by score descending
    const sortedResults = [...results].sort(
      (a, b) => (b.score ?? -1) - (a.score ?? -1)
    );

    // Header
    console.log(
      chalk.gray(
        "Rank".padEnd(6) +
          "Provider".padEnd(16) +
          "Tag".padEnd(20) +
          "Quant".padEnd(8) +
          "Score".padEnd(10) +
          "Time".padEnd(8) +
          "$/1M"
      )
    );
    console.log(chalk.gray("─".repeat(80)));

    for (let i = 0; i < sortedResults.length; i++) {
      const r = sortedResults[i];
      const rank = i + 1;
      const medal =
        rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`;

      const quant = r.metadata?.quantization ?? "n/a";
      const price = r.metadata?.pricing
        ? `$${(parseFloat(r.metadata.pricing.prompt) * 1_000_000).toFixed(2)}`
        : "n/a";

      console.log(
        medal.padEnd(6) +
          chalk.cyan(r.provider.padEnd(15)) +
          r.providerTag.padEnd(20) +
          quant.padEnd(8) +
          formatScore(r.score).padEnd(10) +
          `${(r.duration_ms / 1000).toFixed(1)}s`.padEnd(8) +
          price
      );

      if (r.error) {
        console.log(chalk.red(`      └─ Error: ${r.error.slice(0, 60)}...`));
      }
    }

    console.log(chalk.gray("\n" + "─".repeat(80)));
    console.log(
      chalk.gray(
        `Evaluated ${results.length} providers in ${totalTime}s with ${limit} questions each`
      )
    );

    // Save results
    if (options.output) {
      const fs = await import("fs");
      const output = {
        model: modelId,
        benchmark: "mmlu",
        questions_per_provider: limit,
        total_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        results: sortedResults,
      };
      fs.writeFileSync(options.output, JSON.stringify(output, null, 2));
      console.log(chalk.green(`\nResults saved to ${options.output}`));
    }
  });

// ============================================================================
// COMPARE COMMAND - Compare different models
// ============================================================================
program
  .command("compare")
  .description("Compare MMLU scores across multiple models")
  .argument("<models...>", "Model IDs to compare")
  .option("-l, --limit <n>", "Number of questions per model", "10")
  .option("-o, --output <file>", "Output results to JSON file")
  .action(async (modelIds, options) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error(chalk.red("Error: OPENROUTER_API_KEY not set in .env"));
      process.exit(1);
    }

    const limit = parseInt(options.limit);
    console.log(chalk.bold(`\nComparing ${modelIds.length} models on MMLU\n`));
    console.log(chalk.gray(`Questions per model: ${limit}\n`));

    // Load questions once to ensure fair comparison
    const questions = await loadMMLUSample(limit);
    const results: EvalResult[] = [];

    for (const modelId of modelIds) {
      const spinner = ora(`Evaluating ${modelId}...`).start();

      try {
        const result = await runMMLUDirect({
          model: modelId,
          apiKey,
          limit,
          questions,
        });
        results.push(result);
        spinner.succeed(`${modelId}: ${formatScore(result.score)}`);
      } catch (e) {
        spinner.fail(`${modelId}: Error - ${e}`);
        results.push({
          provider: "openrouter-default",
          providerTag: "default",
          model: modelId,
          benchmark: "mmlu",
          score: null,
          error: String(e),
          duration_ms: 0,
          timestamp: new Date().toISOString(),
          samples_evaluated: 0,
        });
      }
    }

    // Print comparison table
    console.log(chalk.bold("\n--- Comparison Results ---\n"));
    const sortedResults = [...results].sort(
      (a, b) => (b.score ?? -1) - (a.score ?? -1)
    );

    for (let i = 0; i < sortedResults.length; i++) {
      const r = sortedResults[i];
      const rank = i + 1;
      const medal =
        rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "  ";
      console.log(
        `${medal} ${chalk.cyan(r.model.padEnd(45))} ${formatScore(r.score)} (${r.samples_evaluated} samples, ${(r.duration_ms / 1000).toFixed(1)}s)`
      );
    }

    if (options.output) {
      const fs = await import("fs");
      fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
      console.log(chalk.green(`\nResults saved to ${options.output}`));
    }
  });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatScore(score: number | null): string {
  if (score === null) return chalk.red("N/A");
  const percent = (score * 100).toFixed(1);
  if (score >= 0.8) return chalk.green(`${percent}%`);
  if (score >= 0.6) return chalk.yellow(`${percent}%`);
  return chalk.red(`${percent}%`);
}

function printResult(result: EvalResult) {
  console.log(chalk.gray("Model:     ") + chalk.cyan(result.model));
  console.log(chalk.gray("Provider:  ") + result.provider);
  console.log(chalk.gray("Benchmark: ") + result.benchmark);
  console.log(chalk.gray("Score:     ") + formatScore(result.score));
  console.log(chalk.gray("Samples:   ") + result.samples_evaluated);
  console.log(
    chalk.gray("Duration:  ") + `${(result.duration_ms / 1000).toFixed(1)}s`
  );
  if (result.error) {
    console.log(chalk.gray("Errors:    ") + chalk.red(result.error));
  }
}

program.parse();
