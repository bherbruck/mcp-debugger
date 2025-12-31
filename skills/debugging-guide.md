---
name: debugging-guide
description: Comprehensive guide to using the MCP debugger for debugging Python, JavaScript, TypeScript, Go, and Rust code. Provides patterns, strategies, and best practices for effective debugging.
---

# MCP Debugger Guide

## IMPORTANT: The tools are already available

The MCP debugger tools are ALREADY AVAILABLE to you. Do NOT:
- Search for .mcp.json files
- Look in ~/.claude/ for configuration
- Use Glob/Grep/Search to find "how to use" the debugger
- Read config files to understand the tools

Just CALL THE TOOLS DIRECTLY. They work. Start with `create_debug_session(language)`.

---

A comprehensive guide to debugging code with the MCP debugger.

## Quick Start

### Python
```
1. create_debug_session(language="python")
2. set_breakpoint(sessionId, file="/path/to/script.py", line=10)
3. start_debugging(sessionId, scriptPath="/path/to/script.py")
4. [Program pauses at line 10]
5. get_variables(sessionId) → see local variables
6. step_over(sessionId) → go to next line
```

### JavaScript/TypeScript
```
1. create_debug_session(language="javascript")
2. set_breakpoint(sessionId, file="/path/to/app.js", line=25)
3. start_debugging(sessionId, scriptPath="/path/to/app.js")
```

### Go
```
1. create_debug_session(language="go")
2. set_breakpoint(sessionId, file="/path/to/main.go", line=15)
3. start_debugging(sessionId, scriptPath="/path/to/main.go")
```

### Rust
```
1. create_debug_session(language="rust")
2. set_breakpoint(sessionId, file="/path/to/main.rs", line=20)
3. start_debugging(sessionId, scriptPath="/path/to/project")
```

## Core Debugging Patterns

### Pattern 1: Finding Where a Value Goes Wrong
1. Set breakpoint before the suspected mutation
2. Use `step_over` to advance line by line
3. Check `get_variables` after each step
4. When value changes unexpectedly, you found the bug

### Pattern 2: Understanding Function Behavior
1. Set breakpoint at function entry
2. Check arguments with `get_variables`
3. Step through the logic
4. Evaluate return value before return

### Pattern 3: Debugging Loops
1. Set conditional breakpoint: `set_breakpoint(sessionId, file, line, condition="i == 100")`
2. Check loop state when condition triggers
3. Verify accumulator values
4. Check exit conditions

### Pattern 4: Inspecting Complex Objects
1. `get_variables` returns `variablesReference` for objects
2. Use `expand_variable(sessionId, variablesReference)` to see properties
3. Keep expanding to drill into nested structures

### Pattern 5: Testing Hypotheses
Use `evaluate_expression` to test ideas without modifying code:
```
evaluate_expression(sessionId, "len(items)")
evaluate_expression(sessionId, "user.permissions.includes('admin')")
evaluate_expression(sessionId, "x * 2 + y")
```

## Conditional Breakpoints

Set breakpoints that only trigger under specific conditions:

### Value Conditions
```
set_breakpoint(sessionId, file, line, condition="x > 10")
set_breakpoint(sessionId, file, line, condition="name == 'error'")
set_breakpoint(sessionId, file, line, condition="items.length > 100")
```

### Hit Count Conditions
```
set_breakpoint(sessionId, file, line, hitCondition=">5")  # After 5 hits
set_breakpoint(sessionId, file, line, hitCondition="==10") # Exactly 10th hit
```

## Stepping Strategies

### When to Use Each Step Type

| Step Type | Use When |
|-----------|----------|
| `step_over` | You want to execute the line without entering functions |
| `step_in` | You want to see what happens inside a function call |
| `step_out` | You're done with the current function and want to return |
| `continue` | You want to run until the next breakpoint |

### Efficient Stepping
1. Set a breakpoint past repetitive code
2. Use `continue` to skip to it
3. Then step through the important parts

## Variable Inspection

### Getting All Variables
```
get_variables(sessionId)                    # All scopes
get_variables(sessionId, scope="local")     # Just local variables
get_variables(sessionId, scope="global")    # Just globals
```

### Inspecting Specific Frames
```
get_stack_trace(sessionId)                  # Get frame IDs
get_variables(sessionId, frameId=2)         # Variables in frame 2
```

### Expanding Objects
```
variables = get_variables(sessionId)
# If variable has variablesReference > 0:
children = expand_variable(sessionId, variablesReference)
```

## Language-Specific Notes

### Python
- **Debugger**: debugpy (auto-installed via pip)
- **Virtual Environments**: Specify `executablePath` in create_debug_session
- **Async**: Full async/await debugging support
- **Jupyter**: Not directly supported (use script files)

### JavaScript/TypeScript
- **Debugger**: vscode-js-debug (auto-installed)
- **Node.js**: Full Node.js debugging
- **TypeScript**: Automatically handles source maps
- **ESM**: Supports ES modules

### Go
- **Debugger**: Delve (dlv, auto-installed via go install)
- **Optimization**: Builds with `-gcflags="all=-N -l"` for debugging
- **Goroutines**: Full goroutine inspection
- **CGO**: Supported

### Rust
- **Debugger**: CodeLLDB (auto-installed)
- **Cargo**: Automatically builds debug targets
- **LLDB**: Full LLDB features available
- **Pretty Printing**: Standard library types displayed nicely

## Troubleshooting

### Breakpoint Not Hitting
1. Check file path is correct (use absolute paths)
2. Verify line number has executable code
3. Ensure program execution reaches that code path
4. Check if breakpoint is verified (`verified: true`)

### Variables Not Showing
1. Ensure program is paused (not running)
2. Check you're in the right stack frame
3. Some variables may be optimized out

### Adapter Not Starting
1. Check language runtime is installed (Python, Node.js, Go, Rust)
2. Verify PATH includes the runtime
3. Try specifying `executablePath` explicitly

### Session Errors
1. Check `list_sessions()` for session state
2. Terminate stuck sessions with `terminate_session`
3. Create a fresh session

### Multithreaded/Async App Issues
Debugging heavily multithreaded apps (tokio, mio, epoll) can be unstable:

**Symptoms:**
- `Invalid frame reference` errors
- `sbframe object is not valid`
- `Invalid thread_id` errors
- Session dies unexpectedly

**Solutions:**
1. **Run single-threaded for debugging** (most reliable):
   ```rust
   // Temporarily use single-threaded runtime
   #[tokio::main(flavor = "current_thread")]
   ```
   Or set thread count to 1 via config/env var if your app supports it.

2. **Set breakpoints in sync code** - not hot async handlers

3. **Always call `get_stack_trace` first** - before `get_variables` or `evaluate_expression`

4. **Add a debug sleep** in the handler to stabilize:
   ```rust
   std::thread::sleep(std::time::Duration::from_millis(100));
   ```

5. **Use conditional breakpoints** to reduce how often breakpoints fire

This is a limitation of debugging async/threaded code, not specific to mcp-debugger.

## Best Practices

1. **Set Strategic Breakpoints**: Place them just before where you expect issues
2. **Use Conditional Breakpoints**: Skip uninteresting iterations
3. **Evaluate Before Modifying**: Test fixes with `evaluate_expression` first
4. **Clean Up Sessions**: Always terminate when done
5. **Read the Stack**: The call stack tells you how you got here
6. **Compare Expected vs Actual**: The gap reveals the bug

## Debugging Servers and Long-Running Programs

When debugging servers (HTTP, MQTT, WebSocket, etc.) that wait for connections:

1. Start the server under debugger with breakpoints set
2. **Use Bash to trigger the breakpoint yourself** - don't ask the user to do it
3. Then check the debugger state

Example for an HTTP server:
```
1. start_debugging(sessionId, "/path/to/server")  → server running
2. Bash("curl http://localhost:8080/api/endpoint")  → triggers breakpoint
3. get_stack_trace(sessionId)  → now paused at handler
4. get_variables(sessionId)  → inspect the request
```

The debugger does NOT block other tools. You can run Bash commands while the program is running.
