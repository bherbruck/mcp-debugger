/**
 * Python Debug Adapter
 *
 * Uses debugpy (Microsoft's Python debugger) for debugging Python code.
 * https://github.com/microsoft/debugpy
 */
import { DebugLanguage } from '../../session/types.js';
import { executeCommand, isPipPackageInstalled, installPipPackage, getPythonVersion, commandExists } from '../adapter-installer.js';
export class PythonAdapter {
    language = DebugLanguage.PYTHON;
    name = 'Python Debug Adapter (debugpy)';
    runtime = 'python';
    pythonPath = 'python3';
    cachedInstallStatus = null;
    async checkInstallation() {
        if (this.cachedInstallStatus) {
            return this.cachedInstallStatus;
        }
        // First check if Python is available
        const pythonVersion = await getPythonVersion(this.pythonPath);
        if (!pythonVersion) {
            // Try 'python' if 'python3' fails
            const altVersion = await getPythonVersion('python');
            if (altVersion) {
                this.pythonPath = 'python';
            }
            else {
                return {
                    installed: false,
                    error: 'Python is not installed or not in PATH'
                };
            }
        }
        // Check if debugpy is installed
        const hasDebugpy = await isPipPackageInstalled('debugpy', this.pythonPath);
        if (!hasDebugpy) {
            return {
                installed: false,
                error: 'debugpy is not installed. Run: pip install debugpy'
            };
        }
        // Get debugpy version
        let version;
        try {
            const { stdout } = await executeCommand(`${this.pythonPath} -c "import debugpy; print(debugpy.__version__)"`);
            version = stdout.trim();
        }
        catch {
            // Version check failed, but debugpy is installed
        }
        const status = {
            installed: true,
            version,
            path: this.pythonPath
        };
        this.cachedInstallStatus = status;
        return status;
    }
    async install() {
        // Ensure Python is available
        const pythonVersion = await getPythonVersion(this.pythonPath);
        if (!pythonVersion) {
            const altVersion = await getPythonVersion('python');
            if (altVersion) {
                this.pythonPath = 'python';
            }
            else {
                throw new Error('Python is not installed. Please install Python 3.7+ first.');
            }
        }
        // Install debugpy via pip
        await installPipPackage('debugpy', this.pythonPath);
        // Clear cached status
        this.cachedInstallStatus = null;
        // Verify installation
        const status = await this.checkInstallation();
        if (!status.installed) {
            throw new Error(`Failed to install debugpy: ${status.error}`);
        }
    }
    async getAdapterCommand() {
        // Ensure installed
        const status = await this.checkInstallation();
        if (!status.installed) {
            await this.install();
        }
        return {
            command: this.pythonPath,
            args: ['-m', 'debugpy.adapter'],
            env: {}
        };
    }
    async validateEnvironment() {
        const errors = [];
        const warnings = [];
        // Check Python version
        const pythonVersion = await getPythonVersion(this.pythonPath);
        if (!pythonVersion) {
            const altVersion = await getPythonVersion('python');
            if (altVersion) {
                this.pythonPath = 'python';
                warnings.push('Using "python" instead of "python3"');
            }
            else {
                errors.push('Python is not installed or not in PATH');
                return { valid: false, errors, warnings };
            }
        }
        // Check Python version is >= 3.7
        const version = pythonVersion ?? (await getPythonVersion('python'));
        if (version) {
            const [major, minor] = version.split('.').map(Number);
            if (major < 3 || (major === 3 && minor < 7)) {
                errors.push(`Python 3.7+ required, found ${version}`);
            }
        }
        // Check debugpy installation
        const status = await this.checkInstallation();
        if (!status.installed) {
            warnings.push('debugpy not installed - will auto-install on first use');
        }
        // Check pip availability
        const hasPip = await commandExists(`${this.pythonPath} -m pip`);
        if (!hasPip) {
            warnings.push('pip not available - may not be able to auto-install debugpy');
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
            const version = await getPythonVersion(preferredPath);
            if (!version) {
                throw new Error(`Invalid Python path: ${preferredPath}`);
            }
            this.pythonPath = preferredPath;
            this.cachedInstallStatus = null; // Clear cache when path changes
            return preferredPath;
        }
        // Try python3 first, then python
        const candidates = ['python3', 'python', '/usr/bin/python3', '/usr/local/bin/python3'];
        for (const candidate of candidates) {
            const version = await getPythonVersion(candidate);
            if (version) {
                const [major] = version.split('.').map(Number);
                if (major >= 3) {
                    this.pythonPath = candidate;
                    this.cachedInstallStatus = null;
                    return candidate;
                }
            }
        }
        throw new Error('Python 3 not found in PATH');
    }
    buildLaunchConfig(params, executablePath) {
        // Build debugpy launch configuration
        const config = {
            type: 'python',
            request: 'launch',
            name: 'MCP Debug Python',
            program: params.scriptPath,
            python: executablePath,
            args: params.args ?? [],
            cwd: params.cwd ?? process.cwd(),
            env: params.env ?? {},
            stopOnEntry: params.stopOnEntry ?? false,
            justMyCode: false, // Debug all code, not just user code
            redirectOutput: true, // Capture stdout/stderr
            console: 'internalConsole'
        };
        return config;
    }
    getFileExtensions() {
        return ['.py', '.pyw'];
    }
}
