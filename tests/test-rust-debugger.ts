/**
 * Test script for the Rust debugger using CodeLLDB
 */

import { SessionManager } from '../src/session/session-manager.js';
import { DebugLanguage } from '../src/session/types.js';
import * as path from 'path';

const BINARY_PATH = path.resolve(
  import.meta.dirname,
  'fixtures/rust_test/target/debug/rust_test'
);
const SOURCE_PATH = path.resolve(
  import.meta.dirname,
  'fixtures/rust_test/src/main.rs'
);

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Rust Debugger Test (CodeLLDB) ===\n');
  console.log('Binary:', BINARY_PATH);
  console.log('Source:', SOURCE_PATH);

  const manager = new SessionManager();
  let sessionId: string | null = null;

  // Handle errors from the session manager
  manager.on('error', (sid: string, error: Error) => {
    console.error('Session error:', sid, error.message);
  });

  manager.on('sessionStateChanged', (sid: string, newState: string, oldState: string) => {
    console.log(`   State: ${oldState} -> ${newState}`);
  });

  try {
    // Create session
    console.log('\n1. Creating debug session...');
    const session = await manager.createSession({
      language: DebugLanguage.RUST,
      name: 'Rust Test'
    });
    sessionId = session.id;
    console.log('   Session created:', sessionId);

    // Set a breakpoint at line 13 (let result = calculate(a, b);)
    console.log('\n2. Setting breakpoint at line 13...');
    const bp = await manager.setBreakpoint(sessionId, { file: SOURCE_PATH, line: 13 });
    console.log('   Breakpoint set:', bp);

    // Start debugging
    console.log('\n3. Starting debugging...');
    const startResult = await manager.startDebugging(sessionId, {
      scriptPath: BINARY_PATH,
      stopOnEntry: false
    });
    console.log('   Start result:', startResult);

    // Wait for stop at breakpoint
    console.log('\n4. Waiting for breakpoint hit...');
    await sleep(2000);

    // Get threads
    console.log('\n5. Getting threads...');
    const threads = await manager.getThreads(sessionId);
    console.log('   Threads:', JSON.stringify(threads, null, 2));

    if (threads.length > 0) {
      const threadId = threads[0].id;

      // Get stack trace
      console.log('\n6. Getting stack trace...');
      const stackTrace = await manager.getStackTrace(sessionId, threadId);
      console.log('   Stack frames:');
      stackTrace.slice(0, 3).forEach((frame, i) => {
        console.log(`     ${i}: ${frame.name} at ${frame.source}:${frame.line}`);
      });

      if (stackTrace.length > 0) {
        const frameId = stackTrace[0].id;

        // Get variables
        console.log('\n7. Getting variables...');
        const variables = await manager.getVariables(sessionId, frameId);
        console.log('   Variables:', JSON.stringify(variables, null, 2));

        // Step over to line 14
        console.log('\n8. Stepping over...');
        await manager.stepOver(sessionId, threadId);
        await sleep(500);

        // Get stack trace again to see new position
        console.log('\n9. Getting stack trace after step...');
        const stackAfter = await manager.getStackTrace(sessionId, threadId);
        if (stackAfter.length > 0) {
          console.log(`   Now at: ${stackAfter[0].name} line ${stackAfter[0].line}`);

          // Get variables again
          console.log('\n10. Getting variables after step...');
          const varsAfterStep = await manager.getVariables(sessionId, stackAfter[0].id);
          console.log('   Variables:', JSON.stringify(varsAfterStep, null, 2));
        }
      }

      // Continue execution
      console.log('\n11. Continuing execution...');
      await manager.continue(sessionId, threadId);
      await sleep(1000);
    }

    console.log('\n=== Test Complete ===');
  } catch (error) {
    console.error('\nError:', error);
  } finally {
    if (sessionId) {
      console.log('\nCleaning up...');
      try {
        await manager.terminateSession(sessionId);
        console.log('Session terminated');
      } catch (e) {
        console.error('Cleanup error:', e);
      }
    }
    // Give it a moment to clean up
    await sleep(500);
    process.exit(0);
  }
}

main();
