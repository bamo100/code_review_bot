/**
 * Per-repo memory store.
 *
 * Stores patterns maintainers have explicitly marked as "not an issue"
 * (via a 👎 reaction handled in github/handleFeedback.ts). The agent
 * consults this before including a finding in its review — see
 * ARCHITECTURE.md decision 3 for why this is explicit-feedback-only
 * rather than self-adjusting.
 */
import { SuppressedPattern } from "../types";
export declare function addSuppression(pattern: Omit<SuppressedPattern, "createdAt">): void;
export declare function getSuppressions(repo: string): SuppressedPattern[];
export declare function isSuppressed(repo: string, ruleId: string | null, filename: string): boolean;
export declare function closeMemoryStore(): void;
