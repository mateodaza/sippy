/**
 * LLM Parser Test Suite
 *
 * Tests natural language understanding, bilingual support,
 * fallback behavior, and safety features
 */

import 'dotenv/config';
import {
  parseMessage,
  parseMessageWithRegex,
} from './src/utils/messageParser.js';

// Test colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

// Test results tracking
let passed = 0;
let failed = 0;

function logTest(name: string, success: boolean, details?: string) {
  if (success) {
    console.log(`${GREEN}✓${RESET} ${name}`);
    passed++;
  } else {
    console.log(`${RED}✗${RESET} ${name}`);
    if (details) console.log(`  ${details}`);
    failed++;
  }
}

// ============================================================================
// Test Cases
// ============================================================================

async function testNaturalLanguageEnglish() {
  console.log(`\n${BLUE}═══ Natural Language (English) ═══${RESET}\n`);

  const tests = [
    { input: 'how much do I have?', expected: 'balance' },
    { input: 'check my balance', expected: 'balance' },
    { input: "what's my balance", expected: 'balance' },
    { input: 'show me my balance please', expected: 'balance' },
    { input: 'transfer 10 to +573001234567', expected: 'send' },
    { input: 'can you send 5 to +573001234567', expected: 'send' },
    { input: 'view my transactions', expected: 'history' },
    { input: 'show me my history', expected: 'history' },
    { input: 'what is this?', expected: 'about' },
    { input: 'i need help', expected: 'help' },
  ];

  for (const test of tests) {
    const result = await parseMessage(test.input);
    const success = result.command === test.expected;
    logTest(
      `"${test.input}" → ${test.expected}`,
      success,
      success ? undefined : `Got: ${result.command}`
    );
  }
}

async function testNaturalLanguageSpanish() {
  console.log(`\n${BLUE}═══ Natural Language (Spanish) ═══${RESET}\n`);

  const tests = [
    { input: 'cuánto tengo?', expected: 'balance' },
    { input: 'ver mi saldo', expected: 'balance' },
    { input: 'checar saldo', expected: 'balance' },
    { input: 'enviar 5 a +573001234567', expected: 'send' },
    { input: 'transferir 10 a +573001234567', expected: 'send' },
    { input: 'quiero enviar dinero a +573001234567', expected: 'send' },
    { input: 'ver mis transacciones', expected: 'history' },
    { input: 'mostrar historial', expected: 'history' },
    { input: 'qué es esto?', expected: 'about' },
    { input: 'necesito ayuda', expected: 'help' },
  ];

  for (const test of tests) {
    const result = await parseMessage(test.input);
    const success = result.command === test.expected;
    logTest(
      `"${test.input}" → ${test.expected}`,
      success,
      success ? undefined : `Got: ${result.command}`
    );
  }
}

async function testTypoTolerance() {
  console.log(`\n${BLUE}═══ Typo Tolerance ═══${RESET}\n`);

  const tests = [
    { input: 'ballance', expected: 'balance' },
    { input: 'chek balance', expected: 'balance' },
    { input: 'balanc', expected: 'balance' },
    { input: 'histery', expected: 'history' },
  ];

  for (const test of tests) {
    const result = await parseMessage(test.input);
    const success = result.command === test.expected;
    logTest(
      `"${test.input}" → ${test.expected}`,
      success,
      success ? undefined : `Got: ${result.command}`
    );
  }
}

async function testSendCommandSafety() {
  console.log(
    `\n${BLUE}═══ Send Command Safety (Cross-Verification) ═══${RESET}\n`
  );

  const tests = [
    {
      input: 'send 100 to +573001234567',
      expectedCmd: 'send',
      expectedAmount: 100,
    },
    {
      input: 'send $50 to 3001234567',
      expectedCmd: 'send',
      expectedAmount: 50,
    },
    {
      input: 'send 25.5 to +573001234567',
      expectedCmd: 'send',
      expectedAmount: 25.5,
    },
  ];

  for (const test of tests) {
    const result = await parseMessage(test.input);
    const cmdMatch = result.command === test.expectedCmd;
    const amountMatch =
      result.amount !== undefined &&
      Math.abs(result.amount - test.expectedAmount) < 0.01;
    const success = cmdMatch && amountMatch;

    logTest(
      `"${test.input}" → ${test.expectedCmd} ($${test.expectedAmount})`,
      success,
      success ? undefined : `Got: ${result.command} ($${result.amount})`
    );
  }
}

async function testExactCommands() {
  console.log(
    `\n${BLUE}═══ Exact Commands (Regex Compatibility) ═══${RESET}\n`
  );

  const tests = [
    { input: 'start', expected: 'start' },
    { input: 'balance', expected: 'balance' },
    { input: 'send 10 to +573001234567', expected: 'send' },
    { input: 'history', expected: 'history' },
    { input: 'about', expected: 'about' },
    { input: 'help', expected: 'help' },
  ];

  for (const test of tests) {
    const result = await parseMessage(test.input);
    const success = result.command === test.expected;
    logTest(
      `"${test.input}" → ${test.expected}`,
      success,
      success ? undefined : `Got: ${result.command}`
    );
  }
}

async function testFallbackBehavior() {
  console.log(`\n${BLUE}═══ Fallback Behavior ═══${RESET}\n`);

  // Test that regex still works
  const regexTests = [
    { input: 'balance', expected: 'balance' },
    { input: 'send 10 to +573001234567', expected: 'send' },
  ];

  for (const test of regexTests) {
    const result = parseMessageWithRegex(test.input);
    const success = result.command === test.expected;
    logTest(
      `Regex: "${test.input}" → ${test.expected}`,
      success,
      success ? undefined : `Got: ${result.command}`
    );
  }
}

async function testPhoneValidation() {
  console.log(`\n${BLUE}═══ Phone Number Validation ═══${RESET}\n`);

  const tests = [
    {
      input: 'send 10 to +573001234567',
      expected: 'send',
      shouldWork: true,
      desc: 'Valid phone with +',
    },
    {
      input: 'send 10 to +1234567890',
      expected: 'send',
      shouldWork: true,
      desc: 'Valid phone with + (10 digits)',
    },
    {
      input: 'send 10 to +12345',
      expected: 'unknown',
      shouldWork: false,
      desc: 'Invalid phone (too short)',
    },
    {
      input: 'send 10 to 1234567890',
      expected: 'unknown',
      shouldWork: false,
      desc: 'Invalid phone (no +)',
    },
  ];

  for (const test of tests) {
    const result = await parseMessage(test.input);
    const success = result.command === test.expected;
    logTest(
      `${test.desc}: "${test.input}"`,
      success,
      success ? undefined : `Expected: ${test.expected}, Got: ${result.command}`
    );
  }
}

async function testEdgeCases() {
  console.log(`\n${BLUE}═══ Edge Cases ═══${RESET}\n`);

  const tests = [
    { input: '', expected: 'unknown' },
    { input: '   ', expected: 'unknown' },
    { input: 'random gibberish xyz', expected: 'unknown' },
    { input: 'send -10 to +57300', expected: 'unknown' },
    { input: 'send 999999 to +57300', expected: 'unknown' },
    { input: 'send money', expected: 'unknown' }, // No amount or recipient
  ];

  for (const test of tests) {
    const result = await parseMessage(test.input);
    const success = result.command === test.expected;
    logTest(
      `"${test.input}" → ${test.expected}`,
      success,
      success ? undefined : `Got: ${result.command}`
    );
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function runAllTests() {
  console.log(
    `${YELLOW}╔════════════════════════════════════════════╗${RESET}`
  );
  console.log(`${YELLOW}║   LLM Parser Test Suite                   ║${RESET}`);
  console.log(
    `${YELLOW}╚════════════════════════════════════════════╝${RESET}`
  );

  // Check if LLM is enabled
  const llmEnabled = process.env.USE_LLM !== 'false';
  console.log(
    `\nLLM Status: ${
      llmEnabled ? GREEN + 'ENABLED' : YELLOW + 'DISABLED'
    }${RESET}`
  );
  console.log(
    `GROQ_API_KEY: ${
      process.env.GROQ_API_KEY ? GREEN + 'SET' : RED + 'NOT SET'
    }${RESET}`
  );

  if (!llmEnabled) {
    console.log(
      `${YELLOW}\n⚠️  LLM is disabled. Only exact command tests will pass.${RESET}`
    );
  }

  // Run all test suites
  await testNaturalLanguageEnglish();
  await testNaturalLanguageSpanish();
  await testTypoTolerance();
  await testSendCommandSafety();
  await testPhoneValidation();
  await testExactCommands();
  await testFallbackBehavior();
  await testEdgeCases();

  // Summary
  console.log(`\n${YELLOW}═══════════════════════════════════════════${RESET}`);
  console.log(`${GREEN}Passed: ${passed}${RESET}`);
  console.log(`${RED}Failed: ${failed}${RESET}`);
  console.log(`${YELLOW}═══════════════════════════════════════════${RESET}\n`);

  if (failed > 0) {
    console.log(
      `${RED}Some tests failed. Check the output above for details.${RESET}\n`
    );
    process.exit(1);
  } else {
    console.log(`${GREEN}All tests passed! 🎉${RESET}\n`);
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error(`${RED}Test suite error:${RESET}`, error);
  process.exit(1);
});
