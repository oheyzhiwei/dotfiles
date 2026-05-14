/**
 * gsheet.ts — Google Sheets REST API fetch and plain-text extraction.
 *
 * Provides:
 *   parseSheetUrl(input)           — Extracts spreadsheet ID and optional gid
 *                                    from a Sheets URL or bare spreadsheet ID.
 *   fetchSheetText(id, token, gid) — Fetches sheet data via the Sheets API v4
 *                                    and formats it as a Markdown table.
 *
 * URL form accepted:
 *   https://docs.google.com/spreadsheets/d/{id}/edit?gid={gid}#gid={gid}
 *   {bare-spreadsheet-id}
 *
 * When a gid is present the matching sheet tab is fetched; otherwise the first
 * sheet in the spreadsheet is used.
 */

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

// ─── URL / ID parsing ────────────────────────────────────────────────────────

export interface SheetRef {
  spreadsheetId: string;
  /** Numeric sheet gid from the URL fragment/query, if present. */
  gid?: number;
}

/**
 * Extract the spreadsheet ID and optional gid from a Google Sheets URL, or
 * treat the whole input as a bare spreadsheet ID (gid undefined).
 */
export function parseSheetUrl(input: string): SheetRef {
  const trimmed = input.trim();

  // Extract spreadsheet ID from /spreadsheets/d/{id}/ pattern
  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const spreadsheetId = idMatch ? idMatch[1] : trimmed;

  // Extract gid from ?gid=... or #gid=... (both appear in Sheets URLs)
  const gidMatch = trimmed.match(/[?#&]gid=(\d+)/);
  const gid = gidMatch ? parseInt(gidMatch[1], 10) : undefined;

  return { spreadsheetId, gid };
}

// ─── Sheets API types (minimal) ──────────────────────────────────────────────

interface SheetProperties {
  sheetId: number;
  title: string;
  index: number;
}

interface Sheet {
  properties: SheetProperties;
}

interface SpreadsheetMetadata {
  properties?: { title?: string };
  sheets?: Sheet[];
}

interface ValueRange {
  values?: (string | number | boolean)[][];
}

// ─── Cell write ──────────────────────────────────────────────────────────────

export interface CellUpdate {
  /** A1 notation, e.g. "Sheet1!B2" or "B2" (uses first sheet if no sheet name). */
  range: string;
  /** 2-D array of values. Outer array = rows, inner array = columns. */
  values: (string | number | boolean | null)[][];
}

export interface WriteResult {
  updatedRange: string;
  updatedRows: number;
  updatedColumns: number;
  updatedCells: number;
}

/**
 * Write values to one or more ranges in a spreadsheet using batchUpdate.
 * Values are written in RAW input mode (no formula parsing).
 *
 * Throws descriptive errors for 401 / 403 / other non-2xx responses.
 */
export async function writeSheetCells(
  spreadsheetId: string,
  accessToken: string,
  updates: CellUpdate[],
): Promise<WriteResult[]> {
  const url =
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;

  const body = {
    valueInputOption: "RAW",
    data: updates.map((u) => ({ range: u.range, values: u.values })),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const resBody = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error(
        `UNAUTHENTICATED: access token rejected (${res.status}). ` +
          "Run /login and select \"Google Docs\" to re-authenticate.\n" +
          `Details: ${resBody}`,
      );
    }
    if (res.status === 403) {
      throw new Error(
        `PERMISSION_DENIED: you don't have write access to this spreadsheet (${res.status}). ` +
          "Share the spreadsheet with your Google account (Editor role) and try again.\n" +
          `Details: ${resBody}`,
      );
    }
    throw new Error(`Google Sheets API error ${res.status}: ${resBody}`);
  }

  const data = (await res.json()) as {
    responses: Array<{
      updatedRange: string;
      updatedRows: number;
      updatedColumns: number;
      updatedCells: number;
    }>;
  };

  return (data.responses ?? []).map((r) => ({
    updatedRange: r.updatedRange,
    updatedRows: r.updatedRows,
    updatedColumns: r.updatedColumns,
    updatedCells: r.updatedCells,
  }));
}

// ─── Plain-text formatting ───────────────────────────────────────────────────

/**
 * Format a 2-D array of cell values as a plain Markdown table.
 * The first row is treated as the header row.
 */
function formatAsMarkdownTable(values: (string | number | boolean)[][]): string {
  if (values.length === 0) return "(empty sheet)";

  // Normalise: ensure every row has the same number of columns
  const colCount = Math.max(...values.map((r) => r.length));
  const rows = values.map((row) => {
    const padded = [...row];
    while (padded.length < colCount) padded.push("");
    return padded.map((cell) => String(cell).replace(/\|/g, "\\|").replace(/\n/g, " "));
  });

  // Column widths
  const widths = Array.from({ length: colCount }, (_, ci) =>
    Math.max(...rows.map((r) => r[ci].length), 1),
  );

  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));

  const lines: string[] = [];
  rows.forEach((row, ri) => {
    lines.push("| " + row.map((cell, ci) => pad(cell, widths[ci])).join(" | ") + " |");
    // Separator after header row
    if (ri === 0) {
      lines.push("| " + widths.map((w) => "-".repeat(w)).join(" | ") + " |");
    }
  });

  return lines.join("\n");
}

// ─── Tab listing ─────────────────────────────────────────────────────────────

export interface SheetTab {
  gid: number;
  title: string;
  index: number;
  hidden: boolean;
}

/**
 * Fetch the list of tabs (sheets) in a spreadsheet.
 * Returns title, gid, index, and whether the tab is hidden.
 */
export async function listSheetTabs(
  spreadsheetId: string,
  accessToken: string,
): Promise<{ spreadsheetTitle: string; tabs: SheetTab[] }> {
  const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties`;

  const res = await fetch(url, { headers: authHeader });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error(
        `UNAUTHENTICATED: access token rejected (${res.status}). ` +
          "Run /login and select \"Google Docs\" to re-authenticate.\n" +
          `Details: ${body}`,
      );
    }
    if (res.status === 403) {
      throw new Error(
        `PERMISSION_DENIED: you don't have access to this spreadsheet (${res.status}). ` +
          "Share the spreadsheet with your Google account and try again.\n" +
          `Details: ${body}`,
      );
    }
    throw new Error(`Google Sheets API error ${res.status}: ${body}`);
  }

  const meta = (await res.json()) as SpreadsheetMetadata;
  const spreadsheetTitle = meta.properties?.title ?? "(untitled spreadsheet)";
  const tabs: SheetTab[] = (meta.sheets ?? []).map((s) => ({
    gid: s.properties.sheetId,
    title: s.properties.title,
    index: s.properties.index,
    hidden: (s.properties as any).hidden === true,
  }));

  return { spreadsheetTitle, tabs };
}

// ─── API fetch ───────────────────────────────────────────────────────────────

/**
 * Fetch a Google Sheet by spreadsheet ID using a Bearer access token.
 * When gid is provided the matching tab is loaded; otherwise the first tab.
 *
 * Returns { title, sheetTitle, text } where text is a Markdown table.
 *
 * Throws descriptive errors for 401 / 403 / other non-2xx responses.
 */
export async function fetchSheetText(
  spreadsheetId: string,
  accessToken: string,
  gid?: number,
): Promise<{ title: string; sheetTitle: string; text: string }> {
  const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

  // ── Step 1: fetch spreadsheet metadata to resolve gid → sheet title ───────
  const metaUrl = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties`;
  const metaRes = await fetch(metaUrl, { headers: authHeader });

  if (!metaRes.ok) {
    const body = await metaRes.text().catch(() => "");
    if (metaRes.status === 401) {
      throw new Error(
        `UNAUTHENTICATED: access token rejected (${metaRes.status}). ` +
          "The token may have been revoked or the spreadsheets.readonly scope is missing. " +
          "Run /login google-docs to re-authenticate.\n" +
          `Details: ${body}`,
      );
    }
    if (metaRes.status === 403) {
      throw new Error(
        `PERMISSION_DENIED: you don't have access to this spreadsheet (${metaRes.status}). ` +
          "Share the spreadsheet with your Google account and try again.\n" +
          `Details: ${body}`,
      );
    }
    throw new Error(`Google Sheets API error ${metaRes.status}: ${body}`);
  }

  const meta = (await metaRes.json()) as SpreadsheetMetadata;
  const spreadsheetTitle = meta.properties?.title ?? "(untitled spreadsheet)";
  const sheets = meta.sheets ?? [];

  // Resolve the target sheet
  let targetSheet: Sheet | undefined;
  if (gid !== undefined) {
    targetSheet = sheets.find((s) => s.properties.sheetId === gid);
    if (!targetSheet) {
      throw new Error(
        `Sheet with gid=${gid} not found in spreadsheet "${spreadsheetTitle}". ` +
          `Available sheets: ${sheets.map((s) => `"${s.properties.title}" (gid=${s.properties.sheetId})`).join(", ")}`,
      );
    }
  } else {
    targetSheet = sheets[0];
    if (!targetSheet) {
      throw new Error(`Spreadsheet "${spreadsheetTitle}" contains no sheets.`);
    }
  }

  const sheetTitle = targetSheet.properties.title;

  // ── Step 2: fetch all values from the target sheet ────────────────────────
  const range = encodeURIComponent(sheetTitle);
  const valuesUrl = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${range}`;
  const valuesRes = await fetch(valuesUrl, { headers: authHeader });

  if (!valuesRes.ok) {
    const body = await valuesRes.text().catch(() => "");
    throw new Error(`Google Sheets values API error ${valuesRes.status}: ${body}`);
  }

  const valueRange = (await valuesRes.json()) as ValueRange;
  const values = valueRange.values ?? [];

  const text = formatAsMarkdownTable(values);
  return { title: spreadsheetTitle, sheetTitle, text };
}
