import { z } from "zod";

export const RiskLevel = z.enum(["low", "medium", "high"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

// ---------------------------------------------------------------------------
// Diff / PR data
// ---------------------------------------------------------------------------

export interface ChangedFile {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed";
  patch: string | null; // unified diff for this file, null for binary/too-large
  additions: number;
  deletions: number;
}

export interface PullRequestContext {
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  changedFiles: ChangedFile[];
}

// ---------------------------------------------------------------------------
// Tool output schemas — what each static analysis tool reports
// ---------------------------------------------------------------------------

export const ToolFinding = z.object({
  filename: z.string(),
  line: z.number().nullable(),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  ruleId: z.string().nullable(),
  source: z.enum(["eslint", "tsc", "semgrep"]),
});
export type ToolFinding = z.infer<typeof ToolFinding>;

// ---------------------------------------------------------------------------
// Agent output schema — the final review the model produces
// ---------------------------------------------------------------------------

export const ReviewComment = z.object({
  filename: z.string(),
  line: z.number(),
  body: z.string(),
  riskLevel: RiskLevel,
  // Links back to a specific tool finding when applicable, so we can
  // later correlate maintainer feedback to a specific rule/pattern.
  sourceRuleId: z.string().nullable(),
});
export type ReviewComment = z.infer<typeof ReviewComment>;

export const FileRiskAssessment = z.object({
  filename: z.string(),
  riskLevel: RiskLevel,
  summary: z.string(),
});
export type FileRiskAssessment = z.infer<typeof FileRiskAssessment>;

export const ReviewResult = z.object({
  comments: z.array(ReviewComment),
  fileRisk: z.array(FileRiskAssessment),
  overallSummary: z.string(),
});
export type ReviewResult = z.infer<typeof ReviewResult>;

// ---------------------------------------------------------------------------
// Memory store entries
// ---------------------------------------------------------------------------

export interface SuppressedPattern {
  repo: string;
  ruleId: string;
  filenamePattern: string; // glob-ish, e.g. "*.test.ts"
  reason: string;
  createdAt: string;
}
