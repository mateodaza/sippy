#!/usr/bin/env tsx
/**
 * Message Parser Unit Tests
 * Tests all message parsing functionality including LLM and regex fallback
 */

import 'dotenv/config';
import {
  parseMessage,
  parseMessageWithRegex,
} from '../../src/utils/messageParser.js';
import { TestRunner, checkLLMStatus } from '../helpers/test-utils.js';

const runner = new TestRunner('Message Parser Tests');

async function testEnglishNaturalLanguage() {
  runner.printSection('Natural Language (English)');

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
    runner.assert(
      result.command === test.expected,
      `"${test.input}" → ${test.expected}`,
      result.command !== test.expected ? `Got: ${result.command}` : undefined
    );
  }
}

async function testSpanishNaturalLanguage() {
  runner.printSection('Natural Language (Spanish)');

  const tests = [
    { input: 'cuánto tengo?', expected: 'balance' },
    { input: 'ver mi saldo', expected: 'balance' },
    { input: 'checar saldo', expected: 'balance' },
    { input: 'enviar 5 a +573001234567', expected: 'send' },
    { input: 'transferir 10 a +573001234567', expected: 'send' },
    { input: 'quiero enviar dinero a +573001234567', expected: 'send' },
    { input: 'ver mis transacciones', expected: 'history' },
    { input: 'mostrar historial', expected: 'history' },
  ];

  for (const test of tests) {
    const result = await parseMessage(test.input);
    runner.assert(
      result.command === test.expected,
      `"${test.input}" → ${test.expected}`,
      result.command !== test.expected ? `Got: ${result.command}` : undefined
    );
  }
}

async function testTypoTolerance() {
  runner.printSection('Typo Tolerance');

  const tests = [
    { input: 'ballance', expected: 'balance' },
    { input: 'chek balance', expected: 'balance' },
    { input: 'balanc', expected: 'balance' },
    { input: 'histery', expected: 'history' },
  ];

  for (const test of tests) {
    const result = await parseMessage(test.input);
    runner.assert(
      result.command === test.expected,
      `"${test.input}" → ${test.expected}`,
      result.command !== test.expected ? `Got: ${result.command}` : undefined
    );
  }
}

async function testSendCommandParsing() {
  runner.printSection('Send Command Parsing & Safety');

  const tests = [
    {
      input: 'send 100 to +573001234567',
      expectedCmd: 'send',
      expectedAmount: 100,
    },
    {
      input: 'send $50 to +573001234567',
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

    runner.assert(
      cmdMatch && amountMatch,
      `"${test.input}" → ${test.expectedCmd} ($${test.expectedAmount})`,
      !cmdMatch || !amountMatch
        ? `Got: ${result.command} ($${result.amount})`
        : undefined
    );
  }
}

async function testExactCommands() {
  runner.printSection('Exact Commands (Regex Compatibility)');

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
    runner.assert(
      result.command === test.expected,
      `"${test.input}" → ${test.expected}`,
      result.command !== test.expected ? `Got: ${result.command}` : undefined
    );
  }
}

async function testRegexFallback() {
  runner.printSection('Regex Fallback (Core Guarantee)');

  const tests = [
    { input: 'balance', expected: 'balance' },
    { input: 'send 10 to +573001234567', expected: 'send' },
    { input: 'history', expected: 'history' },
  ];

  for (const test of tests) {
    const result = parseMessageWithRegex(test.input);
    runner.assert(
      result.command === test.expected,
      `Regex: "${test.input}" → ${test.expected}`,
      result.command !== test.expected ? `Got: ${result.command}` : undefined
    );
  }
}

async function testPhoneValidation() {
  runner.printSection('Phone Number Validation');

  const tests = [
    {
      input: 'send 10 to +573001234567',
      shouldWork: true,
      desc: 'Valid phone with +',
    },
    {
      input: 'send 10 to +1234567890',
      shouldWork: true,
      desc: 'Valid 10-digit phone',
    },
    { input: 'send 10 to +12345', shouldWork: false, desc: 'Phone too short' },
  ];

  for (const test of tests) {
    const result = await parseMessage(test.input);
    const worked = result.command === 'send' && result.recipient;

    runner.assert(
      worked === test.shouldWork,
      `${test.desc}: "${test.input}"`,
      worked !== test.shouldWork
        ? `Expected ${test.shouldWork ? 'valid' : 'invalid'}, got ${
            worked ? 'valid' : 'invalid'
          }`
        : undefined
    );
  }
}

async function testEdgeCases() {
  runner.printSection('Edge Cases');

  const tests = [
    { input: '', expected: 'unknown' },
    { input: '   ', expected: 'unknown' },
    { input: 'random gibberish xyz', expected: 'unknown' },
    { input: 'send -10 to +573001234567', expected: 'unknown' },
  ];

  for (const test of tests) {
    const result = await parseMessage(test.input);
    runner.assert(
      result.command === test.expected,
      `"${test.input}" → ${test.expected}`,
      result.command !== test.expected ? `Got: ${result.command}` : undefined
    );
  }
}

async function testOriginalTextPresence() {
  runner.printSection('OriginalText Field (Bug Fix Verification)');

  const unknownInputs = [
    'complete gibberish xyz',
    'random nonsense',
    'asdfghjkl',
  ];

  for (const input of unknownInputs) {
    const result = await parseMessage(input);
    runner.assert(
      result.originalText !== undefined,
      `Unknown command includes originalText: "${input}"`,
      result.originalText === undefined
        ? 'originalText is undefined'
        : undefined
    );
  }
}

async function runTests() {
  runner.printHeader();
  checkLLMStatus();

  await testExactCommands();
  await testRegexFallback();
  await testEnglishNaturalLanguage();
  await testSpanishNaturalLanguage();
  await testTypoTolerance();
  await testSendCommandParsing();
  await testPhoneValidation();
  await testEdgeCases();
  await testOriginalTextPresence();

  runner.printSummary();
}

runTests().catch((error) => {
  console.error('Test error:', error);
  process.exit(1);
});
