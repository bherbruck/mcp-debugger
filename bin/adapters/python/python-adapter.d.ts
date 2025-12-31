/**
 * Python Debug Adapter
 *
 * Uses debugpy (Microsoft's Python debugger) for debugging Python code.
 * https://github.com/microsoft/debugpy
 */
import { DebugProtocol } from '@vscode/debugprotocol';
import { DebugLanguage, LaunchParams } from '../../session/types.js';
import { IDebugAdapter, AdapterCommand, ValidationResult, InstallationStatus } from '../types.js';
export declare class PythonAdapter implements IDebugAdapter {
    readonly language = DebugLanguage.PYTHON;
    readonly name = "Python Debug Adapter (debugpy)";
    readonly runtime = "python";
    private pythonPath;
    private cachedInstallStatus;
    checkInstallation(): Promise<InstallationStatus>;
    install(): Promise<void>;
    getAdapterCommand(): Promise<AdapterCommand>;
    validateEnvironment(): Promise<ValidationResult>;
    resolveExecutablePath(preferredPath?: string): Promise<string>;
    buildLaunchConfig(params: LaunchParams, executablePath: string): DebugProtocol.LaunchRequestArguments;
    getFileExtensions(): string[];
}
//# sourceMappingURL=python-adapter.d.ts.map