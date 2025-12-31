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
      currentFrameId: 0
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

        // Auto-fetch stack trace to update currentFrameId (like VSCode does)
        // This prevents "Invalid frame reference" errors in multithreaded apps
        try {
          const frames = await client.stackTrace(session.currentThreadId);
          if (frames.length > 0) {
            session.currentFrameId = frames[0].id;
          }
        } catch {
          // Ignore errors - frame will be fetched on next getStackTrace call
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
    const { file, line, condition, hitCondition, logMessage } = request;

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
        logMessage
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
        logMessage
      });
    }

    session.breakpoints.set(normalizedFile, existingBreakpoints);

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
   * Continue execution
   */
  async continue(
    sessionId: string,
    threadId?: number
  ): Promise<{ success: boolean; state: SessionState; message: string }> {
    const session = this.getSession(sessionId);
    const tid = threadId ?? session.currentThreadId;

    try {
      await session.client.continue(tid);
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
   * Step in
   */
  async stepIn(
    sessionId: string,
    threadId?: number
  ): Promise<{ success: boolean; state: SessionState; stoppedAt?: StackFrame }> {
    const session = this.getSession(sessionId);
    const tid = threadId ?? session.currentThreadId;

    try {
      await session.client.stepIn(tid);
      // The stopped event will update state
      return {
        success: true,
        state: session.info.state
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
  ): Promise<{ success: boolean; state: SessionState; stoppedAt?: StackFrame }> {
    const session = this.getSession(sessionId);
    const tid = threadId ?? session.currentThreadId;

    try {
      await session.client.next(tid);
      return {
        success: true,
        state: session.info.state
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
  ): Promise<{ success: boolean; state: SessionState; stoppedAt?: StackFrame }> {
    const session = this.getSession(sessionId);
    const tid = threadId ?? session.currentThreadId;

    try {
      await session.client.stepOut(tid);
      return {
        success: true,
        state: session.info.state
      };
    } catch (error) {
      return {
        success: false,
        state: session.info.state
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
