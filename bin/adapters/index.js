/**
 * Adapter Index
 *
 * Exports all adapters and initializes the registry.
 */
export * from './types.js';
export * from './adapter-registry.js';
export * from './adapter-installer.js';
export * from './python/python-adapter.js';
export * from './javascript/javascript-adapter.js';
export * from './go/go-adapter.js';
export * from './rust/rust-adapter.js';
import { DebugLanguage } from '../session/types.js';
import { adapterRegistry } from './adapter-registry.js';
import { PythonAdapter } from './python/python-adapter.js';
import { JavaScriptAdapter, TypeScriptAdapter } from './javascript/javascript-adapter.js';
import { GoAdapter } from './go/go-adapter.js';
import { RustAdapter } from './rust/rust-adapter.js';
/**
 * Initialize the adapter registry with all built-in adapters
 */
export function initializeAdapters() {
    adapterRegistry.register(DebugLanguage.PYTHON, () => new PythonAdapter());
    adapterRegistry.register(DebugLanguage.JAVASCRIPT, () => new JavaScriptAdapter());
    adapterRegistry.register(DebugLanguage.TYPESCRIPT, () => new TypeScriptAdapter());
    adapterRegistry.register(DebugLanguage.GO, () => new GoAdapter());
    adapterRegistry.register(DebugLanguage.RUST, () => new RustAdapter());
}
// Auto-initialize on import
initializeAdapters();
//# sourceMappingURL=index.js.map