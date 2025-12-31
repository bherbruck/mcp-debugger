#!/usr/bin/env node

/**
 * MCP Debugger Entry Point
 *
 * A multi-language debugger for Claude Code using the Debug Adapter Protocol.
 */

import { startServer } from './server.js';

// Start the MCP server
startServer().catch((error) => {
  console.error('Failed to start MCP debugger server:', error);
  process.exit(1);
});
