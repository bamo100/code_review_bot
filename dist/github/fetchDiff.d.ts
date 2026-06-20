import { Octokit } from "@octokit/rest";
import { ChangedFile, PullRequestContext } from "../types";
export declare function fetchPullRequestContext(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<PullRequestContext>;
/**
 * Filters changed files down to ones worth running static analysis on —
 * skips deleted files, lockfiles, and generated/vendored paths that
 * would otherwise waste tool calls and model context.
 */
export declare function filterReviewableFiles(files: ChangedFile[]): ChangedFile[];
