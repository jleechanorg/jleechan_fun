# Autonomous Long-Running Agent Harness

> A fully autonomous multi-agent coding architecture combining GAN-style generation/evaluation loops, Anthropic-style context resets and sprint contracts, and Boris-style research and planning phases — with no human in the loop. Evaluator thresholds are the only quality gate.

**Status:** Design v2 (fully self-contained)
**Sources:**
- [Anthropic: Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) (Prithvi Rajasekaran, 2025)
- [Anthropic: The Advisor Strategy](https://claude.com/blog/the-advisor-strategy) (April 2026)
- [Boris Tan: How I Use Claude Code](https://boristane.com/blog/how-i-use-claude-code/) (February 2026)
- [LLM Wiki experiments](https://github.com/jleechanorg/llm-wiki): Meta-Harness, SWE-bench, PRM, Combined cycles against worldarchitect.ai PRs

---

## The Core Problem

Long-running autonomous coding tasks fail in four predictable ways:

1. **Context anxiety** — models wrap up prematurely as context window fills, even with compaction
2. **Self-evaluation failure** — agents grade their own output generously; a generator judging itself is useless
3. **No scope discipline** — agents drift from spec over multi-hour runs
4. **Context window collapse** — history grows without bound until the model loses coherence

The harness addresses all four via architectural decisions, not prompt engineering.

---

## The Three Source Patterns

### Anthropic Harness — Generator/Evaluator Separation

From [Anthropic's harness design post](https://www.anthropic.com/engineering/harness-design-long-running-apps):

> "When asked to evaluate work they've produced, agents tend to respond by confidently praising the work — even when, to a human observer, the quality is obviously mediocre... Separating the agent doing the work from the agent judging it proves to be a strong lever to address this issue."

The architecture uses **three agents**: planner → generator → evaluator. Key insights:

- **Context resets > compaction alone.** Compaction preserves continuity but doesn't give a clean slate — context anxiety persists. A reset provides a clean slate at cost of token overhead. [Anthropic found Sonnet 4.5 exhibited context anxiety strongly enough that compaction alone wasn't sufficient; context resets became essential until Opus 4.5 largely removed that behavior.]
- **Sprint contracts** negotiated before each build chunk keep scope tight.
- **File-based handoffs** survive agent restarts — each agent reads state and resumes.

**GAN-style loop:** The evaluator grades outputs and returns critique; the generator refines against that critique. The evaluator must be tuned to be skeptical — an uncalibrated evaluator is still generous to LLM-generated outputs. Few-shot calibration with detailed score breakdowns aligns the evaluator's judgment and reduces score drift.

**Four grading criteria** (from the Anthropic article, applied to frontend but transferable to code):

| Criterion | Weight | What It Penalizes |
|-----------|--------|-------------------|
| Design/Architecture quality | High | Incoherent whole; parts that don't combine |
| Originality | High | Template layouts, library defaults, AI slop patterns (purple gradients over white cards) |
| Craft | Standard | Broken fundamentals — most reasonable implementations pass by default |
| Functionality | Standard | Users can't find actions or complete tasks |

> "Including phrases like 'the best designs are museum quality' pushed designs toward a particular visual convergence, suggesting that the prompting associated with the criteria directly shaped the character of the output."

### Anthropic Advisor Strategy — Frontier Reasoning on Demand

From [The Advisor Strategy](https://claude.com/blog/the-advisor-strategy):

> "Sonnet or Haiku runs the task end-to-end as the executor, calling tools, reading results, and iterating toward a solution. When the executor hits a decision it can't reasonably solve, it consults Opus for guidance as the advisor. Opus accesses the shared context and returns a plan, a correction, or a stop signal, and the executor resumes."

This **inverts** the common sub-agent pattern (large orchestrator decomposes and delegates to workers). Here a smaller, cost-effective model drives and escalates only when it needs frontier-level reasoning. Results: **+2.7 percentage points on SWE-bench Multilingual 1** over Sonnet alone, at **11.9% lower cost per task**.

In the harness context: the **Generator is the executor** (Sonnet-class cost), and the **Evaluator is the advisor** (Opus-class reasoning) — but the advisor evaluates the output, not just高层次 decisions. The evaluator provides critique the generator must act on before advancing.

### Boris Workflow — Research + Planning Rigor

From [Boris Tan's workflow](https://boristane.com/blog/how-i-use-claude-code/):

> "Never let Claude write code until you've reviewed and approved a written plan."

The three phases:

1. **Research phase** — Mandatory deep-read before any planning. Key phrase: "deeply," "in great details," "intricacies." Without these words, Claude skims function signatures and moves on. Output: `research.md` (>50 lines). This is the review surface — if research is wrong, plan is wrong, implementation is wrong.

2. **Planning phase** — Plan in a persistent markdown file. Boris uses his own `.md` files, not Claude Code's built-in plan mode. Full control, editable in editor, persists as a real artifact.

3. **Annotation cycle** — The most distinctive step: open the plan in your editor, add inline notes (correcting assumptions, rejecting approaches, adding constraints), send Claude back to address them. Repeat 1–6 times. The explicit "don't implement yet" guard is essential — without it, Claude jumps to code the moment it thinks the plan is good enough.

**Implementation directive** (Boris's exact phrasing, transferable to autonomous agents):
```
implement it all. when you're done with a task or phase, mark it as completed
in the plan document. do not stop until all tasks and phases are completed.
do not add unnecessary comments or jsdocs. do not use any or unknown types.
continuously run typecheck to make sure you're not introducing new issues.
```

---

## Architecture

```
ORCHESTRATOR (AO, long-lived)
  State machine · artifact routing · loop control · budget

  Researcher → research.md              (blocks if <50 lines)
  Strategist → spec.md + plan.md
  Reviewer   → plan_review.md            (L1 constraint enforcement)
  Generator + Reviewer → sprint_contract.md  (max 2 rounds negotiation)
  Generator  → sprint_N_report.md + git commit
  Evaluator  → sprint_N_eval.md         (dual verdict: EVIDENCE + QUALITY)
    [QUALITY FAIL] → critique → Generator (SelfCritiqueVerificationLoop, 2-iter cap)
    [PASS]          → next sprint
```

### Agent Definitions

| Agent | Input | Output | Role |
|-------|-------|--------|------|
| **Orchestrator** | brief | `harness_state.json` | State machine; enforces guards; routes artifacts |
| **Researcher** | existing codebase | `research.md` (>50 lines) | Deep codebase understanding; prerequisite for planning |
| **Strategist** | `research.md`, `brief` | `spec.md`, `plan.md` | Expands brief into full spec + prioritized feature breakdown |
| **Reviewer** | `spec.md`, `plan.md` | `plan_review.md` | Autonomous critique: tech corrections, scope, L1 constraint violations |
| **Generator** | `spec.md`, `plan.md`, `sprint_contract.md` | `sprint_N_report.md`, git commit | Implements sprint; self-evaluates before handoff |
| **Evaluator** | `sprint_N_report.md`, running app | `sprint_N_eval.md` (dual verdict) | Independent scoring; threshold gate; L4 verification |

### The Six-Agent Loop

```
brief
  │
  ▼
RESEARCHER: deep-read codebase → research.md (blocks if <50 lines)
  │
  ▼
STRATEGIST: spec.md + plan.md
  │
  ▼
REVIEWER: plan_review.md (autonomous annotations + L1 constraint check)
  │
  ▼
sprint_contract.md negotiated (Generator proposes, Reviewer critiques, 2 rounds max)
  │
  ▼
ORCHESTRATOR: contract signed → Generator unlocked
  │
  ▼
GENERATE: implement sprint_contract.md → sprint_N_report.md → git commit
  │
  ▼
EVALUATE: AO skeptic agent → dual verdict (EVIDENCE + QUALITY)
  │
  ├─ QUALITY FAIL → critique → Generator
  │                 SelfCritiqueVerificationLoop: 2-iteration cap
  │
  └─ both PASS → next sprint
```

---

## Prior Experiment Results

Three harness experiment cycles were run against worldarchitect.ai PRs (jleechanorg/llm-wiki). These directly inform the Evaluator upgrade path.

### Meta-Harness (context + prompt optimization)

| PR | Baseline | Meta-Harness | Delta |
|----|----------|-------------|-------|
| WA-001 (small) | 51 | 85 | **+34** |
| WA-004 (medium) | 68 | 90 | **+22** |
| WA-005 (complex) | 62 | 87 | **+25** |
| **Average** | **60** | **87** | **+27** |

**Key insight:** Explicit typing guidance (TypedDict) yields the largest single improvement. Harness-layer guidance ("use TypedDict") is higher leverage than model-layer improvements.

### SWE-bench (test-first → fix → verify)

| PR | Baseline | SWE-bench | Delta |
|----|----------|-----------|-------|
| WA-001 (small) | 48 | 72 | **+24** |
| WA-004 (medium) | 45 | 68 | **+23** |
| WA-005 (complex) | 40 | 65 | **+25** |

**Key insight:** Test-first forces explicit data shape specification before generation. Largest gains on Type Safety dimension.

### PRM — Process Reward Model (step-level feedback)

| PR | Baseline | PRM | Delta |
|----|----------|-----|-------|
| WA-001 (small) | 55 | 78 | **+23** |
| WA-004 (medium) | 48 | 72 | **+24** |
| WA-005 (complex) | 42 | 65 | **+23** |

**Key insight:** Step-level scoring catches failures that final-score evaluation misses. Guard clauses forgotten, `.get()` chains used silently, edge cases missed. Steps scored <7/10 trigger revision.

### Combined (SWE-bench + Meta-Harness + ExtendedThinking)

| PR | Baseline | Combined | vs Meta-Harness alone |
|----|----------|----------|----------------------|
| WA-001 (small) | 48–58 | **90** | +5 |
| WA-004 (medium) | 45–68 | **92** | +2 |
| WA-005 (complex) | 40–62 | **88** | +1 |

**Recommendation:** Combined for sprints marked "critical"; Meta-Harness alone for routine sprints. Most value is captured by Meta-Harness alone.

---

## Grading Criteria — CanonicalCodeScorer

The Evaluator's scoring engine. Six dimensions, weighted, with diff-similarity against a canonical reference.

### 6-Dimension Rubric

| Dimension | Weight | What It Catches | Threshold |
|-----------|--------|-----------------|-----------|
| Type Safety / Architecture | 30% | TypedDict, strong typing, clean architecture | ≥ 70% |
| Error Handling / Robustness | 20% | Exceptions, input validation, edge cases | ≥ 70% |
| Naming & Consistency | 15% | Variables/functions follow conventions | ≥ 70% |
| Test Coverage & Clarity | 15% | Unit/integration/edge case coverage | ≥ 70% |
| Documentation | 10% | Docstrings explain *why*, not *what* | ≥ 60% |
| Evidence-Standard Adherence | 10% | Harness evidence standards met | ≥ 70% |

### Scoring Formula

**Overall:** `0.7 × rubric-score + 0.3 × diff-similarity`

- **Rubric component:** Each dimension is continuous (0–100%). Weighted average of the six dimension scores. A dimension "passes" when its score ≥ its configured Threshold. The rubric component is the weighted pass rate expressed as a decimal (e.g., 85% → 0.85).
- **Diff similarity:** Token-level edit distance against a ground-truth canonical pattern. Normalized as `1 - (edit_distance / max(len(candidate), len(pattern)))`. Range 0–1. Prevents "polished garbage" — code that scores well qualitatively but diverges structurally from the correct implementation.
- **Fallback (no canonical):** Diff-similarity = N/A, rubric weight = 1.0. Optional override: find the most similar feature pattern in `wiki/concepts/` and use its canonical as the diff reference.

### Dual Verdict (EVIDENCE + QUALITY)

The Evaluator emits two separate verdicts. **Both must be PASS for the sprint to advance.**

| Verdict | What It Measures | Gate |
|---------|-----------------|------|
| **EVIDENCE: PASS/FAIL** | Does the PR have video/screenshot evidence per harness standards? | Required for merge |
| **QUALITY: PASS/FAIL** | Does the code score above all CanonicalCodeScorer thresholds? | Required for merge |

This is the DualAgentArchitecture pattern. Evidence compliance and code quality are separate reviewer mandates — conflating them is how polished garbage gets merged.

### Evaluator Calibration

**Few-shot calibration:** Run 3 test evaluations on known-good/known-bad reference outputs before harness launch. Score deviation from expected results indicates drift.

**Drift prevention:** Reset evaluator prompt to prevent self-reinforcement. **Consecutive pass streak semantics:** If the 10 most recent runs are all PASS (no FAIL in the last 10 entries), trigger a prompt reset. Any FAIL in the last 10 resets the streak to 0.

**Calibration prompt anchor:**
> "Be skeptical. Generous scores from a generator are meaningless. You are calibrated to reject mediocre output. Penalize purple-gradient-over-white-card patterns, library defaults, and safe generic layouts. The best outputs demonstrate deliberate creative choices. If in doubt, err toward failure — the Generator can iterate."

---

## SelfCritiqueVerificationLoop — The Inner Iteration Loop

```
Phase 0: Insert canonical pattern prompt (e.g. "FastAPI error handling pattern")
Phase 1: Think step-by-step → generate initial code
Phase 2: Generate full test suite → run in sandbox → capture failures
Phase 3: Critique against test results
  - Any failure + <3 iterations → loop back to Phase 2 with revised tests/code
  - All pass + clean critique → output final verified code only
```

**Critical evidence:** Self-refine WITHOUT canonical pattern context hits token cap (4,096 tokens, 45s) and still fails. **Context + canonical patterns is mandatory**, not optional.

**Harness integration:** The Evaluator uses this loop internally:
1. First pass: identify failures against CanonicalCodeScorer rubric
2. Second pass: verify fixes (**2-iteration cap** — cost-optimized for automated skeptic; full harness uses 3 iterations per canonical spec)
3. If still failing after 2 iterations: emit QUALITY FAIL with specific critique

---

## Harness5LayerModel — Architectural Context

| Layer | Description | Autonomous Harness Role |
|-------|-------------|------------------------|
| L1 Constraint | ArchUnit-style linters, dependency rules, naming conventions | Reviewer agent — flags violations during plan_review.md phase, before any code is written |
| L2 Context | SOUL.md/CLAUDE.md/AGENTS.md, research.md, spec.md, sprint contracts | All agents — context injected at prompt start |
| L3 Execution | AO dispatch, sandboxed test execution, canonical pattern injection | Generator + Evaluator runtime |
| L4 Verification | Evaluator + CanonicalCodeScorer — acceptance criteria, evidence standards | Evaluator (AO skeptic agent) |
| L5 Lifecycle | Orchestrator state machine, crash recovery, cost tracking, git commits per sprint | Orchestrator (AO) |

**Key insight:** Anthropic Managed Agents provides L2, L3, L5. **Gap:** L1 (domain-specific architectural constraints) and L4 (acceptance criteria/verification) are the team's responsibility. Most teams skip L1, over-invest in L4. **L1 offers highest marginal return on managed platforms.**

The AO skeptic agent currently serves L4. It should also serve L1 constraint enforcement by reading architectural rules and flagging violations during plan_review.md — before any code is written.

---

## File-Based Handoffs

All agents communicate through files. No in-memory context. Critical for surviving orchestrator restarts and independent agent operation.

| Artifact | Written By | Read By | Purpose |
|----------|-----------|---------|---------|
| `research.md` | Researcher | Strategist, Generator | Deep codebase understanding |
| `spec.md` | Strategist | All | Full product specification |
| `plan.md` | Strategist | Reviewer, Generator | Feature breakdown with priorities |
| `plan_review.md` | Reviewer | Generator | Autonomous annotations + L1 constraint violations |
| `sprint_contract.md` | Generator + Reviewer | Both | Agreed "done" criteria before sprint |
| `sprint_N_report.md` | Generator | Evaluator | What was built + self-eval |
| `sprint_N_eval.md` | Evaluator | Generator, Orchestrator | Dual verdict (EVIDENCE + QUALITY) + scores |
| `harness_state.json` | Orchestrator | All | Canonical state; survives restarts |

---

## Context Reset Strategy

Compaction alone does NOT eliminate context anxiety. Reset gives a clean slate at cost of token overhead.

### When to Reset

| Trigger | Action |
|---------|--------|
| Context window >80% mid-sprint | Generator writes state artifact; next agent resumes |
| Model exhibits premature wrap-up | Hard reset + state artifact |
| Sprint runs >90 minutes without eval | Force eval gate, then reset |

### State Artifact Format

```json
{
  "sprint": 3,
  "in_progress_files": ["src/handlers/auth.go", "migrations/004.sql"],
  "cursor_positions": {"src/handlers/auth.go": "line 247"},
  "next_steps": ["finish auth handler (JWT RS256)", "write integration tests", "update routes"],
  "context_pct": 82,
  "token_budget_spent": 145000
}
```

---

## Research Phase

Mandatory prerequisite for Strategist. Surface-level reading produces wrong plans.

**Researcher prompt:** "Thoroughly read and understand this codebase. Write research.md covering: (1) architecture, (2) data models, (3) API endpoints, (4) existing patterns, (5) known debt. Do not summarize at function-signature level. Output must exceed 50 lines."

**Orchestrator gate:** research.md absent or <50 lines blocks Strategist. Hard gate, no exceptions.

**Why this matters:** The most expensive failure mode is not bad syntax — it is implementations that work in isolation but break the surrounding system. A function that ignores existing caching. A migration that violates ORM conventions. Research prevents all of this.

---

## Sprint Contract Protocol

Forces explicit scope agreement before any code is written.

```
Generator: "Sprint 3: user auth. Done: (1) /login renders, (2) POST /api/login returns 200 JWT,
(3) unauthenticated /dashboard redirects. Self-eval: Func 85, Code 80."

Reviewer: "Agreed. Add: (4) invalid creds return 401, (5) JWT must be RS256."

Generator: "Added. Contract locked."

Orchestrator: "signed → Generator unlocked."
```

Max 2 negotiation rounds. Orchestrator arbitrates if no agreement.

---

## Implementation Directive (Generator)

After sprint contract is signed, Generator receives:

```
implement it all. when you're done with a task or phase, mark it as completed
in the plan document. do not stop until all tasks and phases are completed.
do not add unnecessary comments or jsdocs. do not use any or unknown types.
continuously run typecheck to make sure you're not introducing new issues.
```

Implementation should be mechanical, not creative. All creative decisions were made during research + plan phases. This is intentional — autonomous execution should be boring.

---

## Evaluator Upgrade Path (Skeptic Agent P1–P7)

The current `ao skeptic verify` is structurally the Evaluator but is underpowered. Wiki experiments prove these gaps matter:

| Priority | Gap | Wiki Finding | Improvement |
|----------|-----|--------------|-------------|
| **P1** | No CanonicalCodeScorer rubric | 6-dim rubric + diff similarity: baseline 55 → optimized 87 | Score all dimensions independently; PASS requires ALL above threshold |
| **P2** | No SelfCritiqueVerificationLoop | Self-refine without canonical hits token cap and still fails | 2-pass skeptic: first identifies failures, second verifies fixes |
| **P3** | No step-level scoring (PRM) | Steps <7/10 trigger revision; catches guard-clause and `.get()` chain misses | Decompose PR into steps; score each step |
| **P4** | No dual verdict | Evidence and quality conflated | Emit EVIDENCE + QUALITY separately; merge gate requires both PASS |
| **P5** | No drift prevention | Evaluator becomes self-reinforcing | `skeptic-calibration.json` + consecutive-streak reset trigger |
| **P6** | No few-shot calibration | 3 reference PRs calibrate evaluator | Run 3 reference PRs through skeptic before activating on real PRs |
| **P7** | No claim-to-code traceability | Acceptance criteria not mapped to diff hunks | Explicit claim-mapping phase: PR description → diff hunk verification |

**Expected impact:** Full P1–P6 implementation closes ~80% of the evaluator gap. P7 (claim-to-code traceability) closes the remaining ~20%.

---

## Cost Expectations

| Harness | Duration | Cost |
|---------|----------|------|
| Single-agent (no harness) | ~20 min | ~$9 |
| Full 3-agent harness (Anthropic benchmark) | ~6 hr | ~$200 |
| Estimated per sprint | 15–30 min | $10–20/sprint |
| Full complex app (20 sprints) | ~10 hr | ~$300–400 |

Budget guideline: 20 sprints × $15 avg = ~$300/harness run for complex full-stack apps.

---

## When to Use This Architecture

| Scenario | Variant |
|----------|---------|
| Greenfield full-stack app | Full architecture as shown |
| Feature extension to existing codebase | Researcher + Strategist + Generator + Evaluator |
| Design system / UI work | Generator-heavy, Evaluator with visual criteria emphasis |
| Bug repair | Generator (targeted) + Evaluator (regression test) only |
| API / backend service | Evaluator emphasizes API correctness + data integrity |
| Very long task (>4h) | Context reset every 2 sprints; Evaluator recalibration every 10 sprints |

---

## Anti-Patterns

- **Ralph loops without evaluator gates** — continuous iteration without thresholds produces mediocre results
- **Generator self-grading** — agents are reliably generous to their own output
- **Compaction-only, no resets** — context anxiety persists; model wraps up early
- **No sprint contract** — vague scope → generator drift → wrong thing built confidently
- **Human-in-the-loop for every sprint** — bottlenecks the harness; use evaluator thresholds instead
- **Skipping research phase** — wrong understanding → wrong plan → wrong implementation
- **Single-evaluator long-term without recalibration** — score drift is inevitable
- **Generator jumping ahead without contract** — "don't implement yet" guard
- **Self-refine without canonical pattern grounding** — hits token cap and still fails
- **Conflating evidence and quality verdicts** — code quality failures masked by good evidence

---

## Tooling

- **Orchestrator:** AO (agent-orchestrator) via `dispatch-task` skill — long-lived workspace per harness run
- **Evaluator runtime:** `ao skeptic verify` (upgraded per gap analysis)
- **Inner loop:** SelfCritiqueVerificationLoop (2-iteration cap for skeptic; 3 for full harness)
- **Scorer:** CanonicalCodeScorer (6-dim rubric + diff similarity)
- **Artifact store:** `./harness/{run_id}/` — filesystem; survives all restarts
- **State tracking:** `harness_state.json` (machine) + `harness_summary.md` (human-readable)
- **Skeptic calibration:** `~/.agent-orchestrator/skeptic-calibration.json`
- **Git:** Generator commits after each sprint; revert to prior sprint on cascade failure
- **Context monitoring:** Token budget tracked per sprint; Orchestrator aborts if exceeded
