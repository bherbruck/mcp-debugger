---
name: debug
description: Start a debugging session for a file with real breakpoints and stepping
arguments:
  - name: file
    description: Path to the file to debug
    required: true
  - name: line
    description: Optional line number for initial breakpoint
    required: false
---

# Debug Session

The MCP debugger tools are ALREADY AVAILABLE. Do NOT search for .mcp.json or config files. Just call the tools directly.

I'll help you debug `$ARGUMENTS.file` using the MCP debugger.

## Instructions

1. **Detect Language**: First, determine the programming language from the file extension:
   - `.py` → Python (uses debugpy)
   - `.js`, `.ts`, `.mjs`, `.tsx` → JavaScript/TypeScript (uses vscode-js-debug)
   - `.go` → Go (uses Delve)
   - `.rs` → Rust (uses CodeLLDB)

2. **Create Session**: Use `create_debug_session` with the detected language

3. **Set Breakpoints**: If a line number was provided, use `set_breakpoint` to add an initial breakpoint. Otherwise, suggest strategic breakpoints based on the code.

4. **Start Debugging**: Use `start_debugging` with the script path

5. **When Stopped**: When the program pauses at a breakpoint:
   - Use `get_source_context` to show the code around current location
   - Use `get_variables` to display local variables
   - Use `get_stack_trace` to show the call stack
   - Explain what the code is doing at this point

6. **Interactive Debugging**:
   - Ask if the user wants to step (in/over/out), continue, or inspect something
   - Use `evaluate_expression` to test hypotheses about variable values
   - Use `expand_variable` to drill into complex objects

7. **Cleanup**: When done, use `terminate_session` to clean up

## Tips

- Set breakpoints before where you expect the issue to occur
- Compare expected vs actual variable values
- Watch for null/undefined values or unexpected types
- Check loop counters and array indices
