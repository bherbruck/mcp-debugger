/**
 * Adapter Installer
 *
 * Utility for installing debug adapters on demand.
 * Handles platform-specific installation and version management.
 */
/**
 * Platform information
 */
export interface PlatformInfo {
    os: 'darwin' | 'linux' | 'windows';
    arch: 'x64' | 'arm64';
}
/**
 * Get the install directory for adapters
 */
export declare function getInstallDir(): string;
/**
 * Get current platform info
 */
export declare function getPlatformInfo(): PlatformInfo;
/**
 * Ensure the install directory exists
 */
export declare function ensureInstallDir(): Promise<string>;
/**
 * Get path to an adapter's install directory
 */
export declare function getAdapterPath(adapterName: string): string;
/**
 * Check if a command exists in PATH
 */
export declare function commandExists(command: string): Promise<boolean>;
/**
 * Execute a shell command with timeout
 */
export declare function executeCommand(command: string, options?: {
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
}): Promise<{
    stdout: string;
    stderr: string;
}>;
/**
 * Download a file using curl or wget
 */
export declare function downloadFile(url: string, destPath: string, options?: {
    timeout?: number;
}): Promise<void>;
/**
 * Extract a zip file
 */
export declare function extractZip(zipPath: string, destDir: string): Promise<void>;
/**
 * Extract a tar.gz file
 */
export declare function extractTarGz(tarPath: string, destDir: string): Promise<void>;
/**
 * Check if a path exists
 */
export declare function pathExists(p: string): Promise<boolean>;
/**
 * Make a file executable
 */
export declare function makeExecutable(filePath: string): Promise<void>;
/**
 * Get Python version
 */
export declare function getPythonVersion(pythonPath?: string): Promise<string | null>;
/**
 * Get Node.js version
 */
export declare function getNodeVersion(): Promise<string | null>;
/**
 * Get Go version
 */
export declare function getGoVersion(): Promise<string | null>;
/**
 * Get Rust/Cargo version
 */
export declare function getRustVersion(): Promise<string | null>;
/**
 * Check if pip package is installed
 */
export declare function isPipPackageInstalled(packageName: string, pythonPath?: string): Promise<boolean>;
/**
 * Install a pip package
 */
export declare function installPipPackage(packageName: string, pythonPath?: string): Promise<void>;
/**
 * Get GOPATH
 */
export declare function getGoPath(): Promise<string | null>;
/**
 * Get GOBIN or default bin path
 */
export declare function getGoBin(): Promise<string | null>;
//# sourceMappingURL=adapter-installer.d.ts.map