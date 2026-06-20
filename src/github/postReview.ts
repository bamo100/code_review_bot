import { Octokit } from "@octokit/rest";
import { PullRequestContext, ReviewResult, RISK_ORDER } from "../types";
import { config } from "../config";

function riskEmoji(level: "low" | "medium" | "high"): string {
  return { low: "🟢", medium: "🟡", high: "🔴" }[level];
}

export function buildSummaryComment(result: ReviewResult): string {
  const sorted = [...result.fileRisk].sort(
    (a, b) => RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel]
  );

  const fileRows = sorted
    .map((f) => `| ${riskEmoji(f.riskLevel)} ${f.riskLevel} | \`${f.filename}\` | ${f.summary} |`)
    .join("\n");

  const counts = sorted.reduce(
    (acc, f) => ({ ...acc, [f.riskLevel]: acc[f.riskLevel] + 1 }),
    { low: 0, medium: 0, high: 0 }
  );

  return [
    "## 🤖 Automated Code Review",
    "",
    result.overallSummary,
    "",
    `**Risk breakdown:** ${counts.high} high · ${counts.medium} medium · ${counts.low} low`,
    "",
    "| Risk | File | Summary |",
    "|------|------|---------|",
    fileRows,
    "",
    "_React 👎 on any inline comment below to mark it as not relevant — " +
      "the bot will remember that for future PRs in this repo._",
  ].join("\n");
}

export async function postReview(
  octokit: Octokit,
  ctx: PullRequestContext,
  result: ReviewResult,
  options: { dryRun?: boolean } = {}
): Promise<void> {
  const threshold = RISK_ORDER[config.riskThresholdForComment];
  const commentsToPost = result.comments.filter(
    (c) => RISK_ORDER[c.riskLevel] >= threshold
  );

  const summary = buildSummaryComment(result);

  if (options.dryRun) {
    console.log("--- DRY RUN: would post summary ---");
    console.log(summary);
    console.log(`--- DRY RUN: would post ${commentsToPost.length} inline comments ---`);
    for (const c of commentsToPost) {
      console.log(`[${c.riskLevel}] ${c.filename}:${c.line} — ${c.body}`);
    }
    return;
  }

  await octokit.pulls.createReview({
    owner: ctx.owner,
    repo: ctx.repo,
    pull_number: ctx.prNumber,
    commit_id: ctx.headSha,
    event: "COMMENT",
    body: summary,
    comments: commentsToPost.map((c) => ({
      path: c.filename,
      line: c.line,
      body: `${riskEmoji(c.riskLevel)} **${c.riskLevel} risk**\n\n${c.body}`,
    })),
  });
}
