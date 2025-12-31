/**
 * Low-level DAP test for vscode-js-debug
 *
 * NOTE: vscode-js-debug uses a multi-session DAP architecture that requires
 * handling 'startDebugging' reverse requests. This test documents the current
 * state of JavaScript debugging support.
 *
 * For full functionality, a session multiplexer is needed (similar to nvim-dap-vscode-js).
 * See: https://github.com/microsoft/vscode-js-debug/issues/969
 */

import { DapClient, DapClientConfig } from '../src/dap/dap-client.js';
import * as path from 'path';

const SOURCE_PATH = path.resolve(
  import.meta.dirname,
  'fixtures/js_test/sample.js'
);

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Low-Level vscode-js-debug Test ===\n');
  console.log('Source:', SOURCE_PATH);
  console.log('\nNOTE: vscode-js-debug requires multi-session DAP support.');
  console.log('This test shows the current state of JavaScript debugging.\n');

  const serverPath = path.join(
    process.env.HOME || '~',
    '.mcp-debugger/adapters/js-debug/js-debug/src/dapDebugServer.js'
  );

  console.log('Server:', serverPath);

  const config: DapClientConfig = {
    command: 'node',
    args: [serverPath, '0'],
    mode: 'tcp',
    timeout: 30000
  };

  const client = new DapClient(config);

  // Listen to all events
  client.on('event', (event) => {
    console.log('<<< event:', event.event);
  });

  client.on('output', (event) => {
    const output = event.body.output?.trim();
    if (output && output.startsWith('[Child Session]')) {
      console.log('   ', output);
    }
  });

  client.on('stopped', (event) => {
    console.log('<<< STOPPED:', event.body.reason, 'threadId:', event.body.threadId);
  });

  client.on('error', (err) => {
    console.error('Client error:', err.message);
  });

  try {
    // Start the adapter
    console.log('\n1. Starting vscode-js-debug adapter...');
    await client.start();
    console.log('   Adapter started and connected');

    // Initialize
    console.log('\n2. Initialize...');
    const initResponse = await client.initialize({
      clientID: 'mcp-debugger-test',
      clientName: 'MCP Debugger Test',
      adapterID: 'pwa-node',
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: 'path',
      supportsVariableType: true,
      supportsVariablePaging: true,
      supportsRunInTerminalRequest: false,
      supportsStartDebuggingRequest: true,  // We support this now
      locale: 'en-US'
    });
    console.log('   Capabilities:', Object.keys(initResponse || {}).length, 'keys');

    await sleep(500);

    // Set breakpoint
    console.log('\n3. Set breakpoint at line 12...');
    const bpResult = await client.setBreakpoints(
      { path: SOURCE_PATH },
      [{ line: 12 }]
    );
    console.log('   Breakpoint:', bpResult[0]?.verified ? 'verified' : 'provisional');

    // Launch
    console.log('\n4. Launch...');
    const launchConfig = {
      type: 'pwa-node',
      request: 'launch',
      name: 'MCP Debug Node.js',
      program: SOURCE_PATH,
      cwd: path.dirname(SOURCE_PATH),
      stopOnEntry: true,
      console: 'internalConsole',
      skipFiles: ['<node_internals>/**'],
      trace: true  // Enable trace logging
    };

    client.launchAsync(launchConfig);
    console.log('   Launch request sent');

    // Configuration done
    console.log('\n5. Configuration done...');
    await client.configurationDone();
    console.log('   ConfigurationDone sent');

    // Wait for stopped event
    console.log('\n6. Waiting for stopped event (10 seconds for child session setup)...');

    let stoppedThreadId: number | null = null;
    const stoppedPromise = new Promise<number>((resolve) => {
      const handler = (event: { body: { threadId?: number } }) => {
        console.log('   Got stopped event!');
        stoppedThreadId = event.body.threadId ?? 0;
        client.off('stopped', handler);
        resolve(stoppedThreadId);
      };
      client.on('stopped', handler);
      // Timeout fallback
      setTimeout(() => resolve(-1), 10000);
    });

    const threadId = await stoppedPromise;

    if (threadId === -1) {
      console.log('   ⚠️  Timeout waiting for stopped event');
    } else {
      console.log('   ✓ Stopped at threadId:', threadId);
    }

    // Get threads
    console.log('\n7. Get threads...');
    const threads = await client.threads();
    console.log('   Threads:', threads.length);
    for (const t of threads) {
      console.log('   -', t.id, t.name);
    }

    if (threads.length === 0) {
      console.log('   ⚠️  No threads available - checking if child session is active...');
      console.log('   hasActiveChildSession:', client.hasActiveChildSession());
    }

    // Try to get stack trace if we have a thread
    if (threads.length > 0 || threadId >= 0) {
      const tid = threads.length > 0 ? threads[0].id : threadId;
      console.log('\n8. Get stack trace for thread', tid, '...');
      try {
        const stack = await client.stackTrace(tid);
        console.log('   Stack frames:', stack.length);
        for (const frame of stack.slice(0, 3)) {
          console.log('   -', frame.name, '@', frame.source?.path ?? 'unknown', ':', frame.line);
        }

        // Get variables if we have a frame
        if (stack.length > 0) {
          console.log('\n9. Get scopes for frame', stack[0].id, '...');
          const scopes = await client.scopes(stack[0].id);
          console.log('   Scopes:', scopes.length);
          for (const scope of scopes) {
            console.log('   -', scope.name, '(ref:', scope.variablesReference, ')');
          }

          // Get variables from first scope
          if (scopes.length > 0 && scopes[0].variablesReference > 0) {
            console.log('\n10. Get variables from', scopes[0].name, '...');
            const vars = await client.variables(scopes[0].variablesReference);
            console.log('   Variables:', vars.length);
            for (const v of vars.slice(0, 5)) {
              console.log('   -', v.name, '=', v.value);
            }
          }
        }
      } catch (error) {
        console.log('   Error getting stack:', error);
      }
    }

    // Disconnect
    console.log('\n11. Disconnect...');
    await client.disconnect();

  } catch (error) {
    console.error('\nError:', error);
  }

  await sleep(500);
  console.log('\n=== Test Complete ===');
  console.log('\nSummary: vscode-js-debug multi-session DAP debugging test completed.');
  process.exit(0);
}

main();
