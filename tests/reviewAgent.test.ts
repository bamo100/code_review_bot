/**
 * Tests mock both the model client and the static analysis tool
 * implementations — no API key, no ESLint/tsc/Semgrep installation
 * required to run these.
 */

import { runReviewAgent } from "../src/agents/reviewAgent";
import * as eslintTool from "../src/tools/eslintTool";
import * as typeCheckTool from "../src/tools/typeCheckTool";
import * as semgrepTool from "../src/tools/semgrepTool";
import * as memoryStore from "../src/storage/memoryStore";
import { ChangedFile } from "../src/types";

// Mock the OpenAI client module entirely so no network calls happen.
// jest.mock factories are hoisted above imports/const declarations, so
// mockCreate must be created lazily inside the factory and exposed via
// a mutable holder object rather than referenced directly by closure.
const mockHolder: { create: jest.Mock } = { create: jest.fn() };
jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: (...args: unknown[]) => mockHolder.create(...args) } },
  }));
});
const mockCreate = mockHolder.create;

const SAMPLE_FILES: ChangedFile[] = [
  {
    filename: "src/auth.ts",
    status: "modified",
    patch:
      "@@ -10,6 +10,9 @@\n function login(user, pass) {\n+  const query = `SELECT * FROM users WHERE name='${user}'`;\n+  db.execute(query);\n }",
    additions: 3,
    deletions: 0,
  },
];

function toolCallResponse(toolName: string, args: Record<string, unknown>) {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: toolName, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  };
}

function finalAnswerResponse(content: object) {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: JSON.stringify(content),
          tool_calls: undefined,
        },
      },
    ],
  };
}

describe("runReviewAgent", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    jest.spyOn(eslintTool, "runEslint").mockResolvedValue([]);
    jest.spyOn(typeCheckTool, "runTypeCheck").mockResolvedValue([]);
    jest.spyOn(semgrepTool, "runSemgrep").mockResolvedValue([
      {
        filename: "src/auth.ts",
        line: 12,
        severity: "error",
        message: "Possible SQL injection via string interpolation",
        ruleId: "sql-injection-template-string",
        source: "semgrep",
      },
    ]);
    jest.spyOn(memoryStore, "isSuppressed").mockReturnValue(false);
  });

  test("calls semgrep tool then returns parsed final review", async () => {
    mockCreate
      .mockResolvedValueOnce(
        toolCallResponse("run_semgrep", { filenames: ["src/auth.ts"] })
      )
      .mockResolvedValueOnce(
        finalAnswerResponse({
          comments: [
            {
              filename: "src/auth.ts",
              line: 12,
              body: "This builds a SQL query via string interpolation, which is vulnerable to SQL injection. Use a parameterized query instead.",
              riskLevel: "high",
              sourceRuleId: "sql-injection-template-string",
            },
          ],
          fileRisk: [
            {
              filename: "src/auth.ts",
              riskLevel: "high",
              summary: "Introduces a SQL injection vulnerability in the login flow.",
            },
          ],
          overallSummary:
            "This PR introduces a SQL injection vulnerability in the login function and should not be merged as-is.",
        })
      );

    const result = await runReviewAgent("acme/webapp", SAMPLE_FILES);

    expect(semgrepTool.runSemgrep).toHaveBeenCalledWith(["src/auth.ts"]);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].riskLevel).toBe("high");
    expect(result.fileRisk[0].riskLevel).toBe("high");
  });

  test("suppressed findings are filtered out of the final result", async () => {
    jest.spyOn(memoryStore, "isSuppressed").mockReturnValue(true);

    mockCreate.mockResolvedValueOnce(
      finalAnswerResponse({
        comments: [
          {
            filename: "src/auth.ts",
            line: 12,
            body: "Flagged issue",
            riskLevel: "medium",
            sourceRuleId: "some-rule",
          },
        ],
        fileRisk: [
          { filename: "src/auth.ts", riskLevel: "medium", summary: "minor issue" },
        ],
        overallSummary: "Minor issue found.",
      })
    );

    const result = await runReviewAgent("acme/webapp", SAMPLE_FILES);

    expect(result.comments).toHaveLength(0);
    // fileRisk is untouched by suppression — only individual comments are filtered.
    expect(result.fileRisk).toHaveLength(1);
  });

  test("throws if the model never stops calling tools", async () => {
    mockCreate.mockResolvedValue(
      toolCallResponse("run_semgrep", { filenames: ["src/auth.ts"] })
    );

    await expect(runReviewAgent("acme/webapp", SAMPLE_FILES)).rejects.toThrow(
      /exceeded.*tool-calling rounds/
    );
  });

  test("throws a clear error if final response is not valid JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: "assistant",
            content: "Sure, here's my review: looks good to me!",
            tool_calls: undefined,
          },
        },
      ],
    });

    await expect(runReviewAgent("acme/webapp", SAMPLE_FILES)).rejects.toThrow(
      /not valid JSON/
    );
  });
});
