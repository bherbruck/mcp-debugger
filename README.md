# MCP Debugger

**A Claude Code plugin that enables fully autonomous debugging — coding agents pause programs, step through execution, inspect locals, and compare expected vs actual values using real debuggers. No human intervention. No log statements.**

This is a **game changer** for AI-assisted development. Claude autonomously investigates bugs by debugging itself, finding discrepancies between expected and actual runtime state. It works today.

## Why This Exists

Traditional AI debugging means:
- Stop execution
- Edit code to add debug logs
- Adjust log levels
- Rerun the program
- Parse log spam
- Repeat

**This wastes tokens, time, and iteration cycles.**

**MCP Debugger eliminates all of that.**

No debug logs. No log levels. No reruns. No code edits. Claude pauses your running program, inspects the actual state, and tells you what's wrong — in one shot.

**Result**: Faster debugging, fewer tokens spent on log spam, and no polluted git diffs from print statements.

## What Makes This Different

- ✓ **Fully Autonomous**: Claude decides when to debug, sets breakpoints, and investigates without human prompting
- ✓ **Real DAP Backends**: Uses production debuggers (debugpy, vscode-js-debug, Delve, CodeLLDB), not mocks or interpreters
- ✓ **Expanded Locals**: Inspects full object trees, compares expected vs actual values
- ✓ **Multi-Language**: Same autonomous debugging across Python, JavaScript/TypeScript, Go, and Rust

This isn't "AI explains stack traces" or "human-directed debugging" — it's **autonomous runtime investigation**.

**Claude debugs itself. No human intervention required.**

## Language Support

Fully functional with real debugger backends:

- **Python** — debugpy
- **JavaScript / TypeScript** — vscode-js-debug
- **Go** — Delve
- **Rust** — CodeLLDB

Debug adapters auto-install on first use.

## How It Works

```
Claude Code → MCP Protocol → mcp-debugger → DAP → Runtime Debugger
                                                    ↓
                                              Your Program (paused)
```

1. Claude detects something might be wrong (test failure, unexpected behavior, etc.)
2. Claude autonomously decides to debug instead of guessing
3. Breakpoints are set, program runs
4. Claude inspects locals, compares expected vs actual values
5. Claude identifies the discrepancy and fixes the bug

**Fully autonomous** — Claude invokes debugging tools on its own when investigating issues.

## Installation

In Claude Code:

1. Use `/plugin` to open the plugin manager
2. Add the registry: `bherbruck/mcp-debugger`
3. Install the `mcp-debugger` plugin

That's it. Claude autonomously uses it when investigating issues — no commands needed.

**Optional**: Add to your `CLAUDE.md` to encourage autonomous debugging over print statements:

```markdown
## Debugging

Use the mcp-debugger plugin for debugging instead of adding print/log statements.
Set breakpoints and inspect variables using real debuggers.
```

**Requirements**: Language runtimes for what you want to debug (Python 3.7+, Node.js 18+, Go 1.18+, Rust). Debug adapters install automatically on first use.

## Concrete Example

**Scenario**: A test fails. Expected return value, got None instead.

**Claude** (autonomously): *Test failure detected. Instead of guessing or adding logs, I'll debug this to see what's actually happening at runtime.*

```
[Claude creates debug session, sets breakpoint at process_orders(), runs code]

Paused at line 47 in process_orders()

Stack frame:
  process_orders() → validate_items() → calculate_total()

Expanded locals at breakpoint:
  orders = [
    Order(id=1, items=[...], total=150.00, status='pending'),
    Order(id=2, items=[], total=0.00, status='pending'),  ← suspicious
    Order(id=3, items=[...], total=200.00, status='pending')
  ]
  valid_orders = []

[Claude steps into validate_items(), inspects]

Found it: Order #2 has an empty items list. The function returns None
when items is empty instead of raising an exception or returning an
empty result.

The bug is in line 52 — it returns early without a value when
len(order.items) == 0.

[Claude fixes the bug to return an empty result instead of None]
```

**Claude found and fixed this autonomously.** No log statements added. No human debugging. Just runtime inspection, expected vs actual comparison, and a fix.

## Who This Is For

- **Autonomous coding agents** that need to debug themselves without human intervention
- **Developers who want agents to investigate and fix bugs independently**
- **Anyone building with AI agents** who's tired of log-based debugging cycles

This is agent-first debugging. **Claude investigates, debugs, and fixes autonomously.**

## Scope & Safety

**Intended for**: Local development and debugging environments
**Not intended for**: Production runtime debugging (yet)
**Agent capabilities**: Inspect state, set breakpoints, evaluate expressions
**Agent limitations**: Cannot modify code through the debugger

MCP Debugger gives agents read-only runtime inspection. It's designed for dev environments where pausing execution is safe.

**Known limitations**: Rust multithreaded debugging behaves like a regular VS Code debugger — cross-thread symbol resolution can be limited. This is a CodeLLDB/DAP limitation, not specific to MCP Debugger.

## Available Tools

Claude has access to these debugging capabilities (invoked automatically):

**Session Management**: `create_debug_session`, `start_debugging`, `terminate_session`, `list_sessions`
**Breakpoints**: `set_breakpoint`, `remove_breakpoint`, `list_breakpoints`
**Execution Control**: `continue`, `pause`, `step_in`, `step_over`, `step_out`
**Inspection**: `get_stack_trace`, `get_variables`, `expand_variable`, `evaluate_expression`, `get_source_context`

You don't call these directly — Claude chooses when to use them.

## Development & Architecture

**Build**: `npm install && npm run build`
**Test**: `npm test`
**Watch**: `npm run dev`

Architecture layers:
1. **MCP Server** (`src/server.ts`) — Routes tool calls from Claude Code to handlers
2. **Session Manager** (`src/session/`) — Manages debug session lifecycle and state machine
3. **DAP Client** (`src/dap/`) — Implements Debug Adapter Protocol, handles message parsing
4. **Adapters** (`src/adapters/`) — Language-specific debugger implementations (Python, JS/TS, Go, Rust)

See [CLAUDE.md](CLAUDE.md) for detailed architecture notes.

## License

MIT
