import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, json, projectExists, slugSchema, text, toFtsQuery } from "../util";

const kindSchema = z.enum(["note", "decision", "status", "todo", "reference"]);

export function registerNoteTools(server: McpServer, env: Env, user: string) {
  server.tool(
    "add_note",
    "Save a note, decision, status update, todo or reference to a project so other AI tools and future sessions can see it.",
    {
      project: slugSchema,
      kind: kindSchema.default("note"),
      title: z.string().min(1).max(200),
      body: z.string().min(1),
      tags: z.array(z.string()).default([]),
      source: z.string().default("").describe("Which AI tool is writing this, e.g. 'claude', 'chatgpt', 'gemini'"),
    },
    async ({ project, kind, title, body, tags, source }) => {
      if (!(await projectExists(env, project))) return fail(`No project '${project}'.`);
      const result = await env.DB.prepare(
        "INSERT INTO notes (project_slug, kind, title, body, tags, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(project, kind, title, body, tags.join(","), source, user)
        .run();
      await env.DB.prepare("UPDATE projects SET updated_at = datetime('now') WHERE slug = ?").bind(project).run();
      return text(`Saved ${kind} #${result.meta.last_row_id} to '${project}'.`);
    },
  );

  server.tool(
    "search_notes",
    "Full-text search across notes, optionally within one project or of one kind.",
    {
      query: z.string().min(1),
      project: slugSchema.optional(),
      kind: kindSchema.optional(),
      limit: z.number().int().min(1).max(50).default(10),
    },
    async ({ query, project, kind, limit }) => {
      const where = ["notes_fts MATCH ?"];
      const params: unknown[] = [toFtsQuery(query)];
      if (project) {
        where.push("n.project_slug = ?");
        params.push(project);
      }
      if (kind) {
        where.push("n.kind = ?");
        params.push(kind);
      }
      params.push(limit);

      const { results } = await env.DB.prepare(
        `SELECT n.id, n.project_slug, n.kind, n.title, n.body, n.tags, n.created_at
           FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid
          WHERE ${where.join(" AND ")}
          ORDER BY bm25(notes_fts)
          LIMIT ?`,
      )
        .bind(...params)
        .all();
      return json(results);
    },
  );

  server.tool(
    "list_notes",
    "List the most recent notes for a project, optionally filtered by kind.",
    {
      project: slugSchema,
      kind: kindSchema.optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ project, kind, limit }) => {
      const stmt = kind
        ? env.DB.prepare(
            "SELECT id, kind, title, body, tags, source, created_at FROM notes WHERE project_slug = ? AND kind = ? ORDER BY created_at DESC, id DESC LIMIT ?",
          ).bind(project, kind, limit)
        : env.DB.prepare(
            "SELECT id, kind, title, body, tags, source, created_at FROM notes WHERE project_slug = ? ORDER BY created_at DESC, id DESC LIMIT ?",
          ).bind(project, limit);
      const { results } = await stmt.all();
      return json(results);
    },
  );

  server.tool(
    "delete_note",
    "Delete a note by id. Only do this when the user explicitly asks.",
    { id: z.number().int() },
    async ({ id }) => {
      const result = await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(id).run();
      return result.meta.changes ? text(`Deleted note #${id}.`) : fail(`No note #${id}.`);
    },
  );
}
