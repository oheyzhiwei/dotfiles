---
name: pr-monitor
description: "Manage the background PR check monitor. Use when the user wants to watch GitHub PRs, check PR CI status, add/remove PRs from monitoring, start/stop the monitor, or view monitor logs. Triggers on: pr monitor, watch pr, monitor pr, pr checks, ci status."
---

# PR Monitor

A background bash script that monitors GitHub PR checks, auto-reruns failed jobs, and sends desktop notifications.

**Script location:** `~/bin/pr-monitor`
**State directory:** `~/.pr-monitor/`

## Commands

All commands are run via bash:

```bash
# Add a PR to watch
pr-monitor add <github-pr-url>

# Remove a PR
pr-monitor remove <github-pr-url>

# Interactive fzf UI — browse, remove, or add PRs; also auto-prunes merged/closed
pr-monitor manage

# List all monitored PRs and their status
pr-monitor list

# Start the background daemon (polls every 2 minutes)
pr-monitor start

# Stop the background daemon
pr-monitor stop

# Run in foreground (for debugging)
pr-monitor run

# Tail the log file
pr-monitor log
```

## Behavior

- **Polls every 2 minutes** using `gh pr view --json statusCheckRollup`
- **On check failure**: automatically reruns failed jobs via `gh run rerun --failed`
- **After 3 consecutive failed retries**: sends a `notify-send --urgency=critical` desktop notification and stops retrying that PR
- **On pass** (after a previous failure): sends a success desktop notification
- **Merged/closed PRs are auto-removed**: both during `manage` (pre-check) and during each poll cycle
- **State persists** in `~/.pr-monitor/state.json` — survives reboots
- **PID file** at `~/.pr-monitor/monitor.pid` — prevents duplicate daemons
- **Log file** at `~/.pr-monitor/monitor.log`

## Typical Workflows

### User says "watch this PR" or "monitor PR #123"
1. Run `pr-monitor add <url>`
2. Check if daemon is running with `pr-monitor list`
3. If not running, start it with `pr-monitor start`

### User asks for PR status
1. Run `pr-monitor list` to show all tracked PRs and their last known status

### User says "stop watching" or "remove PR"
1. Run `pr-monitor remove <url>`

### User asks to see logs
1. Run `cat ~/.pr-monitor/monitor.log | tail -50` (don't use `pr-monitor log` as that blocks with `tail -f`)

## Notes

- PR URLs must be full GitHub URLs: `https://github.com/<owner>/<repo>/pull/<number>`
- Requires `gh` CLI to be authenticated
- Requires `jq` for state management
- Desktop notifications require `notify-send` (Linux)
