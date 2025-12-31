/**
 * Session Types and Interfaces
 *
 * Core type definitions for debug sessions, breakpoints, and debugging state.
 */

import { DebugProtocol } from '@vscode/debugprotocol';

/**
 * Supported programming languages for debugging
 */
export enum DebugLanguage {
  JAVASCRIPT = 'javascript',
  TYPESCRIPT = 'typescript',
  PYTHON = 'python',
  GO = 'go',
  RUST = 'rust'
}

/**
 * Debug session state machine
 */
export enum SessionState {
  /** Session created but adapter not started */
  CREATED = 'created',
  /** Adapter process starting */
  INITIALIZING = 'initializing',
  /** Adapter initialized, ready for launch/attach */
  READY = 'ready',
  /** Program is running */
  RUNNING = 'running',
  /** Program is paused (breakpoint, step, etc.) */
  PAUSED = 'paused',
  /** Session has ended normally */
  TERMINATED = 'terminated',
  /** Session ended due to error */
  ERROR = 'error'
}

/**
 * Reason why the program stopped
 */
export type StopReason =
  | 'breakpoint'
  | 'step'
  | 'pause'
  | 'exception'
  | 'entry'
  | 'goto'
  | 'function breakpoint'
  | 'data breakpoint'
  | 'instruction breakpoint';

/**
 * Information about a debug session
 */
export interface DebugSessionInfo {
  id: string;
  name: string;
  language: DebugLanguage;
  state: SessionState;
  scriptPath?: string;
  workingDirectory?: string;
  createdAt: Date;
  stoppedReason?: StopReason;
  stoppedThreadId?: number;
  exitCode?: number;
  error?: string;
}

/**
 * Parameters for creating a new debug session
 */
export interface SessionCreateParams {
  language: DebugLanguage;
  name?: string;
  executablePath?: string;
}

/**
 * Parameters for launching a program to debug
 */
export interface LaunchParams {
  scriptPath: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  stopOnEntry?: boolean;
}

/**
 * Information about a breakpoint
 */
export interface BreakpointInfo {
  /** Unique ID assigned by the debug adapter */
  id: number;
  /** Source file path */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based, optional) */
  column?: number;
  /** Whether the breakpoint has been verified by the adapter */
  verified: boolean;
  /** Conditional expression (optional) */
  condition?: string;
  /** Hit count condition (optional) */
  hitCondition?: string;
  /** Log message instead of breaking (optional) */
  logMessage?: string;
  /** Additional message from adapter */
  message?: string;
}

/**
 * Request to set a breakpoint
 */
export interface SetBreakpointRequest {
  file: string;
  line: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}

/**
 * Stack frame information
 */
export interface StackFrame {
  /** Frame ID */
  id: number;
  /** Function or method name */
  name: string;
  /** Source file path */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based, optional) */
  column?: number;
  /** Module or namespace name (optional) */
  moduleId?: number;
  /** Additional presentation hint */
  presentationHint?: 'normal' | 'label' | 'subtle';
}

/**
 * Variable information
 */
export interface Variable {
  /** Variable name */
  name: string;
  /** String representation of value */
  value: string;
  /** Type of the variable */
  type: string;
  /** Reference to children (for objects/arrays) */
  variablesReference: number;
  /** Whether this variable has expandable children */
  hasChildren: boolean;
  /** Named children count */
  namedVariables?: number;
  /** Indexed children count */
  indexedVariables?: number;
  /** Memory reference (optional) */
  memoryReference?: string;
  /** Evaluation name for hover/watch (optional) */
  evaluateName?: string;
}

/**
 * Scope information
 */
export interface Scope {
  /** Scope name (e.g., 'Locals', 'Globals') */
  name: string;
  /** Reference to variables in this scope */
  variablesReference: number;
  /** Number of named variables */
  namedVariables?: number;
  /** Number of indexed variables */
  indexedVariables?: number;
  /** Whether this is an expensive scope to evaluate */
  expensive: boolean;
  /** Optional source location */
  source?: {
    path: string;
    line?: number;
  };
}

/**
 * Thread information
 */
export interface ThreadInfo {
  id: number;
  name: string;
}

/**
 * Result of expression evaluation
 */
export interface EvaluationResult {
  result: string;
  type: string;
  variablesReference: number;
  hasChildren: boolean;
  namedVariables?: number;
  indexedVariables?: number;
  memoryReference?: string;
}

/**
 * Source context around current execution point
 */
export interface SourceContext {
  file: string;
  startLine: number;
  endLine: number;
  currentLine: number;
  lines: SourceLine[];
}

/**
 * A line of source code with metadata
 */
export interface SourceLine {
  lineNumber: number;
  content: string;
  isCurrent: boolean;
  hasBreakpoint: boolean;
}

/**
 * Output from the debuggee
 */
export interface DebugOutput {
  category: 'console' | 'stdout' | 'stderr' | 'telemetry' | 'important';
  output: string;
  source?: string;
  line?: number;
  column?: number;
}

/**
 * Events emitted by debug sessions
 */
export interface DebugSessionEvents {
  /** Session state changed */
  stateChanged: (state: SessionState, previousState: SessionState) => void;

  /** Program stopped (breakpoint, step, exception, etc.) */
  stopped: (reason: StopReason, threadId: number, description?: string) => void;

  /** Program continued execution */
  continued: (threadId: number) => void;

  /** Program exited */
  exited: (exitCode: number) => void;

  /** Debug session terminated */
  terminated: () => void;

  /** Output from debuggee */
  output: (output: DebugOutput) => void;

  /** Breakpoint changed (verified, moved, etc.) */
  breakpointChanged: (breakpoint: BreakpointInfo) => void;

  /** Thread started */
  threadStarted: (thread: ThreadInfo) => void;

  /** Thread exited */
  threadExited: (threadId: number) => void;

  /** Error occurred */
  error: (error: Error) => void;
}

/**
 * Capabilities reported by a debug adapter
 */
export interface AdapterCapabilities {
  supportsConfigurationDoneRequest: boolean;
  supportsFunctionBreakpoints: boolean;
  supportsConditionalBreakpoints: boolean;
  supportsHitConditionalBreakpoints: boolean;
  supportsEvaluateForHovers: boolean;
  supportsStepBack: boolean;
  supportsSetVariable: boolean;
  supportsRestartFrame: boolean;
  supportsGotoTargetsRequest: boolean;
  supportsStepInTargetsRequest: boolean;
  supportsCompletionsRequest: boolean;
  supportsModulesRequest: boolean;
  supportsRestartRequest: boolean;
  supportsExceptionOptions: boolean;
  supportsValueFormattingOptions: boolean;
  supportsExceptionInfoRequest: boolean;
  supportTerminateDebuggee: boolean;
  supportsDelayedStackTraceLoading: boolean;
  supportsLoadedSourcesRequest: boolean;
  supportsLogPoints: boolean;
  supportsTerminateThreadsRequest: boolean;
  supportsSetExpression: boolean;
  supportsTerminateRequest: boolean;
  supportsDataBreakpoints: boolean;
  supportsReadMemoryRequest: boolean;
  supportsWriteMemoryRequest: boolean;
  supportsDisassembleRequest: boolean;
  supportsCancelRequest: boolean;
  supportsBreakpointLocationsRequest: boolean;
  supportsClipboardContext: boolean;
  supportsSteppingGranularity: boolean;
  supportsInstructionBreakpoints: boolean;
  supportsExceptionFilterOptions: boolean;
  supportsSingleThreadExecutionRequests: boolean;
}

/**
 * Convert DebugProtocol types to our internal types
 */
export function convertCapabilities(
  caps: DebugProtocol.Capabilities
): Partial<AdapterCapabilities> {
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

export function convertStackFrame(frame: DebugProtocol.StackFrame): StackFrame {
  return {
    id: frame.id,
    name: frame.name,
    file: frame.source?.path ?? frame.source?.name ?? 'unknown',
    line: frame.line,
    column: frame.column,
    moduleId: frame.moduleId as number | undefined,
    presentationHint: frame.presentationHint
  };
}

export function convertVariable(variable: DebugProtocol.Variable): Variable {
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

export function convertScope(scope: DebugProtocol.Scope): Scope {
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

export function convertBreakpoint(
  bp: DebugProtocol.Breakpoint,
  file: string,
  requestedLine: number
): BreakpointInfo {
  return {
    id: bp.id ?? 0,
    file: bp.source?.path ?? file,
    line: bp.line ?? requestedLine,
    column: bp.column,
    verified: bp.verified,
    message: bp.message
  };
}
