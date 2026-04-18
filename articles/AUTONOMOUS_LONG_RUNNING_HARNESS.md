# Autonomous Long-Running Agent Harness

> A fully autonomous multi-agent coding architecture combining GAN-style generation/evaluation loops, Anthropic-style context resets and sprint contracts, and Boris-style research and planning phases — with no human in the loop. Evaluator thresholds are the only quality gate.

**Status:** Design v2 (wiki-informed)
**Sources:** Anthropic Harness Engineering (2025), Anthropic Advisor/GAN Strategy (2025), Boris Tan "How I Use Claude Code" (2026), LLM Wiki prior experiments (Meta-Harness, SWE-bench, PRM, Combined), SWE-bench/SWE-TRACE (2025-2026)

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

### Anthropic Harness (Context + Architecture)
- Context resets > compaction alone for eliminating context anxiety
- Three-agent architecture: planner → generator → evaluator
- Sprint contracts negotiated before each build chunk
- File-based handoffs that survive agent restarts

### Anthropic Advisor / GAN Strategy (Quality Gates)
- Generator + Evaluator must be separate agents
- Evaluator calibrated to be skeptical via few-shot examples
- Hard thresholds on grading criteria — any breach = fail
- **Current design uses `ao skeptic verify` (upgraded) as the active Evaluator.** Playwright MCP is the reference implementation pattern; the upgraded skeptic agent replaces it as the live architecture.

### Boris Workflow (Research + Planning Rigor)
- Mandatory deep-read research phase before any planning
- `research.md` as prerequisite artifact (blocks planning if <50 lines)
- All implementation gated behind approved plan
- Todo list in plan tracked throughout execution

---

## Architecture

```
ORCHESTRATOR (AO, long-lived)
  State machine · artifact routing · loop control · budget

  Researcher → research.md           (blocks if <50 lines)
  Strategist → spec.md + plan.md
  Reviewer   → plan_review.md         (L1 constraint enforcement)
  Generator + Reviewer → sprint_contract.md  (max 2 rounds negotiation)
  Generator  → sprint_N_report.md + git commit
  Evaluator  → sprint_N_eval.md      (dual verdict: EVIDENCE + QUALITY)
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

## LLM Wiki — Prior Experiment Results

Three prior experiment cycles were run against worldarchitect.ai PRs. These results directly inform the Evaluator upgrade path.

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

**Recommendation:** Combined for sprints marked "critical"; Meta-Harness alone for routine sprints. Most value is captured by Meta-Harness alone; Combined is additive primarily for small/medium tasks.

---

## Grading Criteria

Hard threshold gate — any criterion below its threshold = sprint fails. Evaluator never sees Generator's self-eval.

### CanonicalCodeScorer — 6-Dimension Rubric

The Evaluator's scoring engine. Rubric from `~/llm_wiki/wiki/concepts/CanonicalCodeScorer.md`.

| Dimension | Weight | What It Catches | Threshold |
|-----------|--------|-----------------|-----------|
| Type Safety / Architecture | 30% | TypedDict, strong typing, clean architecture | ≥ 70% |
| Error Handling / Robustness | 20% | Exceptions, input validation, edge cases | ≥ 70% |
| Naming & Consistency | 15% | Variables/functions follow conventions | ≥ 70% |
| Test Coverage & Clarity | 15% | Unit/integration/edge case coverage | ≥ 70% |
| Documentation | 10% | Docstrings explain *why*, not *what* | ≥ 60% |
| Evidence-Standard Adherence | 10% | Harness evidence standards met | ≥ 70% |

**Overall formula:** `0.7 × rubric-weighted-pass-rate + 0.3 × diff-similarity`

- **Rubric component:** Each dimension is continuous (0–100%), not binary. Per-dimension score is the estimated pass rate within that dimension. A dimension "passes" when its score ≥ its configured Threshold.
- **Diff similarity:** Token-level edit distance against a ground-truth canonical pattern. Normalized as `1 - (edit_distance / max(edit_distance, len(pattern)))`. Prevents "polished garbage" — code that scores well qualitatively but diverges structurally from the correct implementation.
- **Fallback when no canonical exists:** Diff-similarity is marked N/A; overall formula falls back to rubric-only score (weight 1.0). Use nearest-canonical heuristic: find the most similar feature pattern in `wiki/concepts/` and use its canonical as the diff reference.

### Dual Verdict (EVIDENCE + QUALITY)

The Evaluator emits two separate verdicts. **Both must be PASS for the sprint to advance.**

| Verdict | What It Measures | Gate |
|---------|-----------------|------|
| **EVIDENCE: PASS/FAIL** | Does the PR have video/screenshot evidence per harness standards? | Required for merge |
| **QUALITY: PASS/FAIL** | Does the code score above all CanonicalCodeScorer thresholds? | Required for merge |

This is the DualAgentArchitecture pattern. Evidence compliance and code quality are separate reviewer mandates — conflating them is how polished garbage gets merged.

### Evaluator Calibration

**Few-shot calibration:** Run 3 test evaluations on known-good/known-bad reference outputs before harness launch. Score deviation from expected results indicates drift.

**Drift prevention:** Reset evaluator prompt to prevent self-reinforcement. Track pass rate in `~/.agent-orchestrator/skeptic-calibration.json`. **Semantics: consecutive pass streak** — if the 10 most recent runs are all PASS (no FAIL in the last 10 entries), trigger a prompt reset. Any FAIL in the last 10 resets the streak to 0.

---

## SelfCritiqueVerificationLoop — The Inner Iteration Loop

From `~/llm_wiki/wiki/concepts/SelfCritiqueVerificationLoop.md`:

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

From `~/llm_wiki/wiki/concepts/Harness5LayerModel.md`:

| Layer | Description | Autonomous Harness Role |
|-------|-------------|------------------------|
| L1 Constraint | ArchUnit-style linters, dependency rules, naming conventions | Reviewer agent — flags violations during plan_review.md phase, before any code is written |
| L2 Context | SOUL.md/CLAUDE.md/AGENTS.md, research.md, spec.md, sprint contracts | All agents — context injected at prompt start |
| L3 Execution | AO dispatch, sandboxed test execution, canonical pattern injection | Generator + Evaluator runtime |
| L4 Verification | Evaluator + CanonicalCodeScorer — acceptance criteria, evidence standards | Evaluator (AO skeptic agent) |
| L5 Lifecycle | Orchestrator state machine, crash recovery, cost tracking, git commits per sprint | Orchestrator (AO) |

**Key insight:** Anthropic Managed Agents provides L2, L3, L5. **Gap:** L1 (domain-specific architectural constraints) and L4 (acceptance criteria/verification) are the team's responsibility. Most teams skip L1, over-invest in L4. **L1 offers highest marginal return on managed platforms.**

**AO skeptic agent currently serves L4.** It should also serve L1 constraint enforcement by reading architectural rules from the wiki and flagging violations during plan_review.md — before any code is written.

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

## Orchestrator Responsibilities

1. **State machine:** Track current phase, sprint number, eval pass/fail per sprint
2. **Artifact routing:** Each agent reads correct inputs, writes to correct outputs
3. **Guard enforcement:** Generator cannot start until `sprint_contract.md` is signed
4. **Context budget:** Reset at 80% context; abort at token budget with reason logged
5. **Loop control:** Continue sprint loop until `plan.md` complete OR max iterations reached (default: 20 sprints)
6. **Evaluator calibration:** Run 3-shot baseline check before harness launch
7. **Persistence:** All files in `./harness/{run_id}/`; survives Orchestrator restarts
8. **Skeptic calibration tracking:** Maintain `skeptic-calibration.json`

---

## Failure Modes and Mitigations

| Failure | Cause | Fix |
|---------|-------|-----|
| Polished garbage | Evaluator too lenient | Recalibrate few-shot; reset evaluator prompt |
| Infinite loop | Threshold too high | Adjust down; cap 5 iterations/sprint |
| Generator drift | No sprint contract | Orchestrator refuses to start sprint without signed contract |
| Context anxiety | Compaction only | Force reset + state artifact |
| Evaluator score drift | No prompt reset | Reset every 10 sprints (consecutive-streak semantics) |
| Beautiful but broken app | No functionality gate | CanonicalCodeScorer hard thresholds all dimensions |
| Research phase skipped | Orchestrator didn't block | `research.md` <50 lines blocks Strategist |
| Self-refine fails | No canonical patterns | Mandatory pattern grounding before generation |
| Skeptic score drift | No calibration tracking | `skeptic-calibration.json` + consecutive-streak reset trigger |
| Claim without code | No traceability | Claim-to-code mapping phase (P7) — acceptance criteria → diff hunks |

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

## Evaluator Upgrade Path (Skeptic Agent)

The current `ao skeptic verify` is structurally the Evaluator but is underpowered. Wiki experiments prove these gaps matter:

| Priority | Gap | Wiki Finding | Improvement |
|----------|-----|--------------|-------------|
| **P1** | No step-level scoring (PRM) | Steps <7/10 trigger revision; catches guard-clause and `.get()` chain misses | Decompose PR into steps; score each step |
| **P2** | No SelfCritiqueVerificationLoop | Self-refine without canonical hits token cap and still fails | 2-pass skeptic: first identifies failures, second verifies fixes |
| **P3** | No CanonicalCodeScorer rubric | 6-dim rubric + diff similarity: baseline 55 → optimized 87 | Score all dimensions independently; PASS requires ALL above threshold |
| **P4** | No drift prevention | Evaluator becomes self-reinforcing | `skeptic-calibration.json` + consecutive-streak reset trigger |
| **P5** | No few-shot calibration | 3 reference PRs calibrate evaluator | Run 3 reference PRs through skeptic before activating on real PRs |
| **P6** | No dual verdict | Evidence and quality conflated | Emit EVIDENCE + QUALITY separately; merge gate requires both PASS |
| **P7** | No claim-to-code traceability | Acceptance criteria not mapped to diff hunks | Explicit claim-mapping phase: PR description → diff hunk verification |

**Expected impact:** Full P1–P6 implementation closes ~80% of the evaluator gap. P7 (claim-to-code traceability) closes the remaining ~20% — PR description claims explicitly verified against diff hunks.

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
