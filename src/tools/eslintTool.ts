/**
 * Wraps ESLint as a function the agent can call.
 *
 * Deliberately shells out to the repo's own ESLint config rather than
 * embedding a hardcoded ruleset — this is the tool the repo's maintainers
 * already trust, and the bot should defer to it rather than impose its
 * own opinions about style. See ARCHITECTURE.md decision 2.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { ToolFinding } from "../types";

const execFileAsync = promisify(execFile);

interface EslintMessage {
  ruleId: string | null;
  severity: 1 | 2; // 1 = warning, 2 = error
  message: string;
  line: number;
}

interface EslintResult {
  filePath: string;
  messages: EslintMessage[];
}

export async function runEslint(filenames: string[]): Promise<ToolFinding[]> {
  if (filenames.length === 0) return [];

  try {
    const { stdout } = await execFileAsync(
      "npx",
      ["eslint", "--format", "json", "--no-error-on-unmatched-pattern", ...filenames],
      { maxBuffer: 1024 * 1024 * 20 }
    );
    return parseEslintOutput(stdout);
  } catch (err) {
    // ESLint exits non-zero when it finds lint errors — that's not a
    // tool failure, the findings are still on stdout.
    const execErr = err as { stdout?: string; code?: number };
    if (execErr.stdout) {
      return parseEslintOutput(execErr.stdout);
    }
    console.warn("[eslintTool] ESLint invocation failed entirely:", err);
    return [];
  }
}

function parseEslintOutput(stdout: string): ToolFinding[] {
  let results: EslintResult[];
  try {
    results = JSON.parse(stdout) as EslintResult[];
  } catch {
    console.warn("[eslintTool] could not parse ESLint JSON output");
    return [];
  }

  const findings: ToolFinding[] = [];
  for (const fileResult of results) {
    for (const msg of fileResult.messages) {
      findings.push({
        filename: fileResult.filePath,
        line: msg.line ?? null,
        severity: msg.severity === 2 ? "error" : "warning",
        message: msg.message,
        ruleId: msg.ruleId,
        source: "eslint",
      });
    }
  }
  return findings;
}

/** Tool definition exposed to the model for function-calling. */
export const eslintToolDefinition = {
  type: "function" as const,
  function: {
    name: "run_eslint",
    description:
      "Run ESLint on a list of changed files using the repository's own " +
      "ESLint config. Returns structured lint findings (errors/warnings " +
      "with rule IDs and line numbers). Use this before commenting on " +
      "style or correctness issues that a linter would catch.",
    parameters: {
      type: "object",
      properties: {
        filenames: {
          type: "array",
          items: { type: "string" },
          description: "Paths to the changed files to lint",
        },
      },
      required: ["filenames"],
    },
  },
};
