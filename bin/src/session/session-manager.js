/**
 * Session Manager
 *
 * Central orchestrator for debug sessions. Manages session lifecycle,
 * coordinates adapters and DAP clients, and routes tool requests.
 */
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SessionState } from './types.js';
import { DapClient } from '../dap/dap-client.js';
import { adapterRegistry } from '../adapters/index.js';
export class SessionManager extends EventEmitter {
    sessions = new Map();
    constructor() {
        super();
    }
    /**
     * Create a new debug session
     */
    async createSession(params) {
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
            cwd: adapterCommand.cwd
        });
        // Generate session ID
        const sessionId = randomUUID();
        const sessionName = name ?? `${language}-debug-${sessionId.substring(0, 8)}`;
        // Create session info
        const info = {
            id: sessionId,
            name: sessionName,
            language,
            state: SessionState.CREATED,
            createdAt: new Date()
        };
        // Store session data
        const sessionData = {
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
    setupEventHandlers(sessionId, client) {
        client.on('initialized', () => {
            this.updateState(sessionId, SessionState.READY);
        });
        client.on('stopped', (event) => {
            const session = this.sessions.get(sessionId);
            if (session) {
                session.currentThreadId = event.body.threadId ?? 1;
                session.info.stoppedReason = event.body.reason;
                session.info.stoppedThreadId = session.currentThreadId;
            }
            this.updateState(sessionId, SessionState.PAUSED);
            this.emit('stopped', sessionId, event.body.reason, event.body.threadId ?? 1, event.body.description);
        });
        client.on('continued', () => {
            this.updateState(sessionId, SessionState.RUNNING);
        });
        client.on('exited', (event) => {
            const session = this.sessions.get(sessionId);
            if (session) {
                session.info.exitCode = event.body.exitCode;
            }
        });
        client.on('terminated', () => {
            this.updateState(sessionId, SessionState.TERMINATED);
            this.emit('sessionTerminated', sessionId);
        });
        client.on('output', (event) => {
            const output = {
                category: event.body.category,
                output: event.body.output,
                source: event.body.source?.path,
                line: event.body.line,
                column: event.body.column
            };
            this.emit('output', sessionId, output);
        });
        client.on('adapterExit', (code) => {
            if (this.sessions.has(sessionId)) {
                this.updateState(sessionId, SessionState.TERMINATED);
                this.emit('sessionTerminated', sessionId);
            }
        });
        client.on('error', (error) => {
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
    updateState(sessionId, newState) {
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
    async startDebugging(sessionId, params) {
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
            const launchConfig = session.adapter.buildLaunchConfig(params, session.executablePath);
            // Set breakpoints before launch
            for (const [file, breakpoints] of session.breakpoints) {
                await this.setBreakpointsInternal(session, file, breakpoints);
            }
            // Launch the program
            await session.client.launch(launchConfig);
            // Signal configuration done
            await session.client.configurationDone();
            this.updateState(sessionId, SessionState.RUNNING);
            return {
                success: true,
                state: session.info.state,
                message: 'Debugging started successfully'
            };
        }
        catch (error) {
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
     * Set a breakpoint
     */
    async setBreakpoint(sessionId, request) {
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
        }
        else {
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
        if (session.info.state === SessionState.READY ||
            session.info.state === SessionState.RUNNING ||
            session.info.state === SessionState.PAUSED) {
            const result = await this.setBreakpointsInternal(session, normalizedFile, existingBreakpoints);
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
    async setBreakpointsInternal(session, file, breakpoints) {
        const source = { path: file };
        const bpRequests = breakpoints.map((bp) => ({
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
    async removeBreakpoint(sessionId, file, line) {
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
        if (session.info.state === SessionState.READY ||
            session.info.state === SessionState.RUNNING ||
            session.info.state === SessionState.PAUSED) {
            await this.setBreakpointsInternal(session, normalizedFile, breakpoints);
        }
        return { success: true, message: 'Breakpoint removed' };
    }
    /**
     * List all breakpoints
     */
    listBreakpoints(sessionId) {
        const session = this.getSession(sessionId);
        const allBreakpoints = [];
        for (const breakpoints of session.breakpoints.values()) {
            allBreakpoints.push(...breakpoints);
        }
        return allBreakpoints;
    }
    /**
     * Continue execution
     */
    async continue(sessionId, threadId) {
        const session = this.getSession(sessionId);
        const tid = threadId ?? session.currentThreadId;
        try {
            await session.client.continue(tid);
            return {
                success: true,
                state: session.info.state,
                message: 'Execution continued'
            };
        }
        catch (error) {
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
    async pause(sessionId, threadId) {
        const session = this.getSession(sessionId);
        const tid = threadId ?? session.currentThreadId;
        try {
            await session.client.pause(tid);
            return {
                success: true,
                state: session.info.state,
                message: 'Execution paused'
            };
        }
        catch (error) {
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
    async stepIn(sessionId, threadId) {
        const session = this.getSession(sessionId);
        const tid = threadId ?? session.currentThreadId;
        try {
            await session.client.stepIn(tid);
            // The stopped event will update state
            return {
                success: true,
                state: session.info.state
            };
        }
        catch (error) {
            return {
                success: false,
                state: session.info.state
            };
        }
    }
    /**
     * Step over
     */
    async stepOver(sessionId, threadId) {
        const session = this.getSession(sessionId);
        const tid = threadId ?? session.currentThreadId;
        try {
            await session.client.next(tid);
            return {
                success: true,
                state: session.info.state
            };
        }
        catch (error) {
            return {
                success: false,
                state: session.info.state
            };
        }
    }
    /**
     * Step out
     */
    async stepOut(sessionId, threadId) {
        const session = this.getSession(sessionId);
        const tid = threadId ?? session.currentThreadId;
        try {
            await session.client.stepOut(tid);
            return {
                success: true,
                state: session.info.state
            };
        }
        catch (error) {
            return {
                success: false,
                state: session.info.state
            };
        }
    }
    /**
     * Get stack trace
     */
    async getStackTrace(sessionId, threadId) {
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
    async getScopes(sessionId, frameId) {
        const session = this.getSession(sessionId);
        const fid = frameId ?? session.currentFrameId;
        return session.client.scopes(fid);
    }
    /**
     * Get variables
     */
    async getVariables(sessionId, frameId, scopeFilter) {
        const session = this.getSession(sessionId);
        const fid = frameId ?? session.currentFrameId;
        // Get scopes for the frame
        const scopes = await session.client.scopes(fid);
        // Filter by scope type if requested
        let targetScopes = scopes;
        if (scopeFilter) {
            targetScopes = scopes.filter((s) => s.name.toLowerCase().includes(scopeFilter));
        }
        // Get variables from all target scopes
        const allVariables = [];
        for (const scope of targetScopes) {
            const vars = await session.client.variables(scope.variablesReference);
            allVariables.push(...vars);
        }
        return allVariables;
    }
    /**
     * Expand a variable (get its children)
     */
    async expandVariable(sessionId, variablesReference) {
        const session = this.getSession(sessionId);
        return session.client.variables(variablesReference);
    }
    /**
     * Evaluate an expression
     */
    async evaluateExpression(sessionId, expression, frameId, context) {
        const session = this.getSession(sessionId);
        const fid = frameId ?? session.currentFrameId;
        return session.client.evaluate(expression, fid, context);
    }
    /**
     * Get threads
     */
    async getThreads(sessionId) {
        const session = this.getSession(sessionId);
        return session.client.threads();
    }
    /**
     * Get source context around current location
     */
    async getSourceContext(sessionId, file, line, linesContext = 5) {
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
            const lines = [];
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
        }
        catch {
            return null;
        }
    }
    /**
     * Terminate a session
     */
    async terminateSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return { success: false, message: 'Session not found' };
        }
        try {
            await session.client.disconnect(true);
            this.sessions.delete(sessionId);
            return { success: true, message: 'Session terminated' };
        }
        catch (error) {
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
    getSessionInfo(sessionId) {
        return this.getSession(sessionId).info;
    }
    /**
     * List all sessions
     */
    listSessions() {
        return Array.from(this.sessions.values()).map((s) => s.info);
    }
    /**
     * Get a session or throw if not found
     */
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        return session;
    }
    /**
     * Clean up all sessions
     */
    async shutdown() {
        const sessionIds = Array.from(this.sessions.keys());
        for (const sessionId of sessionIds) {
            await this.terminateSession(sessionId).catch(() => { });
        }
    }
}
// Export singleton instance
export const sessionManager = new SessionManager();
