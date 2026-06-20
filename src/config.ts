import "dotenv/config";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const config = {
  cerebrasApiKey: requireEnv("CEREBRAS_API_KEY"),
  reviewModel: process.env.REVIEW_MODEL ?? "llama-3.3-70b",

  githubToken: requireEnv("GITHUB_TOKEN"),

  // Minimum risk level that gets posted as a PR comment.
  // "low" = post everything, "high" = only post the most serious findings.
  riskThresholdForComment: (process.env.RISK_THRESHOLD_FOR_COMMENT ??
    "low") as "low" | "medium" | "high",

  memoryDbPath: process.env.MEMORY_DB_PATH ?? "./review-memory.sqlite",
} as const;
