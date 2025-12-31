/**
 * Adapter Installer
 *
 * Utility for installing debug adapters on demand.
 * Handles platform-specific installation and version management.
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
const execAsync = promisify(exec);
/**
 * Get the install directory for adapters
 */
export function getInstallDir() {
    return path.join(os.homedir(), '.mcp-debugger', 'adapters');
}
/**
 * Get current platform info
 */
export function getPlatformInfo() {
    const platform = os.platform();
    const arch = os.arch();
    let osName;
    if (platform === 'darwin') {
        osName = 'darwin';
    }
    else if (platform === 'win32') {
        osName = 'windows';
    }
    else {
        osName = 'linux';
    }
    const archName = arch === 'arm64' ? 'arm64' : 'x64';
    return { os: osName, arch: archName };
}
/**
 * Ensure the install directory exists
 */
export async function ensureInstallDir() {
    const dir = getInstallDir();
    await fs.mkdir(dir, { recursive: true });
    return dir;
}
/**
 * Get path to an adapter's install directory
 */
export function getAdapterPath(adapterName) {
    return path.join(getInstallDir(), adapterName);
}
/**
 * Check if a command exists in PATH
 */
export async function commandExists(command) {
    try {
        const checkCmd = os.platform() === 'win32' ? 'where' : 'which';
        await execAsync(`${checkCmd} ${command}`);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Execute a shell command with timeout
 */
export async function executeCommand(command, options = {}) {
    const { cwd, timeout = 300000, env } = options;
    return execAsync(command, {
        cwd,
        timeout,
        env: { ...process.env, ...env },
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
}
/**
 * Download a file using curl or wget
 */
export async function downloadFile(url, destPath, options = {}) {
    const { timeout = 300000 } = options;
    // Try curl first, then wget
    const hasCurl = await commandExists('curl');
    const hasWget = await commandExists('wget');
    if (hasCurl) {
        await executeCommand(`curl -L -o "${destPath}" "${url}"`, { timeout });
    }
    else if (hasWget) {
        await executeCommand(`wget -O "${destPath}" "${url}"`, { timeout });
    }
    else {
        throw new Error('Neither curl nor wget is available. Please install one to download adapters.');
    }
}
/**
 * Extract a zip file
 */
export async function extractZip(zipPath, destDir) {
    const hasUnzip = await commandExists('unzip');
    if (hasUnzip) {
        await executeCommand(`unzip -o "${zipPath}" -d "${destDir}"`);
    }
    else {
        throw new Error('unzip is not available. Please install unzip.');
    }
}
/**
 * Extract a tar.gz file
 */
export async function extractTarGz(tarPath, destDir) {
    await executeCommand(`tar -xzf "${tarPath}" -C "${destDir}"`);
}
/**
 * Check if a path exists
 */
export async function pathExists(p) {
    try {
        await fs.access(p);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Make a file executable
 */
export async function makeExecutable(filePath) {
    if (os.platform() !== 'win32') {
        await fs.chmod(filePath, 0o755);
    }
}
/**
 * Get Python version
 */
export async function getPythonVersion(pythonPath = 'python3') {
    try {
        const { stdout } = await executeCommand(`${pythonPath} --version`);
        const match = stdout.match(/Python (\d+\.\d+\.\d+)/);
        return match ? match[1] : null;
    }
    catch {
        return null;
    }
}
/**
 * Get Node.js version
 */
export async function getNodeVersion() {
    try {
        const { stdout } = await executeCommand('node --version');
        const match = stdout.match(/v(\d+\.\d+\.\d+)/);
        return match ? match[1] : null;
    }
    catch {
        return null;
    }
}
/**
 * Get Go version
 */
export async function getGoVersion() {
    try {
        const { stdout } = await executeCommand('go version');
        const match = stdout.match(/go(\d+\.\d+(?:\.\d+)?)/);
        return match ? match[1] : null;
    }
    catch {
        return null;
    }
}
/**
 * Get Rust/Cargo version
 */
export async function getRustVersion() {
    try {
        const { stdout } = await executeCommand('rustc --version');
        const match = stdout.match(/rustc (\d+\.\d+\.\d+)/);
        return match ? match[1] : null;
    }
    catch {
        return null;
    }
}
/**
 * Check if pip package is installed
 */
export async function isPipPackageInstalled(packageName, pythonPath = 'python3') {
    try {
        await executeCommand(`${pythonPath} -c "import ${packageName}"`);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Install a pip package
 */
export async function installPipPackage(packageName, pythonPath = 'python3') {
    await executeCommand(`${pythonPath} -m pip install --user ${packageName}`);
}
/**
 * Get GOPATH
 */
export async function getGoPath() {
    try {
        const { stdout } = await executeCommand('go env GOPATH');
        return stdout.trim();
    }
    catch {
        return null;
    }
}
/**
 * Get GOBIN or default bin path
 */
export async function getGoBin() {
    try {
        const { stdout: gobin } = await executeCommand('go env GOBIN');
        if (gobin.trim()) {
            return gobin.trim();
        }
        const gopath = await getGoPath();
        if (gopath) {
            return path.join(gopath, 'bin');
        }
        return null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=adapter-installer.js.map