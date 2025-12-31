/**
 * Session Manager
 *
 * Central orchestrator for debug sessions. Manages session lifecycle,
 * coordinates adapters and DAP clients, and routes tool requests.
 */
import { EventEmitter } from 'events';
import { SessionState, DebugSessionInfo, SessionCreateParams, LaunchParams, BreakpointInfo, SetBreakpointRequest, StackFrame, Variable, Scope, ThreadInfo, EvaluationResult, SourceContext, StopReason, DebugOutput } from './types.js';
/**
 * Events emitted by the session manager
 */
export interface SessionManagerEvents {
    sessionCreated: (session: DebugSessionInfo) => void;
    sessionStateChanged: (sessionId: string, state: SessionState, previousState: SessionState) => void;
    sessionTerminated: (sessionId: string) => void;
    stopped: (sessionId: string, reason: StopReason, threadId: number, description?: string) => void;
    output: (sessionId: string, output: DebugOutput) => void;
    error: (sessionId: string, error: Error) => void;
}
export declare class SessionManager extends EventEmitter {
    private sessions;
    constructor();
    /**
     * Create a new debug session
     */
    createSession(params: SessionCreateParams): Promise<DebugSessionInfo>;
    /**
     * Set up event handlers for a DAP client
     */
    private setupEventHandlers;
    /**
     * Update session state
     */
    private updateState;
    /**
     * Start debugging a script
     */
    startDebugging(sessionId: string, params: LaunchParams): Promise<{
        success: boolean;
        state: SessionState;
        message: string;
    }>;
    /**
     * Wait for the initialized event from the debug adapter
     */
    private waitForInitialized;
    /**
     * Set a breakpoint
     */
    setBreakpoint(sessionId: string, request: SetBreakpointRequest): Promise<{
        success: boolean;
        breakpoint?: BreakpointInfo;
        message?: string;
    }>;
    /**
     * Internal method to set breakpoints via DAP
     */
    private setBreakpointsInternal;
    /**
     * Remove a breakpoint
     */
    removeBreakpoint(sessionId: string, file: string, line: number): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * List all breakpoints
     */
    listBreakpoints(sessionId: string): BreakpointInfo[];
    /**
     * Continue execution
     */
    continue(sessionId: string, threadId?: number, options?: {
        waitForBreakpoint?: boolean;
        timeout?: number;
    }): Promise<{
        success: boolean;
        state: SessionState;
        message: string;
        stoppedAt?: StackFrame;
        variables?: Variable[];
    }>;
    /**
     * Pause execution
     */
    pause(sessionId: string, threadId?: number): Promise<{
        success: boolean;
        state: SessionState;
        message: string;
    }>;
    /**
     * Wait for session to pause (with timeout)
     */
    private waitForPause;
    /**
     * Step in
     */
    stepIn(sessionId: string, threadId?: number): Promise<{
        success: boolean;
        state: SessionState;
        stoppedAt?: StackFrame;
        variables?: Variable[];
    }>;
    /**
     * Step over
     */
    stepOver(sessionId: string, threadId?: number): Promise<{
        success: boolean;
        state: SessionState;
        stoppedAt?: StackFrame;
        variables?: Variable[];
    }>;
    /**
     * Step out
     */
    stepOut(sessionId: string, threadId?: number): Promise<{
        success: boolean;
        state: SessionState;
        stoppedAt?: StackFrame;
        variables?: Variable[];
    }>;
    /**
     * Get stack trace
     */
    getStackTrace(sessionId: string, threadId?: number): Promise<StackFrame[]>;
    /**
     * Get scopes for a frame
     */
    getScopes(sessionId: string, frameId?: number): Promise<Scope[]>;
    /**
     * Get variables
     */
    getVariables(sessionId: string, frameId?: number, scopeFilter?: 'local' | 'global' | 'closure'): Promise<Variable[]>;
    /**
     * Expand a variable (get its children)
     */
    expandVariable(sessionId: string, variablesReference: number): Promise<Variable[]>;
    /**
     * Evaluate an expression
     */
    evaluateExpression(sessionId: string, expression: string, frameId?: number, context?: 'watch' | 'repl' | 'hover'): Promise<EvaluationResult>;
    /**
     * Get threads
     */
    getThreads(sessionId: string): Promise<ThreadInfo[]>;
    /**
     * Get source context around current location
     */
    getSourceContext(sessionId: string, file?: string, line?: number, linesContext?: number): Promise<SourceContext | null>;
    /**
     * Terminate a session
     */
    terminateSession(sessionId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Get session info
     */
    getSessionInfo(sessionId: string): DebugSessionInfo;
    /**
     * List all sessions
     */
    listSessions(): DebugSessionInfo[];
    /**
     * Get a session or throw if not found
     */
    private getSession;
    /**
     * Clean up all sessions
     */
    shutdown(): Promise<void>;
}
export declare const sessionManager: SessionManager;
//# sourceMappingURL=session-manager.d.ts.map