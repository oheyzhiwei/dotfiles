/**
 * gdoc.ts — Google Docs REST API fetch and plain-text extraction.
 *
 * Provides:
 *   parseDocId(input)      — Accepts a full Docs URL or a bare document ID;
 *                            extracts the ID from the /d/{id}/ URL segment.
 *   fetchDocText(id, token) — GETs the document from the Docs API v1 and
 *                             converts the structured response to plain text.
 *
 * Plain-text extraction covers paragraph elements (textRun.content strings).
 * Inline images, drawings, and table cells are not extracted.
 */

const DOCS_API_BASE = "https://docs.googleapis.com/v1/documents";

// ─── URL type detection ──────────────────────────────────────────────────────

/**
 * Returns true when the input looks like a Google Sheets URL.
 * Sheets URLs contain /spreadsheets/d/; Docs URLs contain /document/d/.
 * Bare IDs (no URL) are treated as Docs.
 */
export function isSheetUrl(input: string): boolean {
  return input.includes("/spreadsheets/d/");
}

// ─── Document ID parsing ─────────────────────────────────────────────────────

/**
 * Extract the document ID from a full Google Docs URL or return the input
 * unchanged if it looks like a bare ID already.
 *
 * Accepted forms:
 *   https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
 *   1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
 */
export function parseDocId(input: string): string {
  const trimmed = input.trim();

  // Try to extract from URL pattern /d/{id}/
  const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }

  // Fall back to treating the whole input as a document ID
  return trimmed;
}

// ─── Docs API types (minimal) ────────────────────────────────────────────────

interface TextRun {
  content?: string;
}

interface ParagraphElement {
  textRun?: TextRun;
}

interface Paragraph {
  elements?: ParagraphElement[];
}

interface StructuralElement {
  paragraph?: Paragraph;
}

interface DocumentBody {
  content?: StructuralElement[];
}

interface GoogleDoc {
  title?: string;
  body?: DocumentBody;
}

// ─── Plain-text extraction ───────────────────────────────────────────────────

/**
 * Walk the document body and concatenate all textRun.content strings.
 * This covers the vast majority of document content.
 * Inline objects (images, drawings) and table cells are not extracted.
 */
export function extractText(doc: GoogleDoc): string {
  const parts: string[] = [];

  for (const structElem of doc.body?.content ?? []) {
    const paragraph = structElem.paragraph;
    if (!paragraph) continue;

    for (const elem of paragraph.elements ?? []) {
      const content = elem.textRun?.content;
      if (content) {
        parts.push(content);
      }
    }
  }

  return parts.join("");
}

// ─── Tab types ───────────────────────────────────────────────────────────────

interface TabProperties {
  tabId?: string;
  title?: string;
  index?: number;
  nestingLevel?: number;
  parentTabId?: string;
}

interface DocumentTab {
  body?: DocumentBody;
}

interface Tab {
  tabProperties?: TabProperties;
  documentTab?: DocumentTab;
  childTabs?: Tab[];
}

interface GoogleDocWithTabs {
  title?: string;
  tabs?: Tab[];
  // Legacy (single-tab) format
  body?: DocumentBody;
}

export interface DocTabInfo {
  tabId: string;
  title: string;
  index: number;
  nestingLevel: number;
  parentTabId?: string;
}

// ─── Tab helpers ─────────────────────────────────────────────────────────────

/**
 * Flatten nested tabs into a list, preserving nesting info.
 */
function flattenTabs(tabs: Tab[]): Tab[] {
  const result: Tab[] = [];
  for (const tab of tabs) {
    result.push(tab);
    if (tab.childTabs?.length) {
      result.push(...flattenTabs(tab.childTabs));
    }
  }
  return result;
}

/**
 * Parse a tab ID from a Google Docs URL with a tab parameter.
 * URL format: https://docs.google.com/document/d/{id}/edit?tab=t.{tabId}
 *             https://docs.google.com/document/d/{id}/edit?tab={tabId}
 */
export function parseDocTabId(input: string): string | undefined {
  const match = input.match(/[?&]tab=([^&#]+)/);
  if (match?.[1]) {
    return match[1];
  }
  // Also check fragment: #tab=t.xxx
  const hashMatch = input.match(/#.*tab=([^&#]+)/);
  return hashMatch?.[1] ?? undefined;
}

// ─── API fetch ───────────────────────────────────────────────────────────────

/**
 * Shared API request helper with standard error handling.
 */
async function docsApiFetch(url: string, accessToken: string): Promise<GoogleDocWithTabs> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error(
        `UNAUTHENTICATED: access token rejected (${res.status}). ` +
          "The token may have been revoked. Call read_gdoc again to re-authenticate, " +
          "or run /login google-docs to re-authenticate proactively.\n" +
          `Details: ${body}`,
      );
    }
    if (res.status === 403) {
      throw new Error(
        `PERMISSION_DENIED: you don't have access to this document (${res.status}). ` +
          "Share the document with your Google account and try again.\n" +
          `Details: ${body}`,
      );
    }
    throw new Error(`Google Docs API error ${res.status}: ${body}`);
  }

  return (await res.json()) as GoogleDocWithTabs;
}

/**
 * Fetch a Google Doc by its document ID using a Bearer access token.
 * Returns the plain-text content of the document.
 *
 * When tabId is provided, fetches that specific tab's content.
 * Otherwise returns the default tab (first tab).
 */
export async function fetchDocText(
  docId: string,
  accessToken: string,
  tabId?: string,
): Promise<{ title: string; tabTitle?: string; text: string }> {
  // Always request with includeTabsContent so we can resolve tabs
  const url = `${DOCS_API_BASE}/${encodeURIComponent(docId)}?includeTabsContent=true`;

  const doc = await docsApiFetch(url, accessToken);
  const docTitle = doc.title ?? "(untitled)";

  // If the API returned tabs, use them
  if (doc.tabs?.length) {
    const allTabs = flattenTabs(doc.tabs);

    let targetTab: Tab | undefined;
    if (tabId) {
      targetTab = allTabs.find((t) => t.tabProperties?.tabId === tabId);
      if (!targetTab) {
        const available = allTabs
          .map((t) => `  ${t.tabProperties?.tabId}: ${t.tabProperties?.title}`)
          .join("\n");
        throw new Error(
          `Tab "${tabId}" not found in document. Available tabs:\n${available}`,
        );
      }
    } else {
      targetTab = allTabs[0];
    }

    const body = targetTab?.documentTab?.body;
    const text = body ? extractText({ body }) : "";
    const tabTitle = targetTab?.tabProperties?.title;

    return { title: docTitle, tabTitle, text };
  }

  // Legacy single-tab fallback
  const text = extractText(doc as GoogleDoc);
  return { title: docTitle, text };
}

/**
 * List all tabs in a Google Doc.
 */
export async function listDocTabs(
  docId: string,
  accessToken: string,
): Promise<{ title: string; tabs: DocTabInfo[] }> {
  // includeTabsContent=true is required for the API to return the tabs array at all.
  // We ignore the body content and only use tabProperties.
  const url = `${DOCS_API_BASE}/${encodeURIComponent(docId)}?includeTabsContent=true`;

  const doc = await docsApiFetch(url, accessToken);
  const docTitle = doc.title ?? "(untitled)";

  if (!doc.tabs?.length) {
    return { title: docTitle, tabs: [] };
  }

  const allTabs = flattenTabs(doc.tabs);
  const tabs: DocTabInfo[] = allTabs.map((t) => ({
    tabId: t.tabProperties?.tabId ?? "",
    title: t.tabProperties?.title ?? "(untitled)",
    index: t.tabProperties?.index ?? 0,
    nestingLevel: t.tabProperties?.nestingLevel ?? 0,
    parentTabId: t.tabProperties?.parentTabId,
  }));

  return { title: docTitle, tabs };
}
