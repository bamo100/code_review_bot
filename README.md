# Agentic Code Review Bot

A GitHub Action that triggers on pull requests, analyzes the diff using a
combination of deterministic static-analysis tools and an LLM agent that
orchestrates them, posts inline PR review comments, and assigns a risk
score — with per-repo memory that reduces false positives over time.

## Why this exists

Most "AI code review" demos pipe a diff straight into an LLM and post
whatever comes back. That fails in two predictable ways: the model
hallucinates issues that a linter would catch instantly (and get wrong),
and it repeats the same false-positive complaint on every PR because it
has no memory of being told "this is intentional" last time.

This project fixes both:

- **Tools first, LLM second.** ESLint, TypeScript's compiler, and
  Semgrep run as actual deterministic tools, exposed to the agent as
  function calls. The LLM's job is to interpret and prioritize their
  output, cross-reference it against the diff, and write a human-
  readable review — not to re-derive what `tsc --noEmit` already knows
  for free and more reliably.
- **Per-repo memory.** When a maintainer marks a comment "not an issue,"
  that pattern is stored and suppressed on future runs for that repo.

## Architecture

```
PR opened/updated
        │
        ▼
┌───────────────┐
│ GitHub Action  │  triggers on pull_request: [opened, synchronize]
└───────┬────────┘
        ▼
┌────────────────┐      ┌─────────────────────────────┐
│  Fetch diff     │ ───► │  Static analysis tools       │
│  (Octokit)      │      │  (ESLint, tsc, Semgrep)       │  ◄── run as
└────────────────┘      │  exposed as agent functions   │      real CLI tools,
                         └──────────────┬────────────────┘      not LLM guesses
                                        ▼
                         ┌──────────────────────────────┐
                         │  Review Agent (LLM)           │
                         │  - calls tools as needed       │
                         │  - cross-checks findings        │
                         │    against the diff             │
                         │  - filters via repo memory       │
                         │  - assigns per-file risk score   │
                         └──────────────┬────────────────┘
                                        ▼
                         ┌──────────────────────────────┐
                         │  Post inline PR comments       │
                         │  + summary comment with risk    │
                         │    score (Octokit)               │
                         └──────────────┬────────────────┘
                                        ▼
                         ┌──────────────────────────────┐
                         │  Repo memory store (SQLite)     │
                         │  updated when maintainer reacts  │
                         │  👎 to a comment ("not an issue")│
                         └──────────────────────────────┘
```

## Stack

- **Orchestration:** plain TypeScript agent loop (tool-calling via the
  model's native function-calling, not LangGraph — see
  `ARCHITECTURE.md` decision 1 for why a graph framework is overkill
  here)
- **Model access:** OpenAI-compatible client pointed at Cerebras
  (`llama-3.3-70b`) — swap `baseURL` for any other provider
- **Static analysis tools:** ESLint, TypeScript compiler, Semgrep
  (wrapped as function-calling tools)
- **GitHub integration:** Octokit (`@octokit/rest`)
- **Memory:** SQLite (`better-sqlite3`) — one row per suppressed
  pattern, keyed by repo
- **Runtime:** runs as a GitHub Action (Node 20) on every PR event

## Project layout

```
src/
├── index.ts              Action entrypoint — reads PR event, runs the pipeline
├── config.ts              Settings from environment / action inputs
├── agents/
│   └── reviewAgent.ts     The tool-calling agent loop
├── tools/
│   ├── eslintTool.ts       Wraps ESLint as an agent-callable tool
│   ├── typeCheckTool.ts    Wraps `tsc --noEmit` as a tool
│   └── semgrepTool.ts      Wraps Semgrep as a tool
├── storage/
│   └── memoryStore.ts      SQLite-backed per-repo suppression memory
├── github/
│   ├── fetchDiff.ts         Fetches PR diff + changed files via Octokit
│   └── postReview.ts        Posts inline comments + summary via Octokit
└── types.ts                Shared types/schemas (Zod)

.github/workflows/
└── review.yml              Example workflow file consumers would add to their repo

action.yaml                 GitHub Action definition file pointing to dist/index.js

tests/
└── reviewAgent.test.ts     Agent loop tested with a mocked model + mocked tools
```

## Getting started (local dev / testing against a real PR)

```bash
# Install dependencies
npm install

# Setup env credentials
cp .env.example .env   # Configure CEREBRAS_API_KEY, GITHUB_TOKEN

# Build/compile the action
npm run build

# Dry run against a real open PR without posting comments
npm run review -- --repo owner/name --pr 42 --dry-run

# Actually post comments
npm run review -- --repo owner/name --pr 42
```

## Packaging for Distribution

This project is packaged as a **Pre-Compiled Node Action** for maximum efficiency and security. To compile all source code and dependencies into a single production bundle, run:
```bash
npm run package
```
This updates the `dist/` directory, which must be committed to GitHub along with `action.yaml`.

## Using it as a GitHub Action in another repo

### Prerequisites & Compatibility
* **Project Type:** The target repository must be a Node.js / TypeScript project (with `package.json` and a lockfile like `package-lock.json` or `yarn.lock`).
* **Tool Configuration:** The repository should have ESLint and TypeScript (`tsc`) configured locally. If these tools are not set up, the bot will fall back to using only raw LLM code-review judgment.

To use this bot in a repository, add a workflow file (e.g. `.github/workflows/review.yml`) with the following steps. 

### Example Workflow Setup
```yaml
name: Agentic Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm ci

      # Persist the bot's feedback memory between workflow runs
      - name: Restore Review Memory
        uses: actions/cache@v4
        with:
          path: ./review-memory.sqlite
          key: code-review-memory-${{ github.run_id }}
          restore-keys: |
            code-review-memory-

      # Run the pre-compiled bot directly from your repository
      - name: Run Review Bot
        uses: bamo100/code_review_bot@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CEREBRAS_API_KEY: ${{ secrets.CEREBRAS_API_KEY }}
```

### Security & Permission Model

This bot was designed with security and ease-of-use in mind:
* **Least Privilege Scope:** Unlike traditional CI/CD review bots that require the broad `checks:write` or custom GitHub App permissions, this bot only requires the standard `pull-requests:write` token scope. This limits the bot's capabilities strictly to checking out the public/private diff and commenting on the PR.
* **Commit-SHA Pinning:** For security-conscious teams, you can prevent supply-chain attacks by pinning the action to a specific, audited Git Commit SHA instead of `@main` or `@v1`:
  ```yaml
  uses: bamo100/code_review_bot@a1b2c3d4e5f6g7h8i9j0...
  ```
* **No Secret Exposure:** Your `CEREBRAS_API_KEY` is kept safe inside GitHub Secrets and is never exposed in the PR threads.

## What's deliberately NOT in v1

See `ARCHITECTURE.md` for full reasoning — short version: this doesn't
attempt auto-fix PRs, doesn't support languages beyond what
ESLint/tsc/Semgrep already cover, and the memory store is per-repo, not
shared across an org.

