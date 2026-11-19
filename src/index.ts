import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { AuthHandler } from "./auth-handler";
import { registerFileTools } from "./tools/files";
import { registerNoteTools } from "./tools/notes";
import { registerProjectTools } from "./tools/projects";

/** Set on the access token when the user signs in (see auth-handler.ts). */
export type Props = {
  login: string;
  name: string;
};

export class ProjectMemoryMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({ name: "project-memory", version: "0.1.0" });

  async init() {
    const user = this.props?.login ?? "unknown";
    registerProjectTools(this.server, this.env);
    registerNoteTools(this.server, this.env, user);
    registerFileTools(this.server, this.env);
  }
}

export default new OAuthProvider({
  apiHandlers: {
    "/mcp": ProjectMemoryMCP.serve("/mcp"), // Streamable HTTP (current standard)
    "/sse": ProjectMemoryMCP.serveSSE("/sse"), // legacy SSE, for older clients
  },
  // biome-ignore lint/suspicious/noExplicitAny: Hono app satisfies the fetch handler shape
  defaultHandler: AuthHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
