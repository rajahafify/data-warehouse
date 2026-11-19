# project-memory-mcp

One shared memory for all your projects, reachable from any AI app that supports MCP (Claude, ChatGPT, Gemini, Cursor…).

- **Server:** Cloudflare Worker (this repo)
- **Data:** Cloudflare D1 (projects + notes, full-text search) and R2 (files)
- **Login:** GitHub sign-in, limited to the usernames you allow

## Tools the AI gets

| Tool | What it does |
|---|---|
| `list_projects` | List projects |
| `create_project` | Create a project |
| `get_project_context` | Project summary + recent notes + file list (read this first) |
| `update_project` | Change name, description, status or context summary |
| `add_note` | Save a note / decision / status / todo / reference |
| `search_notes` | Full-text search across notes |
| `list_notes` | Recent notes for a project |
| `delete_note` | Delete a note |
| `put_file` / `get_file` / `list_files` / `delete_file` | Text files per project in R2 |

## First-time setup

```bash
npm install
npx wrangler login

# 1. Create the storage, then paste the printed IDs into wrangler.jsonc
npx wrangler d1 create project-memory
npx wrangler kv namespace create OAUTH_KV
npx wrangler r2 bucket create project-memory-files

# 2. Create the tables
npm run db:migrate

# 3. Deploy once to get your URL (https://data-warehouse.<you>.workers.dev)
npm run deploy
```

4. **Create a GitHub OAuth App** at GitHub → Settings → Developer settings → OAuth Apps → New:
   - Homepage URL: `https://data-warehouse.<you>.workers.dev`
   - Authorization callback URL: `https://data-warehouse.<you>.workers.dev/callback`

5. **Add the secrets** and deploy again:

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put ALLOWED_GITHUB_USERS   # e.g. yourname,teammate
npm run deploy
```

## Connect your AI apps

Use this URL: `https://data-warehouse.<you>.workers.dev/mcp`

- **Claude:** Settings → Connectors → Add custom connector → paste URL
- **ChatGPT:** Settings → Apps & Connectors (Developer mode) → add custom connector → paste URL
- **Gemini CLI / Cursor / others:** add as a remote MCP server with the URL

Each app opens a consent page, then GitHub sign-in.

## Auto-deploy from GitHub

In the Cloudflare dashboard, open the Worker and connect this repo in its build settings. Every push to `main` then deploys.
Database changes run through GitHub Actions (`.github/workflows/d1-migrations.yml`): add a new numbered file in `migrations/` (e.g. `0002_add_tags.sql`) and push. You can also run it by hand from the repo's **Actions** tab → **D1 migrations** → **Run workflow**.

The Action needs two repository secrets (GitHub → repo → Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with **Account → D1 → Edit** permission
- `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID

## Local development

```bash
cp .dev.vars.example .dev.vars    # fill in a separate local GitHub OAuth app
npm run db:migrate:local
npm run dev                       # http://localhost:8787
npm run inspect                   # MCP Inspector → connect to http://localhost:8787/mcp
```

## Ideas for later

- Semantic search with Cloudflare Vectorize + Workers AI embeddings
- Binary file uploads (images, PDFs) to R2
- Read-only SQL tool for ad-hoc queries
