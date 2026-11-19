import { z } from "zod";

export const text = (t: string) => ({
  content: [{ type: "text" as const, text: t }],
});

export const json = (value: unknown) => text(JSON.stringify(value, null, 2));

export const fail = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "lowercase letters, digits and dashes only")
  .describe("Project slug, e.g. 'website-redesign'");

export async function projectExists(env: Env, slug: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 FROM projects WHERE slug = ?").bind(slug).first();
  return row !== null;
}

/** Turn free text into a safe FTS5 query: each word quoted, all words required. */
export function toFtsQuery(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `"${word.replace(/"/g, '""')}"`)
    .join(" ");
}
