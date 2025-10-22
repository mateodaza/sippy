#!/usr/bin/env ts-node
/**
 * Edge Case Test Suite
 *
 * Tests that core functionality ALWAYS works, even with:
 * - LLM failures
 * - Invalid inputs
 * - Edge cases
 */

import 'dotenv/config';
import {
  parseMessage,
  parseMessageWithRegex,
} from './src/utils/messageParser.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passed++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    if (details) console.log(`  ${details}`);
    failed++;
  }
}

async function runTests() {
  console.log(`\n${YELLOW}════════════════════════════════════════${RESET}`);
  console.log(`${YELLOW}   Edge Case & Reliability Test Suite  ${RESET}`);
  console.log(`${YELLOW}════════════════════════════════════════${RESET}\n`);

  // =====================================================================
  // Test 1: Regex fallback ALWAYS works (core functionality guarantee)
  // =====================================================================
  console.log(`\n${YELLOW}Test 1: Regex Parser (Always Works)${RESET}\n`);

  const regexTests = [
    { input: 'balance', expected: 'balance' },
    { input: 'start', expected: 'start' },
    { input: 'help', expected: 'help' },
    { input: 'send 10 to +573001234567', expected: 'send' },
    { input: '', expected: 'unknown' },
    { input: '   ', expected: 'unknown' },
    { input: 'random gibberish', expected: 'unknown' },
  ];

  for (const test of regexTests) {
    const result = parseMessageWithRegex(test.input);
    assert(
      result.command === test.expected,
      `Regex: "${test.input}" → ${test.expected}`,
      `Got: ${result.command}`
    );
  }

  // =====================================================================
  // Test 2: Hybrid parser works even with LLM disabled
  // =====================================================================
  console.log(`\n${YELLOW}Test 2: Hybrid Parser (LLM Disabled)${RESET}\n`);

  // Temporarily disable LLM
  const originalLLM = process.env.USE_LLM;
  process.env.USE_LLM = 'false';

  for (const test of regexTests) {
    const result = await parseMessage(test.input);
    assert(
      result.command === test.expected,
      `Hybrid (LLM off): "${test.input}" → ${test.expected}`,
      `Got: ${result.command}`
    );
  }

  // Restore LLM setting
  process.env.USE_LLM = originalLLM;

  // =====================================================================
  // Test 3: Phone number normalization edge cases
  // =====================================================================
  console.log(`\n${YELLOW}Test 3: Phone Normalization${RESET}\n`);

  const phoneTests = [
    {
      input: 'send 10 to +573001234567',
      test: 'Phone with +',
      check: (r: any) => r.recipient && !r.recipient.startsWith('+'),
    },
    {
      input: 'send 10 to 573001234567',
      test: 'Phone without +',
      check: (r: any) => r.recipient && r.recipient.length >= 10,
    },
    {
      input: 'send $5 to +573001234567',
      test: 'Dollar sign amount',
      check: (r: any) => r.amount === 5,
    },
    {
      input: 'send 10.50 to +573001234567',
      test: 'Decimal amount',
      check: (r: any) => Math.abs(r.amount! - 10.5) < 0.01,
    },
  ];

  for (const test of phoneTests) {
    const result = await parseMessage(test.input);
    assert(
      result.command === 'send' && test.check(result),
      test.test,
      result.command !== 'send' ? `Got: ${result.command}` : 'Invalid result'
    );
  }

  // =====================================================================
  // Test 4: Invalid input handling
  // =====================================================================
  console.log(`\n${YELLOW}Test 4: Invalid Inputs${RESET}\n`);

  const invalidTests = [
    { input: 'send -10 to +573001234567', desc: 'Negative amount' },
    { input: 'send abc to +573001234567', desc: 'Non-numeric amount' },
    { input: 'send 10 to phone', desc: 'Invalid phone' },
    { input: 'send 10 to +123', desc: 'Phone too short' },
    { input: 'send', desc: 'Missing arguments' },
    { input: 'send to +573001234567', desc: 'Missing amount' },
    { input: 'send 10', desc: 'Missing recipient' },
  ];

  for (const test of invalidTests) {
    const result = await parseMessage(test.input);
    assert(
      result.command !== 'send' || !result.amount || !result.recipient,
      `${test.desc} → rejects or falls back`,
      result.command === 'send'
        ? `Got valid send: ${JSON.stringify(result)}`
        : undefined
    );
  }

  // =====================================================================
  // Test 5: Core commands always work
  // =====================================================================
  console.log(`\n${YELLOW}Test 5: Core Commands (Must Always Work)${RESET}\n`);

  const coreCommands = [
    { input: 'balance', command: 'balance' },
    { input: 'start', command: 'start' },
    { input: 'help', command: 'help' },
    { input: 'history', command: 'history' },
    { input: 'about', command: 'about' },
  ];

  for (const test of coreCommands) {
    const result = await parseMessage(test.input);
    assert(
      result.command === test.command,
      `Core: "${test.input}" MUST work`,
      `Got: ${result.command}`
    );
  }

  // =====================================================================
  // Test 6: Stress test with invalid API key (simulate LLM failure)
  // =====================================================================
  console.log(`\n${YELLOW}Test 6: LLM Failure Resilience${RESET}\n`);

  const originalKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'invalid_key_simulate_failure';

  // Core commands must still work even with invalid LLM key
  for (const test of coreCommands) {
    const result = await parseMessage(test.input);
    assert(
      result.command === test.command,
      `LLM fail: "${test.input}" still works`,
      `Got: ${result.command}`
    );
  }

  // Restore original key
  process.env.GROQ_API_KEY = originalKey;

  // =====================================================================
  // Test 7: Amount validation consistency
  // =====================================================================
  console.log(`\n${YELLOW}Test 7: Amount Validation${RESET}\n`);

  const amountTests = [
    { input: 'send 0 to +573001234567', desc: 'Zero amount', shouldFail: true },
    {
      input: 'send -5 to +573001234567',
      desc: 'Negative amount',
      shouldFail: true,
    },
    {
      input: 'send 0.01 to +573001234567',
      desc: 'Tiny amount',
      shouldFail: false,
    },
    {
      input: 'send 100000 to +573001234567',
      desc: 'Large amount (100k)',
      shouldFail: false,
    },
    {
      input: 'send 999999 to +573001234567',
      desc: 'Huge amount (1M)',
      shouldFail: true,
    },
  ];

  for (const test of amountTests) {
    const result = await parseMessage(test.input);
    const isValid = !!(
      result.command === 'send' &&
      result.amount &&
      result.amount > 0
    );

    if (test.shouldFail) {
      assert(
        !isValid,
        `${test.desc} → rejects`,
        isValid ? `Got: ${result.amount}` : undefined
      );
    } else {
      assert(
        isValid,
        `${test.desc} → accepts`,
        !isValid ? `Got: ${result.command}` : undefined
      );
    }
  }

  // =====================================================================
  // Summary
  // =====================================================================
  console.log(`\n${YELLOW}════════════════════════════════════════${RESET}`);
  console.log(`${GREEN}✓ Passed: ${passed}${RESET}`);
  console.log(`${RED}✗ Failed: ${failed}${RESET}`);
  console.log(`${YELLOW}════════════════════════════════════════${RESET}\n`);

  if (failed > 0) {
    console.log(`${RED}CRITICAL: Some edge cases failed!${RESET}\n`);
    process.exit(1);
  } else {
    console.log(
      `${GREEN}SUCCESS: All edge cases handled correctly! ✨${RESET}`
    );
    console.log(`${GREEN}Core functionality is GUARANTEED to work.${RESET}\n`);
  }
}

runTests().catch((error) => {
  console.error(`${RED}Test suite error:${RESET}`, error);
  process.exit(1);
});
