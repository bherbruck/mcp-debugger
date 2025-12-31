# MCP Debugger

**A Claude Code plugin that lets coding agents pause running programs, step through execution, and inspect expanded local variables via real debuggers — fully autonomous, no log statements required.**

This is a **game changer** for AI-assisted development. Claude decides when to debug, sets breakpoints, and inspects state without modifying your code. It works today.

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

- ✓ **Agent-Driven**: Claude decides when to set breakpoints and inspect variables — you just ask questions
- ✓ **Real DAP Backends**: Uses production debuggers (debugpy, vscode-js-debug, Delve, CodeLLDB), not mocks or interpreters
- ✓ **Expanded Locals**: Inspects full object trees, not just stack frames
- ✓ **Multi-Language**: Same debugging mental model across Python, JavaScript/TypeScript, Go, and Rust

This isn't "AI explains stack traces" or "print-debugging helpers" — it's **autonomous runtime inspection**.

**This fundamentally changes how agents debug code.**

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

1. You ask Claude a question about your code's behavior
2. Claude decides to debug instead of guessing
3. Breakpoints are set, program runs
4. Claude inspects locals and stack on-demand
5. You get answers based on actual runtime state

No user commands required — Claude invokes debugging tools automatically when needed.

## Installation

In Claude Code:

1. Use `/plugin` to open the plugin manager
2. Add the registry: `bherbruck/mcp-debugger`
3. Install the `mcp-debugger` plugin

That's it. Claude uses it automatically when debugging would help.

**Optional**: Add to your `CLAUDE.md` to make Claude prefer debugging over print statements:

```markdown
## Debugging

Use the mcp-debugger plugin for debugging instead of adding print/log statements.
Set breakpoints and inspect variables using real debuggers.
```

**Requirements**: Language runtimes for what you want to debug (Python 3.7+, Node.js 18+, Go 1.18+, Rust). Debug adapters install automatically on first use.

## Concrete Example

**You**: "Why is `process_orders()` returning None sometimes?"

**Claude** (thinking): *Instead of asking the user to add print statements, I'll set a breakpoint and inspect the actual state.*

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
```

**Claude knows this without you adding a single log statement.** It paused execution, expanded the `orders` list, and inspected the invariant break in real time.

## Who This Is For

- **Autonomous coding agents** that need to debug without human hand-holding
- **Humans supervising agents** who want Claude to investigate issues independently
- **Anyone tired of debug logs** and the stop-edit-log-rerun loop

This is agent-first debugging. You ask questions, Claude debugs.

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
