# sg-dev-zhiwei3 — machine setup

Notes for this dev VM (`sg-dev-zhiwei3`, Ubuntu 24.04, KVM/QEMU).
Tailscale IP `100.97.131.106`, tailnet `taile5ac.ts.net`.

## code-server (browser VS Code)

A full VS Code IDE served in the browser, reachable over the tailnet with HTTPS.

### Access

```
https://sg-dev-zhiwei3.taile5ac.ts.net/
```

Reachable from any device logged into the `taile5ac` tailnet. Not exposed to the
public internet. Login uses a password (see below).

### Topology

```
browser ──HTTPS:443──▶ tailscaled        TLS termination, valid Let's Encrypt cert,
                         │                auto-renewed by Tailscale ("tailscale serve")
                         ▼
                       nginx 127.0.0.1:80  reverse proxy / fan-out point for future apps
                         │
                         ▼
                       code-server 127.0.0.1:8080
```

Only `tailscaled` listens on a non-loopback address (`:443` on the Tailscale
interface). nginx and code-server are bound to localhost, so the HTTPS endpoint
is the only way in.

### Components & config

| Component       | Version  | Listens on        | Config / unit                                  |
|-----------------|----------|-------------------|------------------------------------------------|
| code-server     | 4.123.0  | `127.0.0.1:8080`  | `~/.config/code-server/config.yaml`            |
| nginx           | 1.24.0   | `127.0.0.1:80`    | `/etc/nginx/sites-available/code-server`       |
| tailscale serve | 1.98.4   | `:443` (tailnet)  | tailscaled state (`tailscale serve status`)    |

Both `code-server@zhiwei.service` and `nginx.service` are enabled and start on
boot. The `tailscale serve` config persists in tailscaled state across reboots.

Extra: `/etc/sysctl.d/99-nonlocal-bind.conf` sets `net.ipv4.ip_nonlocal_bind=1`
(left over from when nginx bound the Tailscale IP directly; harmless now that
nginx is on loopback).

### Password — where it lives / how to rotate

The login password is stored in `~/.config/code-server/config.yaml` (mode 600).
It is intentionally **not** duplicated in this doc.

```bash
# view
grep password ~/.config/code-server/config.yaml

# rotate
NEW=$(openssl rand -base64 18)
sed -i "s|^password:.*|password: ${NEW}|" ~/.config/code-server/config.yaml
sudo systemctl restart code-server@$USER
echo "new password: ${NEW}"
```

## Common operations

```bash
# service status / logs
systemctl status code-server@$USER
journalctl -u code-server@$USER -f
sudo systemctl status nginx

# restart
sudo systemctl restart code-server@$USER
sudo systemctl restart nginx

# tailscale serve
tailscale serve status            # show the HTTPS mapping
tailscale serve --https=443 off   # disable the public-in-tailnet HTTPS endpoint
```

## Exposing a dev app (the `mapps` tool)

`~/machine/bin/mapps` is the one-stop tool for exposing a local dev port over the
tailnet and listing it at `https://sg-dev-zhiwei3.taile5ac.ts.net/apps`. The
registry `worktree-apps.json` is the single source of truth; the tool reconciles
`tailscale serve` state + the `/apps` index page to match it.

```bash
mapps add 3010 "My Next app"        # expose local :3010, auto-assign an HTTPS port
mapps add 3010 "My app" -p /login   # ...with a landing path
mapps ls                            # list apps + live up/down status
mapps rm 3010                       # remove (by devPort, servePort, or label); tears down its serve port
mapps edit                          # open the registry in $EDITOR; syncs automatically on save
mapps sync                          # reconcile after a hand-edit of the JSON (== gc)
```

`mapps edit` opens `worktree-apps.json` in `$VISUAL`/`$EDITOR` (falls back to
nano/vi). When you save and exit it validates the JSON and runs `sync` for you;
if you left the file syntactically broken it refuses to sync and keeps your edits
so you can fix them.

You only ever specify your app's **local port**. The tailnet-facing HTTPS
"serve port" is auto-assigned from the range **8442–8499** and managed for you —
you never pick it. Each app is served at its own root on that dedicated port
(`sudo tailscale serve --bg --https=<servePort> http://127.0.0.1:<devPort>`), so
apps need no sub-path/basePath config.

**Cleanup:** delete an entry from `worktree-apps.json` (or `mapps rm …`), then
`mapps sync`. Any serve port in the managed range that is no longer in the registry
is torn down. The main `:443` entry (nginx) is outside the managed range and is
never touched.

### Alternative: nginx path routing (rarely needed)

If you specifically want an app under the main `:443` host at a sub-path (one
fewer port), add a `location /myapp/ { proxy_pass ...; }` block to
`/etc/nginx/sites-available/code-server`. The backend must support being served
under `/myapp/` (Next.js `basePath`, Vite `base`, etc.). Reachable at
`https://sg-dev-zhiwei3.taile5ac.ts.net/myapp/`.

## Notifications (the `notify` tool)

`~/bin/notify` is the single way anything on this box pushes a notification to my
phone — scripts, systemd timers, cron, agents. Callers pass a message; the tool
owns which channels are live, so nothing reimplements delivery.

```bash
notify "backup finished"
notify -t "CI" -c https://github.com/org/repo/pull/1 -p 4 "3 checks failed"
some-command 2>&1 | notify -t "job output"
```

`-t` title, `-c` URL opened when the notification is tapped, `-p` ntfy priority
1–5. **Exits non-zero if no channel delivered**, so callers can tell silence from
success.

### Channels

| Channel | Status              | Secret needed                                                 |
|---------|---------------------|---------------------------------------------------------------|
| ntfy    | in use              | none — the topic name *is* the credential                     |
| Slack   | wired, unconfigured | incoming webhook URL (app install may need admin approval)    |
| email   | wired, unconfigured | Gmail app password (needs 2FA; Workspace admin can disable)   |

ntfy is the current choice because publishing to `ntfy.sh` needs no account or
token. Subscribe the phone by installing the ntfy app and adding the topic.

Config is `~/.config/notify/config.json`, mode 600. This repo's work tree is all
of `$HOME` and the repo is **public**, so that path is listed in `~/.gitignore` —
the ntfy topic is a live secret. Never `git add -f` it.

### The ntfy security tradeoff

Hosted `ntfy.sh` runs open. The [docs](https://docs.ntfy.sh/publish/) call the
topic "essentially a password", and real ACLs (`auth-default-access: deny-all`)
require self-hosting. A leaked topic therefore lets someone **read** the
notifications as well as publish to them — strictly worse than a Slack webhook,
where a leak only permits publishing. Fine while the payload is metadata (PR
numbers, check names); revisit before sending anything sensitive.

Upgrade path: self-host ntfy behind `tailscale serve` so the topic never leaves
the tailnet. Tradeoff to weigh first — the Android app only gets battery-efficient
FCM push for `ntfy.sh`; a self-hosted server means a persistent foreground
connection and the phone must be on the tailnet to receive anything.

### Consumers

- `~/bin/auto-retry-pr-checks` — re-runs failed required checks on my open PRs,
  notifying when one exhausts its 3 attempts. systemd user timer, every 10 min.

## Going public + SSO (not currently configured)

Considered and deferred — kept tailnet-only as the safest option (code-server is a
full shell on this box). Tailscale login is already Google SSO for tailnet
membership, so tailnet access is effectively Google-gated via ACLs. If public
access is ever needed, the two viable routes are:

- **Cloudflare Tunnel + Cloudflare Access** (Google IdP, managed auth) — needs a
  domain on Cloudflare. Recommended for public.
- **Tailscale Funnel + oauth2-proxy** (self-hosted Google OAuth client) — stays in
  the Tailscale ecosystem. Funnel only allows ports 443 / 8443 / 10000.

## Install history (for reference)

- code-server: `curl -fsSL https://code-server.dev/install.sh | sh`
- nginx: `sudo apt-get install -y nginx`
- HTTPS: `tailscale serve --bg --https=443 http://127.0.0.1:80`
