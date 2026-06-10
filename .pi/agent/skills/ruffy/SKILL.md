---
name: ruffy
description: "Convert a PRD markdown file into a structured YAML task journal for autonomous coding agents. Use when planning a feature, starting implementation, or when asked to decompose a PRD into tasks. Triggers on: convert prd to yaml, decompose prd, create tasks yaml, ruffy, break down prd."
user-invocable: true
---

# Ruffy

Ruffy converts a PRD into a **task journal** (YAML) and then drives autonomous
implementation through a two-phase plan/execute loop. Each task gets a concrete
implementation plan approved by the user before any code is written. Agents
work in chunks, committing incrementally and handing off cleanly across
sessions.

---

## Overview

```
PRD  →  tasks.yaml  →  orchestrate.sh
                              │
                    ┌─────────┴──────────┐
                    │                    │
               Plan agent          Execute agent
               (reads journal,     (implements plan
                writes plan,        in chunks,
                awaits approval)    commits + hands off)
```

The journal YAML is the single source of truth. All state — task status,
plans, work logs, handover notes — lives there. You can stop and resume at
any time by re-running `orchestrate.sh`.

---

## Step 1 — Generate the Task Journal

Decompose the PRD into a journal file at `[feature-dir]/tasks.yaml`.

### Lean-field rule

Keep task metadata lean and non-duplicative, but always include the project
working directory for clarity.

- Do **not** create multiple fields that restate the same thing in slightly
  different words.
- If the source row number already appears in `id` (for example `ARTA-023`), do
  **not** add a separate `source_id` unless the user explicitly asks for it.
- Always include `project_dir` at the top level so an agent knows which part
  of the repo the queue applies to.
- For simple queue/backlog outputs, prefer just:
  - top-level: `project`, `project_dir`, `source` (optional), `tasks`
  - per-task: `id`, `status`, `priority`, `title`, `summary`, `fix`
- Only add extra fields when they drive automation or the user explicitly wants
  them.

### Schema

```yaml
project: "Project Name"
project_dir: "path/from-repo-root/to/project"
prd: "path/to/PRD.md"
goal: >
  One-paragraph description of what this feature delivers, written for an
  agent that has never read the PRD.

tasks:
  - id: "T-001"
    title: "Short task title"
    description: >
      What this task achieves and why it exists. Enough context for the plan
      agent to understand scope without re-reading the whole PRD.
    depends_on: []          # list of task IDs that must be done first
    status: ""              # "" | awaiting_approval | executing | done
    plan: ""                # written by plan agent, approved by user
    plan_notes: ""          # user feedback written during approval
    work_log: []            # list of {what, files, commit} entries
    handover: ""            # written by execute agent; next agent reads this

# Plan agent writes proposed changes here instead of mutating tasks[] directly.
# Orchestrator halts and asks the user to approve before merging.
proposed_task_changes: []
```

### Task lifecycle

```
""  →  awaiting_approval  →  executing  →  done
        (plan written)        (approved)
```

`proposed_task_changes` entries:
```yaml
- action: add | remove | modify
  task_id: "T-00N"      # for remove / modify
  reason: "why"
  task: { ...full task object... }   # for add / modify

- action: questions     # blocks planning until user answers
  task_id: "T-00N"
  questions:
    - "Should session state use Firestore or an in-memory dict?"
```

### Task ordering rules

Order by dependency, then by implementation layer:

1. Infrastructure / provisioning
2. Schema / database / migrations
3. Backend services and API endpoints
4. Frontend components that consume the backend
5. Integration / end-to-end tests

Every task's `depends_on` must list only tasks with lower positions in the
list. No task may depend on a task that comes after it.

### Queue-only variant

When the user asks for a lightweight task queue rather than the full
plan/execute journal, emit this lean schema:

```yaml
project: "Project Name"
project_dir: "path/from-repo-root/to/project"
source: "optional source file or URL"
tasks:
  - id: "ARTA-023"
    status: "todo"
    priority: "P1"
    title: "Display ARTA version"
    summary: "Show the dashboard version clearly so QA can reference the build."
    fix: |
      There is already a version number being displayed using the date and
      supposedly the commit hash. Render it explicitly as
      `version: {var}` and debug why the git hash is missing in builds.
```

Use the full journal schema only when the user wants orchestration with
planning, approvals, work logs, and handovers.

`project_dir` is required in both the full journal and the queue-only variant.
It should point to the intended working directory relative to the repo root so
future agents know where to start.

### Task sizing

Tasks do **not** need to fit in a single agent session. The execute agent
commits work in chunks and hands off across sessions. A task should represent
a coherent, independently deployable unit of work — not an arbitrarily small
slice.

Good task size: "Implement the session lifecycle backend (create/join/end
endpoints, in-memory store, LiveKit room API integration)"

Too small: "Add the POST /sessions route stub" (better as one chunk within a
larger task)

Too large: "Build the entire application" (no meaningful checkpoint possible)

---

## Step 2 — Run the Orchestrator

```bash
~/.pi/agent/skills/ruffy/orchestrate.sh <tasks.yaml>
```

### Arguments

| Argument | Default | Meaning |
|---|---|---|
| `tasks.yaml` | required | Path to the journal file |

### Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `CHUNK_LIMIT` | `5` | Max commits per execute session |

### Agent modes

- **Plan agent** — runs interactively. You converse with it, give feedback, and approve the plan in the same session.
- **Execute agent** — runs non-interactively (`pi --print`). It processes the approved plan and exits when done or when the chunk limit is reached.

### Continuation prompt

After each execute agent session completes, the orchestrator shows a progress
summary and asks `Continue? [y/n]`. This gives you a checkpoint to review
work, steer the next task, or stop for the day. Answering `n` (or `q`) exits
cleanly; the journal preserves all state so you can resume by re-running
`orchestrate.sh`.

---

## Orchestrator State Machine

The orchestrator derives state entirely from the journal YAML each loop tick.
No external state is kept.

```
needs_planning      → spawn plan agent (interactive); agent asks for approval inline
has_questions       → pause, collect user answers, re-run plan agent
has_proposals       → pause, show proposed task changes, user approves/rejects
awaiting_approval   → fallback shell approval (if plan agent exited without approving)
executing           → spawn execute agent (non-interactive, pi --print)
complete            → all tasks done, exit
stuck               → tasks remain but dependencies are unsatisfied, exit with error
```

Human interactions (questions, proposals, approval) do **not** consume
iterations. Only execute agent runs do.

---

## Plan Agent

The plan agent (`plan-prompt.md`) runs inline (interactive) once per task
before any code is written. It:

1. Reads the journal, PRD, and existing codebase
2. Surfaces consequential ambiguities as `questions` before committing to an
   approach (only things where the wrong choice requires significant rework)
3. Writes a numbered, step-by-step plan into `task.plan` — specific enough
   that the execute agent needs no judgment calls (exact file paths, library
   choices, API shapes, env var names)
4. Proposes task list changes (add/remove/modify) via `proposed_task_changes`
   if the codebase reveals gaps or redundancies in the original task list
5. Presents the plan and asks for approval directly in the conversation

The user responds inline:
- **Approve** — agent sets `status: executing`; orchestrator spawns the execute agent
- **Give feedback** — agent rewrites the plan in the same session and asks again
- **Skip** — task is marked done without implementation

---

## Execute Agent

The execute agent (`execute-prompt.md`) implements the approved plan in
commits, using an externally managed chunk counter to know when to stop.

### Chunk counter

The orchestrator creates a temp file initialised to `0` before each execute
session and injects its path and the limit into the agent's prompt. The agent
reads and increments it via its `bash` tool after each commit:

```bash
cat /tmp/ruffy_chunks_XXXXX          # read current count
echo $(($(cat /tmp/ruffy_chunks_XXXXX) + 1)) > /tmp/ruffy_chunks_XXXXX  # increment
```

When the counter equals `CHUNK_LIMIT`, the agent stops and writes a handover.
This is the only mechanism for session length control — the agent cannot
introspect its context window size.

### Per-chunk discipline

After every commit the execute agent must:
1. Append to `work_log` in the journal
2. Overwrite `handover` with a specific description of what remains and any
   gotchas discovered

This makes the journal crash-safe: if a session ends unexpectedly, the next
agent picks up from the last committed state with accurate handover notes.

### Handover format

```yaml
handover: |
  Completed steps 1–3. Step 4 (JobRequest callback) still needed — stub is
  at backend/agent_worker.py line 42, body is empty. Steps 5–6 remain.

  Gotchas:
  - LIVEKIT_URL must include wss:// scheme, not just the hostname.
  - WorkerOptions must be instantiated before the FastAPI app starts.
```

When the task is fully complete: `handover: ""`, `status: done`.
When stopping at chunk limit: `status: executing` (unchanged), handover updated.

---

## Example Journal

```yaml
project: "LiveKit Room"
prd: "livekit-room/PRD.md"
goal: >
  Build real-time communication infrastructure for suitability sessions.
  Backend manages session lifecycle and issues LiveKit JWT tokens.
  RM and client join via React UI. Headless Python agent joins to receive audio.

tasks:
  - id: "T-001"
    title: "LiveKit server provisioning"
    description: >
      Provision LiveKit Cloud for the POC. Document API key/secret and server
      URL in .env.example. Confirm connectivity. No application code.
    depends_on: []
    status: ""
    plan: ""
    plan_notes: ""
    work_log: []
    handover: ""

  - id: "T-002"
    title: "Backend service skeleton"
    description: >
      FastAPI service with stub endpoints: POST /sessions,
      GET /sessions/:id/client-token, DELETE /sessions/:id.
      Health check route. Dockerfile. Confirms service starts.
    depends_on: []
    status: ""
    plan: ""
    plan_notes: ""
    work_log: []
    handover: ""

  - id: "T-003"
    title: "Session lifecycle and LiveKit room management"
    description: >
      Real logic behind POST /sessions and DELETE /sessions/:id.
      In-memory session store. LiveKit room creation/deletion via server API.
      Grace-period stub for auto-close.
    depends_on: ["T-001", "T-002"]
    status: ""
    plan: ""
    plan_notes: ""
    work_log: []
    handover: ""

proposed_task_changes: []
```

---

## Checklist Before Saving the Journal

- [ ] `goal` gives enough context for an agent that hasn't read the PRD
- [ ] `project_dir` is present and clearly identifies the working directory relative to repo root
- [ ] Tasks ordered by dependency (infra → schema → backend → frontend → tests)
- [ ] Every task's `depends_on` references only earlier tasks
- [ ] Task metadata is lean; no duplicate fields like `source_id`, `reported_issue`, or extra summaries unless explicitly requested
- [ ] Task descriptions are specific enough for the plan agent to scope correctly
- [ ] `proposed_task_changes: []` initialised
- [ ] All `status`, `plan`, `plan_notes`, `handover` fields initialised to `""`
- [ ] All `work_log` fields initialised to `[]`
- [ ] `prd` field points to the correct source file
- [ ] Journal saved to `[feature-dir]/tasks.yaml`
