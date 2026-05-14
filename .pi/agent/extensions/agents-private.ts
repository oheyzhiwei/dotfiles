/**
 * Auto-loads AGENTS.private.md from the current working directory and injects
 * its contents into the system prompt at the start of each agent turn.
 *
 * This lets you keep sensitive or personal project instructions out of version
 * control while still having pi pick them up automatically.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (_event, ctx) => {
		const privateFile = path.join(ctx.cwd, "AGENTS.private.md");

		let content: string;
		try {
			content = fs.readFileSync(privateFile, "utf8").trim();
		} catch {
			// File doesn't exist or isn't readable — nothing to do.
			return;
		}

		if (!content) return;

		return {
			systemPrompt: _event.systemPrompt + "\n\n" + content,
		};
	});
}
