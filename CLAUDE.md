# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP Debugger is a multi-language debugging plugin for Claude Code that leverages the Debug Adapter Protocol (DAP) to provide real debugging capabilities across Python, JavaScript/TypeScript, Go, and Rust. It enables setting breakpoints, stepping through execution, inspecting variables, and evaluating expressions in real debuggers (debugpy, vscode-js-debug, Delve, CodeLLDB).

## Build Commands

```bash
npm run build      # Compile TypeScript to bin/
npm run dev        # Watch mode for development
npm test           # Run vitest
npm run test:run   # Run tests once (CI mode)
npm start          # Run the compiled MCP server
npm run clean      # Remove bin/ directory
```

## Architecture

### Layer Structure

1. **MCP Server** (`src/server.ts`) - Routes tool calls from Claude Code to handlers, exposes 18+ debugging tools
2. **Session Manager** (`src/session/session-manager.ts`) - Central orchestrator managing debug session lifecycle and state
3. **DAP Client** (`src/dap/dap-client.ts`) - Implements Debug Adapter Protocol, handles message parsing and adapter processes
4. **Adapters** (`src/adapters/`) - Language-specific implementations for each debugger

### Session State Machine

```
CREATED → INITIALIZING → READY → RUNNING ↔ PAUSED → TERMINATED (or ERROR)
```

### Key Design Patterns

- **Adapter Pattern**: Each language has an `IDebugAdapter` that handles installation, configuration, and launch for its debugger
- **Registry Pattern**: `AdapterRegistry` maps languages to adapter factories
- **Event-Driven**: `EventEmitter` used throughout; events bubble from DAP → Session Manager → MCP Server → Claude Code

## Important Implementation Details

- **Multi-Session DAP**: vscode-js-debug uses reverse requests for child sessions connecting via TCP
- **Async Launch**: debugpy responds to launch only after `configurationDone()` - use `launchAsync()` and `waitForLaunch()`
- **Message Framing**: DAP uses Content-Length headers with proper UTF-8 byte counting in `message-parser.ts`
- **Breakpoint Queueing**: Breakpoints set before debugging starts are stored and applied once adapter is ready

## Plugin Structure

- `.claude-plugin/plugin.json` - Plugin manifest
- `.mcp.json` - MCP server configuration
- `commands/` - Claude Code slash commands (debug, breakpoint, step)
- `agents/` - Debug assistant agent
- `skills/` - Debugging guide skill

## Supported Languages

Auto-detected by extension:
- JavaScript/TypeScript: `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`
- Python: `.py`, `.pyw`
- Go: `.go`
- Rust: `.rs`
