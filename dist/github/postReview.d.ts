import { Octokit } from "@octokit/rest";
import { PullRequestContext, ReviewResult } from "../types";
export declare function buildSummaryComment(result: ReviewResult): string;
export declare function postReview(octokit: Octokit, ctx: PullRequestContext, result: ReviewResult, options?: {
    dryRun?: boolean;
}): Promise<void>;
