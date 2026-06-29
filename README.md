<div align="center">
  
  # 🚀 SendKit
  
  **A unified toolkit for sending messages through various platforms.**
  
  [![npm version](https://img.shields.io/npm/v/@blagare/sendkit?style=flat-square&color=blue)](https://www.npmjs.com/package/@blagare/sendkit)
  [![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
  [![MCP](https://img.shields.io/badge/MCP-Supported-purple?style=flat-square)](https://modelcontextprotocol.io/)

  [Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Packages](#-packages)

</div>

---

**SendKit** is a robust toolkit and monorepo designed to streamline sending messages across different platforms (currently focused on Telegram). It provides a Command-Line Interface, a core library, Agent Skills, and both local and remote Model Context Protocol (MCP) servers to integrate messaging capabilities into your automated workflows, CI/CD pipelines, and AI agent environments.

## ✨ Features

- 💻 **CLI Interface** - Easy-to-use command-line tool for sending messages directly from your terminal.
- 🧠 **Agent Skill** - Includes a built-in SendKit AI Agent skill for seamless integration into AI coding assistants and agents.
- 🔌 **MCP Support** - Full support for the Model Context Protocol (MCP) with both local (stdio) and remote (HTTP) server implementations.
- 🛠️ **Core Library** - Reusable TypeScript core library with Zod validation for building custom integrations.
- 🛡️ **Type-Safe** - Built completely with TypeScript for strong type guarantees and great developer experience.
- 📦 **Monorepo Architecture** - Well-structured workspace separating concerns into dedicated packages.

## 📦 Installation

### CLI

To install the SendKit CLI globally via npm:

```bash
npm install -g @blagare/sendkit
```

Or using Bun:

```bash
bun add -g @blagare/sendkit
```

### Core Library

To use the core logic in your own project:

```bash
npm install @blagare/sendkit-core
```

## 🚀 Usage

### Initializing the CLI

Before sending messages, you need to configure your Telegram bot token.

```bash
sendkit init --telegram-bot-token <your-bot-token>
```

> [!NOTE]  
> The configuration is securely saved locally to `~/.config/sendkit/config.json` with restricted permissions.

### Sending a Telegram Message

Once initialized, you can send messages using the `telegram` command:

```bash
sendkit telegram <chatId> "Hello, World from SendKit! 👋"
```

### 🤖 Using Agent Capabilities (MCP & Skills)

SendKit is built with AI agents in mind, providing multiple ways to expose its capabilities to LLMs:

- **Agent Skill**: Install the SendKit skill (`skills/sendkit`) into your AI coding assistant workspace to grant it native messaging abilities.
- **Local MCP**: Can be run locally and communicates via standard input/output.
- **Remote MCP**: An HTTP-based server leveraging `@clerk/backend` and `Hono` for remote agent communication.

## 📁 Packages

This monorepo contains the following packages and applications:

- 🏗️ `packages/core` (`@blagare/sendkit-core`): Core business logic and Telegram API integrations.
- ⌨️ `packages/cli` (`@blagare/sendkit`): The command-line interface.
- 🔌 `packages/local-mcp` (`@blagare/sendkit-mcp`): Stdio-based MCP server.
- 🌐 `apps/remote-mcp` (`sendkit-remote-mcp`): HTTP-based MCP server.
- 🧠 `skills/sendkit`: The AI Agent skill definition for SendKit.
