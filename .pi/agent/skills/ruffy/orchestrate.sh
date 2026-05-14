#!/usr/bin/env bash
# orchestrate.sh — Two-phase plan/execute orchestrator
# Usage: ./orchestrate.sh <tasks-yaml>
#
# The plan agent runs interactively so you can converse with it to refine
# and approve the plan in the same session.
#
# The execute agent runs non-interactively (pi --print) and exits when done.
#
# After each execute agent session completes, the orchestrator pauses and
# asks whether to continue before spawning the next one.
#
# Environment:
#   CHUNK_LIMIT   Max commits per execute session (default: 5)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <tasks-yaml> [--tmux]"
  exit 1
fi

TASKS_FILE="$1"

if [[ ! -f "$TASKS_FILE" ]]; then
  echo "Error: Task file not found: $TASKS_FILE"
  exit 1
fi

# ---------------------------------------------------------------------------
# Python helpers — all YAML reads go through here to avoid bash YAML parsing
# ---------------------------------------------------------------------------
py() {
  # Run a short Python snippet with the TASKS_FILE available as sys.argv[1]
  python3 - "$TASKS_FILE" <<EOF
$1
EOF
}

journal_state() {
  # Prints one of: complete | has_questions | has_proposals | needs_planning
  #                awaiting_approval | executing | stuck
  py '
import sys, yaml
with open(sys.argv[1]) as f:
    data = yaml.safe_load(f)

tasks = data.get("tasks", [])
changes = data.get("proposed_task_changes", [])

if changes:
    questions = [c for c in changes if c.get("action") == "questions"]
    proposals = [c for c in changes if c.get("action") != "questions"]
    if questions:
        print("has_questions")
    elif proposals:
        print("has_proposals")
    sys.exit(0)

done_ids = {t["id"] for t in tasks if t.get("status") == "done"}

# Any task stuck mid-execute that was abandoned?
executing = [t for t in tasks if t.get("status") == "executing"]
if executing:
    print("executing")
    sys.exit(0)

awaiting = [t for t in tasks if t.get("status") == "awaiting_approval"]
if awaiting:
    print("awaiting_approval")
    sys.exit(0)

# Find next plannable task
for t in tasks:
    if t.get("status") == "":
        deps = t.get("depends_on") or []
        if all(d in done_ids for d in deps):
            print("needs_planning")
            sys.exit(0)

# Check if all done
if all(t.get("status") == "done" for t in tasks):
    print("complete")
else:
    print("stuck")  # tasks remain but all have unmet deps or in_progress with no executor
'
}

get_awaiting_task() {
  py '
import sys, yaml
with open(sys.argv[1]) as f:
    data = yaml.safe_load(f)
for t in data.get("tasks", []):
    if t.get("status") == "awaiting_approval":
        tid = t["id"]
        title = t["title"]
        print(f"  ID:    {tid}")
        print(f"  Title: {title}")
        print()
        print(t.get("plan", "(no plan written)"))
        break
'
}

get_questions() {
  py '
import sys, yaml
with open(sys.argv[1]) as f:
    data = yaml.safe_load(f)
changes = data.get("proposed_task_changes", [])
for c in changes:
    if c.get("action") == "questions":
        tid = c.get("task_id", "?")
        print(f"Task {tid} has open questions before planning can proceed:")
        print()
        for i, q in enumerate(c.get("questions", []), 1):
            print(f"  {i}. {q}")
        print()
'
}

get_proposals() {
  py '
import sys, yaml
with open(sys.argv[1]) as f:
    data = yaml.safe_load(f)
changes = data.get("proposed_task_changes", [])
proposals = [c for c in changes if c.get("action") != "questions"]
for c in proposals:
    action = c.get("action","?").upper()
    tid = c.get("task_id") or c.get("task", {}).get("id", "?")
    reason = c.get("reason","")
    print(f"  [{action}] {tid}: {reason}")
    if c.get("task"):
        t = c["task"]
        ttitle = t.get("title", "")
        tdeps = t.get("depends_on", [])
        print(f"    Title: {ttitle}")
        print(f"    Depends on: {tdeps}")
print()
'
}

set_task_field() {
  local task_id="$1"
  local field="$2"
  local value="$3"
  python3 - "$TASKS_FILE" "$task_id" "$field" "$value" <<'EOF'
import sys, yaml

def str_representer(dumper, data):
    if '\n' in data:
        return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')
    return dumper.represent_scalar('tag:yaml.org,2002:str', data)
yaml.add_representer(str, str_representer)

path, tid, field, value = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
with open(path) as f:
    data = yaml.safe_load(f)
for t in data.get("tasks", []):
    if t["id"] == tid:
        t[field] = value
        break
with open(path, "w") as f:
    yaml.dump(data, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
EOF
}

write_plan_notes() {
  local task_id="$1"
  local notes="$2"
  python3 - "$TASKS_FILE" "$task_id" "$notes" <<'EOF'
import sys, yaml

def str_representer(dumper, data):
    if '\n' in data:
        return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')
    return dumper.represent_scalar('tag:yaml.org,2002:str', data)
yaml.add_representer(str, str_representer)

path, tid, notes = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    data = yaml.safe_load(f)
for t in data.get("tasks", []):
    if t["id"] == tid:
        t["plan_notes"] = notes
        t["status"] = "executing"
        break
with open(path, "w") as f:
    yaml.dump(data, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
EOF
}

write_answer_to_questions() {
  # Writes user answer into proposed_task_changes questions entry and clears it
  local answer="$1"
  python3 - "$TASKS_FILE" "$answer" <<'EOF'
import sys, yaml

def str_representer(dumper, data):
    if '\n' in data:
        return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')
    return dumper.represent_scalar('tag:yaml.org,2002:str', data)
yaml.add_representer(str, str_representer)

path, answer = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = yaml.safe_load(f)
changes = data.get("proposed_task_changes", [])
new_changes = []
for c in changes:
    if c.get("action") == "questions":
        tid = c.get("task_id")
        for t in data.get("tasks", []):
            if t["id"] == tid:
                existing = t.get("plan_notes", "")
                sep = "\n" if existing else ""
                t["plan_notes"] = existing + sep + "User answers to pre-plan questions:\n" + answer
    else:
        new_changes.append(c)
data["proposed_task_changes"] = new_changes
with open(path, "w") as f:
    yaml.dump(data, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
EOF
}

apply_proposals() {
  python3 - "$TASKS_FILE" <<'EOF'
import sys, yaml

def str_representer(dumper, data):
    if '\n' in data:
        return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')
    return dumper.represent_scalar('tag:yaml.org,2002:str', data)
yaml.add_representer(str, str_representer)

path = sys.argv[1]
with open(path) as f:
    data = yaml.safe_load(f)
proposals = [c for c in data.get("proposed_task_changes", []) if c.get("action") != "questions"]
tasks = data.get("tasks", [])
task_ids = {t["id"] for t in tasks}
for c in proposals:
    action = c.get("action")
    if action == "add":
        new_task = c.get("task", {})
        if new_task.get("id") not in task_ids:
            tasks.append(new_task)
            task_ids.add(new_task["id"])
    elif action == "remove":
        tid = c.get("task_id")
        tasks = [t for t in tasks if t["id"] != tid]
        task_ids.discard(tid)
    elif action == "modify":
        tid = c.get("task_id")
        updated = c.get("task", {})
        for i, t in enumerate(tasks):
            if t["id"] == tid:
                tasks[i] = updated
                break
data["tasks"] = tasks
data["proposed_task_changes"] = []
with open(path, "w") as f:
    yaml.dump(data, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
EOF
}

clear_proposals() {
  python3 - "$TASKS_FILE" <<'EOF'
import sys, yaml

def str_representer(dumper, data):
    if '\n' in data:
        return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')
    return dumper.represent_scalar('tag:yaml.org,2002:str', data)
yaml.add_representer(str, str_representer)

path = sys.argv[1]
with open(path) as f:
    data = yaml.safe_load(f)
data["proposed_task_changes"] = []
with open(path, "w") as f:
    yaml.dump(data, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
EOF
}

get_executing_task_id() {
  py '
import sys, yaml
with open(sys.argv[1]) as f:
    data = yaml.safe_load(f)
for t in data.get("tasks", []):
    if t.get("status") == "executing":
        print(t["id"])
        break
'
}

get_awaiting_task_id() {
  py '
import sys, yaml
with open(sys.argv[1]) as f:
    data = yaml.safe_load(f)
for t in data.get("tasks", []):
    if t.get("status") == "awaiting_approval":
        print(t["id"])
        break
'
}

# ---------------------------------------------------------------------------
# Display helpers
# ---------------------------------------------------------------------------
divider() { echo ""; echo "══════════════════════════════════════════════════════"; echo "  $1"; echo "══════════════════════════════════════════════════════"; }
thin() { echo "  ──────────────────────────────────────────────────"; }

prompt_user() {
  local msg="$1"
  echo "" >&2
  echo -n "  $msg › " >&2
  read -r USER_INPUT
  echo "$USER_INPUT"
}

print_progress() {
  py '
import sys, yaml
with open(sys.argv[1]) as f:
    data = yaml.safe_load(f)
tasks = data.get("tasks", [])
total = len(tasks)
by_status = {}
for t in tasks:
    s = t.get("status") or "not started"
    by_status.setdefault(s, []).append(t["id"])

print(f"  Tasks: {total} total")
for status in ["done", "executing", "awaiting_approval", "not started"]:
    ids = by_status.get(status, [])
    if ids:
        ids_str = " ".join(ids)
        print(f"    {status:20s} {ids_str}")

# Print current executing or awaiting task title
for t in tasks:
    if t.get("status") in ("executing", "awaiting_approval"):
        tid = t["id"]
        title = t["title"]
        print(f"  Current: [{tid}] {title}")
        notes = (t.get("handover") or "").strip()
        if notes:
            # Print first line of handover as a quick summary
            first_line = notes.splitlines()[0]
            print(f"  Handover: {first_line}")
        break
'
}

# ---------------------------------------------------------------------------
# Chunk counter — written to a tmp file, injected into the execute prompt.
# The agent reads and increments it via its bash tool after each commit.
# The orchestrator resets it to 0 before each new execute agent invocation.
# ---------------------------------------------------------------------------
CHUNK_COUNTER_FILE=""
CHUNK_LIMIT="${CHUNK_LIMIT:-5}"   # override via env: CHUNK_LIMIT=8 ./orchestrate.sh ...

init_chunk_counter() {
  CHUNK_COUNTER_FILE=$(mktemp /tmp/ruffy_chunks_XXXXXX)
  echo "0" > "$CHUNK_COUNTER_FILE"
}

cleanup_chunk_counter() {
  [[ -n "$CHUNK_COUNTER_FILE" && -f "$CHUNK_COUNTER_FILE" ]] && rm -f "$CHUNK_COUNTER_FILE"
}

trap cleanup_chunk_counter EXIT

# ---------------------------------------------------------------------------
# Agent runners
#
# Plan agent:    interactive (pi without --print) — converse, refine, approve.
# Execute agent: non-interactive (pi --print) — runs to completion and exits.
# ---------------------------------------------------------------------------

run_plan_agent() {
  divider "PLAN AGENT"
  echo "  Reading journal and forming implementation plan..."
  echo ""

  local PROMPT
  PROMPT=$(cat "$SCRIPT_DIR/plan-prompt.md")
  pi --no-session --append-system-prompt "$PROMPT" "@$TASKS_FILE" || true
}

run_execute_agent() {
  divider "EXECUTE AGENT  (chunk limit: $CHUNK_LIMIT)"
  echo "  Implementing approved plan..."
  echo ""

  # Reset counter for this fresh agent invocation
  init_chunk_counter
  echo "  Counter file: $CHUNK_COUNTER_FILE (starts at 0)"
  echo ""

  # Inject counter path and limit into the execute prompt by substituting
  # the placeholder strings defined in execute-prompt.md
  local PROMPT
  PROMPT=$(sed \
    -e "s|CHUNK_COUNTER_PATH|$CHUNK_COUNTER_FILE|g" \
    -e "s|CHUNK_LIMIT|$CHUNK_LIMIT|g" \
    "$SCRIPT_DIR/execute-prompt.md")

  pi --print --no-session --append-system-prompt "$PROMPT" "@$TASKS_FILE" || true

  # Report how many chunks were actually committed
  local FINAL_COUNT
  FINAL_COUNT=$(cat "$CHUNK_COUNTER_FILE" 2>/dev/null || echo "?")
  echo ""
  echo "  Chunks committed this session: $FINAL_COUNT / $CHUNK_LIMIT"
}

# ---------------------------------------------------------------------------
# Interaction handlers
# ---------------------------------------------------------------------------
handle_questions() {
  divider "OPEN QUESTIONS — Human input required"
  get_questions
  thin
  echo "  Please answer the questions above."
  echo "  Your answers will be given to the plan agent on its next run."
  echo ""
  ANSWER=$(prompt_user "Your answers")
  write_answer_to_questions "$ANSWER"
  divider "Answers recorded. Re-running plan agent."
}

handle_proposals() {
  divider "PROPOSED TASK LIST CHANGES — Approval required"
  echo "  The plan agent is proposing the following changes to the task list:"
  echo ""
  get_proposals
  thin
  echo "  Options:"
  echo "    y / yes   Apply all proposals"
  echo "    n / no    Reject all proposals (plan agent will proceed without changes)"
  echo "    e / edit  Open the YAML in \$EDITOR to review and manually adjust"
  echo ""
  CHOICE=$(prompt_user "Apply proposals? [y/n/e]")

  case "${CHOICE,,}" in
    y|yes)
      apply_proposals
      divider "Proposals applied."
      ;;
    e|edit)
      ${EDITOR:-vi} "$TASKS_FILE"
      # After manual edit, clear proposed_task_changes since user handled it
      clear_proposals
      divider "Manual edits saved."
      ;;
    *)
      clear_proposals
      divider "Proposals rejected — task list unchanged."
      ;;
  esac
}

handle_awaiting_approval() {
  divider "PLAN READY — Approval required"
  echo "  The plan agent has produced a plan for the following task:"
  echo ""
  get_awaiting_task
  thin
  echo ""
  echo "  Options:"
  echo "    y / yes        Approve and proceed to implementation"
  echo "    <instructions> Type feedback/changes — plan agent will revise"
  echo "    skip           Skip this task (mark as done without implementing)"
  echo ""
  CHOICE=$(prompt_user "Approve plan? [y / instructions / skip]")

  local TASK_ID
  TASK_ID=$(get_awaiting_task_id)

  case "${CHOICE,,}" in
    y|yes)
      # Write empty plan_notes and set status to executing
      write_plan_notes "$TASK_ID" ""
      divider "Plan approved. Spawning execute agent."
      ;;
    skip)
      python3 - "$TASKS_FILE" "$TASK_ID" <<'EOF'
import sys, yaml

def str_representer(dumper, data):
    if '\n' in data:
        return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')
    return dumper.represent_scalar('tag:yaml.org,2002:str', data)
yaml.add_representer(str, str_representer)

path, tid = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = yaml.safe_load(f)
for t in data.get("tasks", []):
    if t["id"] == tid:
        t["status"] = "done"
        t["plan_notes"] = "Skipped by user."
        break
with open(path, "w") as f:
    yaml.dump(data, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
EOF
      divider "Task skipped."
      ;;
    *)
      # User provided feedback — write as plan_notes, revert status for re-planning
      python3 - "$TASKS_FILE" "$TASK_ID" "$CHOICE" <<'EOF'
import sys, yaml

def str_representer(dumper, data):
    if '\n' in data:
        return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')
    return dumper.represent_scalar('tag:yaml.org,2002:str', data)
yaml.add_representer(str, str_representer)

path, tid, notes = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    data = yaml.safe_load(f)
for t in data.get("tasks", []):
    if t["id"] == tid:
        t["plan_notes"] = notes
        t["status"] = ""
        t["plan"] = ""
        break
with open(path, "w") as f:
    yaml.dump(data, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
EOF
      divider "Feedback recorded. Plan agent will revise."
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
echo ""
divider "Orchestrator starting"
echo "  Task file:    $TASKS_FILE"
echo "  Chunk limit:  $CHUNK_LIMIT commits per execute session"
echo "  Plan agent:   interactive"
echo "  Execute agent: non-interactive (--print)"
echo ""
print_progress
echo ""

while true; do
  STATE=$(journal_state)

  echo ""
  echo "  State: $STATE"

  case "$STATE" in

    complete)
      divider "ALL TASKS COMPLETE"
      echo "  All tasks have status: done."
      exit 0
      ;;

    stuck)
      divider "STUCK — Human input required"
      echo "  Remaining tasks have unresolved dependencies or an unknown state."
      echo "  Please review the task file: $TASKS_FILE"
      echo "  Fix the task statuses or dependencies, then re-run orchestrate.sh."
      exit 1
      ;;

    has_questions)
      handle_questions
      continue
      ;;

    has_proposals)
      handle_proposals
      continue
      ;;

    awaiting_approval)
      # The plan agent now handles approval interactively.
      # If we land here the agent stopped early without getting a response —
      # fall back to the original shell-based approval flow.
      handle_awaiting_approval
      continue
      ;;

    needs_planning)
      run_plan_agent
      ;;

    executing)
      EXEC_TASK=$(get_executing_task_id)
      echo "  Executing $EXEC_TASK"
      run_execute_agent

      divider "EXECUTE SESSION DONE"
      echo ""
      print_progress
      echo ""
      echo -n "  Continue? [y/n] › "
      read -r USER_INPUT
      case "${USER_INPUT,,}" in
        n|no|q|quit|exit)
          echo ""
          echo "  Stopping. Task file: $TASKS_FILE"
          exit 0
          ;;
      esac
      ;;

  esac

  sleep 1
done
