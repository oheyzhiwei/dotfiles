/**
 * Prefix Keys Extension
 *
 * Adds leader/prefix key sequences to pi — press the prefix key, then a bound
 * key to trigger an action. Similar to Emacs C-x bindings or tmux prefix.
 *
 * ── Config files (merged, project-local wins for bindings/timeout) ──────────
 *   ~/.pi/agent/prefix-keys.json   global
 *   .pi/prefix-keys.json           project-local
 *
 * ── Config schema ────────────────────────────────────────────────────────────
 * {
 *   "prefix":  "ctrl+x",    // prefix key (change requires pi restart)
 *   "timeout": 3000,        // ms to wait for second key; 0 = no timeout
 *   "bindings": {
 *     "p":       { "action": "yank",          "description": "Yank (paste from kill ring)" },
 *     "m":       { "action": "selectModel",   "description": "Models"                     },
 *     "t":       { "action": "cycleThinking", "description": "Cycle thinking level"        },
 *     ...
 *   }
 * }
 *
 * ── Built-in actions ─────────────────────────────────────────────────────────
 *   EDITOR ACTIONS (operate on the text editor):
 *     yank           Paste most recently killed text (kill-ring)
 *     yankPop        Cycle through kill-ring after yank
 *     undo           Undo last edit
 *
 *   APP ACTIONS (operate at the application level):
 *     selectModel    Open built-in model selector
 *     cycleThinking  Cycle: off → minimal → low → medium → high → xhigh → off
 *     selectThinking Pick thinking level from a list
 *     newSession     Start a new session
 *     fork           Fork the current session at the current leaf
 *     compact        Compact the session context
 *     command        Trigger a registered extension slash-command (NOT built-in
 *                    interactive commands like /model or /fork — use the
 *                    dedicated action types for those)
 *
 * ── How it works ──────────────────────────────────────────────────────────────
 *   The extension installs a CustomEditor subclass (PrefixEditor) that intercepts
 *   the prefix key before it reaches pi's shortcut dispatcher. This lets us inject
 *   raw editor key sequences (like ctrl+y for yank) back into the editor after
 *   the overlay is dismissed — something a plain pi.registerShortcut() handler
 *   cannot do.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   Place at ~/.pi/agent/extensions/prefix-keys.ts  (global)
 *   or        .pi/extensions/prefix-keys.ts         (project-local)
 *   then restart pi (or /reload).
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { CustomEditor, DynamicBorder } from "@mariozechner/pi-coding-agent";
import { runClipfix } from "../clipfix";
import type { KeybindingsManager } from "@mariozechner/pi-coding-agent";
import { Container, matchesKey, type SelectItem, SelectList, Text, TUI, truncateToWidth } from "@mariozechner/pi-tui";
import type { EditorTheme } from "@mariozechner/pi-tui";

// ── Types ─────────────────────────────────────────────────────────────────────

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

type ActionType =
	// Editor-level: injects raw key sequences into the editor buffer
	| "yank"
	| "yankPop"
	| "undo"
	// App-level: operates at the application / session level
	| "externalEditor"
	| "selectModel"
	| "cycleThinking"
	| "selectThinking"
	| "newSession"
	| "fork"
	| "compact"
	| "clipfix"
	| "command";

interface Binding {
	action: ActionType;
	/** Required when action is "command". Must be a registered extension command. */
	command?: string;
	description: string;
}

interface PrefixKeysConfig {
	/** Prefix key (e.g. "ctrl+x"). Change requires pi restart. */
	prefix: string;
	/** ms to wait for the second key. 0 = no timeout. */
	timeout: number;
	/** second-key → action map. Key format matches keybindings.json. */
	bindings: Record<string, Binding>;
}

// ── Raw sequences for editor-level actions ────────────────────────────────────
//
// These are the raw byte strings the terminal sends for the default keybindings.
// If a user has remapped these in keybindings.json, the injected sequence must
// still match the remapped key — which won't be the case. For now we use the
// defaults since remapping kill-ring keys is extremely rare.
//
//   ctrl+y  = ASCII 25 = 0x19  → yank
//   alt+y   = ESC + "y" = "\x1by" → yankPop  (legacy; may differ in Kitty terminals)
//   ctrl+-  = ASCII 31 = 0x1f  → undo
//
const EDITOR_SEQUENCES: Partial<Record<ActionType, string>> = {
	yank: "\x19",
	yankPop: "\x1by",
	undo: "\x1f",
};

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: PrefixKeysConfig = {
	prefix: "ctrl+x",
	timeout: 3000,
	bindings: {
		p: { action: "yank", description: "Yank (paste from kill ring)" },
		m: { action: "selectModel", description: "Models (/models)" },
		t: { action: "cycleThinking", description: "Cycle thinking level" },
		"shift+t": { action: "selectThinking", description: "Pick thinking level" },
		n: { action: "newSession", description: "New session" },
		f: { action: "fork", description: "Fork session" },
		c: { action: "compact", description: "Compact session" },
		y: { action: "clipfix", description: "Clean clipboard text" },
	},
};

// ── Config loading ────────────────────────────────────────────────────────────

function loadConfig(cwd?: string): PrefixKeysConfig {
	const globalPath = join(homedir(), ".pi", "agent", "prefix-keys.json");
	let result: PrefixKeysConfig = structuredClone(DEFAULT_CONFIG);

	if (existsSync(globalPath)) {
		try {
			const parsed = JSON.parse(readFileSync(globalPath, "utf-8")) as Partial<PrefixKeysConfig>;
			if (parsed.prefix) result.prefix = parsed.prefix;
			if (typeof parsed.timeout === "number") result.timeout = parsed.timeout;
			if (parsed.bindings) result.bindings = { ...result.bindings, ...parsed.bindings };
		} catch (e) {
			console.error(`[prefix-keys] Failed to parse global config: ${e}`);
		}
	}

	if (cwd) {
		const projectPath = join(cwd, ".pi", "prefix-keys.json");
		if (existsSync(projectPath)) {
			try {
				const parsed = JSON.parse(readFileSync(projectPath, "utf-8")) as Partial<PrefixKeysConfig>;
				// Project-local may override bindings and timeout, but NOT the prefix key.
				if (typeof parsed.timeout === "number") result.timeout = parsed.timeout;
				if (parsed.bindings) result.bindings = { ...result.bindings, ...parsed.bindings };
			} catch (e) {
				console.error(`[prefix-keys] Failed to parse project config: ${e}`);
			}
		}
	}

	return result;
}

// ── Prefix overlay ────────────────────────────────────────────────────────────

/** Show the prefix-key overlay. Returns the bound key pressed, or null on cancel/timeout. */
async function showPrefixOverlay(config: PrefixKeysConfig, ctx: ExtensionContext): Promise<string | null> {
	return ctx.ui.custom<string | null>(
		(tui, theme, _kb, done) => {
			let closed = false;
			let remainingMs = config.timeout;
			let timerId: ReturnType<typeof setInterval> | null = null;

			function close(result: string | null) {
				if (closed) return;
				closed = true;
				if (timerId) { clearInterval(timerId); timerId = null; }
				done(result);
			}

			if (config.timeout > 0) {
				timerId = setInterval(() => {
					if (closed) return;
					remainingMs -= 250;
					tui.requestRender();
					if (remainingMs <= 0) close(null);
				}, 250);
			}

			const bindingEntries = Object.entries(config.bindings);
			const maxKeyLen = Math.max(3, ...bindingEntries.map(([k]) => k.length));

			return {
				render(width: number): string[] {
					const lines: string[] = [];
					const inner = Math.max(0, width - 2);
					lines.push(theme.fg("borderAccent", `┌${"─".repeat(inner)}┐`));

					const secsLeft = Math.ceil(Math.max(0, remainingMs) / 1000);
					const countdown = config.timeout > 0 ? theme.fg("muted", `  (${secsLeft}s)`) : "";
					lines.push(truncateToWidth(
						"  " + theme.fg("accent", theme.bold("Prefix:")) + "  " + theme.fg("text", config.prefix) + countdown,
						width,
					));
					lines.push("");

					for (const [key, binding] of bindingEntries) {
						lines.push(truncateToWidth(
							"  " + theme.fg("accent", key.padEnd(maxKeyLen + 2)) + "  " + theme.fg("text", binding.description),
							width,
						));
					}

					lines.push("");
					lines.push(truncateToWidth(
						"  " + theme.fg("dim", "esc".padEnd(maxKeyLen + 2)) + "  " + theme.fg("muted", "Cancel  (any unbound key also cancels)"),
						width,
					));
					lines.push("");
					lines.push(theme.fg("borderAccent", `└${"─".repeat(inner)}┘`));
					return lines;
				},
				invalidate() {},
				handleInput(data: string) {
					if (closed) return;
					if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
						close(null);
						return;
					}
					for (const key of Object.keys(config.bindings)) {
						if (matchesKey(data, key)) { close(key); return; }
					}
					close(null); // unbound key cancels
				},
			};
		},
		{
			overlay: true,
			overlayOptions: { anchor: "top-center", offsetY: 3, minWidth: 48, width: "50%" },
		},
	);
}

// ── App-level action execution ────────────────────────────────────────────────

async function executeAppAction(binding: Binding, ctx: ExtensionContext, pi: ExtensionAPI): Promise<void> {
	switch (binding.action) {
		case "selectModel": {
			// Handled at editor level via app.model.select action handler.
			ctx.ui.notify("[prefix-keys] selectModel unavailable in this context", "warning");
			break;
		}

		case "cycleThinking": {
			const current = pi.getThinkingLevel();
			const idx = THINKING_LEVELS.indexOf(current);
			const next = THINKING_LEVELS[(idx + 1) % THINKING_LEVELS.length]!;
			pi.setThinkingLevel(next);
			ctx.ui.notify(`Thinking: ${next}`, "info");
			break;
		}

		case "selectThinking": {
			const current = pi.getThinkingLevel();
			const items: SelectItem[] = THINKING_LEVELS.map((l) => ({
				value: l, label: l, description: l === current ? "← current" : "",
			}));
			const chosen = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
				const container = new Container();
				container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
				container.addChild(new Text(theme.fg("accent", theme.bold("Select Thinking Level")), 1, 0));
				const list = new SelectList(items, items.length, {
					selectedPrefix: (t) => theme.fg("accent", t),
					selectedText: (t) => theme.fg("accent", t),
					description: (t) => theme.fg("muted", t),
					scrollInfo: (t) => theme.fg("dim", t),
					noMatch: (t) => theme.fg("warning", t),
				});
				list.onSelect = (item) => done(item.value);
				list.onCancel = () => done(null);
				container.addChild(list);
				container.addChild(new Text(theme.fg("dim", "↑↓ navigate  •  enter select  •  esc cancel"), 1, 0));
				container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
				return {
					render: (w) => container.render(w),
					invalidate: () => container.invalidate(),
					handleInput: (data) => { list.handleInput(data); tui.requestRender(); },
				};
			});
			if (!chosen) return;
			pi.setThinkingLevel(chosen as ThinkingLevel);
			ctx.ui.notify(`Thinking: ${chosen}`, "info");
			break;
		}

		case "fork":
			if (ctx.isIdle()) pi.sendUserMessage("/prefix-keys-fork");
			else pi.sendUserMessage("/prefix-keys-fork", { deliverAs: "followUp" });
			break;

		case "newSession":
			if (ctx.isIdle()) pi.sendUserMessage("/prefix-keys-new");
			else pi.sendUserMessage("/prefix-keys-new", { deliverAs: "followUp" });
			break;

		case "compact":
			ctx.compact();
			break;

		case "clipfix":
			await runClipfix(ctx);
			break;

		case "command":
			if (!binding.command) {
				ctx.ui.notify('[prefix-keys] "command" action requires a "command" field', "error");
				return;
			}
			if (ctx.isIdle()) pi.sendUserMessage(binding.command);
			else pi.sendUserMessage(binding.command, { deliverAs: "followUp" });
			break;
	}
}

// ── PrefixEditor ──────────────────────────────────────────────────────────────

/**
 * Custom editor that intercepts the prefix key at the editor level.
 *
 * Handling the prefix here (rather than via pi.registerShortcut) lets us inject
 * raw escape sequences back into the editor for kill-ring / undo operations,
 * which is impossible from an app-level shortcut handler.
 */
class PrefixEditor extends CustomEditor {
	private prefixConfig: PrefixKeysConfig;
	private ctx: ExtensionContext;
	private pi: ExtensionAPI;
	private tui: TUI;
	private overlayActive = false;

	constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, config: PrefixKeysConfig, ctx: ExtensionContext, pi: ExtensionAPI) {
		super(tui, theme, keybindings);
		this.tui = tui;
		this.prefixConfig = config;
		this.ctx = ctx;
		this.pi = pi;
	}

	override handleInput(data: string): void {
		// If the overlay is already showing, ignore further prefix presses.
		if (this.overlayActive) {
			super.handleInput(data);
			return;
		}

		// Check for the prefix key BEFORE calling super (which would route
		// to onExtensionShortcut and registered shortcuts).
		if (matchesKey(data, this.prefixConfig.prefix)) {
			this.activatePrefix();
			return; // consume the prefix key
		}

		super.handleInput(data);
	}

	private activatePrefix(): void {
		if (this.overlayActive) return;
		this.overlayActive = true;

		showPrefixOverlay(this.prefixConfig, this.ctx)
			.then((selectedKey) => {
				this.overlayActive = false;
				if (!selectedKey) return;

				const binding = this.prefixConfig.bindings[selectedKey];
				if (!binding) return;

				this.dispatchBinding(binding);
			})
			.catch((err) => {
				this.overlayActive = false;
				console.error(`[prefix-keys] Overlay error: ${err}`);
			});
	}

	private dispatchBinding(binding: Binding): void {
		const editorSeq = EDITOR_SEQUENCES[binding.action];

		if (editorSeq !== undefined) {
			// Editor-level action: inject the raw key sequence into the editor,
			// then request a re-render so the change is visible immediately.
			super.handleInput(editorSeq);
			this.tui.requestRender();
			return;
		}

		if (binding.action === "externalEditor") {
			// Trigger the app-level external editor action that was copied onto
			// this editor's actionHandlers by setCustomEditorComponent.
			this.actionHandlers.get("app.editor.external")?.();
			return;
		}

		if (binding.action === "selectModel") {
			// Trigger pi's native model selector UI directly.
			this.actionHandlers.get("app.model.select")?.();
			return;
		}

		// App-level action: run async, errors surfaced via notify
		executeAppAction(binding, this.ctx, this.pi).catch((err) => {
			this.ctx.ui.notify(`[prefix-keys] Action error: ${err}`, "error");
		});
	}
}

// ── Extension entry point ────────────────────────────────────────────────────

export default function prefixKeysExtension(pi: ExtensionAPI) {
	// Load global config at startup (prefix key must be known before session_start).
	let config: PrefixKeysConfig = loadConfig();

	// ── Bridge commands for session-control actions ──────────────────────────
	//
	// fork() / newSession() require ExtensionCommandContext, only available in
	// command handlers. We register thin bridge commands and call them via
	// pi.sendUserMessage() — extension commands are intercepted before the LLM.

	pi.registerCommand("prefix-keys-fork", {
		description: "Fork session at current leaf (prefix-keys extension internal)",
		handler: async (_args, ctx) => {
			const leafId = ctx.sessionManager.getLeafId();
			if (!leafId) { ctx.ui.notify("[prefix-keys] No current session entry to fork", "warning"); return; }
			const result = await ctx.fork(leafId);
			if (!result.cancelled) ctx.ui.notify("Session forked", "info");
		},
	});

	pi.registerCommand("prefix-keys-new", {
		description: "Start a new session (prefix-keys extension internal)",
		handler: async (_args, ctx) => { await ctx.newSession(); },
	});

	// ── Session start: install PrefixEditor and reload config ────────────────

	pi.on("session_start", async (_event, ctx) => {
		// Reload full config (including project-local overrides).
		const newConfig = loadConfig(ctx.cwd);
		config.bindings = newConfig.bindings;
		config.timeout = newConfig.timeout;

		if (newConfig.prefix !== config.prefix) {
			ctx.ui.notify(
				`[prefix-keys] Config prefix "${newConfig.prefix}" differs from loaded prefix "${config.prefix}". Restart pi to apply.`,
				"warning",
			);
		}

		// Install the PrefixEditor so it intercepts the prefix key at the editor
		// level. A new instance is created for each session so ctx stays current.
		ctx.ui.setEditorComponent((tui, theme, keybindings) =>
			new PrefixEditor(tui, theme, keybindings, config, ctx, pi),
		);
	});
}
