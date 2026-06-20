/**
 * Wraps `tsc --noEmit` as a function the agent can call.
 *
 * Type errors are exactly the class of issue an LLM is unreliable at
 * deriving from scratch (it has to track type flow across files) but
 * which the compiler reports with perfect precision. See ARCHITECTURE.md
 * decision 2.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { ToolFinding } from "../types";

const execFileAsync = promisify(execFile);

// tsc's plain-text diagnostic format: "src/foo.ts(12,5): error TS2322: ..."
const TSC_DIAGNOSTIC_PATTERN =
  /^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)$/gm;

export async function runTypeCheck(): Promise<ToolFinding[]> {
  try {
    const { stdout } = await execFileAsync(
      "npx",
      ["tsc", "--noEmit", "--pretty", "false"],
      { maxBuffer: 1024 * 1024 * 20 }
    );
    return parseTscOutput(stdout);
  } catch (err) {
    const execErr = err as { stdout?: string };
    // tsc exits non-zero on type errors — findings are still on stdout.
    if (execErr.stdout) {
      return parseTscOutput(execErr.stdout);
    }
    console.warn("[typeCheckTool] tsc invocation failed entirely:", err);
    return [];
  }
}

function parseTscOutput(stdout: string): ToolFinding[] {
  const findings: ToolFinding[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex since this is a global regex reused across calls.
  TSC_DIAGNOSTIC_PATTERN.lastIndex = 0;

  while ((match = TSC_DIAGNOSTIC_PATTERN.exec(stdout)) !== null) {
    const [, filename, line, , severity, code, message] = match;
    findings.push({
      filename,
      line: parseInt(line, 10),
      severity: severity === "error" ? "error" : "warning",
      message,
      ruleId: code,
      source: "tsc",
    });
  }

  return findings;
}

export const typeCheckToolDefinition = {
  type: "function" as const,
  function: {
    name: "run_type_check",
    description:
      "Run the TypeScript compiler (tsc --noEmit) across the whole " +
      "project to find type errors introduced or affected by this PR. " +
      "Returns structured findings with file, line, and TS error code. " +
      "This checks the full project graph, not just changed files, " +
      "because type errors can surface in files that import changed code.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};
