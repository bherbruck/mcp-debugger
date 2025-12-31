/**
 * Adapter Types
 *
 * Interfaces and types for debug adapters that handle language-specific debugging.
 */

import { DebugProtocol } from '@vscode/debugprotocol';
import { DebugLanguage, LaunchParams } from '../session/types.js';

/**
 * Command to launch an adapter process
 */
export interface AdapterCommand {
  /** Executable command */
  command: string;
  /** Command arguments */
  args: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Connection mode: 'stdio' (default) or 'tcp' */
  mode?: 'stdio' | 'tcp';
}

/**
 * Result of validating an adapter environment
 */
export interface ValidationResult {
  /** Whether the environment is valid */
  valid: boolean;
  /** Critical errors that prevent debugging */
  errors: string[];
  /** Non-critical warnings */
  warnings: string[];
}

/**
 * Status of adapter installation
 */
export interface InstallationStatus {
  /** Whether the adapter is installed */
  installed: boolean;
  /** Version if installed */
  version?: string;
  /** Path to the adapter */
  path?: string;
  /** Error message if not installed */
  error?: string;
}

/**
 * Interface for a debug adapter implementation
 */
export interface IDebugAdapter {
  /** The language this adapter handles */
  readonly language: DebugLanguage;

  /** Human-readable name of the adapter */
  readonly name: string;

  /** Required runtime (e.g., 'node', 'python') */
  readonly runtime: string;

  /**
   * Check if the adapter is installed
   */
  checkInstallation(): Promise<InstallationStatus>;

  /**
   * Install the adapter if not present
   */
  install(): Promise<void>;

  /**
   * Get the command to launch the adapter
   */
  getAdapterCommand(): Promise<AdapterCommand>;

  /**
   * Validate that the environment is ready for debugging
   */
  validateEnvironment(): Promise<ValidationResult>;

  /**
   * Resolve the path to the runtime executable
   * @param preferredPath User-specified path (optional)
   */
  resolveExecutablePath(preferredPath?: string): Promise<string>;

  /**
   * Build the launch configuration for this adapter
   */
  buildLaunchConfig(
    params: LaunchParams,
    executablePath: string
  ): DebugProtocol.LaunchRequestArguments;

  /**
   * Get file extensions handled by this adapter
   */
  getFileExtensions(): string[];
}

/**
 * Options for adapter installation
 */
export interface InstallOptions {
  /** Force reinstall even if already installed */
  force?: boolean;
  /** Specific version to install */
  version?: string;
  /** Progress callback */
  onProgress?: (message: string) => void;
}

/**
 * Result of installation attempt
 */
export interface InstallResult {
  success: boolean;
  message: string;
  path?: string;
  version?: string;
}
