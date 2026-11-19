// Bindings from wrangler.jsonc plus secrets. You can regenerate a full version with `npx wrangler types`.
interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  OAUTH_KV: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace;

  // Secrets (wrangler secret put ... / .dev.vars locally)
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ALLOWED_GITHUB_USERS: string; // comma-separated GitHub usernames
}
