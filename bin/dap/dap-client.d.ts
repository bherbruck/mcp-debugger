/**
 * DAP Client
 *
 * A client for communicating with Debug Adapter Protocol servers.
 * Manages the adapter process, sends requests, and handles events.
 */
import { EventEmitter } from 'events';
import { DebugProtocol } from '@vscode/debugprotocol';
import { BreakpointInfo, StackFrame, Variable, Scope, ThreadInfo, EvaluationResult, AdapterCapabilities } from '../session/types.js';
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
export declare class DapClient extends EventEmitter {
    private config;
    private process;
    private socket;
    private parser;
    private sequenceNumber;
    private pendingRequests;
    private capabilities;
    private isConnected;
    private defaultTimeout;
    private connectionMode;
    private tcpPort;
    private tcpHost;
    private childSessions;
    private activeChildSession;
    constructor(config: DapClientConfig);
    /**
     * Start the debug adapter process
     */
    start(): Promise<void>;
    /**
     * Start in stdio mode (default)
     */
    private startStdio;
    /**
     * Start in TCP mode - spawn adapter and connect to its TCP port
     */
    private startTcp;
    /**
     * Handle incoming data from the adapter
     */
    private handleData;
    /**
     * Handle a parsed DAP message
     */
    private handleMessage;
    /**
     * Handle a response to a previous request
     */
    private handleResponse;
    /**
     * Handle an event from the adapter
     */
    private handleEvent;
    /**
     * Handle a reverse request from the adapter
     */
    private handleReverseRequest;
    /**
     * Handle startDebugging reverse request from vscode-js-debug
     * Creates a child session to handle the debug target
     */
    private handleStartDebugging;
    /**
     * Create a child session for a debug target
     */
    private createChildSession;
    /**
     * Initialize a child session with the target configuration
     */
    private initializeChildSession;
    /**
     * Send a message to a child session
     */
    private sendToChildSession;
    /**
     * Wait for a response from a child session
     */
    private waitForChildResponse;
    /**
     * Send a request to the active child session and wait for response
     * Used for multi-session DAP adapters like vscode-js-debug
     */
    sendRequestToChild<T extends DebugProtocol.Response>(command: string, args?: object, timeout?: number): Promise<T>;
    /**
     * Check if there's an active child session
     */
    hasActiveChildSession(): boolean;
    /**
     * Handle incoming data from a child session
     */
    private handleChildData;
    /**
     * Handle a message from a child session
     */
    private handleChildMessage;
    /**
     * Send a response to a reverse request
     */
    private sendReverseResponse;
    /**
     * Send a request to the adapter and wait for response
     */
    sendRequest<T extends DebugProtocol.Response>(command: string, args?: object, timeout?: number): Promise<T>;
    /**
     * Send a raw DAP message
     */
    private sendRaw;
    /**
     * Reject all pending requests
     */
    private rejectAllPending;
    /**
     * Initialize the debug adapter
     */
    initialize(): Promise<AdapterCapabilities>;
    /**
     * Launch a program to debug.
     * Note: Some adapters (like debugpy) don't respond to launch until after configurationDone.
     * Use launchAsync() + waitForLaunch() for those cases.
     */
    launch(args: DebugProtocol.LaunchRequestArguments): Promise<void>;
    private pendingLaunchSeq;
    private pendingLaunchResolve;
    /**
     * Launch a program without waiting for response.
     * Use this with adapters that respond to launch after configurationDone.
     */
    launchAsync(args: DebugProtocol.LaunchRequestArguments): void;
    /**
     * Wait for the pending launch response (if any)
     */
    waitForLaunch(timeout?: number): Promise<void>;
    /**
     * Attach to a running program
     */
    attach(args: DebugProtocol.AttachRequestArguments): Promise<void>;
    /**
     * Signal that configuration is done
     */
    configurationDone(): Promise<void>;
    /**
     * Set breakpoints in a source file
     */
    setBreakpoints(source: DebugProtocol.Source, breakpoints: DebugProtocol.SourceBreakpoint[]): Promise<BreakpointInfo[]>;
    /**
     * Set function breakpoints
     */
    setFunctionBreakpoints(breakpoints: DebugProtocol.FunctionBreakpoint[]): Promise<BreakpointInfo[]>;
    /**
     * Set exception breakpoints
     */
    setExceptionBreakpoints(filters: string[]): Promise<void>;
    /**
     * Get all threads
     */
    threads(): Promise<ThreadInfo[]>;
    /**
     * Get stack trace for a thread
     */
    stackTrace(threadId: number, startFrame?: number, levels?: number): Promise<StackFrame[]>;
    /**
     * Get scopes for a stack frame
     */
    scopes(frameId: number): Promise<Scope[]>;
    /**
     * Get variables for a scope or variable reference
     */
    variables(variablesReference: number): Promise<Variable[]>;
    /**
     * Evaluate an expression
     */
    evaluate(expression: string, frameId?: number, context?: 'watch' | 'repl' | 'hover' | 'clipboard' | 'variables'): Promise<EvaluationResult>;
    /**
     * Continue execution
     */
    continue(threadId: number): Promise<boolean>;
    /**
     * Step to next line (step over)
     */
    next(threadId: number): Promise<void>;
    /**
     * Step into function
     */
    stepIn(threadId: number): Promise<void>;
    /**
     * Step out of function
     */
    stepOut(threadId: number): Promise<void>;
    /**
     * Pause execution
     */
    pause(threadId: number): Promise<void>;
    /**
     * Terminate the debuggee
     */
    terminate(): Promise<void>;
    /**
     * Disconnect from the debug adapter
     */
    disconnect(terminateDebuggee?: boolean): Promise<void>;
    /**
     * Get the adapter capabilities
     */
    getCapabilities(): DebugProtocol.Capabilities | null;
    /**
     * Check if connected
     */
    isStarted(): boolean;
}
//# sourceMappingURL=dap-client.d.ts.map