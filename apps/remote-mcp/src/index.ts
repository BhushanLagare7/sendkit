/**
 * @file SendKit Remote MCP Server
 *
 * This module implements a remote Model Context Protocol (MCP) server
 * using the Hono web framework. It exposes messaging tools (e.g., Telegram)
 * that can be invoked by MCP-compatible clients over HTTP.
 *
 * Each request is scoped to a specific bot token, provided via the URL path,
 * allowing multi-tenant usage without shared server state.
 *
 * Authentication is handled via Clerk. Clients must supply a valid OAuth
 * bearer token in the `Authorization` header. Unauthenticated requests receive
 * a 401 response whose `WWW-Authenticate` header points to the per-token
 * OAuth protected resource metadata endpoint, allowing compliant clients to
 * discover and complete the authorization flow automatically.
 *
 * @module sendkit-remote
 */

import { Hono, type Context } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createClerkClient } from "@clerk/backend";
import { generateClerkProtectedResourceMetadata } from "@clerk/mcp-tools/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import {
  sendTelegramMessage,
  telegramMessageInputSchema,
} from "@blagare/sendkit-core";

const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;

if (!clerkPublishableKey) {
  throw new Error("CLERK_PUBLISHABLE_KEY environment variable is required.");
}

if (!clerkSecretKey) {
  throw new Error("CLERK_SECRET_KEY environment variable is required.");
}

const clerkClient = createClerkClient({
  publishableKey: clerkPublishableKey,
  secretKey: clerkSecretKey,
});

/**
 * Creates and configures a new MCP server instance with all supported tools
 * registered for the given bot token.
 *
 * The server is intentionally created per-request to ensure complete isolation
 * between concurrent requests. This avoids shared mutable state and allows
 * each request to carry its own bot token context.
 *
 * @param {string} botToken - The Telegram Bot API token used to authenticate
 *   outgoing messages. This is injected into each tool handler at registration
 *   time, so callers do not need to pass it explicitly when invoking tools.
 *
 * @returns {McpServer} A fully configured MCP server instance with the
 *   Telegram tool registered and ready to be connected to a transport.
 *
 * @example
 * const server = createServer("123456:ABC-DEF...");
 * await server.connect(transport);
 */
function createServer(botToken: string): McpServer {
  /**
   * The MCP server instance that exposes tools to MCP-compatible clients.
   * Metadata (name, version) is surfaced to clients during capability negotiation.
   */
  const server = new McpServer({
    name: "sendkit-remote",
    version: "0.0.0",
  });

  /**
   * Register the "telegram" tool, which sends a message via the Telegram Bot API.
   *
   * The tool's input schema is derived from `telegramMessageInputSchema` (a Zod
   * schema), ensuring that MCP clients receive accurate parameter definitions
   * and that inputs are validated before the handler is invoked.
   *
   * @tool telegram
   * @param {object} input - The validated tool input, matching `telegramMessageInputSchema`.
   * @returns {object} An MCP-compatible result containing:
   *   - `content`: A human-readable text summary of the sent message.
   *   - `structuredContent`: The full result object returned by `sendTelegramMessage`,
   *     including `messageId` and `chatId`.
   */
  server.registerTool(
    "telegram",
    {
      title: "Telegram",
      description: "Send a Telegram message.",
      // Spread the Zod object schema's `.shape` to provide individual field
      // definitions to the MCP SDK, as required by its registration API.
      inputSchema: telegramMessageInputSchema.shape,
    },
    async (input) => {
      // Invoke the shared Telegram sender, merging the validated tool input
      // with the bot token that was captured at server creation time.
      const result = await sendTelegramMessage({
        ...input,
        botToken,
      });

      return {
        // Human-readable confirmation surfaced to the MCP client or end user.
        content: [
          {
            type: "text",
            text: `Sent Telegram message ${result.messageId} to chat ${result.chatId}`,
          },
        ],
        // Machine-readable result for programmatic consumption by the client.
        structuredContent: result,
      };
    },
  );

  return server;
}

/** The root Hono application instance. All routes are registered on this object. */
const app = new Hono();

/**
 * Constructs the absolute URL for the OAuth protected resource metadata
 * document associated with a given bot token.
 *
 * The returned URL follows the pattern:
 * `<origin>/.well-known/oauth-protected-resource/<botToken>/mcp`
 *
 * It is used in `WWW-Authenticate` response headers to allow OAuth-aware
 * clients to discover the authorization server and complete the auth flow
 * without any out-of-band configuration.
 *
 * @param {Context} c - The Hono request context, used to resolve the base URL.
 * @param {string} botToken - The Telegram Bot API token that scopes the metadata document.
 * @returns {string} The absolute URL of the protected resource metadata endpoint.
 */
function protectedResourceMetadataUrl(c: Context, botToken: string): string {
  return new URL(
    `/.well-known/oauth-protected-resource/${botToken}/mcp`,
    c.req.url,
  ).toString();
}

/**
 * Returns a 401 Unauthorized JSON response with a `WWW-Authenticate` header
 * that points to the OAuth protected resource metadata document for the given
 * bot token.
 *
 * Compliant OAuth clients (e.g., MCP clients with built-in auth support) can
 * read the `resource_metadata` URL from this header and use it to discover the
 * authorization server, obtain a token, and retry the request automatically.
 *
 * @param {Context} c - The Hono request context used to set headers and build the response.
 * @param {string} botToken - The Telegram Bot API token that scopes the metadata URL
 *   embedded in the `WWW-Authenticate` header.
 * @returns {Response} A 401 JSON response with the appropriate auth challenge header.
 */
function unauthorizedMcpResponse(c: Context, botToken: string): Response {
  c.header(
    "WWW-Authenticate",
    `Bearer resource_metadata="${protectedResourceMetadataUrl(c, botToken)}"`,
  );

  return c.json({ error: "Unauthorized" }, 401);
}

/**
 * GET /.well-known/oauth-protected-resource/:botToken/mcp
 *
 * Serves the OAuth 2.0 Protected Resource Metadata document for the MCP
 * endpoint associated with a given bot token.
 *
 * This endpoint is part of the OAuth 2.0 Protected Resource Metadata
 * specification (RFC 9728) and is used by OAuth-aware clients to discover
 * which authorization server protects this resource. Clients are directed
 * here via the `WWW-Authenticate` header in 401 responses from the main
 * MCP endpoint.
 *
 * The metadata document is generated by Clerk and includes details such as
 * the authorization server URL, the resource URL, and supported token types.
 *
 * @route   GET /.well-known/oauth-protected-resource/:botToken/mcp
 * @param   {string} botToken - Path parameter used to construct the resource URL
 *   embedded in the metadata document.
 * @returns {Response} A JSON response containing the protected resource metadata.
 */
app.get("/.well-known/oauth-protected-resource/:botToken/mcp", (c) => {
  return c.json(
    generateClerkProtectedResourceMetadata({
      publishableKey: clerkPublishableKey,
      resourceUrl: new URL(
        `/${c.req.param("botToken")}/mcp`,
        c.req.url,
      ).toString(),
    }),
  );
});

/**
 * POST /:botToken/mcp
 *
 * The primary MCP endpoint. Handles a single stateless MCP request for the
 * bot token specified in the URL path.
 *
 * Flow:
 *  1. Extract `botToken` from the URL parameter.
 *  2. Verify that the request carries a `Bearer` token in the `Authorization`
 *     header. If not, respond immediately with a 401 auth challenge.
 *  3. Authenticate the bearer token against Clerk, expecting an OAuth token.
 *     If authentication fails or the token is invalid, respond with a 401.
 *  4. Create a scoped MCP server pre-configured with the bot token.
 *  5. Create a `WebStandardStreamableHTTPServerTransport` to bridge the MCP
 *     server with the incoming HTTP request/response cycle.
 *  6. Connect the server to the transport, then delegate request handling to
 *     the transport.
 *  7. Always close the server after the response is sent to release resources.
 *
 * Design notes:
 *  - `sessionIdGenerator: undefined` disables session tracking, making every
 *    request fully stateless. This is appropriate for serverless or ephemeral
 *    deployment environments.
 *  - `enableJsonResponse: true` instructs the transport to return a plain JSON
 *    response rather than an SSE stream, which is more compatible with
 *    request/response HTTP clients.
 *
 * @route   POST /:botToken/mcp
 * @param   {string} botToken - Path parameter containing the Telegram Bot API token.
 * @returns {Response} The MCP-formatted HTTP response produced by the transport,
 *   or a 401 JSON response if the request is not authenticated.
 */
app.post("/:botToken/mcp", async (c) => {
  const botToken = c.req.param("botToken");
  const authHeader = c.req.header("authorization");

  // Reject requests that do not carry a Bearer token outright, before making
  // any network calls to Clerk.
  if (!authHeader?.startsWith("Bearer ")) {
    return unauthorizedMcpResponse(c, botToken);
  }

  try {
    // Validate the bearer token with Clerk, expecting it to be an OAuth token
    // issued on behalf of a user. Any other token type is rejected.
    const requestState = await clerkClient.authenticateRequest(c.req.raw, {
      acceptsToken: "oauth_token",
    });

    if (!requestState.isAuthenticated) {
      return unauthorizedMcpResponse(c, botToken);
    }
  } catch {
    // Treat any error during authentication (e.g., network failure, malformed
    // token) as an authentication failure rather than a server error, to avoid
    // leaking internal details to the caller.
    return unauthorizedMcpResponse(c, botToken);
  }

  // Create a request-scoped MCP server bound to this bot token.
  const server = createServer(botToken);

  // Create a stateless, JSON-mode HTTP transport for this request.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless — no session persistence.
    enableJsonResponse: true, // Return JSON, not an SSE stream.
  });

  // Connect the server to the transport before handling the request.
  // This wires up the MCP protocol layer to the HTTP I/O layer.
  await server.connect(transport);

  try {
    // Delegate the raw Request object to the transport for MCP processing.
    // The transport parses the MCP message, dispatches it to the server,
    // and serialises the response back to an HTTP Response.
    return await transport.handleRequest(c.req.raw);
  } finally {
    // Always close the server to clean up any internal resources,
    // regardless of whether the request succeeded or threw an error.
    await server.close();
  }
});

/**
 * Fallback handler for any route not matched by the routes above.
 * Returns a standard JSON 404 error to avoid leaking framework-default
 * error pages or stack traces to clients.
 */
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

/**
 * The port on which the HTTP server will listen.
 *
 * Defaults to `3000` if the `PORT` environment variable is not set.
 * Using an environment variable allows the port to be configured at
 * deployment time without modifying source code.
 */
const port = Number(process.env.PORT ?? 3000);

/**
 * The default export consumed by the Bun runtime (or a compatible host) to
 * start the HTTP server.
 *
 * - `port`: Tells the runtime which port to bind to.
 * - `fetch`: The WHATWG-standard `fetch`-compatible request handler provided
 *   by Hono, which routes incoming requests through the registered middleware
 *   and route handlers.
 *
 * Before forwarding each request to Hono, the `fetch` wrapper rewrites the
 * request URL to honour `X-Forwarded-Proto` and `X-Forwarded-Host` headers.
 * This ensures that any URL construction performed inside route handlers
 * (e.g., building absolute callback or metadata URLs) reflects the public-
 * facing scheme and hostname rather than the internal ones seen by the process,
 * which is important when the server runs behind a reverse proxy or load
 * balancer.
 */
export default {
  port,
  fetch: (req: Request) => {
    const url = new URL(req.url);
    url.protocol = req.headers.get("x-forwarded-proto") ?? url.protocol;
    url.host = req.headers.get("x-forwarded-host") ?? url.host;

    return app.fetch(new Request(url, req));
  },
};
