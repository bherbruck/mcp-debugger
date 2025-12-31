/**
 * Adapter Registry
 *
 * Central registry for debug adapters. Maps languages to adapter implementations
 * and provides language detection from file extensions.
 */
import { DebugLanguage } from '../session/types.js';
/**
 * Registry for debug adapters
 */
export class AdapterRegistry {
    adapters = new Map();
    extensionMap = new Map();
    constructor() {
        // Initialize file extension mappings
        this.initializeExtensionMap();
    }
    /**
     * Initialize the file extension to language mapping
     */
    initializeExtensionMap() {
        // JavaScript/TypeScript
        this.extensionMap.set('.js', DebugLanguage.JAVASCRIPT);
        this.extensionMap.set('.mjs', DebugLanguage.JAVASCRIPT);
        this.extensionMap.set('.cjs', DebugLanguage.JAVASCRIPT);
        this.extensionMap.set('.jsx', DebugLanguage.JAVASCRIPT);
        this.extensionMap.set('.ts', DebugLanguage.TYPESCRIPT);
        this.extensionMap.set('.mts', DebugLanguage.TYPESCRIPT);
        this.extensionMap.set('.cts', DebugLanguage.TYPESCRIPT);
        this.extensionMap.set('.tsx', DebugLanguage.TYPESCRIPT);
        // Python
        this.extensionMap.set('.py', DebugLanguage.PYTHON);
        this.extensionMap.set('.pyw', DebugLanguage.PYTHON);
        // Go
        this.extensionMap.set('.go', DebugLanguage.GO);
        // Rust
        this.extensionMap.set('.rs', DebugLanguage.RUST);
    }
    /**
     * Register an adapter factory for a language
     */
    register(language, factory) {
        this.adapters.set(language, factory);
    }
    /**
     * Check if a language is supported
     */
    isSupported(language) {
        return this.adapters.has(language);
    }
    /**
     * Create an adapter for a language
     */
    create(language) {
        const factory = this.adapters.get(language);
        if (!factory) {
            throw new Error(`No adapter registered for language: ${language}`);
        }
        return factory();
    }
    /**
     * Get all supported languages
     */
    getSupportedLanguages() {
        return Array.from(this.adapters.keys());
    }
    /**
     * Detect language from file extension
     */
    detectLanguage(filePath) {
        const ext = this.getExtension(filePath).toLowerCase();
        return this.extensionMap.get(ext) ?? null;
    }
    /**
     * Check if a file is debuggable
     */
    isDebuggable(filePath) {
        const language = this.detectLanguage(filePath);
        return language !== null && this.isSupported(language);
    }
    /**
     * Get all supported file extensions
     */
    getSupportedExtensions() {
        return Array.from(this.extensionMap.keys());
    }
    /**
     * Get file extension from path
     */
    getExtension(filePath) {
        const lastDot = filePath.lastIndexOf('.');
        if (lastDot === -1 || lastDot === filePath.length - 1) {
            return '';
        }
        return filePath.substring(lastDot);
    }
}
// Export a singleton instance
export const adapterRegistry = new AdapterRegistry();
//# sourceMappingURL=adapter-registry.js.map