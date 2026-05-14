/**
 * oauth.ts — Google OAuth 2.0 + PKCE login and token refresh.
 *
 * Handles the Authorization Code + PKCE flow for Google, including:
 *   - PKCE verifier/challenge generation
 *   - Building the Google consent URL (offline, documents.readonly, spreadsheets read+write)
 *   - Spinning up a one-shot local HTTP server to capture the redirect code
 *   - Exchanging the code for access + refresh tokens
 *   - Refreshing an access token using the stored refresh token
 *
 * Credentials are read from:
 *   ~/.pi/agent/secrets/google_oauth2_client_id.json
 * Download this file from Google Cloud Console:
 *   APIs & Services → Credentials → your Desktop app client → Download JSON
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import type { OAuthCredentials } from "@mariozechner/pi-ai";

// ─── Constants ───────────────────────────────────────────────────────────────

export const REDIRECT_URI = "http://127.0.0.1:9005/callback";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = [
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

const CLIENT_JSON_PATH = path.join(os.homedir(), ".pi", "agent", "secrets", "google_oauth2_client_id.json");

// ─── Client credentials loader ───────────────────────────────────────────────

interface GoogleClientJson {
  installed: {
    client_id: string;
    client_secret: string;
  };
}

function loadClientCredentials(): { clientId: string; clientSecret: string } {
  if (!fs.existsSync(CLIENT_JSON_PATH)) {
    throw new Error(
      `Google OAuth client file not found at ${CLIENT_JSON_PATH}. ` +
        "Download it from Google Cloud Console (APIs & Services → Credentials → Desktop app → Download JSON) " +
        `and place it at ${CLIENT_JSON_PATH}.`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(CLIENT_JSON_PATH, "utf-8")) as GoogleClientJson;
  const { client_id, client_secret } = raw.installed;
  if (!client_id || !client_secret) {
    throw new Error(`Could not parse client_id / client_secret from ${CLIENT_JSON_PATH}.`);
  }
  return { clientId: client_id, clientSecret: client_secret };
}

// ─── PKCE helpers ────────────────────────────────────────────────────────────

function generateVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// ─── Local redirect server ───────────────────────────────────────────────────

/**
 * Spins up a one-shot HTTP server on port 9005.
 * Waits for Google to redirect to /callback?code=..., captures the code,
 * sends a "you can close this tab" response, and shuts the server down.
 */
function waitForRedirect(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:9005`);
        if (url.pathname !== "/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<!DOCTYPE html><html><body>" +
            "<h2>Authentication complete — you can close this tab.</h2>" +
            "</body></html>",
        );

        server.close();

        if (error) {
          reject(new Error(`OAuth error: ${error}`));
        } else if (!code) {
          reject(new Error("No authorization code received in redirect"));
        } else {
          resolve(code);
        }
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.on("error", (err) => {
      reject(new Error(`Failed to start local callback server: ${err.message}`));
    });

    server.listen(9005, "127.0.0.1");
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface LoginCallbacks {
  /** Called when the consent URL is ready; implementation should open the URL. */
  onUrl(url: string): void;
  /** Called to show informational messages to the user during login. */
  onNotify(message: string): void;
}

/**
 * Full Google OAuth 2.0 + PKCE login flow.
 * Returns persisted-ready OAuthCredentials on success.
 */
export async function loginGoogle(callbacks: LoginCallbacks): Promise<OAuthCredentials> {
  const { clientId, clientSecret } = loadClientCredentials();

  // Generate PKCE pair
  const verifier = generateVerifier();
  const challenge = generateChallenge(verifier);

  // Build consent URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent", // always return refresh_token
  });

  const consentUrl = `${AUTH_URL}?${params.toString()}`;

  callbacks.onNotify("Opening browser for Google login…");
  callbacks.onUrl(consentUrl);

  // Wait for the redirect
  callbacks.onNotify("Waiting for Google authentication… (complete login in your browser)");
  const code = await waitForRedirect();

  // Exchange code for tokens
  callbacks.onNotify("Exchanging authorization code for tokens…");
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Token exchange failed: ${tokenRes.status} ${body}`);
  }

  const data = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!data.refresh_token) {
    throw new Error(
      "Google did not return a refresh_token. " +
        "Revoke the app access in your Google account settings and try /login google-docs again.",
    );
  }

  return {
    access: data.access_token,
    refresh: data.refresh_token,
    expires: Date.now() + data.expires_in * 1000 - 60_000, // 1-minute buffer
  };
}

/**
 * Refresh a Google access token using the stored refresh token.
 * Google does not always re-issue the refresh token on every refresh;
 * we preserve the existing one when the response omits it.
 */
export async function refreshGoogleToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  const { clientId, clientSecret } = loadClientCredentials();

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refresh,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    access: data.access_token,
    // Preserve original refresh token if Google doesn't issue a new one
    refresh: data.refresh_token ?? credentials.refresh,
    expires: Date.now() + data.expires_in * 1000 - 60_000,
  };
}
