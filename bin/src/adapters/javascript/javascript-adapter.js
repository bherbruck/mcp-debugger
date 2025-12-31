/**
 * JavaScript/TypeScript Debug Adapter
 *
 * Uses vscode-js-debug for debugging Node.js applications.
 * https://github.com/microsoft/vscode-js-debug
 */
import * as path from 'path';
import * as fs from 'fs/promises';
import { DebugLanguage } from '../../session/types.js';
import { executeCommand, getNodeVersion, getAdapterPath, ensureInstallDir, pathExists, downloadFile, extractZip, getPlatformInfo } from '../adapter-installer.js';
export class JavaScriptAdapter {
    language = DebugLanguage.JAVASCRIPT;
    name = 'JavaScript Debug Adapter (vscode-js-debug)';
    runtime = 'node';
    nodePath = 'node';
    cachedInstallStatus = null;
    async checkInstallation() {
        if (this.cachedInstallStatus) {
            return this.cachedInstallStatus;
        }
        // Check if Node.js is available
        const nodeVersion = await getNodeVersion();
        if (!nodeVersion) {
            return {
                installed: false,
                error: 'Node.js is not installed or not in PATH'
            };
        }
        // Check if vscode-js-debug is installed
        const adapterPath = getAdapterPath('js-debug');
        const serverPath = path.join(adapterPath, 'src', 'dapDebugServer.js');
        if (!(await pathExists(serverPath))) {
            return {
                installed: false,
                error: 'vscode-js-debug is not installed'
            };
        }
        // Get version from package.json
        let version;
        try {
            const packagePath = path.join(adapterPath, 'package.json');
            const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
            version = packageJson.version;
        }
        catch {
            // Version check failed
        }
        const status = {
            installed: true,
            version,
            path: serverPath
        };
        this.cachedInstallStatus = status;
        return status;
    }
    async install() {
        // Ensure Node.js is available
        const nodeVersion = await getNodeVersion();
        if (!nodeVersion) {
            throw new Error('Node.js is not installed. Please install Node.js 18+ first.');
        }
        const adapterDir = await ensureInstallDir();
        const jsDebugDir = path.join(adapterDir, 'js-debug');
        // Download vscode-js-debug from releases
        // Using a specific release version for stability
        const platform = getPlatformInfo();
        const releaseVersion = 'v1.93.0'; // Use a stable release
        // The release is a vsix (zip) file
        const vsixUrl = `https://github.com/nicholashamilton/js-debug/releases/download/${releaseVersion}/js-debug-dap.zip`;
        const tempZip = path.join(adapterDir, 'js-debug.zip');
        try {
            // Download the release
            await downloadFile(vsixUrl, tempZip);
            // Create target directory
            await fs.mkdir(jsDebugDir, { recursive: true });
            // Extract
            await extractZip(tempZip, jsDebugDir);
            // Clean up
            await fs.unlink(tempZip).catch(() => { });
        }
        catch (error) {
            // If release download fails, try cloning and building
            await this.installFromSource(jsDebugDir);
        }
        // Clear cached status
        this.cachedInstallStatus = null;
        // Verify installation
        const status = await this.checkInstallation();
        if (!status.installed) {
            throw new Error(`Failed to install vscode-js-debug: ${status.error}`);
        }
    }
    async installFromSource(targetDir) {
        // Clone the repository
        await fs.rm(targetDir, { recursive: true, force: true });
        await executeCommand(`git clone --depth 1 https://github.com/nicholashamilton/js-debug.git "${targetDir}"`, { timeout: 120000 });
        // Install dependencies and build
        await executeCommand('npm install', { cwd: targetDir, timeout: 300000 });
        await executeCommand('npm run compile', { cwd: targetDir, timeout: 300000 });
    }
    async getAdapterCommand() {
        // Ensure installed
        const status = await this.checkInstallation();
        if (!status.installed) {
            await this.install();
        }
        const adapterPath = getAdapterPath('js-debug');
        const serverPath = path.join(adapterPath, 'src', 'dapDebugServer.js');
        return {
            command: this.nodePath,
            args: [serverPath],
            env: {}
        };
    }
    async validateEnvironment() {
        const errors = [];
        const warnings = [];
        // Check Node.js version
        const nodeVersion = await getNodeVersion();
        if (!nodeVersion) {
            errors.push('Node.js is not installed or not in PATH');
            return { valid: false, errors, warnings };
        }
        // Check Node.js version is >= 18
        const [major] = nodeVersion.split('.').map(Number);
        if (major < 18) {
            warnings.push(`Node.js 18+ recommended, found ${nodeVersion}`);
        }
        // Check vscode-js-debug installation
        const status = await this.checkInstallation();
        if (!status.installed) {
            warnings.push('vscode-js-debug not installed - will auto-install on first use');
        }
        // Check git availability for installation
        try {
            await executeCommand('git --version');
        }
        catch {
            warnings.push('git not available - may not be able to install vscode-js-debug');
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    async resolveExecutablePath(preferredPath) {
        if (preferredPath) {
            // Validate the provided path
            try {
                const { stdout } = await executeCommand(`${preferredPath} --version`);
                if (!stdout.includes('v')) {
                    throw new Error('Not a valid Node.js executable');
                }
                this.nodePath = preferredPath;
                return preferredPath;
            }
            catch {
                throw new Error(`Invalid Node.js path: ${preferredPath}`);
            }
        }
        // Use default 'node'
        const version = await getNodeVersion();
        if (!version) {
            throw new Error('Node.js not found in PATH');
        }
        return this.nodePath;
    }
    buildLaunchConfig(params, executablePath) {
        // Determine if this is TypeScript or JavaScript
        const isTypeScript = params.scriptPath.endsWith('.ts') ||
            params.scriptPath.endsWith('.tsx') ||
            params.scriptPath.endsWith('.mts') ||
            params.scriptPath.endsWith('.cts');
        const config = {
            type: 'pwa-node',
            request: 'launch',
            name: 'MCP Debug Node.js',
            program: params.scriptPath,
            runtimeExecutable: executablePath,
            args: params.args ?? [],
            cwd: params.cwd ?? process.cwd(),
            env: params.env ?? {},
            stopOnEntry: params.stopOnEntry ?? false,
            console: 'internalConsole',
            skipFiles: ['<node_internals>/**'],
            resolveSourceMapLocations: ['**', '!**/node_modules/**']
        };
        // For TypeScript, add ts-node or tsx support
        if (isTypeScript) {
            // Check if using ts-node or tsx
            config.runtimeArgs = ['--loader', 'tsx'];
        }
        return config;
    }
    getFileExtensions() {
        return ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx'];
    }
}
/**
 * TypeScript adapter - creates a standalone adapter for TypeScript
 */
export class TypeScriptAdapter {
    language = DebugLanguage.TYPESCRIPT;
    name = 'TypeScript Debug Adapter (vscode-js-debug)';
    runtime = 'node';
    jsAdapter = new JavaScriptAdapter();
    async checkInstallation() {
        return this.jsAdapter.checkInstallation();
    }
    async install() {
        return this.jsAdapter.install();
    }
    async getAdapterCommand() {
        return this.jsAdapter.getAdapterCommand();
    }
    async validateEnvironment() {
        return this.jsAdapter.validateEnvironment();
    }
    async resolveExecutablePath(preferredPath) {
        return this.jsAdapter.resolveExecutablePath(preferredPath);
    }
    buildLaunchConfig(params, executablePath) {
        return this.jsAdapter.buildLaunchConfig(params, executablePath);
    }
    getFileExtensions() {
        return ['.ts', '.mts', '.cts', '.tsx'];
    }
}
