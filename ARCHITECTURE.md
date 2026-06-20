# Architecture decisions and tradeoffs

Written for the same reason as the document-pipeline project's
ARCHITECTURE.md: the interesting engineering is in what was rejected and
why, not in the happy-path code.

## 1. Why a plain tool-calling loop instead of LangGraph

**Decision:** `reviewAgent.ts` is a hand-rolled loop: call the model with
tools available → if it requests a tool call, run it and feed the result
back → repeat until it returns a final answer.

**Rejected:** Using LangGraph, as in the document-intelligence project.

**Why:** LangGraph earns its complexity when there are multiple
specialized agents with different prompts/models and conditional
branching between them (classify → extract → validate, with retry
loops). This bot has exactly one agent with one job: interpret tool
output and write a review. There's no branching topology to model — a
graph framework here would be infrastructure for infrastructure's sake.

**Tradeoff accepted:** If this project later grows a second agent stage
(e.g. a separate "triage" agent that decides which files are worth
reviewing before the main agent runs), the hand-rolled loop would need
restructuring. That's an acceptable bet for v1's actual scope.

## 2. Why static analysis tools are real CLI tools, not LLM judgment

**Decision:** ESLint, `tsc --noEmit`, and Semgrep run as actual
subprocess calls, with their structured output exposed to the model as
function-calling tools. The model is never asked to "find type errors" —
it's asked to interpret type errors `tsc` already found.

**Rejected:** A single prompt asking the model to read the diff and
identify bugs, style issues, and type problems directly.

**Why:** LLMs are unreliable at exactly the things deterministic tools
do well — tracking type flow across files, applying a fixed style
ruleset consistently, pattern-matching against a known vulnerability
database. Asking the model to re-derive this from scratch produces both
false positives (flagging correct code) and false negatives (missing
real type errors `tsc` would catch in one pass). Using tools for what
tools are good at, and the model for synthesis and prioritization, is
the same "right layer for the job" principle as decision 4 in the
document-pipeline project (logprobs vs. a cross-check pass).

**Tradeoff accepted:** The bot now depends on the target repo having a
working ESLint/TypeScript/Semgrep setup. A repo with no linter
configured gets less value. This is documented, not silently degraded.

## 3. Why per-repo memory uses explicit maintainer feedback, not implicit learning

**Decision:** A comment is only suppressed in future runs if a
maintainer reacts to it (👎 / "not an issue") — an explicit signal
stored in SQLite. There's no automatic "the model decided this pattern
is usually fine" logic.

**Rejected:** Having the agent track its own false-positive rate and
self-adjust confidence thresholds per pattern.

**Why:** Self-adjusting confidence without a ground-truth signal just
means the bot trains itself on its own mistakes — if it's wrong in a
consistent way, implicit learning would reinforce the wrong pattern
rather than correct it. Requiring an explicit human signal means the
memory store only ever encodes things a maintainer actually confirmed.

**Tradeoff accepted:** Maintainers have to actually react to comments
for memory to build up. A repo that ignores the bot's comments gets no
improvement over time. This is the right failure mode — silence isn't
a signal either way, and a system that intentionally does nothing with
silence is more honest than one that guesses.

## 4. Why risk scoring is per-file, not per-PR

**Decision:** The agent assigns a risk score (low/medium/high) to each
changed file individually, then the summary comment aggregates them
("3 files high risk, 1 file medium").

**Why:** A single PR-level score loses information a reviewer actually
needs — "is the risk concentrated in the payment logic or spread thin
across config files?" matters for where a human reviewer spends their
limited attention. This mirrors the per-field confidence decision in the
document-intelligence project: aggregate scores hide exactly the
information that makes a score actionable.

## 5. Why this posts comments via Octokit directly instead of using GitHub's Checks API

**Decision:** Comments are posted as a PR review (`createReview` with
inline comments) rather than as a GitHub Check Run.

**Rejected:** Implementing this as a Check Run with annotations.

**Why:** PR reviews appear in the same conversation thread human
reviewers use, support the 👎 reaction needed for decision 3's memory
system, and don't require the "Checks" GitHub App permission scope,
which is harder for a portfolio project's example workflow to set up
than a standard `GITHUB_TOKEN`. Check Runs are arguably more "correct"
for a CI-style tool, but reviews fit this bot's specific need (collecting
feedback reactions) better.

**Tradeoff accepted:** The bot's findings don't appear in the Checks tab
or block merges via required-checks the way a Check Run would. A team
wanting hard merge-blocking would need to add that as a separate, small
extension.

## 6. Why this is distributed as a Pre-Compiled Node Action rather than a Composite Action or NPM package

**Decision:** The action is bundled using `@vercel/ncc` into a single file (`dist/index.js`) and distributed directly as a GitHub Action.

**Rejected:** Distributing via `npx` (NPM registry) or using a custom GitHub Actions Composite Action.

**Why:**
* **Efficiency:** A composite action has to clone the bot code, run `npm install` for the bot's own dependencies, and compile TypeScript from scratch on *every single PR run*. This adds 60–90 seconds of setup time per execution. By pre-compiling the entire bot and its dependencies into a single minified bundle (`dist/index.js`), GitHub's runner executes it instantly without any dependency installations or compile steps.
* **Security (Supply Chain Trust):** Publishing to npm exposes users to potential dependency hijacking or squatting. Distributing as a native GitHub Action allows users to securely pin the workflow to an immutable git Commit SHA (e.g. `@a1b2c3d...`). This is a recommended security pattern for third-party actions, as it guarantees the code running in their CI pipeline cannot be modified post-audit.
* **No Dependency Interference:** Since the bot runs static analysis tools (like ESLint and TypeScript) on the target project, keeping the bot's runtime dependencies fully isolated inside a single bundled file avoids dependency resolution conflicts with the target project's own `node_modules`.

**Tradeoff accepted:** Checking compiled code (`dist/index.js`) into git violates the clean source control purist view (where only source code is committed). However, this is the official and standard way GitHub recommends distributing Node-based actions.

## Known limitations / explicitly out of scope for v1

- **No auto-fix.** The bot reports issues; it doesn't open a follow-up
  commit fixing them. Auto-fix is a meaningfully different trust
  surface (now the bot is writing code that ships) and deserves its own
  design, not a bolt-on.
- **Language coverage is whatever ESLint/tsc/Semgrep cover.** A
  Python-only repo would need different tools wired into
  `src/tools/` — the agent loop itself is language-agnostic.
- **Memory is per-repo, not shared across an organization.** Two repos
  in the same org with the same false-positive pattern each have to
  teach the bot independently. Promoting memory to an org-wide store is
  a reasonable v2 feature, deliberately deferred to keep v1's storage
  model simple (one SQLite file, no multi-tenancy concerns).
- **No rate-limit-aware batching.** On a PR with many changed files, the
  bot calls the model once per file inside the agent loop. For very
  large PRs this could be slow or hit rate limits — see
  `src/agents/reviewAgent.ts` for the natural place to add batching.
