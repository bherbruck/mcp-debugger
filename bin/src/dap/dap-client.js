/**
 * DAP Client
 *
 * A client for communicating with Debug Adapter Protocol servers.
 * Manages the adapter process, sends requests, and handles events.
 */
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { DapMessageParser, encodeMessage } from './message-parser.js';
import { convertCapabilities, convertStackFrame, convertVariable, convertScope, convertBreakpoint } from '../session/types.js';
export class DapClient extends EventEmitter {
    config;
    process = null;
    parser;
    sequenceNumber = 1;
    pendingRequests = new Map();
    capabilities = null;
    isConnected = false;
    defaultTimeout;
    constructor(config) {
        super();
        this.config = config;
        this.parser = new DapMessageParser();
        this.defaultTimeout = config.timeout ?? 30000;
    }
    /**
     * Start the debug adapter process
     */
    async start() {
        if (this.isConnected) {
            throw new Error('DAP client is already started');
        }
        const spawnOptions = {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, ...this.config.env },
            cwd: this.config.cwd
        };
        this.process = spawn(this.config.command, this.config.args, spawnOptions);
        // Handle stdout (DAP messages)
        this.process.stdout?.on('data', (data) => {
            this.handleData(data);
        });
        // Handle stderr (adapter logging)
        this.process.stderr?.on('data', (data) => {
            const output = {
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
        this.process.on('error', (error) => {
            this.emit('error', new Error(`Failed to start debug adapter: ${error.message}`));
        });
        // Handle process exit
        this.process.on('exit', (code) => {
            this.isConnected = false;
            this.rejectAllPending(new Error(`Debug adapter exited with code ${code}`));
            this.emit('adapterExit', code);
        });
        this.isConnected = true;
    }
    /**
     * Handle incoming data from the adapter
     */
    handleData(data) {
        this.parser.append(data);
        const messages = this.parser.parseAll();
        for (const message of messages) {
            this.handleMessage(message);
        }
    }
    /**
     * Handle a parsed DAP message
     */
    handleMessage(message) {
        switch (message.type) {
            case 'response':
                this.handleResponse(message);
                break;
            case 'event':
                this.handleEvent(message);
                break;
            case 'request':
                // Reverse requests from adapter (e.g., runInTerminal)
                this.handleReverseRequest(message);
                break;
        }
    }
    /**
     * Handle a response to a previous request
     */
    handleResponse(response) {
        const pending = this.pendingRequests.get(response.request_seq);
        if (!pending) {
            // Response to unknown request - might be stale
            return;
        }
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.request_seq);
        if (response.success) {
            pending.resolve(response);
        }
        else {
            pending.reject(new Error(response.message || `Request '${pending.command}' failed`));
        }
    }
    /**
     * Handle an event from the adapter
     */
    handleEvent(event) {
        switch (event.event) {
            case 'initialized':
                this.emit('initialized');
                break;
            case 'stopped':
                this.emit('stopped', event);
                break;
            case 'continued':
                this.emit('continued', event);
                break;
            case 'exited':
                this.emit('exited', event);
                break;
            case 'terminated':
                this.emit('terminated', event);
                break;
            case 'output':
                this.emit('output', event);
                break;
            case 'breakpoint':
                this.emit('breakpoint', event);
                break;
            case 'thread':
                this.emit('thread', event);
                break;
            case 'module':
                this.emit('module', event);
                break;
            case 'loadedSource':
                this.emit('loadedSource', event);
                break;
            case 'process':
                this.emit('process', event);
                break;
            case 'capabilities':
                this.emit('capabilities', event);
                break;
            default:
                // Unknown event type - ignore
                break;
        }
    }
    /**
     * Handle a reverse request from the adapter
     */
    handleReverseRequest(request) {
        // For now, we don't support reverse requests like runInTerminal
        // Send an error response
        const response = {
            seq: this.sequenceNumber++,
            type: 'response',
            request_seq: request.seq,
            command: request.command,
            success: false,
            message: `Reverse request '${request.command}' is not supported`
        };
        this.sendRaw(response);
    }
    /**
     * Send a request to the adapter and wait for response
     */
    async sendRequest(command, args, timeout) {
        if (!this.isConnected || !this.process?.stdin) {
            throw new Error('DAP client is not connected');
        }
        const seq = this.sequenceNumber++;
        const request = {
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
                resolve: resolve,
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
    sendRaw(message) {
        if (!this.process?.stdin?.writable) {
            throw new Error('Cannot send message: adapter stdin is not writable');
        }
        const encoded = encodeMessage(message);
        this.process.stdin.write(encoded);
    }
    /**
     * Reject all pending requests
     */
    rejectAllPending(error) {
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
    async initialize() {
        const response = await this.sendRequest('initialize', {
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
        });
        this.capabilities = response.body ?? {};
        return convertCapabilities(this.capabilities);
    }
    /**
     * Launch a program to debug
     */
    async launch(args) {
        await this.sendRequest('launch', args);
    }
    /**
     * Attach to a running program
     */
    async attach(args) {
        await this.sendRequest('attach', args);
    }
    /**
     * Signal that configuration is done
     */
    async configurationDone() {
        if (this.capabilities?.supportsConfigurationDoneRequest) {
            await this.sendRequest('configurationDone');
        }
    }
    /**
     * Set breakpoints in a source file
     */
    async setBreakpoints(source, breakpoints) {
        const response = await this.sendRequest('setBreakpoints', { source, breakpoints });
        return (response.body?.breakpoints ?? []).map((bp, index) => convertBreakpoint(bp, source.path ?? '', breakpoints[index]?.line ?? 0));
    }
    /**
     * Set function breakpoints
     */
    async setFunctionBreakpoints(breakpoints) {
        if (!this.capabilities?.supportsFunctionBreakpoints) {
            return [];
        }
        const response = await this.sendRequest('setFunctionBreakpoints', { breakpoints });
        return (response.body?.breakpoints ?? []).map((bp) => convertBreakpoint(bp, '', 0));
    }
    /**
     * Set exception breakpoints
     */
    async setExceptionBreakpoints(filters) {
        await this.sendRequest('setExceptionBreakpoints', { filters });
    }
    /**
     * Get all threads
     */
    async threads() {
        const response = await this.sendRequest('threads');
        return (response.body?.threads ?? []).map((t) => ({
            id: t.id,
            name: t.name
        }));
    }
    /**
     * Get stack trace for a thread
     */
    async stackTrace(threadId, startFrame, levels) {
        const response = await this.sendRequest('stackTrace', {
            threadId,
            startFrame,
            levels
        });
        return (response.body?.stackFrames ?? []).map(convertStackFrame);
    }
    /**
     * Get scopes for a stack frame
     */
    async scopes(frameId) {
        const response = await this.sendRequest('scopes', {
            frameId
        });
        return (response.body?.scopes ?? []).map(convertScope);
    }
    /**
     * Get variables for a scope or variable reference
     */
    async variables(variablesReference) {
        const response = await this.sendRequest('variables', { variablesReference });
        return (response.body?.variables ?? []).map(convertVariable);
    }
    /**
     * Evaluate an expression
     */
    async evaluate(expression, frameId, context) {
        const response = await this.sendRequest('evaluate', { expression, frameId, context });
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
    async continue(threadId) {
        const response = await this.sendRequest('continue', { threadId });
        return response.body?.allThreadsContinued ?? true;
    }
    /**
     * Step to next line (step over)
     */
    async next(threadId) {
        await this.sendRequest('next', { threadId });
    }
    /**
     * Step into function
     */
    async stepIn(threadId) {
        await this.sendRequest('stepIn', { threadId });
    }
    /**
     * Step out of function
     */
    async stepOut(threadId) {
        await this.sendRequest('stepOut', { threadId });
    }
    /**
     * Pause execution
     */
    async pause(threadId) {
        await this.sendRequest('pause', { threadId });
    }
    /**
     * Terminate the debuggee
     */
    async terminate() {
        if (this.capabilities?.supportsTerminateRequest) {
            await this.sendRequest('terminate');
        }
    }
    /**
     * Disconnect from the debug adapter
     */
    async disconnect(terminateDebuggee = true) {
        try {
            await this.sendRequest('disconnect', { terminateDebuggee }, 5000);
        }
        catch {
            // Ignore errors during disconnect
        }
        this.isConnected = false;
        this.process?.kill();
        this.process = null;
        this.parser.clear();
        this.rejectAllPending(new Error('Client disconnected'));
    }
    /**
     * Get the adapter capabilities
     */
    getCapabilities() {
        return this.capabilities;
    }
    /**
     * Check if connected
     */
    isStarted() {
        return this.isConnected;
    }
}
