#!/usr/bin/env node
/**
 * @fileoverview SendKit CLI - A command-line interface for sending messages
 * through various platforms, currently supporting Telegram.
 *
 * @module sendkit-cli
 *
 * @example
 * # Initialize the CLI with your Telegram bot token
 * sendkit init --telegram-bot-token <your-bot-token>
 *
 * # Send a Telegram message
 * sendkit telegram <chatId> "Hello, World!"
 */

import { Command } from "commander";
import { z } from "zod";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { sendTelegramMessage } from "@blagare/sendkit-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

/** Root commander program instance */
const program = new Command();

/**
 * Absolute path to the SendKit CLI configuration file.
 * Resolves to `~/.config/sendkit/config.json` on Unix-like systems.
 */
const configPath = join(homedir(), ".config", "sendkit", "config.json");

/**
 * Zod schema for validating the structure of the CLI configuration file.
 * All fields are optional to allow partial configurations.
 *
 * @example
 * // Valid config shape
 * {
 *   "telegramBotToken": "123456:ABC-DEF..."
 * }
 */
const cliConfigSchema = z.object({
  telegramBotToken: z.string().min(1).optional(),
});

/**
 * Persists the Telegram bot token to the local SendKit configuration file.
 * Creates the configuration directory recursively if it does not exist.
 * The file is written with restricted permissions (owner read/write only)
 * to protect the sensitive token value.
 *
 * @param {string} token - The Telegram bot token to store.
 *
 * @example
 * writeTelegramBotToken("123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11");
 * // Writes to ~/.config/sendkit/config.json with mode 0o600
 */
function writeTelegramBotToken(token: string) {
  // Ensure the parent directory exists before writing the config file
  mkdirSync(dirname(configPath), { recursive: true });

  writeFileSync(
    configPath,
    // Pretty-print JSON with a trailing newline for POSIX compliance
    `${JSON.stringify({ telegramBotToken: token }, null, 2)}\n`,
    // Restrict file permissions to owner read/write (rw-------)
    { mode: 0o600 },
  );
}

/**
 * Reads and returns the Telegram bot token from the local configuration file.
 * Validates the configuration file structure against {@link cliConfigSchema}
 * before returning the token.
 *
 * @returns {string} The stored Telegram bot token.
 *
 * @throws {Error} If the configuration file does not exist at {@link configPath}.
 * @throws {Error} If the configuration file exists but contains no bot token.
 * @throws {z.ZodError} If the configuration file contains invalid JSON structure.
 *
 * @example
 * const token = getTelegramBotToken();
 * // "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
 */
function getTelegramBotToken(): string {
  if (!existsSync(configPath)) {
    throw new Error("Telegram bot token is required. Run `sendkit init`.");
  }

  // Parse and validate the raw JSON against the expected config schema
  const config = cliConfigSchema.parse(
    JSON.parse(readFileSync(configPath, "utf8")),
  );

  const token = config.telegramBotToken;

  if (!token) {
    throw new Error("Telegram bot token is required. Run `sendkit init`.");
  }

  return token;
}

// ---------------------------------------------------------------------------
// CLI Program Definition
// ---------------------------------------------------------------------------

program.name("sendkit").description("SendKit CLI backed by sendkit-core");

// ---------------------------------------------------------------------------
// Command: init
// ---------------------------------------------------------------------------

program
  .command("init")
  .description("Configure SendKit CLI local settings")
  .requiredOption("--telegram-bot-token <botToken>", "Telegram bot token")
  /**
   * Action handler for the `init` command.
   * Writes the provided Telegram bot token to the local config file and
   * confirms the saved path to the user.
   *
   * @param {{ telegramBotToken: string }} options - Parsed CLI options.
   */
  .action(async (options: { telegramBotToken: string }) => {
    writeTelegramBotToken(options.telegramBotToken);
    console.log(`Saved SendKit CLI config to ${configPath}`);
  });

// ---------------------------------------------------------------------------
// Command: telegram
// ---------------------------------------------------------------------------

program
  .command("telegram")
  .description("Send a Telegram message")
  .argument("<chatId>", "Telegram chat ID")
  .argument("<message>", "Message text to send")
  /**
   * Action handler for the `telegram` command.
   * Retrieves the stored bot token, sends a message via `sendkit-core`,
   * and prints the raw API result as JSON to stdout.
   *
   * @param {string} chatId  - The target Telegram chat ID.
   * @param {string} message - The text content of the message to send.
   */
  .action(async (chatId: string, message: string) => {
    const result = await sendTelegramMessage({
      botToken: getTelegramBotToken(),
      chatId,
      message,
    });

    // Output the full API response for downstream consumption or debugging
    console.log(JSON.stringify(result));
  });

// ---------------------------------------------------------------------------
// Program Entry Point
// ---------------------------------------------------------------------------

/**
 * Parse command-line arguments and execute the matched command.
 * Any unhandled errors are caught here: the error message is printed to
 * stderr and the process exit code is set to 1 to signal failure to the
 * calling shell without throwing an unhandled rejection.
 */
await program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
