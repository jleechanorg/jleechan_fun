# Autonomous Long-Running Agent Harness

> *A fully autonomous multi-agent coding architecture combining GAN-style generation/evaluation loops, Anthropic-style context resets and sprint contracts, and Boris-style research and planning phases — with no human in the loop.*

**Status:** Design Proposal
**Sources:** Anthropic Harness Engineering (2025), Anthropic Advisor/GAN Strategy (2025), Boris Tan "How I Use Claude Code" (2026), SWE-bench (2025-2026), Process Reward Models literature, Self-Evolution agent research (2025-2026)

---

## The Core Problem

Long-running autonomous coding tasks fail in predictable ways:

1. **Context anxiety** — models wrap up prematurely as they feel their context window filling, even with compaction
2. **Self-evaluation failure** — agents grade their own output generously; a generator judging itself is useless
3. **No scope discipline** — agents drift from the spec over multi-hour runs
4. **Context window collapse** — history grows without bound until the model loses coherence

The harness below addresses all four via architectural decisions, not prompt engineering.

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
- Playwright MCP for live-app evaluation (not static analysis)

### Boris Workflow (Research + Planning Rigor)
- Mandatory deep-read research phase before any planning
- `research.md` as prerequisite artifact (blocks planning if < 50 lines)
- All implementation gated behind approved plan
- Todo list in plan tracked throughout execution

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   ORCHESTRATOR (AO, long-lived)             │
│   State machine · artifact routing · loop control · budget   │
└──────────┬──────────┬──────────┬──────────┬──────────────────┘
           │          │          │          │
     ┌─────▼─────┐ ┌──▼──────┐ ┌▼────────┐ ┌▼──────────┐
     │ RESEARCHER │ │STRATEGIST│ │GENERATOR│ │ EVALUATOR │
     │ deep-read  │ │spec+plan │ │1 sprint │ │ Playwright│
     │ research.md│ │ plan.md  │ │ at time │ │ hard gate │
     └───────────┘ └──────────┘ └────┬────┘ └─────┬──────┘
                                    │             │
                              sprint_contract   scores+
                                    ↓          critique
                              ┌─────────────────────────┐
                              │      REVIEWER           │
                              │ autonomous plan critique │
                              │   (2 rounds max w gen)  │
                              └─────────────────────────┘
```

### Agent Definitions

| Agent | Input | Output | Role |
|-------|-------|--------|------|
| **Orchestrator** | `brief` | `harness_state.json` | State machine; enforces guards; routes artifacts |
| **Researcher** | existing codebase | `research.md` (>50 lines) | Deep codebase understanding; prerequisite for all planning |
| **Strategist** | `research.md`, `brief` | `spec.md`, `plan.md` | Expands brief into full spec + prioritized feature breakdown |
| **Reviewer** | `spec.md`, `plan.md` | `plan_review.md` | Autonomous critique: tech corrections, scope adjustments, constraints |
| **Generator** | `spec.md`, `plan.md`, `sprint_contract.md` | `sprint_N_report.md`, git commit | Implements sprint; self-evaluates before handoff |
| **Evaluator** | `sprint_N_report.md`, running app | `sprint_N_eval.md` | Playwright MCP live testing; independent scoring; threshold gate |

---

## The Autonomous Loop

```
brief
  │
  ▼
RESEARCHER: deep-read codebase → research.md (blocks if <50 lines)
  │
  ▼
STRATEGIST: spec.md + plan.md from brief
  │
  ▼
REVIEWER: write plan_review.md (autonomous annotations)
  │
  ▼
negotiate sprint_contract.md
  Generator proposes scope + acceptance criteria
  Reviewer critiques (max 2 rounds)
  Orchestrator arbitrates if no agreement
  │
  ▼
ORCHESTRATOR: sprint_contract.md signed → Generator unlocked
  │
  ▼
GENERATE (Generator)
  implement sprint_contract.md exactly
  self-evaluate against same criteria Evaluator will use
  write sprint_N_report.md
  git commit
  │
  ▼
EVALUATE (Evaluator)
  Playwright MCP: navigate live app, test flows, inspect state
  grade all 5 criteria independently (never sees Generator's self-eval)
  │
  ├─ any threshold breach → FAIL
  │   write sprint_N_critique.md
  │   Generator reads critique → regenerate sprint (max 5 iterations)
  │
  └─ all pass → Orchestrator advances to next sprint
            │
            ▼
      [repeat until plan.md complete or max_sprints reached]
```

---

## Grading Criteria

Evaluated by Evaluator via Playwright MCP. Hard threshold gate — any criterion below its threshold = sprint fails.

| Criterion | Weight | What It Catches | Threshold |
|-----------|--------|-----------------|-----------|
| **Functionality** | 25% | Broken flows, dead UI, API errors, bad state | ≥ 80% |
| **Code Quality** | 20% | Type errors, security issues, architectural smell | ≥ 70% |
| **Design & Polish** | 25% | Generic "AI slop" patterns, bad UX, inconsistent styling | ≥ 60% |
| **Product Depth** | 20% | Shallow implementations, missing edge cases | ≥ 70% |
| **Originality** | 10% | Template defaults, uncreative solutions | ≥ 50% |

### Evaluator Calibration Prompt

> "Be skeptical. Generous scores from a generator are meaningless. You are calibrated to reject mediocre output. Penalize purple-gradient-over-white-card patterns, library defaults, and safe generic layouts. The best outputs demonstrate deliberate creative choices. If in doubt, err toward failure — the Generator can iterate."

**Few-shot calibration**: Run 3 test evaluations on known-good / known-bad reference outputs before each harness launch to verify evaluator alignment. Adjust thresholds based on calibration results.

**Evaluator drift prevention**: Reset evaluator prompt every 10 sprints to prevent score drift from repeated self-reinforcement.

---

## File-Based Handoffs

All agents communicate through files. No in-memory context passing. This is critical for:

- Surviving orchestrator restarts (a crashed orchestrator can resume from state)
- Independent agents with no shared memory
- Auditability — every decision is traceable to an artifact

| Artifact | Written By | Read By | Purpose |
|----------|-----------|---------|---------|
| `research.md` | Researcher | Strategist, Generator | Deep codebase understanding |
| `spec.md` | Strategist | All agents | Full product specification |
| `plan.md` | Strategist | Reviewer, Generator | Feature breakdown with priorities |
| `plan_review.md` | Reviewer | Generator | Autonomously annotated corrections |
| `sprint_contract.md` | Generator + Reviewer | Both | Agreed "done" criteria before sprint |
| `sprint_N_report.md` | Generator | Evaluator | What was built + self-eval |
| `sprint_N_eval.md` | Evaluator | Generator, Orchestrator | Scores + critique |
| `harness_state.json` | Orchestrator | All | Canonical state; survives restarts |

---

## Context Reset Strategy

Compaction (summarizing history in-place) preserves continuity but does **not** eliminate context anxiety — the model still "feels" full and wraps up early. Reset gives a clean slate at cost of token overhead.

### When to Reset

| Trigger | Action |
|---------|--------|
| Context window > 80% mid-sprint | Generator writes `sprint_N_state.json` → next agent resumes |
| Model exhibits premature wrap-up | Hard reset + state artifact |
| Sprint runs > 90 minutes without reaching eval | Force eval gate, then reset |

### State Artifact Format

```json
{
  "sprint": 3,
  "in_progress_files": ["src/handlers/auth.go", "migrations/004.sql"],
  "cursor_positions": {
    "src/handlers/auth.go": "line 247",
    "migrations/004.sql": "line 12"
  },
  "next_steps": [
    "finish auth handler (JWT RS256)",
    "write integration tests",
    "update routes.go"
  ],
  "context_pct": 82,
  "token_budget_spent": 145000
}
```

### Compaction vs Reset

| Approach | Context Continuity | Context Anxiety Eliminated | Token Overhead |
|----------|-------------------|---------------------------|----------------|
| Compaction only | High | No | Medium |
| Reset only | Low | Yes | Low |
| Compaction + periodic reset | Medium | Yes | Medium |

**Rule**: Compaction runs continuously; hard reset every 2 sprints OR when context > 80%.

---

## Research Phase

Mandatory prerequisite for Strategist. Research must be deep — surface-level reading produces wrong plans.

### Researcher Prompt

> "Thoroughly read and understand this codebase. Write a detailed `research.md` covering: (1) architecture overview, (2) data models and relationships, (3) API endpoints and their purposes, (4) existing patterns for new features (naming conventions, error handling, auth patterns), (5) known limitations or technical debt. Use 'deeply' and 'in detail' — do not summarize at the function-signature level. Your output must exceed 50 lines."

### Orchestrator Gate

If `research.md` is absent or < 50 lines, the Orchestrator blocks the Strategist and returns an error. No exceptions.

**Why this matters**: The most expensive failure mode in AI-assisted coding is not bad syntax — it is implementations that work in isolation but break the surrounding system. A function that ignores existing caching. A migration that violates ORM conventions. Research prevents all of this.

---

## Sprint Contract Protocol

Prevents Generator drift by forcing explicit scope agreement before any code is written.

### Example Negotiation

```
Generator: "For Sprint 3 I will implement user authentication.
Done criteria: (1) /login page renders, (2) POST /api/login returns 200 with JWT,
(3) protected /dashboard redirects to login if unauthenticated.
Self-eval: Functionality 85, Code Quality 80."

Reviewer: "Agreed on criteria. Add: (4) invalid credentials return 401,
(5) JWT must be RS256. Self-eval thresholds acceptable."

Generator: "Added criteria 4-5. Sprint contract locked."

Orchestrator: "contract signed → Generator unlocked for execution."
```

**Max negotiation rounds**: 2. If no agreement, Orchestrator arbitrates based on `spec.md` scope priority.

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

1. **State machine**: Track current phase, sprint number, eval pass/fail per sprint
2. **Artifact routing**: Each agent reads correct inputs, writes to correct outputs
3. **Guard enforcement**: Generator cannot start until `sprint_contract.md` is signed
4. **Context budget**: Reset at 80% context; abort at token budget with reason logged
5. **Loop control**: Continue sprint loop until `plan.md` complete OR max iterations reached (default: 20 sprints)
6. **Evaluator calibration**: Run 3-shot baseline check before harness launch
7. **Persistence**: All files in `./harness/{run_id}/`; survives Orchestrator restarts

---

## Failure Modes and Mitigations

| Failure | Root Cause | Fix |
|---------|-----------|-----|
| Polished garbage (works but wrong) | Evaluator too lenient | Recalibrate with stricter few-shot; reset evaluator prompt |
| Infinite loop (evaluator always fails) | Threshold too high | Adjust threshold down; cap at 5 iterations/sprint, then abort |
| Generator drifts from spec | No sprint contract | Orchestrator refuses to start sprint without signed contract |
| Context anxiety (premature wrap-up) | Compaction only | Force reset + state artifact |
| Evaluator score drift over time | Same evaluator prompt | Reset evaluator prompt every 10 sprints |
| Generator cherry-picks easy plan items | No enforcement | Orchestrator tracks plan coverage; direct Generator to hard items first |
| Beautiful but broken app | Evaluator only checks looks | Hard Functionality gate ≥80% required; Playwright testing mandatory |
| Research phase skipped | Orchestrator didn't block | `research.md` < 50 lines blocks Strategist; hard gate |

---

## Anti-Patterns

- **Ralph loops without gates** — Continuous iteration without evaluator thresholds produces mediocre results that converge slowly
- **Generator self-grading** — Agents are reliably generous to their own output; never trust self-eval as sole gate
- **Compaction-only, no resets** — Context anxiety persists; model wraps up early even with compaction
- **No sprint contract** — Vague scope → generator drift → wrong thing built confidently
- **Human-in-the-loop for every sprint** — Bottlenecks the harness; use evaluator thresholds instead
- **Skipping research** — Wrong understanding → wrong plan → wrong implementation
- **Single-evaluator long-term** — Score drift is inevitable; recalibrate periodically
- **Generator jumping ahead** — "Don't implement yet" guard; Orchestrator enforces contract before unlock

---

## Research: Key Papers and Articles

### Foundational Articles
- **Anthropic: Harness Design for Long-Running Apps** (`anthropic.com/engineering/harness-design-long-running-apps`) — Context resets, three-agent architecture, sprint contracts, file handoffs
- **Anthropic: The Advisor Strategy** (`claude.com/blog/the-advisor-strategy`) — GAN-style generator/evaluator separation, grading criteria with hard thresholds, Playwright evaluation, few-shot calibration
- **Boris Tan: How I Use Claude Code** (`boristane.com/blog/how-i-use-claude-code/`) — Research phase with "deeply" language, annotation cycle, "don't implement yet" guard, implementation directive, terse corrections

### Benchmarks and Evaluation
- **SWE-bench** (`swebench.ai`) — Autonomous agent for GitHub issue resolution; evaluator-style verification loop; SWE-TRACE (2026) extends this with process reward models and test-time scaling
- **ORACLE-SWE** — Quantifies oracle information signals in SWE agents
- **Frontier-Eng** — Benchmarking self-evolving agents on real-world engineering tasks
- **CodiumATE** — Autonomous code testing agent; evaluator implementation patterns

### Multi-Agent and Self-Evolution
- **Autogenesis: A Self-Evolving Agent Protocol** — Multi-agent self-improvement loop; relevant to Generator→Evaluator→Generator iteration
- **SkillForge** — Forging domain-specific self-evolving agent skills in cloud technical support
- **DarwinNet** — Evolutionary network architecture for agent-driven protocol synthesis
- **UI-Voyager** — Self-evolving GUI agent learning from failed experiences

### Context and Planning
- **Tokalator** — Context engineering toolkit for AI coding assistants
- **From Plan to Action** — How well do agents follow plans? Gap between planning and execution
- **ClawVM** — Harness-managed virtual memory for stateful tool-using LLM agents
- **Agent Memory Management** — External memory stores for long-horizon tasks

### Code Generation and Verification
- **Dr. RTL** — Autonomous agentic RTL optimization through tool-grounded self-improvement
- **SEC-bench** — Automated benchmarking of LLM agents on real-world software security tasks
- **COEVO** — Co-evolutionary framework for joint functional correctness and PPA optimization in LLM-based RTL generation

### Process Reward Models
- **SWE-TRACE** — Optimizing long-horizon SWE agents through rubric process reward models and heuristic test-time scaling (2026)
- **Process Reward Models** (PRM) — Step-level grading during generation; relevant to Evaluator scoring methodology

---

## Cost Expectations

| Harness | Duration | Cost |
|---------|----------|------|
| Single-agent (no harness) | ~20 min | ~$9 |
| Full 3-agent harness (Anthropic benchmark) | ~6 hr | ~$200 |
| Estimated per sprint | 15-30 min | $10-20/sprint |
| Full complex app (20 sprints) | ~10 hr | ~$300-400 |

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

- **Orchestrator**: AO (agent-orchestrator) via `dispatch-task` skill — long-lived workspace per harness run
- **Evaluator runtime**: Playwright MCP for live app interaction (navigate, click, inspect DOM/state)
- **Artifact store**: `./harness/{run_id}/` — filesystem; survives all restarts
- **State tracking**: `harness_state.json` (machine) + `harness_summary.md` (human-readable)
- **Git**: Generator commits after each sprint; revert to prior sprint on cascade failure
- **Context monitoring**: Token budget tracked per sprint; Orchestrator aborts if exceeded
