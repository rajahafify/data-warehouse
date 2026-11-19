import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, json, projectExists, slugSchema, text } from "../util";

const MAX_READ_BYTES = 200_000;

const pathSchema = z
  .string()
  .min(1)
  .max(300)
  .refine((p) => !p.startsWith("/") && !p.split("/").includes(".."), "relative path without '..'")
  .describe("Path inside the project, e.g. 'specs/api.md'");

export function registerFileTools(server: McpServer, env: Env) {
  const key = (project: string, path: string) => `${project}/${path}`;

  server.tool(
    "put_file",
    "Save a text file (markdown, JSON, CSV, code...) to a project. Overwrites any file at the same path.",
    {
      project: slugSchema,
      path: pathSchema,
      content: z.string(),
      content_type: z.string().default("text/markdown; charset=utf-8"),
    },
    async ({ project, path, content, content_type }) => {
      if (!(await projectExists(env, project))) return fail(`No project '${project}'.`);
      await env.FILES.put(key(project, path), content, { httpMetadata: { contentType: content_type } });
      return text(`Saved ${project}/${path} (${new TextEncoder().encode(content).length} bytes).`);
    },
  );

  server.tool(
    "get_file",
    "Read a text file from a project.",
    { project: slugSchema, path: pathSchema },
    async ({ project, path }) => {
      const obj = await env.FILES.get(key(project, path));
      if (!obj) return fail(`No file ${project}/${path}.`);
      const body = await obj.text();
      if (body.length > MAX_READ_BYTES) {
        return text(`${body.slice(0, MAX_READ_BYTES)}\n\n[truncated: file is ${obj.size} bytes]`);
      }
      return text(body);
    },
  );

  server.tool(
    "list_files",
    "List files stored for a project.",
    { project: slugSchema, prefix: z.string().default("") },
    async ({ project, prefix }) => {
      const listing = await env.FILES.list({ prefix: `${project}/${prefix}`, limit: 500 });
      return json(
        listing.objects.map((o) => ({
          path: o.key.slice(project.length + 1),
          size: o.size,
          uploaded: o.uploaded.toISOString(),
        })),
      );
    },
  );

  server.tool(
    "delete_file",
    "Delete a file from a project. Only do this when the user explicitly asks.",
    { project: slugSchema, path: pathSchema },
    async ({ project, path }) => {
      await env.FILES.delete(key(project, path));
      return text(`Deleted ${project}/${path}.`);
    },
  );
}
