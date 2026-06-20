import { z } from "zod";
export declare const RiskLevel: z.ZodEnum<["low", "medium", "high"]>;
export type RiskLevel = z.infer<typeof RiskLevel>;
export declare const RISK_ORDER: Record<RiskLevel, number>;
export interface ChangedFile {
    filename: string;
    status: "added" | "modified" | "removed" | "renamed";
    patch: string | null;
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
export declare const ToolFinding: z.ZodObject<{
    filename: z.ZodString;
    line: z.ZodNullable<z.ZodNumber>;
    severity: z.ZodEnum<["error", "warning", "info"]>;
    message: z.ZodString;
    ruleId: z.ZodNullable<z.ZodString>;
    source: z.ZodEnum<["eslint", "tsc", "semgrep"]>;
}, "strip", z.ZodTypeAny, {
    message: string;
    filename: string;
    line: number | null;
    ruleId: string | null;
    severity: "error" | "warning" | "info";
    source: "eslint" | "tsc" | "semgrep";
}, {
    message: string;
    filename: string;
    line: number | null;
    ruleId: string | null;
    severity: "error" | "warning" | "info";
    source: "eslint" | "tsc" | "semgrep";
}>;
export type ToolFinding = z.infer<typeof ToolFinding>;
export declare const ReviewComment: z.ZodObject<{
    filename: z.ZodString;
    line: z.ZodNumber;
    body: z.ZodString;
    riskLevel: z.ZodEnum<["low", "medium", "high"]>;
    sourceRuleId: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    filename: string;
    line: number;
    body: string;
    riskLevel: "low" | "medium" | "high";
    sourceRuleId: string | null;
}, {
    filename: string;
    line: number;
    body: string;
    riskLevel: "low" | "medium" | "high";
    sourceRuleId: string | null;
}>;
export type ReviewComment = z.infer<typeof ReviewComment>;
export declare const FileRiskAssessment: z.ZodObject<{
    filename: z.ZodString;
    riskLevel: z.ZodEnum<["low", "medium", "high"]>;
    summary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    filename: string;
    riskLevel: "low" | "medium" | "high";
    summary: string;
}, {
    filename: string;
    riskLevel: "low" | "medium" | "high";
    summary: string;
}>;
export type FileRiskAssessment = z.infer<typeof FileRiskAssessment>;
export declare const ReviewResult: z.ZodObject<{
    comments: z.ZodArray<z.ZodObject<{
        filename: z.ZodString;
        line: z.ZodNumber;
        body: z.ZodString;
        riskLevel: z.ZodEnum<["low", "medium", "high"]>;
        sourceRuleId: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        filename: string;
        line: number;
        body: string;
        riskLevel: "low" | "medium" | "high";
        sourceRuleId: string | null;
    }, {
        filename: string;
        line: number;
        body: string;
        riskLevel: "low" | "medium" | "high";
        sourceRuleId: string | null;
    }>, "many">;
    fileRisk: z.ZodArray<z.ZodObject<{
        filename: z.ZodString;
        riskLevel: z.ZodEnum<["low", "medium", "high"]>;
        summary: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        filename: string;
        riskLevel: "low" | "medium" | "high";
        summary: string;
    }, {
        filename: string;
        riskLevel: "low" | "medium" | "high";
        summary: string;
    }>, "many">;
    overallSummary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    comments: {
        filename: string;
        line: number;
        body: string;
        riskLevel: "low" | "medium" | "high";
        sourceRuleId: string | null;
    }[];
    fileRisk: {
        filename: string;
        riskLevel: "low" | "medium" | "high";
        summary: string;
    }[];
    overallSummary: string;
}, {
    comments: {
        filename: string;
        line: number;
        body: string;
        riskLevel: "low" | "medium" | "high";
        sourceRuleId: string | null;
    }[];
    fileRisk: {
        filename: string;
        riskLevel: "low" | "medium" | "high";
        summary: string;
    }[];
    overallSummary: string;
}>;
export type ReviewResult = z.infer<typeof ReviewResult>;
export interface SuppressedPattern {
    repo: string;
    ruleId: string;
    filenamePattern: string;
    reason: string;
    createdAt: string;
}
