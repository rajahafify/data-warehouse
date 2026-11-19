/**
 * Sign-in flow: AI app -> /authorize (consent page) -> GitHub -> /callback -> back to the AI app.
 * Only GitHub users listed in ALLOWED_GITHUB_USERS can finish signing in.
 */
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Props } from "./index";

type Bindings = Env & { OAUTH_PROVIDER: OAuthHelpers };

const app = new Hono<{ Bindings: Bindings }>();

const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 600 } as const;
const TTL = 600; // seconds

app.get("/", (c) => c.text("project-memory MCP server. Add <this URL>/mcp as a connector in your AI app."));

// Step 1: show a consent page naming the app that wants access.
app.get("/authorize", async (c) => {
  const oauthReq = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const client = await c.env.OAUTH_PROVIDER.lookupClient(oauthReq.clientId);
  if (!client) return c.text("Unknown client.", 400);

  const nonce = crypto.randomUUID();
  await c.env.OAUTH_KV.put(`consent:${nonce}`, JSON.stringify(oauthReq), { expirationTtl: TTL });
  setCookie(c, "consent", nonce, COOKIE_OPTS);

  return c.html(consentPage(client.clientName || oauthReq.clientId, oauthReq.redirectUri, nonce));
});

// Step 2: user approved -> send them to GitHub.
app.post("/authorize", async (c) => {
  const form = await c.req.formData();
  const nonce = String(form.get("nonce") ?? "");
  // The cookie is SameSite=Lax, so another site can't submit this form on the user's behalf.
  if (!nonce || getCookie(c, "consent") !== nonce) return c.text("Consent expired. Try connecting again.", 400);
  deleteCookie(c, "consent", { path: "/" });

  const stored = await c.env.OAUTH_KV.get(`consent:${nonce}`);
  if (!stored) return c.text("Consent expired. Try connecting again.", 400);
  await c.env.OAUTH_KV.delete(`consent:${nonce}`);

  const state = crypto.randomUUID();
  await c.env.OAUTH_KV.put(`state:${state}`, stored, { expirationTtl: TTL });
  setCookie(c, "oauth_state", state, COOKIE_OPTS);

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", c.env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", new URL("/callback", c.req.url).href);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  return c.redirect(url.href);
});

// Step 3: GitHub sends the user back here.
app.get("/callback", async (c) => {
  const state = c.req.query("state");
  const code = c.req.query("code");
  if (!state || !code || getCookie(c, "oauth_state") !== state) return c.text("Invalid sign-in state.", 400);
  deleteCookie(c, "oauth_state", { path: "/" });

  const stored = await c.env.OAUTH_KV.get(`state:${state}`);
  if (!stored) return c.text("Sign-in expired. Try connecting again.", 400);
  await c.env.OAUTH_KV.delete(`state:${state}`);
  const oauthReq = JSON.parse(stored) as AuthRequest;

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: new URL("/callback", c.req.url).href,
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!token.access_token) return c.text(`GitHub sign-in failed: ${token.error ?? "no token"}`, 400);

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token.access_token}`, "User-Agent": "project-memory-mcp" },
  });
  if (!userRes.ok) return c.text("Could not read GitHub profile.", 502);
  const user = (await userRes.json()) as { login: string; name: string | null };

  const allowed = c.env.ALLOWED_GITHUB_USERS.split(",")
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(user.login.toLowerCase())) {
    return c.text(`GitHub user '${user.login}' is not allowed to use this server.`, 403);
  }

  const props: Props = { login: user.login, name: user.name ?? user.login };
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReq,
    userId: user.login,
    metadata: { label: props.name },
    scope: oauthReq.scope,
    props,
  });
  return c.redirect(redirectTo);
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function consentPage(clientName: string, redirectUri: string, nonce: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect to project memory</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:440px;margin:12vh auto;padding:0 20px;color:#222}
  code{background:#f2f2f2;padding:2px 5px;border-radius:4px;word-break:break-all}
  button{font-size:16px;padding:10px 18px;border-radius:8px;border:0;background:#222;color:#fff;cursor:pointer}
</style></head><body>
<h2>Allow access to your project memory?</h2>
<p><strong>${escapeHtml(clientName)}</strong> wants to read and write your projects, notes and files.</p>
<p>It will be sent back to:<br><code>${escapeHtml(redirectUri)}</code></p>
<p>Only approve if you just started connecting this app.</p>
<form method="post" action="/authorize">
  <input type="hidden" name="nonce" value="${escapeHtml(nonce)}">
  <button type="submit">Approve and sign in with GitHub</button>
</form>
</body></html>`;
}

export { app as AuthHandler };
