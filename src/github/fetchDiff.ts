import { Octokit } from "@octokit/rest";
import { ChangedFile, PullRequestContext } from "../types";

export async function fetchPullRequestContext(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PullRequestContext> {
  const { data: pr } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  const changedFiles: ChangedFile[] = files.map((f) => ({
    filename: f.filename,
    status: f.status as ChangedFile["status"],
    patch: f.patch ?? null,
    additions: f.additions,
    deletions: f.deletions,
  }));

  return {
    owner,
    repo,
    prNumber,
    headSha: pr.head.sha,
    changedFiles,
  };
}

/**
 * Filters changed files down to ones worth running static analysis on —
 * skips deleted files, lockfiles, and generated/vendored paths that
 * would otherwise waste tool calls and model context.
 */
export function filterReviewableFiles(files: ChangedFile[]): ChangedFile[] {
  const skipPatterns = [
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /^dist\//,
    /^build\//,
    /\.min\.js$/,
    /^vendor\//,
  ];

  return files.filter((f) => {
    if (f.status === "removed") return false;
    if (!f.patch) return false; // binary or too large to diff
    return !skipPatterns.some((pattern) => pattern.test(f.filename));
  });
}
