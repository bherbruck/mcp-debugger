#!/usr/bin/env node

/**
 * MCP Debugger Entry Point
 *
 * A multi-language debugger for Claude Code using the Debug Adapter Protocol.
 */

// Catch any uncaught errors before they silently kill the process
process.on('uncaughtException', (error) => {
  process.stderr.write(`[mcp-debugger] Uncaught exception: ${error.message}\n${error.stack}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`[mcp-debugger] Unhandled rejection: ${reason}\n`);
  process.exit(1);
});

// Use dynamic import to catch module loading errors
async function main() {
  try {
    const { startServer } = await import('./server.js');
    await startServer();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    process.stderr.write(`[mcp-debugger] Failed to start: ${message}\n${stack}\n`);
    process.exit(1);
  }
}

main();
