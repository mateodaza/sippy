#!/usr/bin/env tsx
/**
 * LLM Edge Cases & Reliability Tests
 * Ensures core functionality works even with LLM failures
 */

import 'dotenv/config';
import {
  parseMessage,
  parseMessageWithRegex,
} from '../../src/utils/messageParser.js';
import { TestRunner } from '../helpers/test-utils.js';

const runner = new TestRunner('LLM Edge Cases & Reliability Tests');

async function testCoreCommandsAlwaysWork() {
  runner.printSection('Core Commands (Must Always Work)');

  const coreCommands = [
    { input: 'balance', command: 'balance' },
    { input: 'start', command: 'start' },
    { input: 'help', command: 'help' },
    { input: 'history', command: 'history' },
    { input: 'about', command: 'about' },
  ];

  for (const test of coreCommands) {
    const result = await parseMessage(test.input);
    runner.assert(
      result.command === test.command,
      `Core: "${test.input}" MUST work`,
      result.command !== test.command ? `Got: ${result.command}` : undefined
    );
  }
}

async function testLLMDisabled() {
  runner.printSection('LLM Disabled - Fallback Works');

  const originalLLM = process.env.USE_LLM;
  process.env.USE_LLM = 'false';

  const tests = [
    { input: 'balance', expected: 'balance' },
    { input: 'start', expected: 'start' },
    { input: 'send 10 to +573001234567', expected: 'send' },
  ];

  for (const test of tests) {
    const result = await parseMessage(test.input);
    runner.assert(
      result.command === test.expected,
      `LLM off: "${test.input}" → ${test.expected}`,
      result.command !== test.expected ? `Got: ${result.command}` : undefined
    );
  }

  process.env.USE_LLM = originalLLM;
}

async function testLLMFailureResilience() {
  runner.printSection('LLM Failure Resilience');

  const originalKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'invalid_key_simulate_failure';

  const coreCommands = [
    { input: 'balance', command: 'balance' },
    { input: 'help', command: 'help' },
    { input: 'start', command: 'start' },
  ];

  for (const test of coreCommands) {
    const result = await parseMessage(test.input);
    runner.assert(
      result.command === test.command,
      `LLM fail: "${test.input}" still works`,
      result.command !== test.command ? `Got: ${result.command}` : undefined
    );
  }

  process.env.GROQ_API_KEY = originalKey;
}

async function testRegexAlwaysWorks() {
  runner.printSection('Regex Parser (Always Works)');

  const regexTests = [
    { input: 'balance', expected: 'balance' },
    { input: 'start', expected: 'start' },
    { input: 'help', expected: 'help' },
    { input: 'send 10 to +573001234567', expected: 'send' },
    { input: '', expected: 'unknown' },
    { input: 'random gibberish', expected: 'unknown' },
  ];

  for (const test of regexTests) {
    const result = parseMessageWithRegex(test.input);
    runner.assert(
      result.command === test.expected,
      `Regex: "${test.input}" → ${test.expected}`,
      result.command !== test.expected ? `Got: ${result.command}` : undefined
    );
  }
}

async function testInvalidInputs() {
  runner.printSection('Invalid Input Handling');

  const invalidTests = [
    { input: 'send -10 to +573001234567', desc: 'Negative amount' },
    { input: 'send abc to +573001234567', desc: 'Non-numeric amount' },
    { input: 'send 10 to phone', desc: 'Invalid phone' },
    { input: 'send', desc: 'Missing arguments' },
  ];

  for (const test of invalidTests) {
    const result = await parseMessage(test.input);
    runner.assert(
      result.command !== 'send' || !result.amount || !result.recipient,
      `${test.desc} → rejects or falls back`,
      result.command === 'send' && result.amount && result.recipient
        ? `Got valid send: ${JSON.stringify(result)}`
        : undefined
    );
  }
}

async function testAmountValidation() {
  runner.printSection('Amount Validation');

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
      desc: 'Large amount',
      shouldFail: false,
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
      runner.assert(
        !isValid,
        `${test.desc} → rejects`,
        isValid ? `Got: ${result.amount}` : undefined
      );
    } else {
      runner.assert(
        isValid,
        `${test.desc} → accepts`,
        !isValid ? `Got: ${result.command}` : undefined
      );
    }
  }
}

async function runTests() {
  runner.printHeader();

  console.log('ℹ️  These tests ensure system reliability\n');

  await testRegexAlwaysWorks();
  await testCoreCommandsAlwaysWork();
  await testLLMDisabled();
  await testLLMFailureResilience();
  await testInvalidInputs();
  await testAmountValidation();

  runner.printSummary();
}

runTests().catch((error) => {
  console.error('Test error:', error);
  process.exit(1);
});
