/**
 * JavaScript/TypeScript Debug Adapter
 *
 * Uses vscode-js-debug for debugging Node.js applications.
 * https://github.com/microsoft/vscode-js-debug
 *
 * NOTE: vscode-js-debug uses a multi-session DAP architecture where each debug
 * target gets its own DAP session. This requires handling the 'startDebugging'
 * reverse request and managing multiple sessions internally. See:
 * https://github.com/microsoft/vscode-js-debug/issues/969
 *
 * For full functionality, the DAP client needs to:
 * 1. Respond successfully to 'startDebugging' reverse requests
 * 2. Handle events for the correct session context
 */
import { DebugProtocol } from '@vscode/debugprotocol';
import { DebugLanguage, LaunchParams } from '../../session/types.js';
import { IDebugAdapter, AdapterCommand, ValidationResult, InstallationStatus } from '../types.js';
export declare class JavaScriptAdapter implements IDebugAdapter {
    readonly language = DebugLanguage.JAVASCRIPT;
    readonly name = "JavaScript Debug Adapter (vscode-js-debug)";
    readonly runtime = "node";
    private nodePath;
    private cachedInstallStatus;
    checkInstallation(): Promise<InstallationStatus>;
    install(): Promise<void>;
    private installFromSource;
    getAdapterCommand(): Promise<AdapterCommand>;
    validateEnvironment(): Promise<ValidationResult>;
    resolveExecutablePath(preferredPath?: string): Promise<string>;
    buildLaunchConfig(params: LaunchParams, executablePath: string): DebugProtocol.LaunchRequestArguments;
    getFileExtensions(): string[];
}
/**
 * TypeScript adapter - creates a standalone adapter for TypeScript
 */
export declare class TypeScriptAdapter implements IDebugAdapter {
    readonly language = DebugLanguage.TYPESCRIPT;
    readonly name = "TypeScript Debug Adapter (vscode-js-debug)";
    readonly runtime = "node";
    private jsAdapter;
    checkInstallation(): Promise<InstallationStatus>;
    install(): Promise<void>;
    getAdapterCommand(): Promise<AdapterCommand>;
    validateEnvironment(): Promise<ValidationResult>;
    resolveExecutablePath(preferredPath?: string): Promise<string>;
    buildLaunchConfig(params: LaunchParams, executablePath: string): DebugProtocol.LaunchRequestArguments;
    getFileExtensions(): string[];
}
//# sourceMappingURL=javascript-adapter.d.ts.map