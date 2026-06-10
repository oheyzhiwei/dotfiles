import { execFileSync } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

function tryExec(command: string, args: string[], input?: string): string | null {
	try {
		return execFileSync(command, args, {
			input,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "ignore"],
			timeout: 1000,
		});
	} catch {
		return null;
	}
}

function hasCommand(command: string): boolean {
	return tryExec("sh", ["-lc", `command -v ${command}`]) !== null;
}

function readClipboard(): string {
	if (process.platform === "darwin") {
		return tryExec("pbpaste", []) ?? "";
	}

	if (process.platform === "win32") {
		return tryExec("powershell.exe", ["-NoProfile", "-Command", "Get-Clipboard"]) ?? "";
	}

	if (hasCommand("xclip")) {
		return tryExec("xclip", ["-selection", "clipboard", "-o"]) ??
			tryExec("xclip", ["-selection", "primary", "-o"]) ??
			"";
	}

	if (hasCommand("wl-paste")) {
		return tryExec("wl-paste", ["-n"]) ?? "";
	}

	if (hasCommand("xsel")) {
		return tryExec("xsel", ["--clipboard", "--output"]) ??
			tryExec("xsel", ["--primary", "--output"]) ??
			"";
	}

	return tryExec("termux-clipboard-get", []) ?? "";
}

function writeClipboard(text: string): boolean {
	if (process.platform === "darwin") {
		return tryExec("pbcopy", [], text) !== null;
	}

	if (process.platform === "win32") {
		return tryExec("powershell.exe", ["-NoProfile", "-Command", "Set-Clipboard"], text) !== null;
	}

	if (hasCommand("xsel")) {
		const clipboard = tryExec("xsel", ["--clipboard", "--input"], text) !== null;
		const primary = tryExec("xsel", ["--primary", "--input"], text) !== null;
		return clipboard || primary;
	}

	if (hasCommand("wl-copy")) {
		return tryExec("wl-copy", [], text) !== null;
	}

	if (hasCommand("xclip")) {
		// `xclip` works well for reads, but in write mode it keeps a process alive
		// to own the X selection. `execFileSync` waits for that process to exit,
		// so it times out and appears as a failed write.
		return false;
	}

	return tryExec("termux-clipboard-set", [], text) !== null;
}

function stripAnsi(text: string): string {
	return text.replace(
		// eslint-disable-next-line no-control-regex
		/\u001B\[[0-?]*[ -/]*[@-~]/g,
		"",
	);
}

export function cleanClipboardText(text: string): string {
	return stripAnsi(text)
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.split("\n")
		.map((line) => line.replace(/[ \t]+$/g, ""))
		.join("\n")
		.replace(/\n{3,}/g, "\n\n");
}

export async function runClipfix(ctx: ExtensionContext, args = ""): Promise<void> {
	const raw = readClipboard();
	if (!raw) {
		ctx.ui.notify("Clipboard is empty or unavailable", "warning");
		return;
	}

	const cleaned = cleanClipboardText(raw);
	const preview = args.trim() === "preview";

	if (preview) {
		const edited = await ctx.ui.editor("Cleaned clipboard text", cleaned);
		if (edited == null) return;
		if (!writeClipboard(edited)) {
			ctx.ui.notify("Failed to write clipboard", "error");
			return;
		}
		ctx.ui.setEditorText(edited);
		ctx.ui.notify("Cleaned text copied back to clipboard", "info");
		return;
	}

	if (!writeClipboard(cleaned)) {
		ctx.ui.notify("Failed to write clipboard", "error");
		return;
	}

	ctx.ui.notify("Clipboard cleaned", "info");
}

export default function clipfixExtension(pi: ExtensionAPI) {
	pi.registerCommand("clipfix", {
		description: "Clean clipboard text copied from terminal/TUI output",
		handler: async (args, ctx) => {
			await runClipfix(ctx, args);
		},
	});
}
