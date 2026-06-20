/**
 * Wraps Semgrep as a function the agent can call.
 *
 * Semgrep catches security and correctness patterns (SQL injection
 * shapes, hardcoded secrets, unsafe deserialization) via pattern
 * matching against a known rule database — exactly the kind of
 * "matching against known bad patterns" task a deterministic tool does
 * more reliably than asking a model to "look for security issues."
 *
 * Requires `semgrep` to be installed (pip install semgrep, or via the
 * official Action: returntocorp/semgrep-action). If it's not available
 * this tool degrades gracefully and returns no findings rather than
 * crashing the pipeline.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { ToolFinding } from "../types";

const execFileAsync = promisify(execFile);

interface SemgrepResultItem {
  path: string;
  start: { line: number };
  extra: {
    severity: "ERROR" | "WARNING" | "INFO";
    message: string;
    metadata?: { "rule-id"?: string };
  };
  check_id: string;
}

interface SemgrepOutput {
  results: SemgrepResultItem[];
}

export async function runSemgrep(filenames: string[]): Promise<ToolFinding[]> {
  if (filenames.length === 0) return [];

  try {
    const { stdout } = await execFileAsync(
      "semgrep",
      ["--config=auto", "--json", "--quiet", ...filenames],
      { maxBuffer: 1024 * 1024 * 20 }
    );
    return parseSemgrepOutput(stdout);
  } catch (err) {
    const execErr = err as { stdout?: string; code?: string };
    if (execErr.stdout) {
      return parseSemgrepOutput(execErr.stdout);
    }
    console.warn(
      "[semgrepTool] Semgrep not available or invocation failed — " +
        "skipping security pattern scan for this run.",
      err
    );
    return [];
  }
}

function parseSemgrepOutput(stdout: string): ToolFinding[] {
  let parsed: SemgrepOutput;
  try {
    parsed = JSON.parse(stdout) as SemgrepOutput;
  } catch {
    return [];
  }

  return parsed.results.map((item) => ({
    filename: item.path,
    line: item.start.line,
    severity:
      item.extra.severity === "ERROR"
        ? "error"
        : item.extra.severity === "WARNING"
          ? "warning"
          : "info",
    message: item.extra.message,
    ruleId: item.check_id,
    source: "semgrep" as const,
  }));
}

export const semgrepToolDefinition = {
  type: "function" as const,
  function: {
    name: "run_semgrep",
    description:
      "Run Semgrep security/correctness pattern scanning on the given " +
      "files. Catches known-bad patterns: hardcoded secrets, SQL " +
      "injection shapes, unsafe deserialization, etc. Use this for " +
      "security-sensitive changes (auth, database queries, file I/O, " +
      "user input handling).",
    parameters: {
      type: "object",
      properties: {
        filenames: {
          type: "array",
          items: { type: "string" },
          description: "Paths to scan",
        },
      },
      required: ["filenames"],
    },
  },
};
