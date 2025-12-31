/**
 * Go Debug Adapter
 *
 * Uses Delve (dlv) for debugging Go programs.
 * https://github.com/go-delve/delve
 */
import { DebugProtocol } from '@vscode/debugprotocol';
import { DebugLanguage, LaunchParams } from '../../session/types.js';
import { IDebugAdapter, AdapterCommand, ValidationResult, InstallationStatus } from '../types.js';
export declare class GoAdapter implements IDebugAdapter {
    readonly language = DebugLanguage.GO;
    readonly name = "Go Debug Adapter (Delve)";
    readonly runtime = "go";
    private dlvPath;
    private cachedInstallStatus;
    checkInstallation(): Promise<InstallationStatus>;
    install(): Promise<void>;
    getAdapterCommand(): Promise<AdapterCommand>;
    validateEnvironment(): Promise<ValidationResult>;
    resolveExecutablePath(preferredPath?: string): Promise<string>;
    buildLaunchConfig(params: LaunchParams, executablePath: string): DebugProtocol.LaunchRequestArguments;
    getFileExtensions(): string[];
}
//# sourceMappingURL=go-adapter.d.ts.map