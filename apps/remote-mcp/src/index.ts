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
 * @module sendkit-remote
 */

import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { sendTelegramMessage, telegramMessageInputSchema } from "sendkit-core";

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
 * POST /:botToken/mcp
 *
 * The primary MCP endpoint. Handles a single stateless MCP request for the
 * bot token specified in the URL path.
 *
 * Flow:
 *  1. Extract `botToken` from the URL parameter.
 *  2. Create a scoped MCP server pre-configured with that token.
 *  3. Create a `WebStandardStreamableHTTPServerTransport` to bridge the MCP
 *     server with the incoming HTTP request/response cycle.
 *  4. Connect the server to the transport, then delegate request handling to
 *     the transport.
 *  5. Always close the server after the response is sent to release resources.
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
 * @returns {Response} The MCP-formatted HTTP response produced by the transport.
 */
app.post("/:botToken/mcp", async (c) => {
  const botToken = c.req.param("botToken");

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
 */
export default {
  port,
  fetch: app.fetch,
};
