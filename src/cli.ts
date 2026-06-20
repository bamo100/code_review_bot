/**
 * CLI for local testing against a real open PR without needing to push
 * to a GitHub Actions runner.
 *
 * Usage:
 *   npm run review -- --repo owner/name --pr 42 [--dry-run]
 */

import minimist from "minimist";
import { Octokit } from "@octokit/rest";
import { config } from "./config";
import { fetchPullRequestContext, filterReviewableFiles } from "./github/fetchDiff";
import { postReview } from "./github/postReview";
import { runReviewAgent } from "./agents/reviewAgent";
import { closeMemoryStore } from "./storage/memoryStore";

async function main(): Promise<void> {
  const args = minimist(process.argv.slice(2));

  const repoArg = args.repo as string | undefined;
  const prNumber = args.pr as number | undefined;
  const dryRun = Boolean(args["dry-run"]);

  if (!repoArg || !prNumber) {
    console.error("Usage: npm run review -- --repo owner/name --pr 42 [--dry-run]");
    process.exit(1);
  }

  const [owner, repo] = repoArg.split("/");
  if (!owner || !repo) {
    console.error(`Invalid --repo value: "${repoArg}". Expected format: owner/name`);
    process.exit(1);
  }

  const octokit = new Octokit({ auth: config.githubToken });
  const repoSlug = `${owner}/${repo}`;

  console.log(`Fetching PR #${prNumber} for ${repoSlug}...`);
  const ctx = await fetchPullRequestContext(octokit, owner, repo, prNumber);
  const reviewableFiles = filterReviewableFiles(ctx.changedFiles);

  if (reviewableFiles.length === 0) {
    console.log("No reviewable files in this PR.");
    return;
  }

  console.log(`Running review agent on ${reviewableFiles.length} files...`);
  const result = await runReviewAgent(repoSlug, reviewableFiles);

  await postReview(octokit, ctx, result, { dryRun });

  if (!dryRun) {
    console.log(`Posted review with ${result.comments.length} comments.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closeMemoryStore());
