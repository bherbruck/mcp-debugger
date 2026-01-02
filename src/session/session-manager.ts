/**
 * Session Manager
 *
 * Central orchestrator for debug sessions. Manages session lifecycle,
 * coordinates adapters and DAP clients, and routes tool requests.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  DebugLanguage,
  SessionState,
  DebugSessionInfo,
  SessionCreateParams,
  LaunchParams,
  BreakpointInfo,
  SetBreakpointRequest,
  StackFrame,
  Variable,
  Scope,
  ThreadInfo,
  EvaluationResult,
  SourceContext,
  SourceLine,
  StopReason,
  DebugOutput
} from './types.js';
import { DapClient } from '../dap/dap-client.js';
import { adapterRegistry, IDebugAdapter } from '../adapters/index.js';

// Max traces to keep in memory per session (prevent OOM)
const MAX_TRACES_IN_MEMORY = 10000;
// Max variables per trace (prevent individual traces from being too large)
const MAX_VARIABLES_PER_TRACE = 100;

/**
 * Trace point - captured state at a breakpoint hit
 */
export interface TracePoint {
  hitNumber: number;
  timestamp: number;
  file: string;
  line: number;
  function?: string;
  variables: Variable[];
}

/**
 * Internal session data
 */
interface SessionData {
  info: DebugSessionInfo;
  adapter: IDebugAdapter;
  client: DapClient;
  executablePath: string;
  breakpoints: Map<string, BreakpointInfo[]>; // file -> breakpoints
  currentThreadId: number;
  currentFrameId: number;
  // Cached context from last stop (for returning with step/continue)
  lastStopContext?: {
    stackFrame: StackFrame;
    variables: Variable[];
  };
  // Collected traces when using collectHits mode
  collectedTraces: TracePoint[];
  // Map of "file:line" -> dumpFile for tracepoint breakpoints
  dumpBreakpoints: Map<string, string>;
}

/**
 * Events emitted by the session manager
 */
export interface SessionManagerEvents {
  sessionCreated: (session: DebugSessionInfo) => void;
  sessionStateChanged: (
    sessionId: string,
    state: SessionState,
    previousState: SessionState
  ) => void;
  sessionTerminated: (sessionId: string) => void;
  stopped: (
    sessionId: string,
    reason: StopReason,
    threadId: number,
    description?: string
  ) => void;
  output: (sessionId: string, output: DebugOutput) => void;
  error: (sessionId: string, error: Error) => void;
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, SessionData> = new Map();

  constructor() {
    super();
  }

  /**
   * Create a new debug session
   */
  async createSession(params: SessionCreateParams): Promise<DebugSessionInfo> {
    const { language, name, executablePath } = params;

    // Validate language is supported
    if (!adapterRegistry.isSupported(language)) {
      throw new Error(`Language '${language}' is not supported`);
    }

    // Create adapter
    const adapter = adapterRegistry.create(language);

    // Resolve executable path
    const resolvedPath = await adapter.resolveExecutablePath(executablePath);

    // Check/install adapter
    const status = await adapter.checkInstallation();
    if (!status.installed) {
      await adapter.install();
    }

    // Get adapter command
    const adapterCommand = await adapter.getAdapterCommand();

    // Create DAP client
    const client = new DapClient({
      command: adapterCommand.command,
      args: adapterCommand.args,
      env: adapterCommand.env,
      cwd: adapterCommand.cwd,
      mode: adapterCommand.mode
    });

    // Generate session ID
    const sessionId = randomUUID();
    const sessionName = name ?? `${language}-debug-${sessionId.substring(0, 8)}`;

    // Create session info
    const info: DebugSessionInfo = {
      id: sessionId,
      name: sessionName,
      language,
      state: SessionState.CREATED,
      createdAt: new Date()
    };

    // Store session data
    const sessionData: SessionData = {
      info,
      adapter,
      client,
      executablePath: resolvedPath,
      breakpoints: new Map(),
      currentThreadId: 1,
      currentFrameId: 0,
      collectedTraces: [],
      dumpBreakpoints: new Map()
    };

    this.sessions.set(sessionId, sessionData);

    // Set up event handlers
    this.setupEventHandlers(sessionId, client);

    this.emit('sessionCreated', info);
    return info;
  }

  /**
   * Set up event handlers for a DAP client
   */
  private setupEventHandlers(sessionId: string, client: DapClient): void {
    client.on('initialized', () => {
      this.updateState(sessionId, SessionState.READY);
    });

    client.on('stopped', async (event: DebugProtocol.StoppedEvent) => {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.currentThreadId = event.body.threadId ?? 1;
        session.info.stoppedReason = event.body.reason as StopReason;
        session.info.stoppedThreadId = session.currentThreadId;

        // Auto-fetch stack trace and variables (like VSCode does on stop)
        // This prevents "Invalid frame reference" errors and caches context
        let currentFile = '';
        let currentLine = 0;
        try {
          const frames = await client.stackTrace(session.currentThreadId);
          if (frames.length > 0) {
            session.currentFrameId = frames[0].id;
            currentFile = frames[0].file;
            currentLine = frames[0].line;

            // Also fetch local variables for the top frame
            const scopes = await client.scopes(frames[0].id);
            const localScope = scopes.find(s => s.name.toLowerCase().includes('local'));
            let variables: Variable[] = [];
            if (localScope) {
              variables = await client.variables(localScope.variablesReference);
            }

            // Cache context for returning with step/continue responses
            session.lastStopContext = {
              stackFrame: frames[0],
              variables
            };

            // Check if this is a tracepoint (trace=true or dumpFile set)
            const bpKey = `${currentFile}:${currentLine}`;
            const isTracepoint = session.dumpBreakpoints.has(bpKey);
            if (isTracepoint) {
              const dumpFile = session.dumpBreakpoints.get(bpKey);

              // Find the breakpoint to check maxDumps
              const fileBreakpoints = session.breakpoints.get(currentFile);
              const bp = fileBreakpoints?.find(b => b.line === currentLine);

              // Increment dump count
              if (bp) {
                bp.dumpCount = (bp.dumpCount ?? 0) + 1;
              }

              // Check if we've exceeded maxDumps
              const maxDumps = bp?.maxDumps;
              const dumpCount = bp?.dumpCount ?? 1;
              const shouldContinue = !maxDumps || dumpCount < maxDumps;

              // Collect trace (limit variables to prevent large traces)
              const limitedVariables = variables.slice(0, MAX_VARIABLES_PER_TRACE);
              const trace: TracePoint = {
                hitNumber: dumpCount,
                timestamp: Date.now(),
                file: currentFile,
                line: currentLine,
                function: frames[0].name,
                variables: limitedVariables
              };

              // Store in session state (drop oldest if at limit)
              if (session.collectedTraces.length >= MAX_TRACES_IN_MEMORY) {
                session.collectedTraces.shift(); // Remove oldest
              }
              session.collectedTraces.push(trace);

              // Optionally also write to file if dumpFile is set (non-empty)
              if (dumpFile) {
                try {
                  await fs.appendFile(dumpFile, JSON.stringify(trace) + '\n');
                } catch (err) {
                  console.error(`Failed to write to dump file ${dumpFile}:`, err);
                }
              }

              // Auto-continue if we haven't reached maxDumps
              if (shouldContinue) {
                setImmediate(async () => {
                  try {
                    await client.continue(session.currentThreadId);
                  } catch {
                    // Program may have terminated
                  }
                });
                return; // Don't emit stopped event for dump breakpoints
              }
              // If maxDumps reached, fall through to normal stopped behavior
            }
          }
        } catch {
          // Ignore errors - will be fetched on next get* call
        }
      }
      this.updateState(sessionId, SessionState.PAUSED);
      this.emit(
        'stopped',
        sessionId,
        event.body.reason as StopReason,
        event.body.threadId ?? 1,
        event.body.description
      );
    });

    client.on('continued', () => {
      this.updateState(sessionId, SessionState.RUNNING);
    });

    client.on('exited', (event: DebugProtocol.ExitedEvent) => {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.info.exitCode = event.body.exitCode;
      }
    });

    client.on('terminated', () => {
      this.updateState(sessionId, SessionState.TERMINATED);
      this.emit('sessionTerminated', sessionId);
      // Auto-cleanup terminated sessions after a short delay
      setTimeout(() => {
        if (this.sessions.get(sessionId)?.info.state === SessionState.TERMINATED) {
          this.sessions.delete(sessionId);
        }
      }, 5000);
    });

    client.on('output', (event: DebugProtocol.OutputEvent) => {
      const output: DebugOutput = {
        category: event.body.category as DebugOutput['category'],
        output: event.body.output,
        source: event.body.source?.path,
        line: event.body.line,
        column: event.body.column
      };
      this.emit('output', sessionId, output);
    });

    client.on('adapterExit', (code: number | null) => {
      if (this.sessions.has(sessionId)) {
        this.updateState(sessionId, SessionState.TERMINATED);
        this.emit('sessionTerminated', sessionId);
        // Auto-cleanup after adapter exit
        setTimeout(() => {
          if (this.sessions.get(sessionId)?.info.state === SessionState.TERMINATED) {
            this.sessions.delete(sessionId);
          }
        }, 5000);
      }
    });

    client.on('error', (error: Error) => {
      this.updateState(sessionId, SessionState.ERROR);
      const session = this.sessions.get(sessionId);
      if (session) {
        session.info.error = error.message;
      }
      this.emit('error', sessionId, error);
    });
  }

  /**
   * Update session state
   */
  private updateState(sessionId: string, newState: SessionState): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const previousState = session.info.state;
      session.info.state = newState;
      this.emit('sessionStateChanged', sessionId, newState, previousState);
    }
  }

  /**
   * Start debugging a script
   */
  async startDebugging(
    sessionId: string,
    params: LaunchParams
  ): Promise<{ success: boolean; state: SessionState; message: string }> {
    const session = this.getSession(sessionId);

    // Update session info
    session.info.scriptPath = params.scriptPath;
    session.info.workingDirectory = params.cwd;

    try {
      // Start the DAP client
      this.updateState(sessionId, SessionState.INITIALIZING);
      await session.client.start();

      // Initialize the adapter
      await session.client.initialize();

      // Build launch configuration
      const launchConfig = session.adapter.buildLaunchConfig(
        params,
        session.executablePath
      );

      // Set up promise to wait for initialized event BEFORE launching
      // Note: Some adapters (like Delve) send initialized AFTER launch request
      const initializedPromise = this.waitForInitialized(session.client);

      // Launch the program (async - response timing varies by adapter)
      session.client.launchAsync(launchConfig);

      // Wait for initialized event (may come after launch for some adapters)
      await initializedPromise;

      // Now we're ready to set breakpoints
      this.updateState(sessionId, SessionState.READY);

      // Set breakpoints (after initialized event)
      for (const [file, breakpoints] of session.breakpoints) {
        await this.setBreakpointsInternal(session, file, breakpoints);
      }

      // Signal configuration done
      await session.client.configurationDone();

      // Wait for launch response (with timeout - don't fail if it takes time)
      await session.client.waitForLaunch(2000);

      this.updateState(sessionId, SessionState.RUNNING);

      return {
        success: true,
        state: session.info.state,
        message: 'Debugging started successfully'
      };
    } catch (error) {
      this.updateState(sessionId, SessionState.ERROR);
      session.info.error = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        state: session.info.state,
        message: `Failed to start debugging: ${session.info.error}`
      };
    }
  }

  /**
   * Wait for the initialized event from the debug adapter
   */
  private waitForInitialized(client: DapClient, timeout: number = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for initialized event'));
      }, timeout);

      client.once('initialized', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * Set a breakpoint
   */
  async setBreakpoint(
    sessionId: string,
    request: SetBreakpointRequest
  ): Promise<{ success: boolean; breakpoint?: BreakpointInfo; message?: string }> {
    const session = this.getSession(sessionId);
    const { file, line, condition, hitCondition, logMessage, dumpFile, trace, maxDumps } = request;

    // Normalize file path
    const normalizedFile = path.resolve(file);

    // Get existing breakpoints for this file
    const existingBreakpoints = session.breakpoints.get(normalizedFile) ?? [];

    // Check if breakpoint already exists at this line
    const existingIndex = existingBreakpoints.findIndex((bp) => bp.line === line);
    if (existingIndex !== -1) {
      // Update existing breakpoint
      existingBreakpoints[existingIndex] = {
        ...existingBreakpoints[existingIndex],
        condition,
        hitCondition,
        logMessage,
        dumpFile,
        trace,
        maxDumps,
        dumpCount: 0 // Reset count on update
      };
    } else {
      // Add new breakpoint
      existingBreakpoints.push({
        id: 0, // Will be set by adapter
        file: normalizedFile,
        line,
        verified: false,
        condition,
        hitCondition,
        logMessage,
        dumpFile,
        trace,
        maxDumps,
        dumpCount: 0
      });
    }

    session.breakpoints.set(normalizedFile, existingBreakpoints);

    // Register tracepoint for auto-continue behavior
    const bpKey = `${normalizedFile}:${line}`;
    if (trace || dumpFile) {
      // Store dumpFile path (or empty string if just tracing internally)
      session.dumpBreakpoints.set(bpKey, dumpFile ?? '');
    } else {
      session.dumpBreakpoints.delete(bpKey);
    }

    // If session is active, send to adapter
    if (
      session.info.state === SessionState.READY ||
      session.info.state === SessionState.RUNNING ||
      session.info.state === SessionState.PAUSED
    ) {
      const result = await this.setBreakpointsInternal(
        session,
        normalizedFile,
        existingBreakpoints
      );
      const bp = result.find((b) => b.line === line);
      return {
        success: bp?.verified ?? false,
        breakpoint: bp,
        message: bp?.verified ? undefined : bp?.message ?? 'Breakpoint not verified'
      };
    }

    // Return pending breakpoint
    return {
      success: true,
      breakpoint: existingBreakpoints.find((bp) => bp.line === line),
      message: 'Breakpoint set (will be verified when debugging starts)'
    };
  }

  /**
   * Internal method to set breakpoints via DAP
   */
  private async setBreakpointsInternal(
    session: SessionData,
    file: string,
    breakpoints: BreakpointInfo[]
  ): Promise<BreakpointInfo[]> {
    const source: DebugProtocol.Source = { path: file };
    const bpRequests: DebugProtocol.SourceBreakpoint[] = breakpoints.map((bp) => ({
      line: bp.line,
      column: bp.column,
      condition: bp.condition,
      hitCondition: bp.hitCondition,
      logMessage: bp.logMessage
    }));

    const result = await session.client.setBreakpoints(source, bpRequests);

    // Update stored breakpoints with results
    session.breakpoints.set(file, result);

    return result;
  }

  /**
   * Remove a breakpoint
   */
  async removeBreakpoint(
    sessionId: string,
    file: string,
    line: number
  ): Promise<{ success: boolean; message: string }> {
    const session = this.getSession(sessionId);
    const normalizedFile = path.resolve(file);

    const breakpoints = session.breakpoints.get(normalizedFile);
    if (!breakpoints) {
      return { success: false, message: 'No breakpoints in this file' };
    }

    const index = breakpoints.findIndex((bp) => bp.line === line);
    if (index === -1) {
      return { success: false, message: 'Breakpoint not found at this line' };
    }

    breakpoints.splice(index, 1);

    // Update in adapter if active
    if (
      session.info.state === SessionState.READY ||
      session.info.state === SessionState.RUNNING ||
      session.info.state === SessionState.PAUSED
    ) {
      await this.setBreakpointsInternal(session, normalizedFile, breakpoints);
    }

    return { success: true, message: 'Breakpoint removed' };
  }

  /**
   * List all breakpoints
   */
  listBreakpoints(sessionId: string): BreakpointInfo[] {
    const session = this.getSession(sessionId);
    const allBreakpoints: BreakpointInfo[] = [];

    for (const breakpoints of session.breakpoints.values()) {
      allBreakpoints.push(...breakpoints);
    }

    return allBreakpoints;
  }

  /**
   * Get collected traces with optional filtering
   */
  getTraces(
    sessionId: string,
    options?: {
      file?: string;
      line?: number;
      function?: string;
      limit?: number;
      offset?: number;
    }
  ): { traces: TracePoint[]; total: number } {
    const session = this.getSession(sessionId);
    let traces = session.collectedTraces;

    // Apply filters
    if (options?.file) {
      const fileFilter = options.file;
      traces = traces.filter(t => t.file === fileFilter || t.file.endsWith(fileFilter));
    }
    if (options?.line) {
      const lineFilter = options.line;
      traces = traces.filter(t => t.line === lineFilter);
    }
    if (options?.function) {
      const funcFilter = options.function;
      traces = traces.filter(t => t.function?.includes(funcFilter));
    }

    const total = traces.length;

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    traces = traces.slice(offset, offset + limit);

    return { traces, total };
  }

  /**
   * Clear collected traces
   */
  clearTraces(sessionId: string): { cleared: number } {
    const session = this.getSession(sessionId);
    const cleared = session.collectedTraces.length;
    session.collectedTraces = [];
    return { cleared };
  }

  /**
   * Continue execution
   * @param collectHits - If set, collect this many breakpoint hits before returning (auto-continues at each hit)
   */
  async continue(
    sessionId: string,
    threadId?: number,
    options?: { waitForBreakpoint?: boolean; timeout?: number; collectHits?: number }
  ): Promise<{
    success: boolean;
    state: SessionState;
    message: string;
    stoppedAt?: StackFrame;
    variables?: Variable[];
    traces?: TracePoint[];
  }> {
    const session = this.getSession(sessionId);
    const tid = threadId ?? session.currentThreadId;
    const waitForBreakpoint = options?.waitForBreakpoint ?? false;
    const timeout = options?.timeout ?? 30000; // 30s default
    const collectHits = options?.collectHits;

    try {
      // Multi-hit collection mode: continue and collect N breakpoint hits
      if (collectHits && collectHits > 0) {
        session.collectedTraces = []; // Clear previous traces
        const startTime = Date.now();
        let hitCount = 0;

        while (hitCount < collectHits) {
          // Check timeout
          if (Date.now() - startTime > timeout) {
            break;
          }

          await session.client.continue(tid);

          // Wait for pause with remaining timeout
          const remainingTimeout = Math.max(1000, timeout - (Date.now() - startTime));
          await this.waitForPause(sessionId, remainingTimeout);

          // Check if we actually paused (program might have terminated)
          if (session.info.state !== SessionState.PAUSED) {
            break;
          }

          // Collect trace point
          hitCount++;
          const frame = session.lastStopContext?.stackFrame;
          if (frame) {
            session.collectedTraces.push({
              hitNumber: hitCount,
              timestamp: Date.now(),
              file: frame.file,
              line: frame.line,
              function: frame.name,
              variables: session.lastStopContext?.variables ?? []
            });
          }
        }

        return {
          success: true,
          state: session.info.state,
          message: `Collected ${hitCount} breakpoint hit(s)`,
          traces: session.collectedTraces
        };
      }

      // Standard continue
      await session.client.continue(tid);

      if (waitForBreakpoint) {
        await this.waitForPause(sessionId, timeout);
        return {
          success: true,
          state: session.info.state,
          message: session.info.state === SessionState.PAUSED
            ? 'Hit breakpoint'
            : 'Execution continued (no breakpoint hit)',
          stoppedAt: session.lastStopContext?.stackFrame,
          variables: session.lastStopContext?.variables
        };
      }

      return {
        success: true,
        state: session.info.state,
        message: 'Execution continued'
      };
    } catch (error) {
      return {
        success: false,
        state: session.info.state,
        message: `Continue failed: ${error}`
      };
    }
  }

  /**
   * Pause execution
   */
  async pause(
    sessionId: string,
    threadId?: number
  ): Promise<{ success: boolean; state: SessionState; message: string }> {
    const session = this.getSession(sessionId);
    const tid = threadId ?? session.currentThreadId;

    try {
      await session.client.pause(tid);
      return {
        success: true,
        state: session.info.state,
        message: 'Execution paused'
      };
    } catch (error) {
      return {
        success: false,
        state: session.info.state,
        message: `Pause failed: ${error}`
      };
    }
  }

  /**
   * Wait for session to pause (with timeout)
   */
  private waitForPause(sessionId: string, timeoutMs: number = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const session = this.sessions.get(sessionId);
      if (!session) {
        reject(new Error('Session not found'));
        return;
      }

      // Already paused
      if (session.info.state === SessionState.PAUSED) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        this.off('stopped', handler);
        resolve(); // Don't fail, just return without context
      }, timeoutMs);

      const handler = (stoppedSessionId: string) => {
        if (stoppedSessionId === sessionId) {
          clearTimeout(timeout);
          this.off('stopped', handler);
          // Small delay to let lastStopContext be populated
          setTimeout(resolve, 50);
        }
      };

      this.on('stopped', handler);
    });
  }

  /**
   * Step in
   */
  async stepIn(
    sessionId: string,
    threadId?: number
  ): Promise<{ success: boolean; state: SessionState; stoppedAt?: StackFrame; variables?: Variable[] }> {
    const session = this.getSession(sessionId);
    const tid = threadId ?? session.currentThreadId;

    try {
      await session.client.stepIn(tid);
      await this.waitForPause(sessionId);
      return {
        success: true,
        state: session.info.state,
        stoppedAt: session.lastStopContext?.stackFrame,
        variables: session.lastStopContext?.variables
      };
    } catch (error) {
      return {
        success: false,
        state: session.info.state
      };
    }
  }

  /**
   * Step over
   */
  async stepOver(
    sessionId: string,
    threadId?: number
  ): Promise<{ success: boolean; state: SessionState; stoppedAt?: StackFrame; variables?: Variable[] }> {
    const session = this.getSession(sessionId);
    const tid = threadId ?? session.currentThreadId;

    try {
      await session.client.next(tid);
      await this.waitForPause(sessionId);
      return {
        success: true,
        state: session.info.state,
        stoppedAt: session.lastStopContext?.stackFrame,
        variables: session.lastStopContext?.variables
      };
    } catch (error) {
      return {
        success: false,
        state: session.info.state
      };
    }
  }

  /**
   * Step out
   */
  async stepOut(
    sessionId: string,
    threadId?: number
  ): Promise<{ success: boolean; state: SessionState; stoppedAt?: StackFrame; variables?: Variable[] }> {
    const session = this.getSession(sessionId);
    const tid = threadId ?? session.currentThreadId;

    try {
      await session.client.stepOut(tid);
      await this.waitForPause(sessionId);
      return {
        success: true,
        state: session.info.state,
        stoppedAt: session.lastStopContext?.stackFrame,
        variables: session.lastStopContext?.variables
      };
    } catch (error) {
      return {
        success: false,
        state: session.info.state
      };
    }
  }

  /**
   * Step and trace - step N times, collecting variables at each step
   * Can write to file (dumpFile) or return in response (traces)
   */
  async stepAndTrace(
    sessionId: string,
    options: {
      count?: number;
      timeout?: number;
      stepType?: 'in' | 'over' | 'out';
      dumpFile?: string;
    }
  ): Promise<{
    success: boolean;
    state: SessionState;
    message: string;
    traces?: TracePoint[];
    stepsCompleted: number;
  }> {
    const session = this.getSession(sessionId);
    const count = options.count ?? 100;
    const timeout = options.timeout ?? 30000;
    const stepType = options.stepType ?? 'over';
    const dumpFile = options.dumpFile;

    const traces: TracePoint[] = [];
    const startTime = Date.now();
    let stepsCompleted = 0;

    try {
      while (stepsCompleted < count) {
        // Check timeout
        if (Date.now() - startTime > timeout) {
          break;
        }

        // Check if we're still paused (program might have terminated)
        if (session.info.state !== SessionState.PAUSED) {
          break;
        }

        // Collect current state before stepping
        const frame = session.lastStopContext?.stackFrame;
        const variables = session.lastStopContext?.variables ?? [];
        const limitedVariables = variables.slice(0, MAX_VARIABLES_PER_TRACE);

        if (frame) {
          const trace: TracePoint = {
            hitNumber: stepsCompleted + 1,
            timestamp: Date.now(),
            file: frame.file,
            line: frame.line,
            function: frame.name,
            variables: limitedVariables
          };

          if (dumpFile) {
            // Write to file
            await fs.appendFile(dumpFile, JSON.stringify(trace) + '\n');
          } else {
            // Collect in memory (limit total traces)
            if (traces.length >= MAX_TRACES_IN_MEMORY) {
              traces.shift();
            }
            traces.push(trace);
          }
        }

        stepsCompleted++;

        // Step
        switch (stepType) {
          case 'in':
            await session.client.stepIn(session.currentThreadId);
            break;
          case 'out':
            await session.client.stepOut(session.currentThreadId);
            break;
          case 'over':
          default:
            await session.client.next(session.currentThreadId);
            break;
        }

        // Wait for pause with short timeout per step
        const remainingTimeout = Math.max(1000, timeout - (Date.now() - startTime));
        await this.waitForPause(sessionId, Math.min(5000, remainingTimeout));
      }

      return {
        success: true,
        state: session.info.state,
        message: dumpFile
          ? `Traced ${stepsCompleted} step(s) to ${dumpFile}`
          : `Traced ${stepsCompleted} step(s)`,
        traces: dumpFile ? undefined : traces,
        stepsCompleted
      };
    } catch (error) {
      return {
        success: false,
        state: session.info.state,
        message: `Step and trace failed: ${error}`,
        traces: dumpFile ? undefined : traces,
        stepsCompleted
      };
    }
  }

  /**
   * Get stack trace
   */
  async getStackTrace(sessionId: string, threadId?: number): Promise<StackFrame[]> {
    const session = this.getSession(sessionId);
    const tid = threadId ?? session.currentThreadId;

    const frames = await session.client.stackTrace(tid);

    // Update current frame ID
    if (frames.length > 0) {
      session.currentFrameId = frames[0].id;
    }

    return frames;
  }

  /**
   * Get scopes for a frame
   */
  async getScopes(sessionId: string, frameId?: number): Promise<Scope[]> {
    const session = this.getSession(sessionId);
    const fid = frameId ?? session.currentFrameId;

    return session.client.scopes(fid);
  }

  /**
   * Get variables
   */
  async getVariables(
    sessionId: string,
    frameId?: number,
    scopeFilter?: 'local' | 'global' | 'closure'
  ): Promise<Variable[]> {
    const session = this.getSession(sessionId);
    const fid = frameId ?? session.currentFrameId;

    // Get scopes for the frame
    const scopes = await session.client.scopes(fid);

    // Filter by scope type if requested
    let targetScopes = scopes;
    if (scopeFilter) {
      targetScopes = scopes.filter((s) =>
        s.name.toLowerCase().includes(scopeFilter)
      );
    }

    // Get variables from all target scopes
    const allVariables: Variable[] = [];
    for (const scope of targetScopes) {
      const vars = await session.client.variables(scope.variablesReference);
      allVariables.push(...vars);
    }

    return allVariables;
  }

  /**
   * Expand a variable (get its children)
   */
  async expandVariable(
    sessionId: string,
    variablesReference: number
  ): Promise<Variable[]> {
    const session = this.getSession(sessionId);
    return session.client.variables(variablesReference);
  }

  /**
   * Evaluate an expression
   */
  async evaluateExpression(
    sessionId: string,
    expression: string,
    frameId?: number,
    context?: 'watch' | 'repl' | 'hover'
  ): Promise<EvaluationResult> {
    const session = this.getSession(sessionId);
    const fid = frameId ?? session.currentFrameId;

    return session.client.evaluate(expression, fid, context);
  }

  /**
   * Get threads
   */
  async getThreads(sessionId: string): Promise<ThreadInfo[]> {
    const session = this.getSession(sessionId);
    return session.client.threads();
  }

  /**
   * Get source context around current location
   */
  async getSourceContext(
    sessionId: string,
    file?: string,
    line?: number,
    linesContext: number = 5
  ): Promise<SourceContext | null> {
    const session = this.getSession(sessionId);

    // Get current location if not specified
    let targetFile = file;
    let targetLine = line;

    if (!targetFile || !targetLine) {
      const frames = await this.getStackTrace(sessionId);
      if (frames.length === 0) {
        return null;
      }
      targetFile = frames[0].file;
      targetLine = frames[0].line;
    }

    // Read the source file
    try {
      const content = await fs.readFile(targetFile, 'utf8');
      const allLines = content.split('\n');

      const startLine = Math.max(1, targetLine - linesContext);
      const endLine = Math.min(allLines.length, targetLine + linesContext);

      // Get breakpoints for this file
      const breakpoints = session.breakpoints.get(targetFile) ?? [];
      const breakpointLines = new Set(breakpoints.map((bp) => bp.line));

      const lines: SourceLine[] = [];
      for (let i = startLine; i <= endLine; i++) {
        lines.push({
          lineNumber: i,
          content: allLines[i - 1] ?? '',
          isCurrent: i === targetLine,
          hasBreakpoint: breakpointLines.has(i)
        });
      }

      return {
        file: targetFile,
        startLine,
        endLine,
        currentLine: targetLine,
        lines
      };
    } catch {
      return null;
    }
  }

  /**
   * Terminate a session
   */
  async terminateSession(
    sessionId: string
  ): Promise<{ success: boolean; message: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, message: 'Session not found' };
    }

    try {
      await session.client.disconnect(true);
      this.sessions.delete(sessionId);
      return { success: true, message: 'Session terminated' };
    } catch (error) {
      // Force cleanup even if disconnect fails
      this.sessions.delete(sessionId);
      return {
        success: true,
        message: `Session terminated (cleanup error: ${error})`
      };
    }
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId: string): DebugSessionInfo {
    return this.getSession(sessionId).info;
  }

  /**
   * List all sessions
   */
  listSessions(): DebugSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.info);
  }

  /**
   * Get a session or throw if not found
   */
  private getSession(sessionId: string): SessionData {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  /**
   * Clean up all sessions
   */
  async shutdown(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.terminateSession(sessionId).catch(() => {});
    }
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
