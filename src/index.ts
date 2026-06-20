/**
 * GitHub Action entrypoint. Reads PR context from the Actions runtime
 * environment, runs the review pipeline, posts results.
 */

import * as core from "@actions/core";
import * as github from "@actions/github";
import { Octokit } from "@octokit/rest";
import { fetchPullRequestContext, filterReviewableFiles } from "./github/fetchDiff";
import { postReview } from "./github/postReview";
import { runReviewAgent } from "./agents/reviewAgent";
import { closeMemoryStore } from "./storage/memoryStore";

async function main(): Promise<void> {
  const payload = github.context.payload;
  const pr = payload.pull_request;

  if (!pr) {
    core.setFailed("This action must be triggered by a pull_request event");
    return;
  }

  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;
  const prNumber = pr.number;
  const repoSlug = `${owner}/${repo}`;

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  core.info(`Fetching PR #${prNumber} for ${repoSlug}...`);
  const ctx = await fetchPullRequestContext(octokit, owner, repo, prNumber);
  const reviewableFiles = filterReviewableFiles(ctx.changedFiles);

  if (reviewableFiles.length === 0) {
    core.info("No reviewable files in this PR — skipping.");
    return;
  }

  core.info(`Running review agent on ${reviewableFiles.length} files...`);
  const result = await runReviewAgent(repoSlug, reviewableFiles);

  core.info(`Posting review with ${result.comments.length} comments...`);
  await postReview(octokit, ctx, result);

  core.info("Done.");
}

main()
  .catch((err) => {
    core.setFailed(err instanceof Error ? err.message : String(err));
  })
  .finally(() => {
    closeMemoryStore();
  });
