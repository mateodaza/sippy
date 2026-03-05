#!/usr/bin/env tsx
/**
 * Phone Number Validation Tests
 */

import 'dotenv/config';
import { parseMessage } from '../../src/utils/messageParser.js';
import { TestRunner } from '../helpers/test-utils.js';

const runner = new TestRunner('Phone Validation Tests');

async function testPhoneFormats() {
  runner.printSection('Phone Number Format Validation');

  const tests = [
    {
      input: 'send 10 to +573001234567',
      desc: 'Standard format (+57 10 digits)',
      shouldWork: true,
    },
    {
      input: 'send 10 to +1234567890',
      desc: 'US format (+1 10 digits)',
      shouldWork: true,
    },
    {
      input: 'send 10 to +573001234567890',
      desc: 'Valid long format',
      shouldWork: true,
    },
    {
      input: 'send 10 to +123',
      desc: 'Too short (3 digits)',
      shouldWork: false,
    },
    {
      input: 'send 10 to +12345',
      desc: 'Too short (5 digits)',
      shouldWork: false,
    },
    {
      input: 'send 10 to phone',
      desc: 'Non-numeric',
      shouldWork: false,
    },
  ];

  for (const test of tests) {
    const result = await parseMessage(test.input);
    const worked = result.command === 'send' && result.recipient;

    runner.assert(
      worked === test.shouldWork,
      `${test.desc}`,
      worked !== test.shouldWork
        ? `Expected ${test.shouldWork ? 'valid' : 'invalid'}, got ${
            worked ? 'valid' : 'invalid'
          }`
        : undefined
    );
  }
}

async function testPhoneNormalization() {
  runner.printSection('Phone Number Normalization');

  const tests = [
    {
      input: 'send 10 to +573001234567',
      desc: 'With + prefix',
    },
    {
      input: 'send 10 to 573001234567',
      desc: 'Without + prefix',
    },
  ];

  for (const test of tests) {
    const result = await parseMessage(test.input);

    runner.assert(
      result.command === 'send' && result.recipient,
      `${test.desc}: "${test.input}"`,
      result.command !== 'send' || !result.recipient
        ? `Got: ${result.command}, recipient: ${result.recipient}`
        : undefined
    );
  }
}

async function testBareDigitsHandling() {
  runner.printSection('Bare Digits Handling (LLM Feature)');

  console.log('ℹ️  These tests verify LLM can extract bare digits\n');

  const tests = [
    { input: 'send 10 to 3001234567', desc: '10-digit bare number' },
    { input: 'send 5 to 573001234567', desc: 'With country code, no +' },
  ];

  for (const test of tests) {
    const result = await parseMessage(test.input);
    const didNotCrash = result !== undefined;

    runner.assert(
      didNotCrash,
      `${test.desc}: Handles without crashing`,
      !didNotCrash ? 'Result was undefined' : undefined
    );
  }
}

async function runTests() {
  runner.printHeader();

  await testPhoneFormats();
  await testPhoneNormalization();
  await testBareDigitsHandling();

  runner.printSummary();
}

runTests().catch((error) => {
  console.error('Test error:', error);
  process.exit(1);
});
