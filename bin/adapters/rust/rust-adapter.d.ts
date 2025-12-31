/**
 * Rust Debug Adapter
 *
 * Uses CodeLLDB for debugging Rust programs.
 * https://github.com/vadimcn/codelldb
 */
import { DebugProtocol } from '@vscode/debugprotocol';
import { DebugLanguage, LaunchParams } from '../../session/types.js';
import { IDebugAdapter, AdapterCommand, ValidationResult, InstallationStatus } from '../types.js';
export declare class RustAdapter implements IDebugAdapter {
    readonly language = DebugLanguage.RUST;
    readonly name = "Rust Debug Adapter (CodeLLDB)";
    readonly runtime = "rust";
    private cachedInstallStatus;
    checkInstallation(): Promise<InstallationStatus>;
    private getCodeLLDBPath;
    install(): Promise<void>;
    getAdapterCommand(): Promise<AdapterCommand>;
    validateEnvironment(): Promise<ValidationResult>;
    resolveExecutablePath(preferredPath?: string): Promise<string>;
    buildLaunchConfig(params: LaunchParams, _executablePath: string): DebugProtocol.LaunchRequestArguments;
    getFileExtensions(): string[];
}
//# sourceMappingURL=rust-adapter.d.ts.map