/**
 * Export utilities for eval results
 * Supports CSV, TXT, and Markdown formats
 */

export interface ExportableResult {
  question?: string;
  questionIndex?: number;
  expected: string;
  predicted: string;
  correct: boolean;
  latencyMs?: number;
  subject?: string;
}

export interface ExportableEvalData {
  model: string;
  provider?: string;
  benchmark?: string;
  score: number;
  totalQuestions: number;
  correctCount: number;
  avgLatency?: number;
  results: ExportableResult[];
  timestamp?: string;
}

/**
 * Format a number as percentage string
 */
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Format latency in milliseconds
 */
function formatLatency(ms: number | undefined): string {
  if (ms === undefined || ms === 0) return "N/A";
  return `${ms.toFixed(0)}ms`;
}

/**
 * Generate filename with timestamp
 */
function generateFilename(data: ExportableEvalData, extension: string): string {
  const modelSlug = data.model.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  const providerSlug = data.provider?.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase() || "default";
  const date = new Date().toISOString().split("T")[0];
  return `eval-${modelSlug}-${providerSlug}-${date}.${extension}`;
}

/**
 * Trigger browser download of content
 */
function downloadContent(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export eval results as CSV
 */
export function exportToCSV(data: ExportableEvalData): void {
  const headers = ["Question #", "Expected", "Predicted", "Correct", "Latency (ms)", "Subject"];
  const rows = data.results.map((r, i) => [
    (r.questionIndex ?? i) + 1,
    `"${(r.expected || "").replace(/"/g, '""')}"`,
    `"${(r.predicted || "").replace(/"/g, '""')}"`,
    r.correct ? "Yes" : "No",
    r.latencyMs?.toFixed(0) || "",
    r.subject || "",
  ]);

  // Add summary row
  const summaryRows = [
    [],
    ["Summary"],
    ["Model", data.model],
    ["Provider", data.provider || "default"],
    ["Benchmark", data.benchmark || "N/A"],
    ["Score", formatPercent(data.score)],
    ["Correct", `${data.correctCount}/${data.totalQuestions}`],
    ["Avg Latency", formatLatency(data.avgLatency)],
    ["Timestamp", data.timestamp || new Date().toISOString()],
  ];

  const csvContent = [
    headers.join(","),
    ...rows.map((r) => r.join(",")),
    ...summaryRows.map((r) => r.join(",")),
  ].join("\n");

  downloadContent(csvContent, generateFilename(data, "csv"), "text/csv");
}

/**
 * Export eval results as plain text
 */
export function exportToTXT(data: ExportableEvalData): void {
  const lines: string[] = [
    "=" .repeat(60),
    "EVALUATION RESULTS",
    "=" .repeat(60),
    "",
    `Model:      ${data.model}`,
    `Provider:   ${data.provider || "default"}`,
    `Benchmark:  ${data.benchmark || "N/A"}`,
    `Score:      ${formatPercent(data.score)}`,
    `Correct:    ${data.correctCount}/${data.totalQuestions}`,
    `Avg Latency: ${formatLatency(data.avgLatency)}`,
    `Timestamp:  ${data.timestamp || new Date().toISOString()}`,
    "",
    "-".repeat(60),
    "INDIVIDUAL RESULTS",
    "-".repeat(60),
    "",
  ];

  data.results.forEach((r, i) => {
    const qNum = (r.questionIndex ?? i) + 1;
    lines.push(`Question ${qNum}:`);
    lines.push(`  Expected:  ${r.expected || "N/A"}`);
    lines.push(`  Predicted: ${r.predicted || "N/A"}`);
    lines.push(`  Correct:   ${r.correct ? "Yes" : "No"}`);
    lines.push(`  Latency:   ${formatLatency(r.latencyMs)}`);
    if (r.subject) lines.push(`  Subject:   ${r.subject}`);
    lines.push("");
  });

  lines.push("=" .repeat(60));
  lines.push("END OF REPORT");
  lines.push("=" .repeat(60));

  downloadContent(lines.join("\n"), generateFilename(data, "txt"), "text/plain");
}

/**
 * Export eval results as Markdown
 */
export function exportToMarkdown(data: ExportableEvalData): void {
  const lines: string[] = [
    "# Evaluation Results",
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Model | ${data.model} |`,
    `| Provider | ${data.provider || "default"} |`,
    `| Benchmark | ${data.benchmark || "N/A"} |`,
    `| Score | ${formatPercent(data.score)} |`,
    `| Correct | ${data.correctCount}/${data.totalQuestions} |`,
    `| Avg Latency | ${formatLatency(data.avgLatency)} |`,
    `| Timestamp | ${data.timestamp || new Date().toISOString()} |`,
    "",
    "## Individual Results",
    "",
    "| # | Expected | Predicted | Correct | Latency |",
    "|---|----------|-----------|---------|---------|",
  ];

  data.results.forEach((r, i) => {
    const qNum = (r.questionIndex ?? i) + 1;
    const correct = r.correct ? "✓" : "✗";
    lines.push(
      `| ${qNum} | ${r.expected || "N/A"} | ${r.predicted || "N/A"} | ${correct} | ${formatLatency(r.latencyMs)} |`
    );
  });

  lines.push("");
  lines.push("---");
  lines.push("*Generated by OpenRouter Eval Platform*");

  downloadContent(lines.join("\n"), generateFilename(data, "md"), "text/markdown");
}

/**
 * Export options type
 */
export type ExportFormat = "csv" | "txt" | "md";

/**
 * Export eval results in specified format
 */
export function exportResults(data: ExportableEvalData, format: ExportFormat): void {
  switch (format) {
    case "csv":
      exportToCSV(data);
      break;
    case "txt":
      exportToTXT(data);
      break;
    case "md":
      exportToMarkdown(data);
      break;
  }
}
