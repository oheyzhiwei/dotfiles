---
description: Pick up the next item from a task queue and implement it
argument-hint: "<task-queue-path>"
---
Pick up the next actionable item from `$1` and implement it.

Instructions:
1. Read the task queue file and identify the next item to work on.
   - Prefer the first item marked `todo`, `open`, or equivalent not-done status.
   - If the queue format is custom, infer the intended status fields from the file.
2. Gather context before coding:
   - Read the task fields carefully (`title`, `summary`, `fix`, or equivalent).
   - Inspect the relevant codepaths in the repo.
   - Check for nearby tests, related configs, and existing implementation patterns.
3. If anything is ambiguous or important information is missing, gather more context first.
   - Prefer using the `scout` subagent to investigate codepaths, dependencies, prior art, and likely implementation locations.
   - After gathering context, ask clarifying question(s) if needed before making changes.
   - Only proceed without asking if the remaining ambiguity is minor and low-risk.
4. Implement only that one task.
   - Keep changes minimal, scoped, and consistent with existing patterns.
   - Do not work on multiple queue items.
   - Do not reorder the queue unless explicitly asked.
5. Update the queue item status if appropriate.
   - Mark it `done` if fully completed.
   - Mark it `in_progress`, `blocked`, or equivalent if not fully completed.
6. Run relevant checks/tests for the files you changed.
7. In your final response, include:
   - task ID/title picked up
   - queue file path
   - files changed
   - checks run
   - brief summary of what was implemented
   - any blockers or follow-up questions

Important:
- Treat the queue file as the source of truth for task selection.
- If the queue has dependencies or ordering rules, respect them.
- If the task cannot be completed safely without clarification, stop and ask.
