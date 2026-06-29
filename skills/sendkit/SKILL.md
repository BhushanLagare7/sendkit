---
name: sendkit
description: Use SendKit to send Telegram messages from agents through the SendKit MCP tool or CLI fallback. Use SendKit when a user asks to send a Telegram message, use SendKit, interact with the SendKit toolset, verify SendKit manually, or choose between SendKit MCP and CLI workflows. Also use this skill whenever Telegram, chat notifications, or bot messaging come up in any context — even if the user doesn't say "SendKit" by name.
---

# SendKit

SendKit lets you send Telegram messages from within an agent session. There are two delivery paths — an **MCP tool** (preferred) and a **CLI fallback** — so you can always get a message out regardless of the environment.

## When to use this skill

- The user asks to send, deliver, or push a Telegram message
- The user mentions SendKit, `sendkit`, `@blagare/sendkit`, or `@blagare/sendkit-mcp`
- The user wants to verify that Telegram delivery is working
- The user needs to choose between MCP and CLI for sending messages
- The user wants to set up or configure SendKit in a new project
- Any scenario involving Telegram bot messaging or chat notifications from an agent

## How it works

SendKit provides two published packages:

- **`@blagare/sendkit-mcp`** — A stdio-based MCP server that exposes a `telegram` tool to any MCP-compatible client
- **`@blagare/sendkit`** — A command-line interface for sending messages directly from the terminal

Both packages deliver messages through the Telegram Bot API with the same validated input and identical behaviour.

## Sending a message

### Path 1: MCP tool (preferred)

If the `sendkit` MCP server is configured, you already have a tool called **`telegram`** available. Use it directly:

- **`chatId`** (string, required) — the Telegram chat ID to send to
- **`message`** (string, required) — the message text

The bot token is injected via the `TELEGRAM_BOT_TOKEN` environment variable in the MCP server configuration, so you never need to supply it yourself.

**Example MCP tool call:**
```
Tool: mcp__sendkit__telegram
Arguments: { "chatId": "123456789", "message": "Build completed successfully ✅" }
```

On success you'll get back a confirmation containing `messageId` and `chatId`.

### Path 2: CLI fallback

Use the CLI when the MCP server is not available (e.g., the environment doesn't support MCP, or the server isn't configured). The CLI reads the bot token from a local config file.

**One-time setup** (stores the token at `~/.config/sendkit/config.json` with `0600` permissions):
```bash
bunx -y @blagare/sendkit init --telegram-bot-token "<YOUR_BOT_TOKEN>"
```

**Send a message:**
```bash
bunx -y @blagare/sendkit telegram "<chatId>" "Hello from SendKit 👋"
```

The CLI prints the API result as JSON to stdout.

## Deciding which path to use

```
Is the `sendkit` MCP server configured?
├── YES → Use the `telegram` MCP tool directly
└── NO  → Use the CLI fallback (`bunx -y @blagare/sendkit telegram ...`)
```

Prefer MCP whenever possible — it keeps everything inside the agent session, requires no shell commands, and the bot token is already injected via the MCP environment. Fall back to CLI only when the MCP tool isn't registered.

## Setup and configuration

### MCP server setup

Add the following to `.mcp.json` (Claude Code / Gemini) or the equivalent MCP config for your client:

```json
{
  "mcpServers": {
    "sendkit": {
      "type": "stdio",
      "command": "bunx",
      "args": ["-y", "@blagare/sendkit-mcp"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "<YOUR_BOT_TOKEN>"
      }
    }
  }
}
```

For OpenCode, use `opencode.json`:

```json
{
  "mcp": {
    "sendkit": {
      "type": "local",
      "command": ["bunx", "-y", "@blagare/sendkit-mcp"],
      "environment": {
        "TELEGRAM_BOT_TOKEN": "<YOUR_BOT_TOKEN>"
      },
      "enabled": true
    }
  }
}
```

### Getting a bot token

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the token (format: `123456789:AABb...`)

### Getting a chat ID

1. Send any message to your bot on Telegram
2. Visit `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Find `"chat": { "id": <number> }` in the response — that number is the chat ID

## Verifying SendKit manually

To confirm everything works:

**Via MCP:** Call the `telegram` tool with a test message and check for a successful `messageId` in the response.

**Via CLI:**
```bash
bunx -y @blagare/sendkit telegram "<chatId>" "Test message from SendKit"
```

A successful result looks like:
```json
{"ok":true,"chatId":"123456789","messageId":42}
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `TELEGRAM_BOT_TOKEN is required` | Token not set in MCP env config | Add `TELEGRAM_BOT_TOKEN` to the `env` block in `.mcp.json` |
| `Telegram bot token is required. Run 'sendkit init'.` | CLI hasn't been initialized | Run `bunx -y @blagare/sendkit init --telegram-bot-token "<token>"` |
| `Telegram message request failed` | Invalid token, wrong chat ID, or bot hasn't been messaged yet | Verify the token with BotFather, confirm the chat ID via `/getUpdates`, and make sure the user has started a conversation with the bot |
| MCP tool `telegram` not found | MCP server not configured or not running | Check `.mcp.json` config and restart the MCP client |
