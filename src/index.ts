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

/**
 * The OAuth provider needs the server's public URL (RFC 9728 resource metadata).
 * It's taken from the incoming request, so the same code works on workers.dev
 * and on a custom domain. One provider is cached per origin.
 */
const providers = new Map<string, OAuthProvider>();

function providerFor(origin: string): OAuthProvider {
  let provider = providers.get(origin);
  if (!provider) {
    provider = new OAuthProvider({
      apiHandlers: {
        "/mcp": ProjectMemoryMCP.serve("/mcp"), // Streamable HTTP
      },
      // biome-ignore lint/suspicious/noExplicitAny: Hono app satisfies the fetch handler shape
      defaultHandler: AuthHandler as any,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/token",
      clientRegistrationEndpoint: "/register",
      resourceMetadata: {
        resource: `${origin}/mcp`,
        resource_name: "Project memory",
      },
    });
    providers.set(origin, provider);
  }
  return provider;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = new URL(request.url).origin.toLowerCase();
    return providerFor(origin).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
