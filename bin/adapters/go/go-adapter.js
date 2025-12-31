/**
 * Go Debug Adapter
 *
 * Uses Delve (dlv) for debugging Go programs.
 * https://github.com/go-delve/delve
 */
import * as path from 'path';
import { DebugLanguage } from '../../session/types.js';
import { executeCommand, getGoVersion, getGoBin, commandExists, pathExists } from '../adapter-installer.js';
export class GoAdapter {
    language = DebugLanguage.GO;
    name = 'Go Debug Adapter (Delve)';
    runtime = 'go';
    dlvPath = 'dlv';
    cachedInstallStatus = null;
    async checkInstallation() {
        if (this.cachedInstallStatus) {
            return this.cachedInstallStatus;
        }
        // Check if Go is available
        const goVersion = await getGoVersion();
        if (!goVersion) {
            return {
                installed: false,
                error: 'Go is not installed or not in PATH'
            };
        }
        // Check if dlv is available
        const hasDlv = await commandExists('dlv');
        if (!hasDlv) {
            // Check in GOBIN
            const goBin = await getGoBin();
            if (goBin) {
                const dlvInGoBin = path.join(goBin, 'dlv');
                if (await pathExists(dlvInGoBin)) {
                    this.dlvPath = dlvInGoBin;
                }
                else {
                    return {
                        installed: false,
                        error: 'Delve (dlv) is not installed. Run: go install github.com/go-delve/delve/cmd/dlv@latest'
                    };
                }
            }
            else {
                return {
                    installed: false,
                    error: 'Delve (dlv) is not installed'
                };
            }
        }
        // Get dlv version
        let version;
        try {
            const { stdout } = await executeCommand(`${this.dlvPath} version`);
            const match = stdout.match(/Version: (\d+\.\d+\.\d+)/);
            version = match ? match[1] : undefined;
        }
        catch {
            // Version check failed
        }
        const status = {
            installed: true,
            version,
            path: this.dlvPath
        };
        this.cachedInstallStatus = status;
        return status;
    }
    async install() {
        // Ensure Go is available
        const goVersion = await getGoVersion();
        if (!goVersion) {
            throw new Error('Go is not installed. Please install Go 1.18+ first.');
        }
        // Install delve via go install
        await executeCommand('go install github.com/go-delve/delve/cmd/dlv@latest', { timeout: 300000 });
        // Clear cached status
        this.cachedInstallStatus = null;
        // Verify installation
        const status = await this.checkInstallation();
        if (!status.installed) {
            throw new Error(`Failed to install Delve: ${status.error}`);
        }
    }
    async getAdapterCommand() {
        // Ensure installed
        const status = await this.checkInstallation();
        if (!status.installed) {
            await this.install();
            // Re-check to get the correct path
            await this.checkInstallation();
        }
        return {
            command: this.dlvPath,
            args: ['dap'],
            env: {},
            mode: 'tcp' // Delve DAP uses TCP, not stdio
        };
    }
    async validateEnvironment() {
        const errors = [];
        const warnings = [];
        // Check Go version
        const goVersion = await getGoVersion();
        if (!goVersion) {
            errors.push('Go is not installed or not in PATH');
            return { valid: false, errors, warnings };
        }
        // Check Go version is >= 1.18
        const [major, minor] = goVersion.split('.').map(Number);
        if (major < 1 || (major === 1 && minor < 18)) {
            warnings.push(`Go 1.18+ recommended for Delve, found ${goVersion}`);
        }
        // Check dlv installation
        const status = await this.checkInstallation();
        if (!status.installed) {
            warnings.push('Delve (dlv) not installed - will auto-install on first use');
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    async resolveExecutablePath(preferredPath) {
        if (preferredPath) {
            // For Go, the executable is the built binary, not go itself
            // But we'll validate go is available
            try {
                await executeCommand(`${preferredPath} version`);
                return preferredPath;
            }
            catch {
                throw new Error(`Invalid Go path: ${preferredPath}`);
            }
        }
        // Return 'go' as the executable
        const version = await getGoVersion();
        if (!version) {
            throw new Error('Go not found in PATH');
        }
        return 'go';
    }
    buildLaunchConfig(params, executablePath) {
        // Determine if this is a file or a package
        const isGoFile = params.scriptPath.endsWith('.go');
        const config = {
            type: 'go',
            request: 'launch',
            name: 'MCP Debug Go',
            mode: isGoFile ? 'debug' : 'auto',
            program: params.scriptPath,
            args: params.args ?? [],
            cwd: params.cwd ?? process.cwd(),
            env: params.env ?? {},
            stopOnEntry: params.stopOnEntry ?? false
        };
        return config;
    }
    getFileExtensions() {
        return ['.go'];
    }
}
//# sourceMappingURL=go-adapter.js.map