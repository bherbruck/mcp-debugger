---
name: step
description: Step through code in a debug session
arguments:
  - name: direction
    description: "Step direction: in, over, or out"
    required: true
---

# Step Through Code

Stepping **$ARGUMENTS.direction** in the current debug session.

## Step Directions

### step in
Use `step_in` to:
- Enter the next function call
- Go into library code if needed
- Useful when you want to understand what a function does

### step over
Use `step_over` to:
- Execute the current line completely
- Move to the next line without entering function calls
- Most common stepping action

### step out
Use `step_out` to:
- Complete the current function
- Return to the caller
- Useful when you've seen enough of the current function

## After Each Step

1. Use `get_source_context` to show where we are now
2. Use `get_variables` to see current variable values
3. Highlight any changes from the previous state
4. Explain what just happened

## Continue Execution

If you want to run until the next breakpoint instead of stepping:
- Use `continue` to resume normal execution
- Use `pause` to interrupt running code
