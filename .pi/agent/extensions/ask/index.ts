/**
 * Ask Extension — A rich Q&A tool for pi agents
 *
 * Provides an `ask` tool the LLM can call to ask the user questions.
 * Supports three question types:
 *
 *   1. **select**   — Pick one option from a list (MCQ)
 *   2. **multi**    — Pick one or more options from a list (multi-select)
 *   3. **text**     — Free-form long text answer
 *
 * Every question type also allows the user to type a custom answer
 * instead of picking from options, so the agent always gets useful input.
 *
 * Features:
 * - Beautiful TUI with themed borders and colors
 * - Inline editor for custom / long-form answers
 * - Multi-select with toggle indicators
 * - Numbered options for quick scanning
 * - Custom renderCall / renderResult for compact session history
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	Text,
	truncateToWidth,
	wrapTextWithAnsi,
} from "@mariozechner/pi-tui";
import { Type, type Static } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OptionDef {
	label: string;
	value?: string;
	description?: string;
}

interface DisplayOption extends OptionDef {
	isOther?: boolean;
}

interface AskResult {
	questionType: "select" | "multi" | "text";
	question: string;
	options: string[];
	answers: string[];
	wasCustom: boolean;
	cancelled: boolean;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const OptionSchema = Type.Object({
	label: Type.String({ description: "Display label" }),
	value: Type.Optional(Type.String({ description: "Return value (defaults to label)" })),
	description: Type.Optional(Type.String({ description: "Extra detail shown below label" })),
});

const AskParams = Type.Object({
	question: Type.String({ description: "The question to ask the user" }),
	type: StringEnum(["select", "multi", "text"] as const, {
		description:
			"select = pick one, multi = pick one or more, text = free-form long answer",
	}),
	options: Type.Optional(
		Type.Array(OptionSchema, {
			description:
				"Options for select/multi. Ignored for text. Each option has a label, optional value, and optional description.",
		}),
	),
	placeholder: Type.Optional(
		Type.String({ description: "Placeholder text for the text editor (text type only)" }),
	),
});

export type AskInput = Static<typeof AskParams>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function errResult(msg: string, params: AskInput): { content: { type: "text"; text: string }[]; details: AskResult } {
	return {
		content: [{ type: "text", text: msg }],
		details: {
			questionType: params.type,
			question: params.question,
			options: (params.options ?? []).map((o) => o.label),
			answers: [],
			wasCustom: false,
			cancelled: true,
		},
	};
}

function optionValue(o: OptionDef): string {
	return o.value ?? o.label;
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function askExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask",
		label: "Ask",
		description:
			"Ask the user a question. Use type 'select' for single-choice, 'multi' for multi-choice, or 'text' for free-form answers. Always provide options for select/multi types.",
		promptSnippet: "Ask the user a question (single-choice, multi-choice, or free-form text)",
		promptGuidelines: [
			"Use the `ask` tool whenever you need user input, clarification, or a decision.",
			"For yes/no or A-vs-B decisions use type 'select' with appropriate options.",
			"For questions where multiple answers apply use type 'multi'.",
			"For open-ended questions use type 'text'.",
			"Keep option lists short (2–8 items). Add a description to options when helpful.",
		],
		parameters: AskParams,

		// ── Execute ─────────────────────────────────────────────────────────
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				return errResult("Error: UI not available (non-interactive mode)", params);
			}

			const qType = params.type;
			const opts: OptionDef[] = params.options ?? [];

			// Validate
			if ((qType === "select" || qType === "multi") && opts.length === 0) {
				return errResult("Error: options are required for select/multi questions", params);
			}

			// ── Text type ─────────────────────────────────────────────────
			if (qType === "text") {
				return await handleText(params, ctx);
			}

			// ── Select / Multi type ───────────────────────────────────────
			return await handleChoice(params, opts, ctx);
		},

		// ── Render call ─────────────────────────────────────────────────────
		renderCall(args, theme) {
			const a = args as AskInput;
			let text = theme.fg("toolTitle", theme.bold("ask "));
			const tag =
				a.type === "select" ? "[select one]" : a.type === "multi" ? "[select many]" : "[text]";
			text += theme.fg("muted", tag + " ");
			text += theme.fg("text", a.question);

			if (a.options?.length) {
				const labels = a.options.map((o) => o.label);
				const numbered = labels.map((l, i) => `${i + 1}. ${l}`);
				text += "\n" + theme.fg("dim", `  Options: ${numbered.join(", ")}`);
			}
			return new Text(text, 0, 0);
		},

		// ── Render result ───────────────────────────────────────────────────
		renderResult(result, _options, theme) {
			const d = result.details as AskResult | undefined;
			if (!d) {
				const t = result.content[0];
				return new Text(t?.type === "text" ? t.text : "", 0, 0);
			}
			if (d.cancelled) {
				return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			}

			const lines: string[] = [];
			for (const ans of d.answers) {
				const prefix = d.wasCustom ? theme.fg("muted", "(wrote) ") : "";
				lines.push(theme.fg("success", "✓ ") + prefix + theme.fg("accent", ans));
			}
			return new Text(lines.join("\n") || theme.fg("dim", "(no answer)"), 0, 0);
		},
	});

	// ── Text handler ──────────────────────────────────────────────────────────

	async function handleText(
		params: AskInput,
		ctx: { hasUI: boolean; ui: any },
	) {
		const result = await ctx.ui.custom<{ answer: string } | null>(
			(tui: any, theme: any, _kb: any, done: (v: { answer: string } | null) => void) => {
				let cachedLines: string[] | undefined;

				const editorTheme: EditorTheme = {
					borderColor: (s: string) => theme.fg("accent", s),
					selectList: {
						selectedPrefix: (t: string) => theme.fg("accent", t),
						selectedText: (t: string) => theme.fg("accent", t),
						description: (t: string) => theme.fg("muted", t),
						scrollInfo: (t: string) => theme.fg("dim", t),
						noMatch: (t: string) => theme.fg("warning", t),
					},
				};
				const editor = new Editor(tui, editorTheme);

				editor.onSubmit = (value: string) => {
					const trimmed = value.trim();
					if (trimmed) {
						done({ answer: trimmed });
					}
				};

				function refresh() {
					cachedLines = undefined;
					tui.requestRender();
				}

				function handleInput(data: string) {
					if (matchesKey(data, Key.escape)) {
						done(null);
						return;
					}
					editor.handleInput(data);
					refresh();
				}

				function render(width: number): string[] {
					if (cachedLines) return cachedLines;
					const lines: string[] = [];
					const add = (s: string) => lines.push(truncateToWidth(s, width));

					add(theme.fg("accent", "─".repeat(width)));
					// Wrap long question text instead of truncating
					const questionWidth = Math.max(1, width - 2); // 1-char left padding + 1 spare
					for (const line of wrapTextWithAnsi(theme.fg("text", params.question), questionWidth)) {
						add(` ${line}`);
					}
					lines.push("");
					add(theme.fg("muted", " Your answer:"));
					for (const line of editor.render(width - 2)) {
						add(` ${line}`);
					}
					lines.push("");
					add(theme.fg("dim", " Enter to submit • Esc to cancel"));
					add(theme.fg("accent", "─".repeat(width)));

					cachedLines = lines;
					return lines;
				}

				return {
					render,
					invalidate: () => { cachedLines = undefined; },
					handleInput,
				};
			},
		);

		const simpleOptions = (params.options ?? []).map((o) => o.label);

		if (!result) {
			return {
				content: [{ type: "text" as const, text: "User cancelled" }],
				details: {
					questionType: params.type,
					question: params.question,
					options: simpleOptions,
					answers: [],
					wasCustom: false,
					cancelled: true,
				} as AskResult,
			};
		}

		return {
			content: [{ type: "text" as const, text: `User answered: ${result.answer}` }],
			details: {
				questionType: params.type,
				question: params.question,
				options: simpleOptions,
				answers: [result.answer],
				wasCustom: true,
				cancelled: false,
			} as AskResult,
		};
	}

	// ── Choice handler (select / multi) ───────────────────────────────────────

	async function handleChoice(
		params: AskInput,
		opts: OptionDef[],
		ctx: { hasUI: boolean; ui: any },
	) {
		const isMulti = params.type === "multi";

		// Build display options — always add "Type something" at the end
		const displayOpts: DisplayOption[] = [
			...opts,
			{ label: "Type my own answer…", isOther: true },
		];

		const result = await ctx.ui.custom<
			{ answers: { value: string; label: string }[]; wasCustom: boolean } | null
		>((tui: any, theme: any, _kb: any, done: (v: any) => void) => {
			let cursor = 0;
			let editMode = false;
			let cachedLines: string[] | undefined;

			// Multi-select toggle state
			const selected = new Set<number>();

			const editorTheme: EditorTheme = {
				borderColor: (s: string) => theme.fg("accent", s),
				selectList: {
					selectedPrefix: (t: string) => theme.fg("accent", t),
					selectedText: (t: string) => theme.fg("accent", t),
					description: (t: string) => theme.fg("muted", t),
					scrollInfo: (t: string) => theme.fg("dim", t),
					noMatch: (t: string) => theme.fg("warning", t),
				},
			};
			const editor = new Editor(tui, editorTheme);

			editor.onSubmit = (value: string) => {
				const trimmed = value.trim();
				if (trimmed) {
					done({ answers: [{ value: trimmed, label: trimmed }], wasCustom: true });
				} else {
					editMode = false;
					editor.setText("");
					refresh();
				}
			};

			function refresh() {
				cachedLines = undefined;
				tui.requestRender();
			}

			function handleInput(data: string) {
				// ── Edit mode ──────────────────────────────────────────────
				if (editMode) {
					if (matchesKey(data, Key.escape)) {
						editMode = false;
						editor.setText("");
						refresh();
						return;
					}
					editor.handleInput(data);
					refresh();
					return;
				}

				// ── Navigation ─────────────────────────────────────────────
				if (matchesKey(data, Key.up)) {
					cursor = Math.max(0, cursor - 1);
					refresh();
					return;
				}
				if (matchesKey(data, Key.down)) {
					cursor = Math.min(displayOpts.length - 1, cursor + 1);
					refresh();
					return;
				}

				// ── Space toggles for multi ────────────────────────────────
				if (isMulti && matchesKey(data, Key.space)) {
					const opt = displayOpts[cursor];
					if (!opt.isOther) {
						if (selected.has(cursor)) {
							selected.delete(cursor);
						} else {
							selected.add(cursor);
						}
						refresh();
					}
					return;
				}

				// ── Enter ──────────────────────────────────────────────────
				if (matchesKey(data, Key.enter)) {
					const opt = displayOpts[cursor];

					// "Type my own answer" option
					if (opt.isOther) {
						editMode = true;
						refresh();
						return;
					}

					if (isMulti) {
						// In multi mode, Enter on an option toggles it
						// If any are selected, Enter also serves as "submit"
						// We'll make Enter on an option toggle, but add a
						// separate submit mechanism via tab key or Enter
						// when cursor is past all options.

						// Toggle current
						if (selected.has(cursor)) {
							selected.delete(cursor);
						} else {
							selected.add(cursor);
						}

						// If we have selections after toggling, offer to submit
						refresh();
						return;
					}

					// Single select — done immediately
					done({
						answers: [{ value: optionValue(opt), label: opt.label }],
						wasCustom: false,
					});
					return;
				}

				// ── Multi-select submit (Ctrl+Enter or Tab) ────────────────
				if (isMulti && (matchesKey(data, Key.ctrl("d")) || matchesKey(data, Key.tab))) {
					if (selected.size > 0) {
						const answers = [...selected]
							.sort((a, b) => a - b)
							.map((i) => ({
								value: optionValue(displayOpts[i]),
								label: displayOpts[i].label,
							}));
						done({ answers, wasCustom: false });
					}
					return;
				}

				// ── Cancel ─────────────────────────────────────────────────
				if (matchesKey(data, Key.escape)) {
					done(null);
				}
			}

			function render(width: number): string[] {
				if (cachedLines) return cachedLines;

				const lines: string[] = [];
				const add = (s: string) => lines.push(truncateToWidth(s, width));

				add(theme.fg("accent", "─".repeat(width)));

				// Header — wrap long question text
				const typeLabel = isMulti ? " [select one or more]" : " [select one]";
				const questionWidth = Math.max(1, width - 2);
				const questionLines = wrapTextWithAnsi(theme.fg("text", params.question), questionWidth);
				for (let qi = 0; qi < questionLines.length; qi++) {
					const suffix = qi === questionLines.length - 1 ? theme.fg("muted", typeLabel) : "";
					add(` ${questionLines[qi]}${suffix}`);
				}
				lines.push("");

				// Options
				for (let i = 0; i < displayOpts.length; i++) {
					const opt = displayOpts[i];
					const isCursor = i === cursor;
					const isOther = opt.isOther === true;

					let prefix: string;
					if (isMulti && !isOther) {
						const checked = selected.has(i);
						const box = checked
							? theme.fg("success", "◉")
							: theme.fg("dim", "○");
						prefix = isCursor ? theme.fg("accent", "› ") + box + " " : "  " + box + " ";
					} else {
						prefix = isCursor ? theme.fg("accent", "› ") : "  ";
					}

					const num = isOther ? "" : `${i + 1}. `;
					const label = isOther
						? theme.fg("dim", theme.italic(opt.label))
						: opt.label;

					if (isCursor) {
						add(prefix + theme.fg("accent", `${num}${label}`));
					} else {
						add(prefix + theme.fg("text", `${num}`) + (isOther ? label : theme.fg("text", label)));
					}

					if (opt.description) {
						const indent = isMulti && !isOther ? "      " : "     ";
						add(indent + theme.fg("muted", opt.description));
					}
				}

				// Editor for custom answer
				if (editMode) {
					lines.push("");
					add(theme.fg("muted", " Your answer:"));
					for (const line of editor.render(width - 2)) {
						add(` ${line}`);
					}
				}

				// Multi-select status
				if (isMulti && selected.size > 0 && !editMode) {
					lines.push("");
					const labels = [...selected]
						.sort((a, b) => a - b)
						.map((i) => displayOpts[i].label);
					add(
						theme.fg("success", ` ✓ Selected (${selected.size}): `) +
							theme.fg("text", labels.join(", ")),
					);
				}

				// Help
				lines.push("");
				if (editMode) {
					add(theme.fg("dim", " Enter to submit • Esc to go back"));
				} else if (isMulti) {
					add(
						theme.fg("dim", " ↑↓ navigate • Space/Enter toggle • Tab to submit • Esc cancel"),
					);
				} else {
					add(theme.fg("dim", " ↑↓ navigate • Enter to select • Esc to cancel"));
				}
				add(theme.fg("accent", "─".repeat(width)));

				cachedLines = lines;
				return lines;
			}

			return {
				render,
				invalidate: () => { cachedLines = undefined; },
				handleInput,
			};
		});

		const simpleOptions = opts.map((o) => o.label);

		if (!result) {
			return {
				content: [{ type: "text" as const, text: "User cancelled the selection" }],
				details: {
					questionType: params.type,
					question: params.question,
					options: simpleOptions,
					answers: [],
					wasCustom: false,
					cancelled: true,
				} as AskResult,
			};
		}

		const answerLabels = result.answers.map((a) => a.label);
		const answerValues = result.answers.map((a) => a.value);

		if (result.wasCustom) {
			return {
				content: [{ type: "text" as const, text: `User wrote: ${answerValues[0]}` }],
				details: {
					questionType: params.type,
					question: params.question,
					options: simpleOptions,
					answers: answerValues,
					wasCustom: true,
					cancelled: false,
				} as AskResult,
			};
		}

		const formatted = answerLabels
			.map((l) => {
				const idx = simpleOptions.indexOf(l);
				return idx >= 0 ? `${idx + 1}. ${l}` : l;
			})
			.join(", ");

		const verb = isMulti ? "User selected" : "User selected";

		return {
			content: [{ type: "text" as const, text: `${verb}: ${formatted}` }],
			details: {
				questionType: params.type,
				question: params.question,
				options: simpleOptions,
				answers: answerValues,
				wasCustom: false,
				cancelled: false,
			} as AskResult,
		};
	}
}
