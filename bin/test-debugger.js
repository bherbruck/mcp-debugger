/**
 * Test script to verify the debugger works
 */
import { sessionManager } from './src/session/session-manager.js';
import { DebugLanguage } from './src/session/types.js';
import './src/adapters/index.js';
import * as path from 'path';
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function main() {
    console.log('=== MCP Debugger Test ===\n');
    const scriptPath = path.resolve('./tests/fixtures/python/sample.py');
    console.log(`Testing with: ${scriptPath}\n`);
    try {
        // Create session
        console.log('1. Creating debug session...');
        const session = await sessionManager.createSession({
            language: DebugLanguage.PYTHON,
            name: 'test-session'
        });
        console.log(`   Session created: ${session.id}`);
        console.log(`   State: ${session.state}\n`);
        // Set up event listeners
        sessionManager.on('stopped', (sid, reason, threadId) => {
            console.log(`\n>>> STOPPED: reason=${reason}, threadId=${threadId}`);
        });
        sessionManager.on('output', (sid, output) => {
            if (output.category !== 'stderr') {
                console.log(`   [output] ${output.output.trim()}`);
            }
        });
        // Set a breakpoint
        console.log('2. Setting breakpoint at line 9 (inside calculate_sum)...');
        const bpResult = await sessionManager.setBreakpoint(session.id, {
            file: scriptPath,
            line: 9
        });
        console.log(`   Breakpoint set: verified=${bpResult.breakpoint?.verified ?? 'pending'}\n`);
        // Start debugging
        console.log('3. Starting debugging...');
        const startResult = await sessionManager.startDebugging(session.id, {
            scriptPath,
            stopOnEntry: false
        });
        console.log(`   Result: ${startResult.message}`);
        console.log(`   State: ${startResult.state}\n`);
        // Wait for the program to hit the breakpoint
        console.log('4. Waiting for breakpoint...');
        await sleep(2000);
        // Get current state
        const info = sessionManager.getSessionInfo(session.id);
        console.log(`   Current state: ${info.state}`);
        if (info.state === 'paused') {
            // Get source context
            console.log('\n5. Getting source context...');
            const context = await sessionManager.getSourceContext(session.id);
            if (context) {
                console.log(`   File: ${path.basename(context.file)}`);
                for (const line of context.lines) {
                    const marker = line.isCurrent ? '>>>' : '   ';
                    const bp = line.hasBreakpoint ? '*' : ' ';
                    console.log(`   ${marker}${bp}${line.lineNumber}: ${line.content}`);
                }
            }
            // Get variables
            console.log('\n6. Getting variables...');
            const variables = await sessionManager.getVariables(session.id);
            console.log('   Local variables:');
            for (const v of variables.slice(0, 10)) {
                console.log(`   - ${v.name}: ${v.value} (${v.type})`);
            }
            // Get stack trace
            console.log('\n7. Getting stack trace...');
            const stack = await sessionManager.getStackTrace(session.id);
            console.log('   Call stack:');
            for (const frame of stack) {
                console.log(`   - ${frame.name} at ${path.basename(frame.file)}:${frame.line}`);
            }
            // Step over
            console.log('\n8. Stepping over...');
            await sessionManager.stepOver(session.id);
            await sleep(500);
            // Get variables again
            const varsAfter = await sessionManager.getVariables(session.id);
            console.log('   Variables after step:');
            for (const v of varsAfter.slice(0, 5)) {
                console.log(`   - ${v.name}: ${v.value}`);
            }
            // Continue execution
            console.log('\n9. Continuing execution...');
            await sessionManager.continue(session.id);
            await sleep(1000);
        }
        // Terminate session
        console.log('\n10. Terminating session...');
        const termResult = await sessionManager.terminateSession(session.id);
        console.log(`    ${termResult.message}`);
        console.log('\n=== Test Complete ===');
    }
    catch (error) {
        console.error('Error:', error);
    }
    process.exit(0);
}
main();
