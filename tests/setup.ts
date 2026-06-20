// Provides dummy env vars so config.ts doesn't throw during test imports.
// Tests never make real network calls — the OpenAI client and Octokit
// are always mocked — so these values are never actually used.
process.env.CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY ?? "test-key";
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "test-token";
process.env.MEMORY_DB_PATH = ":memory:";
