/**
 * Session Types and Interfaces
 *
 * Core type definitions for debug sessions, breakpoints, and debugging state.
 */
/**
 * Supported programming languages for debugging
 */
export var DebugLanguage;
(function (DebugLanguage) {
    DebugLanguage["JAVASCRIPT"] = "javascript";
    DebugLanguage["TYPESCRIPT"] = "typescript";
    DebugLanguage["PYTHON"] = "python";
    DebugLanguage["GO"] = "go";
    DebugLanguage["RUST"] = "rust";
})(DebugLanguage || (DebugLanguage = {}));
/**
 * Debug session state machine
 */
export var SessionState;
(function (SessionState) {
    /** Session created but adapter not started */
    SessionState["CREATED"] = "created";
    /** Adapter process starting */
    SessionState["INITIALIZING"] = "initializing";
    /** Adapter initialized, ready for launch/attach */
    SessionState["READY"] = "ready";
    /** Program is running */
    SessionState["RUNNING"] = "running";
    /** Program is paused (breakpoint, step, etc.) */
    SessionState["PAUSED"] = "paused";
    /** Session has ended normally */
    SessionState["TERMINATED"] = "terminated";
    /** Session ended due to error */
    SessionState["ERROR"] = "error";
})(SessionState || (SessionState = {}));
/**
 * Convert DebugProtocol types to our internal types
 */
export function convertCapabilities(caps) {
    return {
        supportsConfigurationDoneRequest: caps.supportsConfigurationDoneRequest ?? false,
        supportsFunctionBreakpoints: caps.supportsFunctionBreakpoints ?? false,
        supportsConditionalBreakpoints: caps.supportsConditionalBreakpoints ?? false,
        supportsHitConditionalBreakpoints: caps.supportsHitConditionalBreakpoints ?? false,
        supportsEvaluateForHovers: caps.supportsEvaluateForHovers ?? false,
        supportsStepBack: caps.supportsStepBack ?? false,
        supportsSetVariable: caps.supportsSetVariable ?? false,
        supportsRestartFrame: caps.supportsRestartFrame ?? false,
        supportsGotoTargetsRequest: caps.supportsGotoTargetsRequest ?? false,
        supportsStepInTargetsRequest: caps.supportsStepInTargetsRequest ?? false,
        supportsCompletionsRequest: caps.supportsCompletionsRequest ?? false,
        supportsModulesRequest: caps.supportsModulesRequest ?? false,
        supportsRestartRequest: caps.supportsRestartRequest ?? false,
        supportsExceptionOptions: caps.supportsExceptionOptions ?? false,
        supportsValueFormattingOptions: caps.supportsValueFormattingOptions ?? false,
        supportsExceptionInfoRequest: caps.supportsExceptionInfoRequest ?? false,
        supportTerminateDebuggee: caps.supportTerminateDebuggee ?? false,
        supportsDelayedStackTraceLoading: caps.supportsDelayedStackTraceLoading ?? false,
        supportsLoadedSourcesRequest: caps.supportsLoadedSourcesRequest ?? false,
        supportsLogPoints: caps.supportsLogPoints ?? false,
        supportsTerminateThreadsRequest: caps.supportsTerminateThreadsRequest ?? false,
        supportsSetExpression: caps.supportsSetExpression ?? false,
        supportsTerminateRequest: caps.supportsTerminateRequest ?? false,
        supportsDataBreakpoints: caps.supportsDataBreakpoints ?? false,
        supportsReadMemoryRequest: caps.supportsReadMemoryRequest ?? false,
        supportsWriteMemoryRequest: caps.supportsWriteMemoryRequest ?? false,
        supportsDisassembleRequest: caps.supportsDisassembleRequest ?? false,
        supportsCancelRequest: caps.supportsCancelRequest ?? false,
        supportsBreakpointLocationsRequest: caps.supportsBreakpointLocationsRequest ?? false,
        supportsClipboardContext: caps.supportsClipboardContext ?? false,
        supportsSteppingGranularity: caps.supportsSteppingGranularity ?? false,
        supportsInstructionBreakpoints: caps.supportsInstructionBreakpoints ?? false,
        supportsExceptionFilterOptions: caps.supportsExceptionFilterOptions ?? false,
        supportsSingleThreadExecutionRequests: caps.supportsSingleThreadExecutionRequests ?? false
    };
}
export function convertStackFrame(frame) {
    return {
        id: frame.id,
        name: frame.name,
        file: frame.source?.path ?? frame.source?.name ?? 'unknown',
        line: frame.line,
        column: frame.column,
        moduleId: frame.moduleId,
        presentationHint: frame.presentationHint
    };
}
export function convertVariable(variable) {
    return {
        name: variable.name,
        value: variable.value,
        type: variable.type ?? 'unknown',
        variablesReference: variable.variablesReference,
        hasChildren: variable.variablesReference > 0,
        namedVariables: variable.namedVariables,
        indexedVariables: variable.indexedVariables,
        memoryReference: variable.memoryReference,
        evaluateName: variable.evaluateName
    };
}
export function convertScope(scope) {
    return {
        name: scope.name,
        variablesReference: scope.variablesReference,
        namedVariables: scope.namedVariables,
        indexedVariables: scope.indexedVariables,
        expensive: scope.expensive ?? false,
        source: scope.source?.path
            ? { path: scope.source.path, line: scope.source.sourceReference }
            : undefined
    };
}
export function convertBreakpoint(bp, file, requestedLine) {
    return {
        id: bp.id ?? 0,
        file: bp.source?.path ?? file,
        line: bp.line ?? requestedLine,
        column: bp.column,
        verified: bp.verified,
        message: bp.message
    };
}
//# sourceMappingURL=types.js.map