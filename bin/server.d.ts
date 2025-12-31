/**
 * MCP Debug Server
 *
 * Exposes debugging capabilities as MCP tools for Claude Code.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import './adapters/index.js';
/**
 * Create and configure the MCP server
 */
export declare function createServer(): Server;
/**
 * Start the MCP server
 */
export declare function startServer(): Promise<void>;
//# sourceMappingURL=server.d.ts.map