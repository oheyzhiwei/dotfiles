/**
 * index.ts — Google Docs Reader extension entry point.
 *
 * Registers a dummy OAuth provider ("google-docs") so that pi manages credential
 * storage and automatic token refresh via auth.json, then registers two tools:
 *   - read_gdoc         — fetch and read a Google Doc or Sheet tab as plain text
 *   - list_gsheet_tabs  — list all tabs in a Google Sheets spreadsheet (title, gid, hidden)
 *   - write_gsheet      — write values to cell ranges in a Google Sheets spreadsheet
 *
 * First-use authentication is triggered automatically inline when read_gdoc is
 * called without stored credentials (in interactive mode). In non-interactive
 * modes the tool returns a clear error with instructions instead of hanging.
 *
 * Prerequisites:
 *   export GDOC_CLIENT_ID="…"
 *   export GDOC_CLIENT_SECRET="…"
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  keyHint,
  truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { exec } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchDocText, isSheetUrl, listDocTabs, parseDocId, parseDocTabId, type DocTabInfo } from "./gdoc.js";
import { fetchSheetText, listSheetTabs, parseSheetUrl, writeSheetCells } from "./gsheet.js";
import { loginGoogle, refreshGoogleToken } from "./oauth.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const PROVIDER_ID = "google-docs";

// ─── Tool parameter schema ───────────────────────────────────────────────────

const ReadGdocParams = Type.Object({
  document: Type.String({
    description:
      "The Google Docs or Google Sheets URL, or a bare document/spreadsheet ID. " +
      "Docs: https://docs.google.com/document/d/…/edit  " +
      "Sheets: https://docs.google.com/spreadsheets/d/…/edit?gid=…  " +
      "For Sheets, include the gid query parameter to target a specific tab; " +
      "omit it to read the first tab.",
  }),
});

interface ReadGdocDetails {
  docId: string;
  title?: string;
  /** Sheet tab title, set when reading a Google Sheet. */
  sheetTitle?: string;
  truncated?: boolean;
  fullOutputPath?: string;
  error?: string;
}

// ─── Helper: open URL in the default browser ─────────────────────────────────

function openUrl(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${url}"`);
}

// ─── Extension entry point ───────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── Register the dummy OAuth provider ──────────────────────────────────────
  //
  // models: [] — intentional. This provider exists solely to integrate with
  // pi's OAuth credential storage and auto-refresh machinery. It will never
  // appear in /model selection.
  //
  // api: "openai-completions" — a required field on provider config, but never
  // invoked since there are no models. Any valid api value works here.
  //
  // getApiKey: pi calls this to resolve the API key and also as the hook to
  // decide whether to call refreshToken() first (when creds.expires is past).

  pi.registerProvider(PROVIDER_ID, {
    baseUrl: "https://docs.googleapis.com",
    api: "openai-completions",
    models: [],
    oauth: {
      name: "Google Docs & Sheets",
      login: async (callbacks) => {
        // The pi /login flow uses OAuthLoginCallbacks (onAuth / onDeviceCode / onPrompt).
        // We bridge that to our loginGoogle() which accepts a simpler callbacks object.
        return loginGoogle({
          onUrl: (url) => {
            // pi's /login flow opens the browser itself via callbacks.onAuth — don't
            // call openUrl() here or the consent page opens twice.
            callbacks.onAuth({ url });
          },
          onNotify: (_msg) => {
            // Notifications during the /login flow are shown via the consent URL
            // mechanism; no extra notification needed here.
          },
        });
      },
      refreshToken: refreshGoogleToken,
      getApiKey: (creds) => creds.access,
    },
  });

  // ── Notify on session start if not yet authenticated ──────────────────────
  pi.on("session_start", async (_event, ctx) => {
    const cred = ctx.modelRegistry.authStorage.get(PROVIDER_ID);
    if (!cred || cred.type !== "oauth") {
      ctx.ui.notify(
        `gdoc-reader: not logged in. Run /login and select "Google Docs" to connect your Google account.`,
        "warning",
      );
    }
  });

  // ── Register the read_gdoc tool ───────────────────────────────────────────

  pi.registerTool<typeof ReadGdocParams, ReadGdocDetails>({
    name: "read_gdoc",
    label: "Read Google Doc",
    description:
      `Read the plain-text content of a Google Document or Google Sheet. ` +
      `Accepts a full Google Docs/Sheets URL or a bare document/spreadsheet ID. ` +
      `Sheet content is returned as a Markdown table; include the gid parameter in the URL ` +
      `to read a specific tab, otherwise the first tab is read. ` +
      `Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)} ` +
      `(whichever is hit first). When truncated, the full text is saved to a temp file ` +
      `and you can use the read tool to fetch more.`,
    parameters: ReadGdocParams,

    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const docId = isSheetUrl(params.document)
        ? parseSheetUrl(params.document).spreadsheetId
        : parseDocId(params.document);

      // Stream initial progress
      onUpdate?.({
        content: [{ type: "text", text: `Fetching document ${docId}…` }],
        details: { docId },
      });

      // ── Credential resolution ─────────────────────────────────────────────
      let cred = ctx.modelRegistry.authStorage.get(PROVIDER_ID);

      if (!cred || cred.type !== "oauth") {
        // No credentials stored — try inline login if UI is available
        if (!ctx.hasUI) {
          return {
            content: [
              {
                type: "text",
                text:
                  "Not authenticated with Google. Run pi in interactive mode, use " +
                  "/login and select \"Google Docs\" to authenticate, then retry.",
              },
            ],
            details: { docId, error: "not authenticated" },
            isError: true,
          };
        }

        // Interactive mode: run the login flow inline
        ctx.ui.notify("Opening browser for Google login…", "info");
        try {
          const newCreds = await loginGoogle({
            onUrl: (url) => {
              openUrl(url);
              ctx.ui.notify(`Google login: ${url}`, "info");
            },
            onNotify: (msg) => ctx.ui.notify(msg, "info"),
          });

          // Persist to auth.json via authStorage
          ctx.modelRegistry.authStorage.set(PROVIDER_ID, {
            type: "oauth",
            ...newCreds,
          });

          cred = { type: "oauth", ...newCreds };
          ctx.ui.notify("Google login successful!", "info");
        } catch (loginErr) {
          const msg = loginErr instanceof Error ? loginErr.message : String(loginErr);
          return {
            content: [{ type: "text", text: `Login failed: ${msg}` }],
            details: { docId, error: msg },
            isError: true,
          };
        }
      }

      // At this point cred.type === "oauth"
      const oauthCred = cred as { type: "oauth"; access: string; refresh: string; expires: number };

      // ── Check expiry and refresh if needed ────────────────────────────────
      // pi's provider machinery handles refresh automatically for model calls,
      // but since we call the Docs API directly we must check ourselves.
      let accessToken = oauthCred.access;
      if (Date.now() >= oauthCred.expires) {
        try {
          const refreshed = await refreshGoogleToken(oauthCred);
          ctx.modelRegistry.authStorage.set(PROVIDER_ID, {
            type: "oauth",
            ...refreshed,
          });
          accessToken = refreshed.access;
        } catch (refreshErr) {
          const msg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
          return {
            content: [{ type: "text", text: `Token refresh failed: ${msg}` }],
            details: { docId, error: msg },
            isError: true,
          };
        }
      }

      // ── Fetch the document or sheet ───────────────────────────────────────
      const isSheet = isSheetUrl(params.document);

      let title: string;
      let sheetTitle: string | undefined;
      let rawText: string;

      if (isSheet) {
        const { spreadsheetId, gid } = parseSheetUrl(params.document);
        onUpdate?.({
          content: [{ type: "text", text: `Fetching sheet ${spreadsheetId}${gid !== undefined ? ` (gid=${gid})` : ""}…` }],
          details: { docId },
        });
        try {
          ({ title, sheetTitle, text: rawText } = await fetchSheetText(spreadsheetId, accessToken, gid));
        } catch (fetchErr) {
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          // 401 on sheets likely means the old token lacks spreadsheets.readonly scope
          const hint = msg.includes("spreadsheets.readonly")
            ? " Re-run /login google-docs to grant the Sheets permission."
            : "";
          return {
            content: [{ type: "text", text: msg + hint }],
            details: { docId, error: msg },
            isError: true,
          };
        }
      } else {
        const tabId = parseDocTabId(params.document);
        onUpdate?.({
          content: [{ type: "text", text: `Fetching document ${docId}${tabId ? ` (tab=${tabId})` : ""}…` }],
          details: { docId },
        });
        try {
          const result = await fetchDocText(docId, accessToken, tabId);
          title = result.title;
          sheetTitle = result.tabTitle;  // reuse sheetTitle field for tab title display
          rawText = result.text;
        } catch (fetchErr) {
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          return {
            content: [{ type: "text", text: msg }],
            details: { docId, error: msg },
            isError: true,
          };
        }
      }

      // ── Truncation ────────────────────────────────────────────────────────
      const header = isSheet ? `# ${title} — ${sheetTitle}\n\n` : `# ${title}\n\n`;
      const truncation = truncateHead(rawText, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });

      let resultText = header + truncation.content;
      let fullOutputPath: string | undefined;

      if (truncation.truncated) {
        const prefix = isSheet ? `gsheet-${docId}` : `gdoc-${docId}`;
        fullOutputPath = join(tmpdir(), `${prefix}.txt`);
        try {
          writeFileSync(fullOutputPath, header + rawText, "utf-8");
        } catch {
          fullOutputPath = undefined;
        }

        const omittedLines = truncation.totalLines - truncation.outputLines;
        const omittedBytes = truncation.totalBytes - truncation.outputBytes;
        resultText +=
          `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines` +
          ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).` +
          ` ${omittedLines} lines (${formatSize(omittedBytes)}) omitted.` +
          (fullOutputPath ? ` Full text saved to: ${fullOutputPath}]` : "]");
      }

      return {
        content: [{ type: "text", text: resultText }],
        details: {
          docId,
          title,
          sheetTitle,
          truncated: truncation.truncated,
          fullOutputPath,
        },
      };
    },

    // ── Custom rendering ────────────────────────────────────────────────────

    renderCall(args, theme) {
      const isSheet = isSheetUrl(args.document);
      const id = isSheet
        ? parseSheetUrl(args.document).spreadsheetId
        : parseDocId(args.document);
      let text = theme.fg("toolTitle", theme.bold("read_gdoc "));
      text += theme.fg("muted", isSheet ? "sheet:" : "doc:");
      text += theme.fg("accent", id);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      const details = result.details as ReadGdocDetails | undefined;

      if (isPartial) {
        return new Text(theme.fg("warning", "Fetching document…"), 0, 0);
      }

      if (result.isError || details?.error) {
        const msg = details?.error ?? "unknown error";
        return new Text(theme.fg("error", `✗ ${msg}`), 0, 0);
      }

      const label = details?.sheetTitle
        ? `${details.title ?? details.docId} — ${details.sheetTitle}`
        : (details?.title ?? details?.docId ?? "document");
      let text = theme.fg("success", `✓ ${label}`);

      if (details?.truncated) {
        text += theme.fg("warning", " (truncated)");
        if (details.fullOutputPath) {
          text += theme.fg("dim", ` → ${details.fullOutputPath}`);
        }
      }

      if (!expanded) {
        text += theme.fg("dim", ` (${keyHint("expandTools", "to expand")})`);
      } else {
        // Show first 10 lines of content on Ctrl+O expand
        const contentItem = result.content[0];
        if (contentItem?.type === "text") {
          const lines = contentItem.text.split("\n").slice(0, 10);
          for (const line of lines) {
            text += `\n${theme.fg("dim", line)}`;
          }
          const totalLines = contentItem.text.split("\n").length;
          if (totalLines > 10) {
            text += `\n${theme.fg("muted", `… (${totalLines - 10} more lines)`)}`;
          }
        }
      }

      return new Text(text, 0, 0);
    },
  });

  // ── Register the list_gsheet_tabs tool ────────────────────────────────────

  const ListGsheetTabsParams = Type.Object({
    spreadsheet: Type.String({
      description:
        "The Google Sheets URL (e.g. https://docs.google.com/spreadsheets/d/…/edit) " +
        "or bare spreadsheet ID.",
    }),
  });

  interface ListGsheetTabsDetails {
    spreadsheetId: string;
    spreadsheetTitle?: string;
    tabs?: Array<{ gid: number; title: string; index: number; hidden: boolean }>;
    error?: string;
  }

  pi.registerTool<typeof ListGsheetTabsParams, ListGsheetTabsDetails>({
    name: "list_gsheet_tabs",
    label: "List Sheet Tabs",
    description:
      "List all tabs (sheets) in a Google Sheets spreadsheet. " +
      "Returns each tab's title, gid, index, and whether it is hidden. " +
      "Use the gid with read_gdoc to read a specific tab.",
    parameters: ListGsheetTabsParams,

    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const { spreadsheetId } = parseSheetUrl(params.spreadsheet);

      onUpdate?.({
        content: [{ type: "text", text: `Fetching tabs for ${spreadsheetId}…` }],
        details: { spreadsheetId },
      });

      // ── Credential resolution (same pattern as read_gdoc) ─────────────────
      let cred = ctx.modelRegistry.authStorage.get(PROVIDER_ID);

      if (!cred || cred.type !== "oauth") {
        if (!ctx.hasUI) {
          return {
            content: [{ type: "text", text: "Not authenticated with Google. Run /login and select \"Google Docs\" to authenticate, then retry." }],
            details: { spreadsheetId, error: "not authenticated" },
            isError: true,
          };
        }
        ctx.ui.notify("Opening browser for Google login…", "info");
        try {
          const newCreds = await loginGoogle({
            onUrl: (url) => { openUrl(url); ctx.ui.notify(`Google login: ${url}`, "info"); },
            onNotify: (msg) => ctx.ui.notify(msg, "info"),
          });
          ctx.modelRegistry.authStorage.set(PROVIDER_ID, { type: "oauth", ...newCreds });
          cred = { type: "oauth", ...newCreds };
          ctx.ui.notify("Google login successful!", "info");
        } catch (loginErr) {
          const msg = loginErr instanceof Error ? loginErr.message : String(loginErr);
          return {
            content: [{ type: "text", text: `Login failed: ${msg}` }],
            details: { spreadsheetId, error: msg },
            isError: true,
          };
        }
      }

      const oauthCred = cred as { type: "oauth"; access: string; refresh: string; expires: number };
      let accessToken = oauthCred.access;
      if (Date.now() >= oauthCred.expires) {
        try {
          const refreshed = await refreshGoogleToken(oauthCred);
          ctx.modelRegistry.authStorage.set(PROVIDER_ID, { type: "oauth", ...refreshed });
          accessToken = refreshed.access;
        } catch (refreshErr) {
          const msg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
          return {
            content: [{ type: "text", text: `Token refresh failed: ${msg}` }],
            details: { spreadsheetId, error: msg },
            isError: true,
          };
        }
      }

      // ── Fetch tabs ────────────────────────────────────────────────────────
      let spreadsheetTitle: string;
      let tabs: Array<{ gid: number; title: string; index: number; hidden: boolean }>;
      try {
        ({ spreadsheetTitle, tabs } = await listSheetTabs(spreadsheetId, accessToken));
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        return {
          content: [{ type: "text", text: msg }],
          details: { spreadsheetId, error: msg },
          isError: true,
        };
      }

      const lines = [
        `# ${spreadsheetTitle}`,
        "",
        "| # | Title | gid | Hidden |",
        "|---|-------|-----|--------|",
        ...tabs.map((t) => `| ${t.index} | ${t.title} | ${t.gid} | ${t.hidden ? "yes" : "no"} |`),
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { spreadsheetId, spreadsheetTitle, tabs },
      };
    },

    renderCall(args, theme) {
      const { spreadsheetId } = parseSheetUrl(args.spreadsheet);
      let text = theme.fg("toolTitle", theme.bold("list_gsheet_tabs "));
      text += theme.fg("accent", spreadsheetId);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      const details = result.details as ListGsheetTabsDetails | undefined;

      if (isPartial) return new Text(theme.fg("warning", "Fetching tabs…"), 0, 0);

      if (result.isError || details?.error) {
        return new Text(theme.fg("error", `✗ ${details?.error ?? "unknown error"}`), 0, 0);
      }

      const count = details?.tabs?.length ?? 0;
      const title = details?.spreadsheetTitle ?? details?.spreadsheetId ?? "spreadsheet";
      let text = theme.fg("success", `✓ ${title} `) + theme.fg("muted", `(${count} tabs)`);

      if (expanded && details?.tabs) {
        for (const tab of details.tabs) {
          text += `\n  ${theme.fg("dim", `${tab.index}.`)} ${theme.fg("accent", tab.title)}`;
          text += theme.fg("dim", `  gid=${tab.gid}`);
          if (tab.hidden) text += theme.fg("warning", "  hidden");
        }
      } else {
        text += theme.fg("dim", ` (${keyHint("expandTools", "to expand")})`);
      }

      return new Text(text, 0, 0);
    },
  });

  // ── Register the list_gdoc_tabs tool ──────────────────────────────────────

  const ListGdocTabsParams = Type.Object({
    document: Type.String({
      description:
        "The Google Docs URL (e.g. https://docs.google.com/document/d/…/edit) " +
        "or bare document ID.",
    }),
  });

  interface ListGdocTabsDetails {
    docId: string;
    docTitle?: string;
    tabs?: DocTabInfo[];
    error?: string;
  }

  pi.registerTool<typeof ListGdocTabsParams, ListGdocTabsDetails>({
    name: "list_gdoc_tabs",
    label: "List Doc Tabs",
    description:
      "List all tabs in a Google Docs document. " +
      "Returns each tab's title, tabId, index, and nesting level. " +
      "Use the tab ID with read_gdoc by including ?tab=<tabId> in the URL.",
    parameters: ListGdocTabsParams,

    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const docId = parseDocId(params.document);

      onUpdate?.({
        content: [{ type: "text", text: `Fetching tabs for ${docId}…` }],
        details: { docId },
      });

      // ── Credential resolution ─────────────────────────────────────────────
      let cred = ctx.modelRegistry.authStorage.get(PROVIDER_ID);

      if (!cred || cred.type !== "oauth") {
        if (!ctx.hasUI) {
          return {
            content: [{ type: "text", text: "Not authenticated with Google. Run /login and select \"Google Docs\" to authenticate, then retry." }],
            details: { docId, error: "not authenticated" },
            isError: true,
          };
        }
        ctx.ui.notify("Opening browser for Google login…", "info");
        try {
          const newCreds = await loginGoogle({
            onUrl: (url) => { openUrl(url); ctx.ui.notify(`Google login: ${url}`, "info"); },
            onNotify: (msg) => ctx.ui.notify(msg, "info"),
          });
          ctx.modelRegistry.authStorage.set(PROVIDER_ID, { type: "oauth", ...newCreds });
          cred = { type: "oauth", ...newCreds };
          ctx.ui.notify("Google login successful!", "info");
        } catch (loginErr) {
          const msg = loginErr instanceof Error ? loginErr.message : String(loginErr);
          return {
            content: [{ type: "text", text: `Login failed: ${msg}` }],
            details: { docId, error: msg },
            isError: true,
          };
        }
      }

      const oauthCred = cred as { type: "oauth"; access: string; refresh: string; expires: number };
      let accessToken = oauthCred.access;
      if (Date.now() >= oauthCred.expires) {
        try {
          const refreshed = await refreshGoogleToken(oauthCred);
          ctx.modelRegistry.authStorage.set(PROVIDER_ID, { type: "oauth", ...refreshed });
          accessToken = refreshed.access;
        } catch (refreshErr) {
          const msg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
          return {
            content: [{ type: "text", text: `Token refresh failed: ${msg}` }],
            details: { docId, error: msg },
            isError: true,
          };
        }
      }

      // ── Fetch tabs ────────────────────────────────────────────────────────
      let docTitle: string;
      let tabs: DocTabInfo[];
      try {
        ({ title: docTitle, tabs } = await listDocTabs(docId, accessToken));
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        return {
          content: [{ type: "text", text: msg }],
          details: { docId, error: msg },
          isError: true,
        };
      }

      const indent = (level: number) => "  ".repeat(level);
      const lines = [
        `# ${docTitle}`,
        "",
        "| # | Title | Tab ID | Nesting |",
        "|---|-------|--------|---------|",
        ...tabs.map((t) =>
          `| ${t.index} | ${indent(t.nestingLevel)}${t.title} | ${t.tabId} | ${t.nestingLevel} |`
        ),
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { docId, docTitle, tabs },
      };
    },

    renderCall(args, theme) {
      const docId = parseDocId(args.document);
      let text = theme.fg("toolTitle", theme.bold("list_gdoc_tabs "));
      text += theme.fg("accent", docId);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      const details = result.details as ListGdocTabsDetails | undefined;

      if (isPartial) return new Text(theme.fg("warning", "Fetching tabs…"), 0, 0);

      if (result.isError || details?.error) {
        return new Text(theme.fg("error", `✗ ${details?.error ?? "unknown error"}`), 0, 0);
      }

      const count = details?.tabs?.length ?? 0;
      const title = details?.docTitle ?? details?.docId ?? "document";
      let text = theme.fg("success", `✓ ${title} `) + theme.fg("muted", `(${count} tabs)`);

      if (expanded && details?.tabs) {
        for (const tab of details.tabs) {
          const indent = "  ".repeat(tab.nestingLevel);
          text += `\n  ${theme.fg("dim", `${tab.index}.`)} ${indent}${theme.fg("accent", tab.title)}`;
          text += theme.fg("dim", `  id=${tab.tabId}`);
        }
      } else {
        text += theme.fg("dim", ` (${keyHint("expandTools", "to expand")})`);
      }

      return new Text(text, 0, 0);
    },
  });

  // ── Register the write_gsheet tool ───────────────────────────────────────

  const WriteGsheetParams = Type.Object({
    spreadsheet: Type.String({
      description:
        "The Google Sheets URL (e.g. https://docs.google.com/spreadsheets/d/…/edit) " +
        "or bare spreadsheet ID.",
    }),
    updates: Type.Array(
      Type.Object({
        range: Type.String({
          description:
            "A1 notation range to write to, e.g. \"Sheet1!B2\" or \"B2\". " +
            "Include the sheet tab name before ! to target a specific tab.",
        }),
        values: Type.Array(
          Type.Array(
            Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]),
            { description: "A single row of cell values." },
          ),
          { description: "Rows of values to write (outer = rows, inner = columns)." },
        ),
      }),
      { description: "One or more range+values pairs to write in a single batch." },
    ),
  });

  interface WriteGsheetDetails {
    spreadsheetId: string;
    results?: Array<{
      updatedRange: string;
      updatedRows: number;
      updatedColumns: number;
      updatedCells: number;
    }>;
    totalCells?: number;
    error?: string;
  }

  pi.registerTool<typeof WriteGsheetParams, WriteGsheetDetails>({
    name: "write_gsheet",
    label: "Write to Sheet",
    description:
      "Write values to one or more cell ranges in a Google Sheets spreadsheet. " +
      "Accepts A1 notation ranges (e.g. \"Sheet1!B2\", \"A1:C3\"). " +
      "Values are written as-is (RAW mode — no formula evaluation). " +
      "Use list_gsheet_tabs to find tab names and read_gdoc to verify existing content first.",
    parameters: WriteGsheetParams,

    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const { spreadsheetId } = parseSheetUrl(params.spreadsheet);

      onUpdate?.({
        content: [{ type: "text", text: `Writing to ${spreadsheetId}…` }],
        details: { spreadsheetId },
      });

      // ── Credential resolution ─────────────────────────────────────────────
      let cred = ctx.modelRegistry.authStorage.get(PROVIDER_ID);

      if (!cred || cred.type !== "oauth") {
        if (!ctx.hasUI) {
          return {
            content: [{ type: "text", text: "Not authenticated with Google. Run /login and select \"Google Docs\" to authenticate, then retry." }],
            details: { spreadsheetId, error: "not authenticated" },
            isError: true,
          };
        }
        ctx.ui.notify("Opening browser for Google login…", "info");
        try {
          const newCreds = await loginGoogle({
            onUrl: (url) => { openUrl(url); ctx.ui.notify(`Google login: ${url}`, "info"); },
            onNotify: (msg) => ctx.ui.notify(msg, "info"),
          });
          ctx.modelRegistry.authStorage.set(PROVIDER_ID, { type: "oauth", ...newCreds });
          cred = { type: "oauth", ...newCreds };
          ctx.ui.notify("Google login successful!", "info");
        } catch (loginErr) {
          const msg = loginErr instanceof Error ? loginErr.message : String(loginErr);
          return {
            content: [{ type: "text", text: `Login failed: ${msg}` }],
            details: { spreadsheetId, error: msg },
            isError: true,
          };
        }
      }

      const oauthCred = cred as { type: "oauth"; access: string; refresh: string; expires: number };
      let accessToken = oauthCred.access;
      if (Date.now() >= oauthCred.expires) {
        try {
          const refreshed = await refreshGoogleToken(oauthCred);
          ctx.modelRegistry.authStorage.set(PROVIDER_ID, { type: "oauth", ...refreshed });
          accessToken = refreshed.access;
        } catch (refreshErr) {
          const msg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
          return {
            content: [{ type: "text", text: `Token refresh failed: ${msg}` }],
            details: { spreadsheetId, error: msg },
            isError: true,
          };
        }
      }

      // ── Write cells ───────────────────────────────────────────────────────
      let results: WriteGsheetDetails["results"];
      try {
        results = await writeSheetCells(spreadsheetId, accessToken, params.updates);
      } catch (writeErr) {
        const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
        return {
          content: [{ type: "text", text: msg }],
          details: { spreadsheetId, error: msg },
          isError: true,
        };
      }

      const totalCells = results.reduce((sum, r) => sum + r.updatedCells, 0);
      const lines = [
        `Updated ${totalCells} cell${totalCells !== 1 ? "s" : ""} across ${results.length} range${results.length !== 1 ? "s" : ""}:`,
        "",
        ...results.map((r) =>
          `- ${r.updatedRange}: ${r.updatedRows} row${r.updatedRows !== 1 ? "s" : ""} × ${r.updatedColumns} col${r.updatedColumns !== 1 ? "s" : ""} (${r.updatedCells} cells)`,
        ),
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { spreadsheetId, results, totalCells },
      };
    },

    renderCall(args, theme) {
      const { spreadsheetId } = parseSheetUrl(args.spreadsheet);
      const rangeCount = args.updates?.length ?? 0;
      let text = theme.fg("toolTitle", theme.bold("write_gsheet "));
      text += theme.fg("accent", spreadsheetId);
      text += theme.fg("muted", `  ${rangeCount} range${rangeCount !== 1 ? "s" : ""}`);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      const details = result.details as WriteGsheetDetails | undefined;

      if (isPartial) return new Text(theme.fg("warning", "Writing…"), 0, 0);

      if (result.isError || details?.error) {
        return new Text(theme.fg("error", `✗ ${details?.error ?? "unknown error"}`), 0, 0);
      }

      const total = details?.totalCells ?? 0;
      let text = theme.fg("success", `✓ ${total} cell${total !== 1 ? "s" : ""} updated`);

      if (expanded && details?.results) {
        for (const r of details.results) {
          text += `\n  ${theme.fg("accent", r.updatedRange)} ${theme.fg("dim", `${r.updatedCells} cells`)}`;
        }
      } else {
        text += theme.fg("dim", ` (${keyHint("expandTools", "to expand")})`);
      }

      return new Text(text, 0, 0);
    },
  });
}
