# MCP Debugger

A multi-language debugging plugin for Claude Code using the Debug Adapter Protocol (DAP). Debug JavaScript/TypeScript, Python, Go, and Rust with real breakpoints, stepping, and variable inspection.

## Features

- **Real Debugging**: Uses actual debuggers (debugpy, vscode-js-debug, Delve, CodeLLDB)
- **Multi-Language**: Python, JavaScript/TypeScript, Go, and Rust
- **Auto-Install**: Debug adapters are automatically installed on first use
- **Full Control**: Breakpoints, stepping (in/over/out), continue, pause
- **Variable Inspection**: View variables, expand objects, evaluate expressions
- **Stack Traces**: Full call stack navigation

## Installation

### As a Claude Code Plugin

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-debugger.git
cd mcp-debugger

# Install dependencies and build
npm install
npm run build

# Use with Claude Code
claude --plugin-dir /path/to/mcp-debugger
```

### Requirements

- Node.js 18+
- Language runtimes for the languages you want to debug:
  - **Python**: Python 3.7+ (debugpy will be auto-installed)
  - **JavaScript/TypeScript**: Node.js 18+
  - **Go**: Go 1.18+ (Delve will be auto-installed)
  - **Rust**: Rust/Cargo (CodeLLDB will be auto-installed)

## Usage

### Commands

- `/mcp-debugger:debug <file>` - Start debugging a file
- `/mcp-debugger:breakpoint add|remove|list` - Manage breakpoints
- `/mcp-debugger:step in|over|out` - Step through code

### MCP Tools

The plugin exposes these tools:

#### Session Management
- `create_debug_session` - Create a debug session for a language
- `start_debugging` - Start debugging a script
- `terminate_session` - End a debug session
- `list_sessions` - List active sessions

#### Breakpoints
- `set_breakpoint` - Set a breakpoint at a line
- `remove_breakpoint` - Remove a breakpoint
- `list_breakpoints` - List all breakpoints

#### Execution Control
- `continue` - Continue execution
- `pause` - Pause execution
- `step_in` - Step into a function
- `step_over` - Step over to next line
- `step_out` - Step out of current function

#### Inspection
- `get_stack_trace` - Get the call stack
- `get_variables` - Get variables in scope
- `expand_variable` - Expand a complex variable
- `evaluate_expression` - Evaluate an expression
- `get_source_context` - Get source code around current location

## Example Session

```
User: Debug this Python script and check what happens at line 15

Claude: I'll create a debug session and set a breakpoint at line 15.

[Creates session, sets breakpoint, starts debugging]

The program has stopped at line 15. Here's the current state:

Source context:
  13 |     for item in items:
  14 |         total += item.value
> 15 |         if total > 100:
  16 |             break

Local variables:
- items: [<Item>, <Item>, <Item>] (3 items)
- total: 87
- item: <Item object at 0x...>

The loop is processing items and total is currently 87.
Would you like me to step to the next line or continue?
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

## Architecture

```
src/
├── index.ts              # Entry point
├── server.ts             # MCP server with tool definitions
├── dap/
│   ├── dap-client.ts     # DAP protocol client
│   └── message-parser.ts # Content-Length message parser
├── session/
│   ├── types.ts          # Type definitions
│   └── session-manager.ts # Session lifecycle management
└── adapters/
    ├── adapter-registry.ts # Adapter factory
    ├── python/            # Python (debugpy)
    ├── javascript/        # JS/TS (vscode-js-debug)
    ├── go/                # Go (Delve)
    └── rust/              # Rust (CodeLLDB)
```

## License

MIT
