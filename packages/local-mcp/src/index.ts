/**
 * @file SendKit Local MCP Server
 *
 * This module implements a local Model Context Protocol (MCP) server that runs
 * as a stdio-based child process. It is intended to be launched directly by an
 * MCP-compatible client (e.g., Claude Desktop, a CLI tool, or an IDE extension)
 * via its process management layer, rather than being exposed over a network.
 *
 * Communication occurs entirely over stdin/stdout using the MCP wire protocol,
 * meaning no HTTP server or port binding is required.
 *
 * Bot token configuration is handled via the `TELEGRAM_BOT_TOKEN` environment
 * variable, which the MCP client is expected to inject into the child process
 * environment at launch time.
 *
 * @module sendkit-local
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { sendTelegramMessage, telegramMessageInputSchema } from "sendkit-core";

/**
 * The MCP server instance that exposes tools to the connected MCP client.
 *
 * Metadata (name, version) is surfaced to the client during the MCP capability
 * negotiation handshake, allowing clients to identify and version-pin this server.
 */
const server = new McpServer({
  name: "sendkit-local",
  version: "0.0.0",
});

/**
 * Retrieves the Telegram Bot API token from the process environment.
 *
 * The token is intentionally read at tool invocation time rather than at
 * startup. This allows the MCP client to inject or rotate the environment
 * variable without requiring a server restart, and ensures that a missing
 * token surfaces as a descriptive tool error rather than a silent crash
 * during initialization.
 *
 * @returns {string} The value of the `TELEGRAM_BOT_TOKEN` environment variable.
 *
 * @throws {Error} If `TELEGRAM_BOT_TOKEN` is not set in the process environment.
 *   The error message is intentionally user-facing, guiding the operator to
 *   configure the variable in their MCP client's environment settings.
 *
 * @example
 * // Typical MCP client configuration (e.g., claude_desktop_config.json):
 * // {
 * //   "env": { "TELEGRAM_BOT_TOKEN": "123456:ABC-DEF..." }
 * // }
 * const token = getTelegramBotToken();
 */
function getTelegramBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      // This message is intentionally operator-facing: it will be surfaced
      // as a tool error in the MCP client's UI, guiding the user to fix
      // their environment configuration.
      "TELEGRAM_BOT_TOKEN is required. Configure it in your MCP client environment",
    );
  }

  return token;
}

/**
 * Register the "telegram" tool with the MCP server.
 *
 * This tool enables MCP clients to send Telegram messages by invoking it with
 * the parameters defined in `telegramMessageInputSchema`. The bot token is
 * sourced from the environment at call time and is never exposed to the client.
 *
 * @tool telegram
 *
 * @param {object} input - The validated tool input, conforming to
 *   `telegramMessageInputSchema`. Field definitions are derived from the Zod
 *   schema's `.shape`, which the MCP SDK uses to generate the tool's parameter
 *   specification for clients.
 *
 * @returns {object} An MCP-compatible tool result containing:
 *   - `content`: A human-readable text confirmation of the sent message,
 *     surfaced directly in the MCP client's UI or conversation context.
 *   - `structuredContent`: The full result object from `sendTelegramMessage`,
 *     including `messageId` and `chatId`, available for programmatic use by
 *     the client.
 *
 * @throws {Error} Propagates any error thrown by `getTelegramBotToken` (missing
 *   env var) or `sendTelegramMessage` (API failure), which the MCP SDK will
 *   convert into a structured tool error response for the client.
 */
server.registerTool(
  "telegram",
  {
    title: "Telegram",
    description: "Send a Telegram message.",
    // Spread the Zod object schema's `.shape` to provide individual field
    // definitions to the MCP SDK, as required by its tool registration API.
    inputSchema: telegramMessageInputSchema.shape,
  },
  async (input) => {
    // Send the message via the Telegram Bot API, merging the validated tool
    // input with the bot token retrieved from the process environment.
    const result = await sendTelegramMessage({
      ...input,
      botToken: getTelegramBotToken(),
    });

    return {
      // Human-readable confirmation displayed to the user in the MCP client.
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

/**
 * The stdio transport bridges the MCP server to the host process's stdin/stdout
 * streams. The MCP client (parent process) communicates with this server by
 * writing MCP-encoded messages to the process's stdin and reading responses
 * from stdout.
 *
 * Using stdio transport means this server has no network footprint — it is
 * entirely local to the machine and scoped to the lifetime of the process.
 */
const transport = new StdioServerTransport();

/**
 * Connect the MCP server to the stdio transport, starting the message
 * processing loop.
 *
 * After this call the server is fully operational: it will read incoming MCP
 * messages from stdin, dispatch them to the appropriate registered tool or
 * handler, and write responses to stdout.
 *
 * This is a top-level `await` — the module is expected to run in an environment
 * that supports top-level await (Node.js ESM, Bun, Deno), and the process will
 * remain alive for as long as the transport connection is open.
 */
await server.connect(transport);
