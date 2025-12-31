---
name: breakpoint
description: Manage breakpoints in a debug session
arguments:
  - name: action
    description: "Action to perform: add, remove, or list"
    required: true
  - name: file
    description: File path (for add/remove)
    required: false
  - name: line
    description: Line number (for add/remove)
    required: false
  - name: condition
    description: Conditional expression (for add)
    required: false
---

# Breakpoint Management

Managing breakpoints: **$ARGUMENTS.action**

## Actions

### Add a Breakpoint
If action is "add":
1. Ensure there's an active debug session
2. Use `set_breakpoint` with the file and line
3. If a condition was provided, include it as a conditional breakpoint
4. Report whether the breakpoint was verified

### Remove a Breakpoint
If action is "remove":
1. Use `remove_breakpoint` with the file and line
2. Confirm removal

### List All Breakpoints
If action is "list":
1. Use `list_breakpoints` to get all breakpoints
2. Display them in a clear table format:
   - File path
   - Line number
   - Verified status
   - Condition (if any)

## Conditional Breakpoints

You can add conditions that must be true for the breakpoint to trigger:
- `x > 10` - Break when x exceeds 10
- `name == "error"` - Break when name equals "error"
- `items.length > 100` - Break when list is large

## Hit Count Conditions

Use hitCondition to break after a certain number of hits:
- `>5` - Break after more than 5 hits
- `==10` - Break on exactly the 10th hit
