/**
 * Low-level DAP test for CodeLLDB
 */

import { DapClient, DapClientConfig } from '../src/dap/dap-client.js';
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
  console.log('=== Low-Level CodeLLDB Test ===\n');
  console.log('Binary:', BINARY_PATH);
  console.log('Source:', SOURCE_PATH);

  // Find CodeLLDB path
  const codelldbPath = path.join(
    process.env.HOME || '~',
    '.mcp-debugger/adapters/codelldb/extension/adapter/codelldb'
  );

  console.log('\n1. Starting CodeLLDB adapter...');
  console.log('   Path:', codelldbPath);

  const config: DapClientConfig = {
    command: codelldbPath,
    args: [],
    timeout: 30000
  };

  const client = new DapClient(config);

  // Start the adapter
  await client.start();
  console.log('   Adapter started');

  // Listen to all events
  client.on('event', (event) => {
    console.log('<<< event:', event.event);
    if (event.body) {
      console.log('    body:', JSON.stringify(event.body).substring(0, 200));
    }
  });

  client.on('error', (err) => {
    console.error('Client error:', err);
  });

  try {
    // Initialize
    console.log('\n2. Initialize...');
    console.log('>>> request: initialize (seq=1)');
    const initResponse = await client.initialize({
      clientID: 'mcp-debugger-test',
      clientName: 'MCP Debugger Test',
      adapterID: 'lldb',
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: 'path',
      supportsVariableType: true,
      supportsVariablePaging: true,
      supportsRunInTerminalRequest: false,
      locale: 'en-US'
    });
    console.log('<<< response: initialize');
    console.log('    success:', initResponse !== undefined);
    console.log('    capabilities:', Object.keys(initResponse || {}).length, 'keys');

    // Launch
    console.log('\n3. Launch...');
    console.log('>>> request: launch (seq=2)');

    const launchConfig = {
      type: 'lldb',
      request: 'launch',
      name: 'MCP Debug Rust',
      program: BINARY_PATH,
      args: [],
      cwd: path.dirname(BINARY_PATH),
      env: {},
      stopOnEntry: false,  // Let it run until breakpoint
      sourceLanguages: ['rust']
    };
    console.log('    config:', JSON.stringify(launchConfig, null, 2));

    // Use launchAsync since we don't know if CodeLLDB responds before or after configurationDone
    client.launchAsync(launchConfig);
    console.log('    launch sent (async)');

    // Wait a moment for initialized event
    await sleep(1000);

    // Set breakpoint
    console.log('\n4. Set breakpoint at line 11...');
    const bpResult = await client.setBreakpoints(
      { path: SOURCE_PATH },
      [{ line: 11 }]
    );
    console.log('<<< breakpoint response:', JSON.stringify(bpResult, null, 2));

    // Configuration done
    console.log('\n5. Configuration done...');
    console.log('>>> request: configurationDone');
    await client.configurationDone();
    console.log('<<< response: configurationDone');

    // Wait for launch response if pending
    try {
      console.log('\n6. Waiting for launch response...');
      await client.waitForLaunch(5000);
      console.log('    Launch response received');
    } catch (e) {
      console.log('    Launch wait error:', (e as Error).message);
    }

    // Wait for stop
    console.log('\n7. Waiting for stop event...');
    await sleep(2000);

    // Get threads
    console.log('\n8. Get threads...');
    const threadsResponse = await client.threads();
    console.log('<<< threads:', JSON.stringify(threadsResponse, null, 2));

    if (threadsResponse.length > 0) {
      const threadId = threadsResponse[0].id;

      // Get stack trace
      console.log('\n9. Get stack trace...');
      const stackTrace = await client.stackTrace(threadId);
      console.log('<<< stackTrace:', JSON.stringify(stackTrace.slice(0, 3), null, 2));

      if (stackTrace.length > 0) {
        const frameId = stackTrace[0].id;

        // Get scopes
        console.log('\n10. Get scopes...');
        const scopesResponse = await client.scopes(frameId);
        console.log('<<< scopes:', JSON.stringify(scopesResponse, null, 2));

        // Get variables from local scope if available
        if (scopesResponse.length > 0) {
          const localScope = scopesResponse.find(s => s.name === 'Locals') || scopesResponse[0];
          console.log('\n11. Get variables from', localScope.name, '...');
          const variables = await client.variables(localScope.variablesReference);
          console.log('<<< variables:', JSON.stringify(variables, null, 2));
        }
      }

      // Continue
      console.log('\n12. Continue...');
      await client.continue(threadId);
      await sleep(500);
    }

    // Disconnect
    console.log('\n12. Disconnect...');
    await client.disconnect();

  } catch (error) {
    console.error('\nError:', error);
  }

  // Wait for cleanup
  await sleep(1000);
  console.log('\n=== Test Complete ===');
  process.exit(0);
}

main();
