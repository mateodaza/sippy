#!/usr/bin/env tsx
/**
 * LLM Natural Language Understanding Tests
 * Tests conversational AI capabilities
 */

import 'dotenv/config';
import { parseMessage } from '../../src/utils/messageParser.js';
import { TestRunner, checkLLMStatus } from '../helpers/test-utils.js';

const runner = new TestRunner('LLM Natural Language Tests');

async function testConversationalEnglish() {
  runner.printSection('Conversational English');

  const conversations = [
    { user: 'how much money do I have?', expected: 'balance' },
    { user: 'check my balance please', expected: 'balance' },
    { user: "what's my current balance?", expected: 'balance' },
    { user: 'show me my balance', expected: 'balance' },
    {
      user: 'hey, can you tell me how much money is in my wallet?',
      expected: 'balance',
    },
    {
      user: 'I would like to check my current balance please',
      expected: 'balance',
    },
  ];

  for (const msg of conversations) {
    const result = await parseMessage(msg.user);
    runner.assert(
      result.command === msg.expected,
      `"${msg.user}"`,
      result.command !== msg.expected ? `Got: ${result.command}` : undefined
    );
  }
}

async function testConversationalSpanish() {
  runner.printSection('Conversational Spanish');

  const conversations = [
    { user: 'cuánto dinero tengo?', expected: 'balance' },
    { user: 'quiero ver mi saldo', expected: 'balance' },
    { user: 'cuál es mi saldo?', expected: 'balance' },
    { user: 'necesito saber cuánto tengo', expected: 'balance' },
  ];

  for (const msg of conversations) {
    const result = await parseMessage(msg.user);
    runner.assert(
      result.command === msg.expected,
      `"${msg.user}"`,
      result.command !== msg.expected ? `Got: ${result.command}` : undefined
    );
  }
}

async function testComplexNaturalLanguage() {
  runner.printSection('Complex Natural Language');

  const complexTests = [
    {
      msg: 'hey, can you tell me how much money is in my wallet?',
      expected: 'balance',
    },
    {
      msg: 'could you please send 10 dollars to my friend at +573001234567?',
      expected: 'send',
    },
    {
      msg: 'necesito enviar dinero a mi amigo, son 5 dolares a +573001234567',
      expected: 'send',
    },
  ];

  for (const test of complexTests) {
    const result = await parseMessage(test.msg);
    runner.assert(
      result.command === test.expected,
      `Complex: "${test.msg.substring(0, 50)}..."`,
      result.command !== test.expected ? `Got: ${result.command}` : undefined
    );
  }
}

async function testSendNaturalLanguage() {
  runner.printSection('Natural Send Requests');

  const sendTests = [
    { user: 'send 10 dollars to +573001234567', expected: 'send' },
    { user: 'transfer 5 to +573001234567', expected: 'send' },
    { user: 'can you send 20 to +573001234567', expected: 'send' },
    { user: 'I want to send 15 to +573001234567', expected: 'send' },
    { user: 'enviar 10 a +573001234567', expected: 'send' },
    { user: 'quiero enviar 5 a +573001234567', expected: 'send' },
  ];

  for (const msg of sendTests) {
    const result = await parseMessage(msg.user);
    runner.assert(
      result.command === msg.expected,
      `"${msg.user}"`,
      result.command !== msg.expected ? `Got: ${result.command}` : undefined
    );
  }
}

async function runTests() {
  runner.printHeader();

  const { llmEnabled, hasKey } = checkLLMStatus();

  if (!llmEnabled || !hasKey) {
    console.log(
      '⚠️  LLM is not fully configured. Natural language tests may fail.\n'
    );
  }

  await testConversationalEnglish();
  await testConversationalSpanish();
  await testComplexNaturalLanguage();
  await testSendNaturalLanguage();

  runner.printSummary();
}

runTests().catch((error) => {
  console.error('Test error:', error);
  process.exit(1);
});
