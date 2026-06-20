/**
 * The review agent.
 *
 * A hand-rolled tool-calling loop, not a graph framework — see
 * ARCHITECTURE.md decision 1 for why. The flow:
 *
 *   1. Give the model the PR diff + available tools (eslint, tsc, semgrep)
 *   2. Let it call tools as it sees fit, feeding results back
 *   3. Once it stops calling tools, parse its final structured review
 *   4. Filter out anything matching a per-repo suppression
 */

import OpenAI from "openai";
import { config } from "../config";
import { eslintToolDefinition, runEslint } from "../tools/eslintTool";
import { typeCheckToolDefinition, runTypeCheck } from "../tools/typeCheckTool";
import { semgrepToolDefinition, runSemgrep } from "../tools/semgrepTool";
import { isSuppressed } from "../storage/memoryStore";
import { ChangedFile, ReviewResult } from "../types";

const client = new OpenAI({
  apiKey: config.cerebrasApiKey,
  baseURL: "https://api.cerebras.ai/v1",
});

const TOOLS = [eslintToolDefinition, typeCheckToolDefinition, semgrepToolDefinition];

const TOOL_IMPLEMENTATIONS: Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> = {
  run_eslint: (args) => runEslint(args.filenames as string[]),
  run_type_check: () => runTypeCheck(),
  run_semgrep: (args) => runSemgrep(args.filenames as string[]),
};

const SYSTEM_PROMPT = `You are a senior engineer doing a code review on a pull request.

You have access to tools that run real static analysis (ESLint, the
TypeScript compiler, Semgrep). USE THEM before commenting on anything a
tool would catch — do not guess at type errors or lint violations,
call the tools and read their actual output.

Your job after gathering tool output:
1. Cross-reference tool findings against the diff — only comment on
   issues in lines that were actually added or modified in this PR.
2. Synthesize and prioritize. Don't just repeat every tool finding
   verbatim — combine related issues, drop trivial style nits a linter
   already auto-fixes, and focus your comments on things that matter:
   correctness bugs, security issues, and patterns that will cause
   problems later.
3. Assign each changed file a risk level (low/medium/high) based on the
   severity and density of issues found, and the nature of the change
   (e.g. changes to auth/payment/data-handling code start at a higher
   baseline risk than changes to test fixtures or documentation).
4. Write a short overall summary (2-3 sentences) a reviewer can read in
   5 seconds to know whether this PR needs careful attention.

When you are done gathering information, respond with ONLY a JSON object
(no prose, no markdown fences) matching this schema:

{
  "comments": [
    {"filename": str, "line": number, "body": str,
     "riskLevel": "low"|"medium"|"high", "sourceRuleId": str|null}
  ],
  "fileRisk": [
    {"filename": str, "riskLevel": "low"|"medium"|"high", "summary": str}
  ],
  "overallSummary": str
}

Every changed file must appear in "fileRisk" even if it has zero comments.`;

function buildDiffMessage(files: ChangedFile[]): string {
  return files
    .map((f) => `--- ${f.filename} (${f.status}) ---\n${f.patch ?? "(no diff available)"}`)
    .join("\n\n");
}

function stripCodeFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) t = t.slice(t.indexOf("\n") + 1);
  if (t.endsWith("```")) t = t.slice(0, t.lastIndexOf("```"));
  return t.trim();
}

function parseFinalReview(rawContent: string, repo: string): ReviewResult {
  const cleaned = stripCodeFences(rawContent);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Agent's final response was not valid JSON: ${err instanceof Error ? err.message : err}\n` +
        `Raw content: ${rawContent.slice(0, 500)}`
    );
  }

  const result = ReviewResult.parse(parsed);

  // Filter out comments that match a per-repo suppression pattern —
  // see ARCHITECTURE.md decision 3.
  const filteredComments = result.comments.filter(
    (c) => !isSuppressed(repo, c.sourceRuleId, c.filename)
  );

  return { ...result, comments: filteredComments };
}

export async function runReviewAgent(
  repo: string,
  changedFiles: ChangedFile[]
): Promise<ReviewResult> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Review this pull request. Changed files:\n` +
        changedFiles
          .map((f) => `- ${f.filename} (+${f.additions}/-${f.deletions})`)
          .join("\n") +
        `\n\nFull diff:\n\n${buildDiffMessage(changedFiles)}`,
    },
  ];

  const MAX_TOOL_ROUNDS = 6;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.chat.completions.create({
      model: config.reviewModel,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      max_tokens: 4096,
    });

    const choice = response.choices[0];
    const toolCalls = choice.message.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      // Model is done calling tools — parse its final answer.
      return parseFinalReview(choice.message.content ?? "", repo);
    }

    // Record the assistant's tool-call request, then execute each tool
    // and feed results back as tool messages — the standard OpenAI-style
    // function-calling loop.
    messages.push(choice.message);

    for (const call of toolCalls) {
      const impl = TOOL_IMPLEMENTATIONS[call.function.name];
      let resultContent: string;

      if (!impl) {
        resultContent = JSON.stringify({ error: `Unknown tool: ${call.function.name}` });
      } else {
        try {
          const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
          const result = await impl(args);
          resultContent = JSON.stringify(result);
        } catch (err) {
          resultContent = JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: resultContent,
      });
    }
  }

  throw new Error(
    `Review agent exceeded ${MAX_TOOL_ROUNDS} tool-calling rounds without reaching a final answer`
  );
}
