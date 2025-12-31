/**
 * DAP Client
 *
 * A client for communicating with Debug Adapter Protocol servers.
 * Manages the adapter process, sends requests, and handles events.
 */

import { EventEmitter } from 'events';
import { ChildProcess, spawn, SpawnOptions } from 'child_process';
import { Socket, createConnection } from 'net';
import { DebugProtocol } from '@vscode/debugprotocol';
import { DapMessageParser, encodeMessage } from './message-parser.js';
import {
  BreakpointInfo,
  StackFrame,
  Variable,
  Scope,
  ThreadInfo,
  EvaluationResult,
  AdapterCapabilities,
  convertCapabilities,
  convertStackFrame,
  convertVariable,
  convertScope,
  convertBreakpoint
} from '../session/types.js';

/**
 * Configuration for starting a debug adapter
 */
export interface DapClientConfig {
  /** Command to launch the adapter */
  command: string;
  /** Arguments for the command */
  args: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Connection mode: 'stdio' (default) or 'tcp' */
  mode?: 'stdio' | 'tcp';
  /** For TCP mode: port to connect to (optional, will parse from stderr if not provided) */
  port?: number;
  /** For TCP mode: host to connect to (default: 127.0.0.1) */
  host?: string;
}

/**
 * Pending request tracking
 */
interface PendingRequest {
  resolve: (response: DebugProtocol.Response) => void;
  reject: (error: Error) => void;
  command: string;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Events emitted by the DAP client
 */
export interface DapClientEvents {
  initialized: () => void;
  stopped: (event: DebugProtocol.StoppedEvent) => void;
  continued: (event: DebugProtocol.ContinuedEvent) => void;
  exited: (event: DebugProtocol.ExitedEvent) => void;
  terminated: (event: DebugProtocol.TerminatedEvent) => void;
  output: (event: DebugProtocol.OutputEvent) => void;
  breakpoint: (event: DebugProtocol.BreakpointEvent) => void;
  thread: (event: DebugProtocol.ThreadEvent) => void;
  module: (event: DebugProtocol.ModuleEvent) => void;
  loadedSource: (event: DebugProtocol.LoadedSourceEvent) => void;
  process: (event: DebugProtocol.ProcessEvent) => void;
  capabilities: (event: DebugProtocol.CapabilitiesEvent) => void;
  error: (error: Error) => void;
  adapterExit: (code: number | null) => void;
}

/**
 * Child session for multi-session DAP support
 */
interface ChildSession {
  socket: Socket;
  parser: DapMessageParser;
  targetId: string;
  sequenceNumber: number;
  pendingRequests: Map<number, PendingRequest>;
}

export class DapClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private socket: Socket | null = null;
  private parser: DapMessageParser;
  private sequenceNumber: number = 1;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private capabilities: DebugProtocol.Capabilities | null = null;
  private isConnected: boolean = false;
  private defaultTimeout: number;
  private connectionMode: 'stdio' | 'tcp';

  // Multi-session support for vscode-js-debug
  private tcpPort: number = 0;
  private tcpHost: string = '127.0.0.1';
  private childSessions: Map<string, ChildSession> = new Map();
  private activeChildSession: ChildSession | null = null;

  constructor(private config: DapClientConfig) {
    super();
    this.parser = new DapMessageParser();
    this.defaultTimeout = config.timeout ?? 30000;
    this.connectionMode = config.mode ?? 'stdio';
  }

  /**
   * Start the debug adapter process
   */
  async start(): Promise<void> {
    if (this.isConnected) {
      throw new Error('DAP client is already started');
    }

    if (this.connectionMode === 'tcp') {
      await this.startTcp();
    } else {
      await this.startStdio();
    }
  }

  /**
   * Start in stdio mode (default)
   */
  private async startStdio(): Promise<void> {
    const spawnOptions: SpawnOptions = {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.config.env },
      cwd: this.config.cwd
    };

    this.process = spawn(this.config.command, this.config.args, spawnOptions);

    // Handle stdout (DAP messages)
    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleData(data);
    });

    // Handle stderr (adapter logging)
    this.process.stderr?.on('data', (data: Buffer) => {
      const output: DebugProtocol.OutputEvent = {
        seq: 0,
        type: 'event',
        event: 'output',
        body: {
          category: 'stderr',
          output: data.toString('utf8')
        }
      };
      this.emit('output', output);
    });

    // Handle process errors
    this.process.on('error', (error: Error) => {
      this.emit('error', new Error(`Failed to start debug adapter: ${error.message}`));
    });

    // Handle process exit
    this.process.on('exit', (code: number | null) => {
      this.isConnected = false;
      this.rejectAllPending(new Error(`Debug adapter exited with code ${code}`));
      this.emit('adapterExit', code);
    });

    this.isConnected = true;
  }

  /**
   * Start in TCP mode - spawn adapter and connect to its TCP port
   */
  private async startTcp(): Promise<void> {
    const spawnOptions: SpawnOptions = {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.config.env },
      cwd: this.config.cwd
    };

    this.process = spawn(this.config.command, this.config.args, spawnOptions);

    // Parse port from stderr output
    let port = this.config.port;
    const host = this.config.host ?? '127.0.0.1';

    if (!port) {
      // Wait for port output from adapter (check both stdout and stderr)
      port = await new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for adapter to output port'));
        }, 10000);

        const onData = (data: Buffer) => {
          const output = data.toString('utf8');
          // Look for port patterns from various adapters:
          // - Delve: "listening at: 127.0.0.1:PORT"
          // - vscode-js-debug: "Debug server listening at 127.0.0.1:PORT"
          const match = output.match(/listening at[:\s]+[^:]+:(\d+)/i);
          if (match) {
            clearTimeout(timeout);
            this.process?.stdout?.off('data', onData);
            this.process?.stderr?.off('data', onData);
            resolve(parseInt(match[1], 10));
          }
        };

        // Listen on both stdout and stderr (Delve uses stdout)
        this.process?.stdout?.on('data', onData);
        this.process?.stderr?.on('data', onData);

        this.process?.on('error', (error: Error) => {
          clearTimeout(timeout);
          reject(new Error(`Failed to start debug adapter: ${error.message}`));
        });

        this.process?.on('exit', (code: number | null) => {
          clearTimeout(timeout);
          reject(new Error(`Debug adapter exited with code ${code} before connection`));
        });
      });
    }

    // Connect to the adapter's TCP port
    const socket = await new Promise<Socket>((resolve, reject) => {
      const sock = createConnection({ host, port }, () => {
        resolve(sock);
      });

      sock.on('error', (error: Error) => {
        reject(new Error(`Failed to connect to debug adapter: ${error.message}`));
      });
    });

    this.socket = socket;
    this.tcpPort = port;
    this.tcpHost = host;

    // Handle incoming data
    socket.on('data', (data: Buffer) => {
      this.handleData(data);
    });

    // Handle socket close
    socket.on('close', () => {
      this.isConnected = false;
      this.rejectAllPending(new Error('Debug adapter connection closed'));
      this.emit('adapterExit', null);
    });

    // Handle socket errors (after connection)
    socket.on('error', (error: Error) => {
      this.emit('error', error);
    });

    // Handle process exit
    this.process.on('exit', (code: number | null) => {
      this.isConnected = false;
      this.socket?.destroy();
      this.rejectAllPending(new Error(`Debug adapter exited with code ${code}`));
      this.emit('adapterExit', code);
    });

    // Handle stderr for logging
    this.process.stderr?.on('data', (data: Buffer) => {
      const output: DebugProtocol.OutputEvent = {
        seq: 0,
        type: 'event',
        event: 'output',
        body: {
          category: 'stderr',
          output: data.toString('utf8')
        }
      };
      this.emit('output', output);
    });

    this.isConnected = true;
  }

  /**
   * Handle incoming data from the adapter
   */
  private handleData(data: Buffer): void {
    this.parser.append(data);

    const messages = this.parser.parseAll();
    for (const message of messages) {
      this.handleMessage(message);
    }
  }

  /**
   * Handle a parsed DAP message
   */
  private handleMessage(message: DebugProtocol.ProtocolMessage): void {
    switch (message.type) {
      case 'response':
        this.handleResponse(message as DebugProtocol.Response);
        break;
      case 'event':
        this.handleEvent(message as DebugProtocol.Event);
        break;
      case 'request':
        // Reverse requests from adapter (e.g., runInTerminal)
        this.handleReverseRequest(message as DebugProtocol.Request);
        break;
    }
  }

  /**
   * Handle a response to a previous request
   */
  private handleResponse(response: DebugProtocol.Response): void {
    const pending = this.pendingRequests.get(response.request_seq);
    if (!pending) {
      // Response to unknown request - might be stale
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.request_seq);

    if (response.success) {
      pending.resolve(response);
    } else {
      pending.reject(
        new Error(response.message || `Request '${pending.command}' failed`)
      );
    }
  }

  /**
   * Handle an event from the adapter
   */
  private handleEvent(event: DebugProtocol.Event): void {
    // Emit the generic 'event' for catch-all handlers
    this.emit('event', event);

    switch (event.event) {
      case 'initialized':
        this.emit('initialized');
        break;
      case 'stopped':
        this.emit('stopped', event as DebugProtocol.StoppedEvent);
        break;
      case 'continued':
        this.emit('continued', event as DebugProtocol.ContinuedEvent);
        break;
      case 'exited':
        this.emit('exited', event as DebugProtocol.ExitedEvent);
        break;
      case 'terminated':
        this.emit('terminated', event as DebugProtocol.TerminatedEvent);
        break;
      case 'output':
        this.emit('output', event as DebugProtocol.OutputEvent);
        break;
      case 'breakpoint':
        this.emit('breakpoint', event as DebugProtocol.BreakpointEvent);
        break;
      case 'thread':
        this.emit('thread', event as DebugProtocol.ThreadEvent);
        break;
      case 'module':
        this.emit('module', event as DebugProtocol.ModuleEvent);
        break;
      case 'loadedSource':
        this.emit('loadedSource', event as DebugProtocol.LoadedSourceEvent);
        break;
      case 'process':
        this.emit('process', event as DebugProtocol.ProcessEvent);
        break;
      case 'capabilities':
        this.emit('capabilities', event as DebugProtocol.CapabilitiesEvent);
        break;
      default:
        // Unknown event type - ignore
        break;
    }
  }

  /**
   * Handle a reverse request from the adapter
   */
  private handleReverseRequest(request: DebugProtocol.Request): void {
    // Handle specific reverse requests that adapters may send
    switch (request.command) {
      case 'startDebugging':
        // vscode-js-debug sends this to start debugging a target
        // We need to create a child session for this target
        this.handleStartDebugging(request);
        break;

      case 'runInTerminal':
        // Some adapters request terminal execution
        // We don't support this, but could in the future
        this.sendReverseResponse(request, false, 'runInTerminal is not supported');
        break;

      default:
        // Unknown reverse request
        this.sendReverseResponse(request, false, `Reverse request '${request.command}' is not supported`);
        break;
    }
  }

  /**
   * Handle startDebugging reverse request from vscode-js-debug
   * Creates a child session to handle the debug target
   */
  private async handleStartDebugging(request: DebugProtocol.Request): Promise<void> {
    const args = request.arguments as {
      request: string;
      configuration: {
        type: string;
        name: string;
        __pendingTargetId?: string;
      };
    };

    const targetId = args.configuration.__pendingTargetId;
    if (!targetId) {
      this.sendReverseResponse(request, false, 'Missing __pendingTargetId');
      return;
    }

    // For TCP mode, create a child session
    if (this.connectionMode === 'tcp' && this.tcpPort > 0) {
      try {
        await this.createChildSession(targetId, args.configuration);
        this.sendReverseResponse(request, true);
      } catch (error) {
        this.sendReverseResponse(request, false, `Failed to create child session: ${error}`);
      }
    } else {
      // For non-TCP mode, just acknowledge
      this.sendReverseResponse(request, true);
    }
  }

  /**
   * Create a child session for a debug target
   */
  private async createChildSession(
    targetId: string,
    configuration: Record<string, unknown>
  ): Promise<void> {
    // Connect to the same adapter port
    const socket = await new Promise<Socket>((resolve, reject) => {
      const sock = createConnection({ host: this.tcpHost, port: this.tcpPort }, () => {
        resolve(sock);
      });

      sock.on('error', (error: Error) => {
        reject(new Error(`Failed to connect child session: ${error.message}`));
      });

      // Timeout for connection
      const timer = setTimeout(() => reject(new Error('Child session connection timeout')), 5000);
      sock.once('connect', () => clearTimeout(timer));
    });

    const childSession: ChildSession = {
      socket,
      parser: new DapMessageParser(),
      targetId,
      sequenceNumber: 1,
      pendingRequests: new Map()
    };

    // Handle incoming data from child session
    socket.on('data', (data: Buffer) => {
      this.handleChildData(childSession, data);
    });

    socket.on('close', () => {
      this.childSessions.delete(targetId);
      if (this.activeChildSession === childSession) {
        this.activeChildSession = null;
      }
    });

    socket.on('error', (error: Error) => {
      this.emit('error', error);
    });

    this.childSessions.set(targetId, childSession);
    this.activeChildSession = childSession;

    // Initialize the child session
    await this.initializeChildSession(childSession, configuration);
  }

  /**
   * Initialize a child session with the target configuration
   */
  private async initializeChildSession(
    session: ChildSession,
    configuration: Record<string, unknown>
  ): Promise<void> {
    // Debug logging
    this.emit('output', {
      seq: 0,
      type: 'event',
      event: 'output',
      body: { category: 'console', output: `[Child Session] Initializing for target ${session.targetId}\n` }
    } as DebugProtocol.OutputEvent);

    // Send initialize request
    const initRequest: DebugProtocol.InitializeRequest = {
      seq: session.sequenceNumber++,
      type: 'request',
      command: 'initialize',
      arguments: {
        clientID: 'mcp-debugger-child',
        clientName: 'MCP Debugger Child Session',
        adapterID: (configuration.type as string) || 'pwa-node',
        linesStartAt1: true,
        columnsStartAt1: true,
        pathFormat: 'path',
        supportsVariableType: true,
        supportsVariablePaging: true,
        supportsRunInTerminalRequest: false,
        supportsStartDebuggingRequest: true
      }
    };

    this.sendToChildSession(session, initRequest);

    // Wait for initialize response
    this.emit('output', {
      seq: 0, type: 'event', event: 'output',
      body: { category: 'console', output: `[Child Session] Waiting for initialize response...\n` }
    } as DebugProtocol.OutputEvent);

    await this.waitForChildResponse(session, initRequest.seq, 5000);

    this.emit('output', {
      seq: 0, type: 'event', event: 'output',
      body: { category: 'console', output: `[Child Session] Initialize response received\n` }
    } as DebugProtocol.OutputEvent);

    // For vscode-js-debug, send attach request with the pending target ID
    // This tells the adapter to "claim" this pending target
    const attachRequest: DebugProtocol.Request = {
      seq: session.sequenceNumber++,
      type: 'request',
      command: 'attach',
      arguments: {
        type: 'pwa-node',
        __pendingTargetId: session.targetId
      }
    };

    this.sendToChildSession(session, attachRequest);

    // Wait for attach response (may fail if adapter doesn't support this pattern)
    this.emit('output', {
      seq: 0, type: 'event', event: 'output',
      body: { category: 'console', output: `[Child Session] Waiting for attach response...\n` }
    } as DebugProtocol.OutputEvent);

    try {
      await this.waitForChildResponse(session, attachRequest.seq, 5000);
      this.emit('output', {
        seq: 0, type: 'event', event: 'output',
        body: { category: 'console', output: `[Child Session] Attach response received\n` }
      } as DebugProtocol.OutputEvent);
    } catch (e) {
      // If attach fails, try continuing anyway
      this.emit('output', {
        seq: 0, type: 'event', event: 'output',
        body: { category: 'console', output: `[Child Session] Attach timeout, continuing anyway...\n` }
      } as DebugProtocol.OutputEvent);
    }

    // Send configurationDone
    const configDoneRequest: DebugProtocol.Request = {
      seq: session.sequenceNumber++,
      type: 'request',
      command: 'configurationDone',
      arguments: {}
    };

    this.sendToChildSession(session, configDoneRequest);
    await this.waitForChildResponse(session, configDoneRequest.seq, 5000);
  }

  /**
   * Send a message to a child session
   */
  private sendToChildSession(session: ChildSession, message: DebugProtocol.ProtocolMessage): void {
    const encoded = encodeMessage(message);
    session.socket.write(encoded);
  }

  /**
   * Wait for a response from a child session
   */
  private waitForChildResponse(
    session: ChildSession,
    seq: number,
    timeout: number
  ): Promise<DebugProtocol.Response> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pendingRequests.delete(seq);
        reject(new Error(`Child session request timed out`));
      }, timeout);

      session.pendingRequests.set(seq, {
        resolve: (response) => {
          clearTimeout(timer);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        command: 'unknown',
        timeout: timer
      });
    });
  }

  /**
   * Send a request to the active child session and wait for response
   * Used for multi-session DAP adapters like vscode-js-debug
   */
  async sendRequestToChild<T extends DebugProtocol.Response>(
    command: string,
    args?: object,
    timeout?: number
  ): Promise<T> {
    if (!this.activeChildSession) {
      throw new Error('No active child session');
    }

    const session = this.activeChildSession;
    const seq = session.sequenceNumber++;
    const timeoutMs = timeout ?? this.defaultTimeout;

    const request: DebugProtocol.Request = {
      seq,
      type: 'request',
      command,
      arguments: args
    };

    this.sendToChildSession(session, request);

    const response = await this.waitForChildResponse(session, seq, timeoutMs);
    return response as T;
  }

  /**
   * Check if there's an active child session
   */
  hasActiveChildSession(): boolean {
    return this.activeChildSession !== null;
  }

  /**
   * Handle incoming data from a child session
   */
  private handleChildData(session: ChildSession, data: Buffer): void {
    session.parser.append(data);

    const messages = session.parser.parseAll();
    for (const message of messages) {
      this.handleChildMessage(session, message);
    }
  }

  /**
   * Handle a message from a child session
   */
  private handleChildMessage(session: ChildSession, message: DebugProtocol.ProtocolMessage): void {
    switch (message.type) {
      case 'response': {
        const response = message as DebugProtocol.Response;
        const pending = session.pendingRequests.get(response.request_seq);
        if (pending) {
          clearTimeout(pending.timeout);
          session.pendingRequests.delete(response.request_seq);
          if (response.success) {
            pending.resolve(response);
          } else {
            pending.reject(new Error(response.message || 'Request failed'));
          }
        }
        break;
      }
      case 'event':
        // Forward events from child session to our event handlers
        this.handleEvent(message as DebugProtocol.Event);
        break;
      case 'request':
        // Handle reverse requests from child session (rare)
        this.handleReverseRequest(message as DebugProtocol.Request);
        break;
    }
  }

  /**
   * Send a response to a reverse request
   */
  private sendReverseResponse(
    request: DebugProtocol.Request,
    success: boolean,
    message?: string,
    body?: unknown
  ): void {
    const response: DebugProtocol.Response = {
      seq: this.sequenceNumber++,
      type: 'response',
      request_seq: request.seq,
      command: request.command,
      success,
      message,
      body
    };
    this.sendRaw(response);
  }

  /**
   * Send a request to the adapter and wait for response
   */
  async sendRequest<T extends DebugProtocol.Response>(
    command: string,
    args?: object,
    timeout?: number
  ): Promise<T> {
    if (!this.isConnected || !this.process?.stdin) {
      throw new Error('DAP client is not connected');
    }

    const seq = this.sequenceNumber++;
    const request: DebugProtocol.Request = {
      seq,
      type: 'request',
      command,
      arguments: args
    };

    return new Promise((resolve, reject) => {
      const timeoutMs = timeout ?? this.defaultTimeout;
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(seq);
        reject(new Error(`Request '${command}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(seq, {
        resolve: resolve as (r: DebugProtocol.Response) => void,
        reject,
        command,
        timeout: timeoutHandle
      });

      this.sendRaw(request);
    });
  }

  /**
   * Send a raw DAP message
   */
  private sendRaw(message: DebugProtocol.ProtocolMessage): void {
    const encoded = encodeMessage(message);

    if (this.connectionMode === 'tcp') {
      if (!this.socket?.writable) {
        throw new Error('Cannot send message: socket is not writable');
      }
      this.socket.write(encoded);
    } else {
      if (!this.process?.stdin?.writable) {
        throw new Error('Cannot send message: adapter stdin is not writable');
      }
      this.process.stdin.write(encoded);
    }
  }

  /**
   * Reject all pending requests
   */
  private rejectAllPending(error: Error): void {
    for (const [seq, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  // ============================================
  // High-level DAP Operations
  // ============================================

  /**
   * Initialize the debug adapter
   */
  async initialize(): Promise<AdapterCapabilities> {
    const response = await this.sendRequest<DebugProtocol.InitializeResponse>(
      'initialize',
      {
        clientID: 'mcp-debugger',
        clientName: 'MCP Debugger',
        adapterID: 'mcp-dap',
        pathFormat: 'path',
        linesStartAt1: true,
        columnsStartAt1: true,
        supportsVariableType: true,
        supportsVariablePaging: true,
        supportsRunInTerminalRequest: false,
        supportsMemoryReferences: true,
        supportsProgressReporting: false,
        supportsInvalidatedEvent: false,
        supportsMemoryEvent: false,
        supportsArgsCanBeInterpretedByShell: false,
        supportsStartDebuggingRequest: false
      }
    );

    this.capabilities = response.body ?? {};
    return convertCapabilities(this.capabilities) as AdapterCapabilities;
  }

  /**
   * Launch a program to debug.
   * Note: Some adapters (like debugpy) don't respond to launch until after configurationDone.
   * Use launchAsync() + waitForLaunch() for those cases.
   */
  async launch(args: DebugProtocol.LaunchRequestArguments): Promise<void> {
    await this.sendRequest('launch', args, 60000); // Long timeout for launch
  }

  private pendingLaunchSeq: number | null = null;
  private pendingLaunchResolve: (() => void) | null = null;

  /**
   * Launch a program without waiting for response.
   * Use this with adapters that respond to launch after configurationDone.
   */
  launchAsync(args: DebugProtocol.LaunchRequestArguments): void {
    if (!this.isConnected || !this.process?.stdin) {
      throw new Error('DAP client is not connected');
    }

    const seq = this.sequenceNumber++;
    this.pendingLaunchSeq = seq;

    const request: DebugProtocol.Request = {
      seq,
      type: 'request',
      command: 'launch',
      arguments: args
    };

    // Set up handler for when response comes
    this.pendingRequests.set(seq, {
      resolve: () => {
        this.pendingLaunchSeq = null;
        if (this.pendingLaunchResolve) {
          this.pendingLaunchResolve();
          this.pendingLaunchResolve = null;
        }
      },
      reject: (error) => {
        this.pendingLaunchSeq = null;
        this.emit('error', error);
      },
      command: 'launch',
      timeout: setTimeout(() => {}, 0) // No timeout for async launch
    });

    this.sendRaw(request);
  }

  /**
   * Wait for the pending launch response (if any)
   */
  async waitForLaunch(timeout: number = 5000): Promise<void> {
    if (this.pendingLaunchSeq === null) {
      return; // Already received
    }

    return new Promise((resolve, reject) => {
      this.pendingLaunchResolve = resolve;
      setTimeout(() => {
        if (this.pendingLaunchSeq !== null) {
          // Timeout but don't fail - launch response may come later
          resolve();
        }
      }, timeout);
    });
  }

  /**
   * Attach to a running program
   */
  async attach(args: DebugProtocol.AttachRequestArguments): Promise<void> {
    await this.sendRequest('attach', args);
  }

  /**
   * Signal that configuration is done
   */
  async configurationDone(): Promise<void> {
    if (this.capabilities?.supportsConfigurationDoneRequest) {
      await this.sendRequest('configurationDone');
    }
  }

  /**
   * Set breakpoints in a source file
   */
  async setBreakpoints(
    source: DebugProtocol.Source,
    breakpoints: DebugProtocol.SourceBreakpoint[]
  ): Promise<BreakpointInfo[]> {
    const response = await this.sendRequest<DebugProtocol.SetBreakpointsResponse>(
      'setBreakpoints',
      { source, breakpoints }
    );

    return (response.body?.breakpoints ?? []).map((bp, index) =>
      convertBreakpoint(bp, source.path ?? '', breakpoints[index]?.line ?? 0)
    );
  }

  /**
   * Set function breakpoints
   */
  async setFunctionBreakpoints(
    breakpoints: DebugProtocol.FunctionBreakpoint[]
  ): Promise<BreakpointInfo[]> {
    if (!this.capabilities?.supportsFunctionBreakpoints) {
      return [];
    }

    const response = await this.sendRequest<DebugProtocol.SetFunctionBreakpointsResponse>(
      'setFunctionBreakpoints',
      { breakpoints }
    );

    return (response.body?.breakpoints ?? []).map((bp) =>
      convertBreakpoint(bp, '', 0)
    );
  }

  /**
   * Set exception breakpoints
   */
  async setExceptionBreakpoints(filters: string[]): Promise<void> {
    await this.sendRequest('setExceptionBreakpoints', { filters });
  }

  /**
   * Get all threads
   */
  async threads(): Promise<ThreadInfo[]> {
    // Route to child session if available (for multi-session adapters like vscode-js-debug)
    const response = this.activeChildSession
      ? await this.sendRequestToChild<DebugProtocol.ThreadsResponse>('threads')
      : await this.sendRequest<DebugProtocol.ThreadsResponse>('threads');
    return (response.body?.threads ?? []).map((t) => ({
      id: t.id,
      name: t.name
    }));
  }

  /**
   * Get stack trace for a thread
   */
  async stackTrace(
    threadId: number,
    startFrame?: number,
    levels?: number
  ): Promise<StackFrame[]> {
    // Route to child session if available (for multi-session adapters like vscode-js-debug)
    const args = { threadId, startFrame, levels };
    const response = this.activeChildSession
      ? await this.sendRequestToChild<DebugProtocol.StackTraceResponse>('stackTrace', args)
      : await this.sendRequest<DebugProtocol.StackTraceResponse>('stackTrace', args);

    return (response.body?.stackFrames ?? []).map(convertStackFrame);
  }

  /**
   * Get scopes for a stack frame
   */
  async scopes(frameId: number): Promise<Scope[]> {
    // Route to child session if available (for multi-session adapters like vscode-js-debug)
    const args = { frameId };
    const response = this.activeChildSession
      ? await this.sendRequestToChild<DebugProtocol.ScopesResponse>('scopes', args)
      : await this.sendRequest<DebugProtocol.ScopesResponse>('scopes', args);

    return (response.body?.scopes ?? []).map(convertScope);
  }

  /**
   * Get variables for a scope or variable reference
   */
  async variables(variablesReference: number): Promise<Variable[]> {
    // Route to child session if available (for multi-session adapters like vscode-js-debug)
    const args = { variablesReference };
    const response = this.activeChildSession
      ? await this.sendRequestToChild<DebugProtocol.VariablesResponse>('variables', args)
      : await this.sendRequest<DebugProtocol.VariablesResponse>('variables', args);

    return (response.body?.variables ?? []).map(convertVariable);
  }

  /**
   * Evaluate an expression
   */
  async evaluate(
    expression: string,
    frameId?: number,
    context?: 'watch' | 'repl' | 'hover' | 'clipboard' | 'variables'
  ): Promise<EvaluationResult> {
    // Route to child session if available (for multi-session adapters like vscode-js-debug)
    const args = { expression, frameId, context };
    const response = this.activeChildSession
      ? await this.sendRequestToChild<DebugProtocol.EvaluateResponse>('evaluate', args)
      : await this.sendRequest<DebugProtocol.EvaluateResponse>('evaluate', args);

    return {
      result: response.body?.result ?? '',
      type: response.body?.type ?? 'unknown',
      variablesReference: response.body?.variablesReference ?? 0,
      hasChildren: (response.body?.variablesReference ?? 0) > 0,
      namedVariables: response.body?.namedVariables,
      indexedVariables: response.body?.indexedVariables,
      memoryReference: response.body?.memoryReference
    };
  }

  /**
   * Continue execution
   */
  async continue(threadId: number): Promise<boolean> {
    // Route to child session if available (for multi-session adapters like vscode-js-debug)
    const args = { threadId };
    const response = this.activeChildSession
      ? await this.sendRequestToChild<DebugProtocol.ContinueResponse>('continue', args)
      : await this.sendRequest<DebugProtocol.ContinueResponse>('continue', args);
    return response.body?.allThreadsContinued ?? true;
  }

  /**
   * Step to next line (step over)
   */
  async next(threadId: number): Promise<void> {
    // Route to child session if available (for multi-session adapters like vscode-js-debug)
    const args = { threadId };
    if (this.activeChildSession) {
      await this.sendRequestToChild('next', args);
    } else {
      await this.sendRequest('next', args);
    }
  }

  /**
   * Step into function
   */
  async stepIn(threadId: number): Promise<void> {
    // Route to child session if available (for multi-session adapters like vscode-js-debug)
    const args = { threadId };
    if (this.activeChildSession) {
      await this.sendRequestToChild('stepIn', args);
    } else {
      await this.sendRequest('stepIn', args);
    }
  }

  /**
   * Step out of function
   */
  async stepOut(threadId: number): Promise<void> {
    // Route to child session if available (for multi-session adapters like vscode-js-debug)
    const args = { threadId };
    if (this.activeChildSession) {
      await this.sendRequestToChild('stepOut', args);
    } else {
      await this.sendRequest('stepOut', args);
    }
  }

  /**
   * Pause execution
   */
  async pause(threadId: number): Promise<void> {
    // Route to child session if available (for multi-session adapters like vscode-js-debug)
    const args = { threadId };
    if (this.activeChildSession) {
      await this.sendRequestToChild('pause', args);
    } else {
      await this.sendRequest('pause', args);
    }
  }

  /**
   * Terminate the debuggee
   */
  async terminate(): Promise<void> {
    if (this.capabilities?.supportsTerminateRequest) {
      await this.sendRequest('terminate');
    }
  }

  /**
   * Disconnect from the debug adapter
   */
  async disconnect(terminateDebuggee: boolean = true): Promise<void> {
    try {
      await this.sendRequest('disconnect', { terminateDebuggee }, 5000);
    } catch {
      // Ignore errors during disconnect
    }

    this.isConnected = false;
    this.socket?.destroy();
    this.socket = null;
    this.process?.kill();
    this.process = null;
    this.parser.clear();
    this.rejectAllPending(new Error('Client disconnected'));
  }

  /**
   * Get the adapter capabilities
   */
  getCapabilities(): DebugProtocol.Capabilities | null {
    return this.capabilities;
  }

  /**
   * Check if connected
   */
  isStarted(): boolean {
    return this.isConnected;
  }
}
