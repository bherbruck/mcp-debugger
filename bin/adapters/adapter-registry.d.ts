/**
 * Adapter Registry
 *
 * Central registry for debug adapters. Maps languages to adapter implementations
 * and provides language detection from file extensions.
 */
import { DebugLanguage } from '../session/types.js';
import { IDebugAdapter } from './types.js';
/**
 * Factory function type for creating adapters
 */
type AdapterFactory = () => IDebugAdapter;
/**
 * Registry for debug adapters
 */
export declare class AdapterRegistry {
    private adapters;
    private extensionMap;
    constructor();
    /**
     * Initialize the file extension to language mapping
     */
    private initializeExtensionMap;
    /**
     * Register an adapter factory for a language
     */
    register(language: DebugLanguage, factory: AdapterFactory): void;
    /**
     * Check if a language is supported
     */
    isSupported(language: DebugLanguage): boolean;
    /**
     * Create an adapter for a language
     */
    create(language: DebugLanguage): IDebugAdapter;
    /**
     * Get all supported languages
     */
    getSupportedLanguages(): DebugLanguage[];
    /**
     * Detect language from file extension
     */
    detectLanguage(filePath: string): DebugLanguage | null;
    /**
     * Check if a file is debuggable
     */
    isDebuggable(filePath: string): boolean;
    /**
     * Get all supported file extensions
     */
    getSupportedExtensions(): string[];
    /**
     * Get file extension from path
     */
    private getExtension;
}
export declare const adapterRegistry: AdapterRegistry;
export {};
//# sourceMappingURL=adapter-registry.d.ts.map