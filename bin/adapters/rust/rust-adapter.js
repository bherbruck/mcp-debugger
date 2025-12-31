/**
 * Rust Debug Adapter
 *
 * Uses CodeLLDB for debugging Rust programs.
 * https://github.com/vadimcn/codelldb
 */
import * as path from 'path';
import * as fs from 'fs/promises';
import { DebugLanguage } from '../../session/types.js';
import { executeCommand, getRustVersion, getAdapterPath, ensureInstallDir, pathExists, downloadFile, extractZip, makeExecutable, getPlatformInfo } from '../adapter-installer.js';
export class RustAdapter {
    language = DebugLanguage.RUST;
    name = 'Rust Debug Adapter (CodeLLDB)';
    runtime = 'rust';
    cachedInstallStatus = null;
    async checkInstallation() {
        if (this.cachedInstallStatus) {
            return this.cachedInstallStatus;
        }
        // Check if Rust is available
        const rustVersion = await getRustVersion();
        if (!rustVersion) {
            return {
                installed: false,
                error: 'Rust is not installed or not in PATH'
            };
        }
        // Check if CodeLLDB is installed
        const adapterPath = this.getCodeLLDBPath();
        if (!(await pathExists(adapterPath))) {
            return {
                installed: false,
                error: 'CodeLLDB is not installed'
            };
        }
        // Get version
        let version;
        try {
            const { stdout } = await executeCommand(`"${adapterPath}" --version`);
            const match = stdout.match(/(\d+\.\d+\.\d+)/);
            version = match ? match[1] : undefined;
        }
        catch {
            // Version check might fail, that's ok
        }
        const status = {
            installed: true,
            version,
            path: adapterPath
        };
        this.cachedInstallStatus = status;
        return status;
    }
    getCodeLLDBPath() {
        const adapterDir = getAdapterPath('codelldb');
        const platform = getPlatformInfo();
        const ext = platform.os === 'windows' ? '.exe' : '';
        return path.join(adapterDir, 'extension', 'adapter', `codelldb${ext}`);
    }
    async install() {
        // Ensure Rust is available
        const rustVersion = await getRustVersion();
        if (!rustVersion) {
            throw new Error('Rust is not installed. Please install Rust first: https://rustup.rs');
        }
        const adapterDir = await ensureInstallDir();
        const codelldbDir = path.join(adapterDir, 'codelldb');
        const platform = getPlatformInfo();
        // Determine the correct release URL
        let platformStr;
        if (platform.os === 'darwin') {
            platformStr = platform.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
        }
        else if (platform.os === 'linux') {
            platformStr = platform.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
        }
        else {
            platformStr = 'windows-x64';
        }
        // Use a stable release version
        const releaseVersion = 'v1.12.0';
        const releaseUrl = `https://github.com/vadimcn/codelldb/releases/download/${releaseVersion}/codelldb-${platformStr}.vsix`;
        const tempZip = path.join(adapterDir, 'codelldb.vsix');
        try {
            // Clean up any existing installation
            await fs.rm(codelldbDir, { recursive: true, force: true });
            // Download the release (vsix is a zip file)
            await downloadFile(releaseUrl, tempZip, { timeout: 300000 });
            // Create target directory
            await fs.mkdir(codelldbDir, { recursive: true });
            // Extract (vsix is just a zip)
            await extractZip(tempZip, codelldbDir);
            // Make the adapter executable
            const adapterPath = this.getCodeLLDBPath();
            await makeExecutable(adapterPath);
            // Also make lldb executable if present
            const lldbPath = path.join(codelldbDir, 'extension', 'lldb', 'bin', platform.os === 'windows' ? 'lldb.exe' : 'lldb');
            if (await pathExists(lldbPath)) {
                await makeExecutable(lldbPath);
            }
            // Clean up
            await fs.unlink(tempZip).catch(() => { });
        }
        catch (error) {
            // Clean up on failure
            await fs.unlink(tempZip).catch(() => { });
            throw new Error(`Failed to install CodeLLDB: ${error}`);
        }
        // Clear cached status
        this.cachedInstallStatus = null;
        // Verify installation
        const status = await this.checkInstallation();
        if (!status.installed) {
            throw new Error(`Failed to install CodeLLDB: ${status.error}`);
        }
    }
    async getAdapterCommand() {
        // Ensure installed
        const status = await this.checkInstallation();
        if (!status.installed) {
            await this.install();
        }
        const adapterPath = this.getCodeLLDBPath();
        return {
            command: adapterPath,
            args: [],
            env: {}
        };
    }
    async validateEnvironment() {
        const errors = [];
        const warnings = [];
        // Check Rust version
        const rustVersion = await getRustVersion();
        if (!rustVersion) {
            errors.push('Rust is not installed or not in PATH');
            return { valid: false, errors, warnings };
        }
        // Check cargo is available
        try {
            await executeCommand('cargo --version');
        }
        catch {
            errors.push('Cargo is not available');
        }
        // Check CodeLLDB installation
        const status = await this.checkInstallation();
        if (!status.installed) {
            warnings.push('CodeLLDB not installed - will auto-install on first use');
        }
        // Check LLDB availability (optional but recommended)
        try {
            await executeCommand('lldb --version');
        }
        catch {
            warnings.push('System LLDB not found - using bundled LLDB');
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    async resolveExecutablePath(preferredPath) {
        if (preferredPath) {
            // Validate the provided path is a valid Rust binary or source
            if (await pathExists(preferredPath)) {
                return preferredPath;
            }
            throw new Error(`Invalid path: ${preferredPath}`);
        }
        // For Rust, we typically debug a built binary
        // Return 'cargo' as the default
        const version = await getRustVersion();
        if (!version) {
            throw new Error('Rust not found in PATH');
        }
        return 'cargo';
    }
    buildLaunchConfig(params, _executablePath) {
        // Always use the program directly - scriptPath should be a compiled binary
        // If it's a source file (.rs), we'd need to compile it first
        const config = {
            type: 'lldb',
            request: 'launch',
            name: 'MCP Debug Rust',
            program: params.scriptPath,
            args: params.args ?? [],
            cwd: params.cwd ?? path.dirname(params.scriptPath),
            env: params.env ?? {},
            stopOnEntry: params.stopOnEntry ?? false,
            sourceLanguages: ['rust']
        };
        return config;
    }
    getFileExtensions() {
        return ['.rs'];
    }
}
//# sourceMappingURL=rust-adapter.js.map