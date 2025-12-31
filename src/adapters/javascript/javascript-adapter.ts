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

import * as path from 'path';
import * as fs from 'fs/promises';
import { DebugProtocol } from '@vscode/debugprotocol';
import { DebugLanguage, LaunchParams } from '../../session/types.js';
import {
  IDebugAdapter,
  AdapterCommand,
  ValidationResult,
  InstallationStatus
} from '../types.js';
import {
  executeCommand,
  getNodeVersion,
  getAdapterPath,
  ensureInstallDir,
  pathExists,
  downloadFile,
  extractZip,
  getPlatformInfo
} from '../adapter-installer.js';

export class JavaScriptAdapter implements IDebugAdapter {
  readonly language = DebugLanguage.JAVASCRIPT;
  readonly name = 'JavaScript Debug Adapter (vscode-js-debug)';
  readonly runtime = 'node';

  private nodePath: string = 'node';
  private cachedInstallStatus: InstallationStatus | null = null;

  async checkInstallation(): Promise<InstallationStatus> {
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
    // The tar extracts to a nested js-debug directory
    const adapterPath = getAdapterPath('js-debug');
    const serverPath = path.join(adapterPath, 'js-debug', 'src', 'dapDebugServer.js');

    if (!(await pathExists(serverPath))) {
      return {
        installed: false,
        error: 'vscode-js-debug is not installed'
      };
    }

    // Get version from package.json
    let version: string | undefined;
    try {
      const packagePath = path.join(adapterPath, 'js-debug', 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
      version = packageJson.version;
    } catch {
      // Version check failed
    }

    const status: InstallationStatus = {
      installed: true,
      version,
      path: serverPath
    };

    this.cachedInstallStatus = status;
    return status;
  }

  async install(): Promise<void> {
    // Ensure Node.js is available
    const nodeVersion = await getNodeVersion();
    if (!nodeVersion) {
      throw new Error('Node.js is not installed. Please install Node.js 18+ first.');
    }

    const adapterDir = await ensureInstallDir();
    const jsDebugDir = path.join(adapterDir, 'js-debug');

    // Download the official standalone DAP server from Microsoft
    const releaseVersion = 'v1.105.0';
    const tarUrl = `https://github.com/microsoft/vscode-js-debug/releases/download/${releaseVersion}/js-debug-dap-${releaseVersion}.tar.gz`;

    const tempTar = path.join(adapterDir, 'js-debug-dap.tar.gz');

    try {
      // Clean up any existing installation
      await fs.rm(jsDebugDir, { recursive: true, force: true });

      // Create target directory
      await fs.mkdir(jsDebugDir, { recursive: true });

      // Download the release
      await downloadFile(tarUrl, tempTar, { timeout: 300000 });

      // Extract tar.gz
      await executeCommand(`tar -xzf "${tempTar}" -C "${jsDebugDir}"`);

      // Clean up
      await fs.unlink(tempTar).catch(() => {});
    } catch (error) {
      // If release download fails, try cloning and building from official repo
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

  private async installFromSource(targetDir: string): Promise<void> {
    // Clone the official Microsoft vscode-js-debug repository
    await fs.rm(targetDir, { recursive: true, force: true });

    await executeCommand(
      `git clone --depth 1 https://github.com/microsoft/vscode-js-debug.git "${targetDir}"`,
      { timeout: 120000 }
    );

    // Install dependencies and build
    await executeCommand('npm install', { cwd: targetDir, timeout: 300000 });
    await executeCommand('npm run compile', { cwd: targetDir, timeout: 300000 });
  }

  async getAdapterCommand(): Promise<AdapterCommand> {
    // Ensure installed
    const status = await this.checkInstallation();
    if (!status.installed) {
      await this.install();
    }

    const adapterPath = getAdapterPath('js-debug');
    const serverPath = path.join(adapterPath, 'js-debug', 'src', 'dapDebugServer.js');

    // vscode-js-debug uses TCP, not stdio
    // We'll use port 0 to let the server choose a random port
    return {
      command: this.nodePath,
      args: [serverPath, '0'],  // Port 0 = random port
      env: {},
      mode: 'tcp'
    };
  }

  async validateEnvironment(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

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
    } catch {
      warnings.push('git not available - may not be able to install vscode-js-debug');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  async resolveExecutablePath(preferredPath?: string): Promise<string> {
    if (preferredPath) {
      // Validate the provided path
      try {
        const { stdout } = await executeCommand(`${preferredPath} --version`);
        if (!stdout.includes('v')) {
          throw new Error('Not a valid Node.js executable');
        }
        this.nodePath = preferredPath;
        return preferredPath;
      } catch {
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

  buildLaunchConfig(
    params: LaunchParams,
    executablePath: string
  ): DebugProtocol.LaunchRequestArguments {
    // Determine if this is TypeScript or JavaScript
    const isTypeScript = params.scriptPath.endsWith('.ts') ||
                         params.scriptPath.endsWith('.tsx') ||
                         params.scriptPath.endsWith('.mts') ||
                         params.scriptPath.endsWith('.cts');

    const config: Record<string, unknown> = {
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

    return config as DebugProtocol.LaunchRequestArguments;
  }

  getFileExtensions(): string[] {
    return ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx'];
  }
}

/**
 * TypeScript adapter - creates a standalone adapter for TypeScript
 */
export class TypeScriptAdapter implements IDebugAdapter {
  readonly language = DebugLanguage.TYPESCRIPT;
  readonly name = 'TypeScript Debug Adapter (vscode-js-debug)';
  readonly runtime = 'node';

  private jsAdapter = new JavaScriptAdapter();

  async checkInstallation(): Promise<InstallationStatus> {
    return this.jsAdapter.checkInstallation();
  }

  async install(): Promise<void> {
    return this.jsAdapter.install();
  }

  async getAdapterCommand(): Promise<AdapterCommand> {
    return this.jsAdapter.getAdapterCommand();
  }

  async validateEnvironment(): Promise<ValidationResult> {
    return this.jsAdapter.validateEnvironment();
  }

  async resolveExecutablePath(preferredPath?: string): Promise<string> {
    return this.jsAdapter.resolveExecutablePath(preferredPath);
  }

  buildLaunchConfig(
    params: LaunchParams,
    executablePath: string
  ): DebugProtocol.LaunchRequestArguments {
    return this.jsAdapter.buildLaunchConfig(params, executablePath);
  }

  getFileExtensions(): string[] {
    return ['.ts', '.mts', '.cts', '.tsx'];
  }
}
