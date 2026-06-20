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
import { ChangedFile, ReviewResult } from "../types";
export declare function runReviewAgent(repo: string, changedFiles: ChangedFile[]): Promise<ReviewResult>;
