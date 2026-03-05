#!/usr/bin/env tsx
/**
 * Test Runner - Run all tests in sequence
 */

import { spawn } from 'child_process';
import { join } from 'path';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

interface TestSuite {
  name: string;
  path: string;
}

const testSuites: TestSuite[] = [
  // Unit tests (fast, no dependencies)
  { name: 'Message Parser', path: 'tests/unit/message-parser.test.ts' },
  { name: 'Phone Validation', path: 'tests/unit/phone-validation.test.ts' },

  // LLM tests (depend on API key)
  { name: 'LLM Natural Language', path: 'tests/llm/natural-language.test.ts' },
  { name: 'LLM Edge Cases', path: 'tests/llm/edge-cases.test.ts' },

  // Integration tests (depend on services)
  {
    name: 'Wallet Operations',
    path: 'tests/integration/wallet-operations.test.ts',
  },

  // E2E tests (full flow)
  { name: 'E2E Full Flow', path: 'tests/e2e/full-flow.test.ts' },
];

async function runTest(suite: TestSuite): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`\n${colors.blue}▶ Running: ${suite.name}${colors.reset}`);
    console.log(`${colors.blue}${'─'.repeat(60)}${colors.reset}`);

    const testProcess = spawn('tsx', [suite.path], {
      cwd: join(process.cwd()),
      stdio: 'inherit',
    });

    testProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`${colors.green}✓ ${suite.name} passed${colors.reset}`);
        resolve(true);
      } else {
        console.log(`${colors.red}✗ ${suite.name} failed${colors.reset}`);
        resolve(false);
      }
    });
  });
}

async function runAll() {
  console.log(`${colors.yellow}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.yellow}   Sippy Backend Test Suite${colors.reset}`);
  console.log(`${colors.yellow}${'═'.repeat(60)}${colors.reset}`);

  let passed = 0;
  let failed = 0;

  for (const suite of testSuites) {
    const success = await runTest(suite);
    if (success) {
      passed++;
    } else {
      failed++;
    }
  }

  // Summary
  console.log(`\n${colors.yellow}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.yellow}   Test Summary${colors.reset}`);
  console.log(`${colors.yellow}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
  console.log(`${colors.yellow}${'═'.repeat(60)}${colors.reset}\n`);

  if (failed > 0) {
    console.log(`${colors.red}Some test suites failed!${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${colors.green}All test suites passed! 🎉${colors.reset}\n`);
  }
}

runAll().catch((error) => {
  console.error(`${colors.red}Test runner error:${colors.reset}`, error);
  process.exit(1);
});
