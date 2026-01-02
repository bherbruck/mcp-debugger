/**
 * MCP Debug Server
 *
 * Exposes debugging capabilities as MCP tools for Claude Code.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { sessionManager } from './session/session-manager.js';
import { DebugLanguage, SessionState } from './session/types.js';
import { adapterRegistry } from './adapters/index.js';

// Import adapters to register them
import './adapters/index.js';

/**
 * Tool definitions
 */
const tools: Tool[] = [
  // Session Management
  {
    name: 'create_debug_session',
    description:
      'Create a new debug session for a specific programming language. Returns a session ID to use with other tools.',
    inputSchema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['javascript', 'typescript', 'python', 'go', 'rust'],
          description: 'Programming language to debug'
        },
        name: {
          type: 'string',
          description: 'Optional human-readable name for the session'
        },
        executablePath: {
          type: 'string',
          description:
            'Optional path to the language runtime (e.g., /usr/bin/python3)'
        }
      },
      required: ['language']
    }
  },
  {
    name: 'start_debugging',
    description:
      'Start debugging a script file. The program will run until it hits a breakpoint or completes.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID from create_debug_session'
        },
        scriptPath: {
          type: 'string',
          description: 'Absolute path to the script file to debug'
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Command line arguments for the script'
        },
        cwd: {
          type: 'string',
          description: 'Working directory for script execution'
        },
        env: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Environment variables'
        },
        stopOnEntry: {
          type: 'boolean',
          description: 'Pause at the first line of code'
        }
      },
      required: ['sessionId', 'scriptPath']
    }
  },
  {
    name: 'terminate_session',
    description: 'Terminate a debug session and clean up resources',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'list_sessions',
    description: 'List all active debug sessions',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  // Breakpoints
  {
    name: 'set_breakpoint',
    description: 'Set a breakpoint at a specific line in a source file. Use dumpFile to create a tracepoint that dumps variables to a file and auto-continues.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        },
        file: {
          type: 'string',
          description: 'Absolute path to the source file'
        },
        line: {
          type: 'number',
          description: 'Line number (1-based)'
        },
        condition: {
          type: 'string',
          description: 'Optional conditional expression (breakpoint only triggers when true)'
        },
        hitCondition: {
          type: 'string',
          description: 'Optional hit count condition (e.g., ">5", "==10")'
        },
        trace: {
          type: 'boolean',
          description: 'Enable tracepoint mode: collect variables to session state and auto-continue'
        },
        dumpFile: {
          type: 'string',
          description: 'Also dump variables to this file (JSONL format). Implies trace=true.'
        },
        maxDumps: {
          type: 'number',
          description: 'Max number of traces before stopping at this breakpoint. Default: unlimited.'
        }
      },
      required: ['sessionId', 'file', 'line']
    }
  },
  {
    name: 'get_traces',
    description: 'Get collected traces from tracepoints. Traces are stored in session state and can be queried with filtering and pagination.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        },
        file: {
          type: 'string',
          description: 'Filter by file path (partial match supported)'
        },
        line: {
          type: 'number',
          description: 'Filter by line number'
        },
        function: {
          type: 'string',
          description: 'Filter by function name (partial match)'
        },
        limit: {
          type: 'number',
          description: 'Max number of traces to return (default: 100)'
        },
        offset: {
          type: 'number',
          description: 'Number of traces to skip (for pagination)'
        }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'clear_traces',
    description: 'Clear all collected traces from the session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'remove_breakpoint',
    description: 'Remove a breakpoint from a source file',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        },
        file: {
          type: 'string',
          description: 'Absolute path to the source file'
        },
        line: {
          type: 'number',
          description: 'Line number of the breakpoint to remove'
        }
      },
      required: ['sessionId', 'file', 'line']
    }
  },
  {
    name: 'list_breakpoints',
    description: 'List all breakpoints in the session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        }
      },
      required: ['sessionId']
    }
  },

  // Execution Control
  {
    name: 'continue',
    description: 'Continue execution until the next breakpoint or program end. Use waitForBreakpoint to block until a breakpoint is hit and return variables. Use collectHits to run through multiple breakpoint hits, collecting variables at each, then return all traces.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        },
        threadId: {
          type: 'number',
          description: 'Optional thread ID (defaults to current thread)'
        },
        waitForBreakpoint: {
          type: 'boolean',
          description: 'Wait for breakpoint hit and return variables (default: false)'
        },
        timeout: {
          type: 'number',
          description: 'Timeout in ms when waiting for breakpoint (default: 30000)'
        },
        collectHits: {
          type: 'number',
          description: 'Collect this many breakpoint hits before returning. At each hit, variables are captured and execution auto-continues. Returns all traces when done.'
        }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'pause',
    description: 'Pause program execution',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        },
        threadId: {
          type: 'number',
          description: 'Optional thread ID'
        }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'step_in',
    description: 'Step into the next function call',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        },
        threadId: {
          type: 'number',
          description: 'Optional thread ID'
        }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'step_over',
    description: 'Step over to the next line (execute function calls without entering)',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        },
        threadId: {
          type: 'number',
          description: 'Optional thread ID'
        }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'step_out',
    description: 'Step out of the current function',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        },
        threadId: {
          type: 'number',
          description: 'Optional thread ID'
        }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'step_and_trace',
    description: 'Step through code N times, collecting variables at each step. Returns all traces or writes to a file. Useful for tracing execution flow.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        },
        count: {
          type: 'number',
          description: 'Number of steps to take (default: 100)'
        },
        timeout: {
          type: 'number',
          description: 'Maximum time in ms (default: 30000)'
        },
        stepType: {
          type: 'string',
          enum: ['in', 'over', 'out'],
          description: 'Type of step: in (step into functions), over (step over), out (step out). Default: over'
        },
        dumpFile: {
          type: 'string',
          description: 'If set, write traces to this file (JSONL format) instead of returning in response'
        }
      },
      required: ['sessionId']
    }
  },

  // Inspection
  {
    name: 'get_stack_trace',
    description: 'Get the current call stack',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        },
        threadId: {
          type: 'number',
          description: 'Optional thread ID'
        }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'get_variables',
    description: 'Get variables in the current scope',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        },
        frameId: {
          type: 'number',
          description: 'Optional stack frame ID (defaults to top frame)'
        },
        scope: {
          type: 'string',
          enum: ['local', 'global', 'closure'],
          description: 'Optional scope filter'
        }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'expand_variable',
    description: 'Expand a complex variable to see its properties/children',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        },
        variablesReference: {
          type: 'number',
          description: 'Variables reference from get_variables result'
        }
      },
      required: ['sessionId', 'variablesReference']
    }
  },
  {
    name: 'evaluate_expression',
    description: 'Evaluate an expression in the current context',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        },
        expression: {
          type: 'string',
          description: 'Expression to evaluate'
        },
        frameId: {
          type: 'number',
          description: 'Optional stack frame ID for context'
        },
        context: {
          type: 'string',
          enum: ['watch', 'repl', 'hover'],
          description: 'Evaluation context'
        }
      },
      required: ['sessionId', 'expression']
    }
  },
  {
    name: 'get_source_context',
    description: 'Get source code around the current execution point',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        },
        file: {
          type: 'string',
          description: 'Optional source file path'
        },
        line: {
          type: 'number',
          description: 'Optional center line number'
        },
        linesContext: {
          type: 'number',
          description: 'Lines of context above and below (default 5)'
        }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'get_threads',
    description: 'Get all threads in the debugged program',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Debug session ID'
        }
      },
      required: ['sessionId']
    }
  }
];

/**
 * Create and configure the MCP server
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: 'mcp-debugger',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools
  }));

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handleToolCall(name, args ?? {});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: message }, null, 2)
          }
        ],
        isError: true
      };
    }
  });

  return server;
}

/**
 * Handle a tool call
 */
async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    // Session Management
    case 'create_debug_session': {
      const language = args.language as string;
      const sessionName = args.name as string | undefined;
      const executablePath = args.executablePath as string | undefined;

      const session = await sessionManager.createSession({
        language: language as DebugLanguage,
        name: sessionName,
        executablePath
      });

      return {
        sessionId: session.id,
        name: session.name,
        language: session.language,
        state: session.state
      };
    }

    case 'start_debugging': {
      const sessionId = args.sessionId as string;
      const scriptPath = args.scriptPath as string;
      const scriptArgs = args.args as string[] | undefined;
      const cwd = args.cwd as string | undefined;
      const env = args.env as Record<string, string> | undefined;
      const stopOnEntry = args.stopOnEntry as boolean | undefined;

      return sessionManager.startDebugging(sessionId, {
        scriptPath,
        args: scriptArgs,
        cwd,
        env,
        stopOnEntry
      });
    }

    case 'terminate_session': {
      const sessionId = args.sessionId as string;
      return sessionManager.terminateSession(sessionId);
    }

    case 'list_sessions': {
      const sessions = sessionManager.listSessions();
      return {
        sessions: sessions.map((s) => ({
          sessionId: s.id,
          name: s.name,
          language: s.language,
          state: s.state,
          scriptPath: s.scriptPath
        }))
      };
    }

    // Breakpoints
    case 'set_breakpoint': {
      const sessionId = args.sessionId as string;
      const file = args.file as string;
      const line = args.line as number;
      const condition = args.condition as string | undefined;
      const hitCondition = args.hitCondition as string | undefined;
      const trace = args.trace as boolean | undefined;
      const dumpFile = args.dumpFile as string | undefined;
      const maxDumps = args.maxDumps as number | undefined;

      return sessionManager.setBreakpoint(sessionId, {
        file,
        line,
        condition,
        hitCondition,
        trace,
        dumpFile,
        maxDumps
      });
    }

    case 'get_traces': {
      const sessionId = args.sessionId as string;
      const file = args.file as string | undefined;
      const line = args.line as number | undefined;
      const func = args.function as string | undefined;
      const limit = args.limit as number | undefined;
      const offset = args.offset as number | undefined;

      return sessionManager.getTraces(sessionId, { file, line, function: func, limit, offset });
    }

    case 'clear_traces': {
      const sessionId = args.sessionId as string;
      return sessionManager.clearTraces(sessionId);
    }

    case 'remove_breakpoint': {
      const sessionId = args.sessionId as string;
      const file = args.file as string;
      const line = args.line as number;

      return sessionManager.removeBreakpoint(sessionId, file, line);
    }

    case 'list_breakpoints': {
      const sessionId = args.sessionId as string;
      const breakpoints = sessionManager.listBreakpoints(sessionId);
      return { breakpoints };
    }

    // Execution Control
    case 'continue': {
      const sessionId = args.sessionId as string;
      const threadId = args.threadId as number | undefined;
      const waitForBreakpoint = args.waitForBreakpoint as boolean | undefined;
      const timeout = args.timeout as number | undefined;
      const collectHits = args.collectHits as number | undefined;
      return sessionManager.continue(sessionId, threadId, { waitForBreakpoint, timeout, collectHits });
    }

    case 'pause': {
      const sessionId = args.sessionId as string;
      const threadId = args.threadId as number | undefined;
      return sessionManager.pause(sessionId, threadId);
    }

    case 'step_in': {
      const sessionId = args.sessionId as string;
      const threadId = args.threadId as number | undefined;
      return sessionManager.stepIn(sessionId, threadId);
    }

    case 'step_over': {
      const sessionId = args.sessionId as string;
      const threadId = args.threadId as number | undefined;
      return sessionManager.stepOver(sessionId, threadId);
    }

    case 'step_out': {
      const sessionId = args.sessionId as string;
      const threadId = args.threadId as number | undefined;
      return sessionManager.stepOut(sessionId, threadId);
    }

    case 'step_and_trace': {
      const sessionId = args.sessionId as string;
      const count = args.count as number | undefined;
      const timeout = args.timeout as number | undefined;
      const stepType = args.stepType as 'in' | 'over' | 'out' | undefined;
      const dumpFile = args.dumpFile as string | undefined;
      return sessionManager.stepAndTrace(sessionId, { count, timeout, stepType, dumpFile });
    }

    // Inspection
    case 'get_stack_trace': {
      const sessionId = args.sessionId as string;
      const threadId = args.threadId as number | undefined;
      const stackFrames = await sessionManager.getStackTrace(sessionId, threadId);
      return { stackFrames, count: stackFrames.length };
    }

    case 'get_variables': {
      const sessionId = args.sessionId as string;
      const frameId = args.frameId as number | undefined;
      const scope = args.scope as 'local' | 'global' | 'closure' | undefined;
      const variables = await sessionManager.getVariables(sessionId, frameId, scope);
      return { variables };
    }

    case 'expand_variable': {
      const sessionId = args.sessionId as string;
      const variablesReference = args.variablesReference as number;
      const variables = await sessionManager.expandVariable(
        sessionId,
        variablesReference
      );
      return { variables };
    }

    case 'evaluate_expression': {
      const sessionId = args.sessionId as string;
      const expression = args.expression as string;
      const frameId = args.frameId as number | undefined;
      const context = args.context as 'watch' | 'repl' | 'hover' | undefined;
      return sessionManager.evaluateExpression(
        sessionId,
        expression,
        frameId,
        context
      );
    }

    case 'get_source_context': {
      const sessionId = args.sessionId as string;
      const file = args.file as string | undefined;
      const line = args.line as number | undefined;
      const linesContext = args.linesContext as number | undefined;
      return sessionManager.getSourceContext(sessionId, file, line, linesContext);
    }

    case 'get_threads': {
      const sessionId = args.sessionId as string;
      const threads = await sessionManager.getThreads(sessionId);
      return { threads };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Start the MCP server
 */
export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  // Handle shutdown
  process.on('SIGINT', async () => {
    await sessionManager.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await sessionManager.shutdown();
    process.exit(0);
  });

  await server.connect(transport);
}
