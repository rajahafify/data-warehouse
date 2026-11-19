import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, json, projectExists, slugSchema, text } from "../util";

const statusSchema = z.enum(["active", "paused", "archived"]);

export function registerProjectTools(server: McpServer, env: Env) {
  server.tool(
    "list_projects",
    "List projects in the shared project memory. Call this first if you don't know which project the user means.",
    { status: z.enum(["active", "paused", "archived", "all"]).default("active") },
    async ({ status }) => {
      const stmt =
        status === "all"
          ? env.DB.prepare(
              "SELECT slug, name, description, status, updated_at FROM projects ORDER BY updated_at DESC",
            )
          : env.DB.prepare(
              "SELECT slug, name, description, status, updated_at FROM projects WHERE status = ? ORDER BY updated_at DESC",
            ).bind(status);
      const { results } = await stmt.all();
      return json(results);
    },
  );

  server.tool(
    "create_project",
    "Create a new project in the shared project memory.",
    {
      slug: slugSchema,
      name: z.string().min(1),
      description: z.string().default(""),
      context: z.string().default("").describe("Initial markdown summary: goals, scope, current state"),
    },
    async ({ slug, name, description, context }) => {
      if (await projectExists(env, slug)) return fail(`Project '${slug}' already exists.`);
      await env.DB.prepare(
        "INSERT INTO projects (slug, name, description, context) VALUES (?, ?, ?, ?)",
      )
        .bind(slug, name, description, context)
        .run();
      return text(`Created project '${slug}'.`);
    },
  );

  server.tool(
    "get_project_context",
    "Get everything needed to work on a project: its summary/context, recent notes and file list. Read this before working on a project.",
    {
      slug: slugSchema,
      recent_notes: z.number().int().min(0).max(50).default(10),
    },
    async ({ slug, recent_notes }) => {
      const project = await env.DB.prepare("SELECT * FROM projects WHERE slug = ?").bind(slug).first();
      if (!project) return fail(`No project '${slug}'. Use list_projects to see what exists.`);

      const { results: notes } = await env.DB.prepare(
        "SELECT id, kind, title, body, tags, source, created_at FROM notes WHERE project_slug = ? ORDER BY created_at DESC, id DESC LIMIT ?",
      )
        .bind(slug, recent_notes)
        .all();

      const listing = await env.FILES.list({ prefix: `${slug}/`, limit: 100 });
      const files = listing.objects.map((o) => ({
        path: o.key.slice(slug.length + 1),
        size: o.size,
        uploaded: o.uploaded.toISOString(),
      }));

      return json({ project, recent_notes: notes, files });
    },
  );

  server.tool(
    "update_project",
    "Update a project's name, description, status or context summary. When updating context, send the full new markdown (it replaces the old one).",
    {
      slug: slugSchema,
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      context: z.string().optional(),
      status: statusSchema.optional(),
    },
    async ({ slug, ...fields }) => {
      const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
      if (entries.length === 0) return fail("Nothing to update.");
      if (!(await projectExists(env, slug))) return fail(`No project '${slug}'.`);

      // Column names come from the fixed schema keys above, never from user input.
      const sets = entries.map(([k]) => `${k} = ?`).join(", ");
      await env.DB.prepare(`UPDATE projects SET ${sets}, updated_at = datetime('now') WHERE slug = ?`)
        .bind(...entries.map(([, v]) => v), slug)
        .run();
      return text(`Updated ${entries.map(([k]) => k).join(", ")} on '${slug}'.`);
    },
  );
}
