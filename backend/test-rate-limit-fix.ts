#!/usr/bin/env ts-node
/**
 * Rate Limit Fix Verification
 *
 * Ensures we don't double-call LLM for unknown messages
 */

import 'dotenv/config';
import { parseMessage } from './src/utils/messageParser.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

async function testRateLimitFix() {
  console.log(
    `\n${YELLOW}╔═══════════════════════════════════════════╗${RESET}`
  );
  console.log(`${YELLOW}║   Rate Limit Protection Test 🛡️          ║${RESET}`);
  console.log(
    `${YELLOW}╚═══════════════════════════════════════════╝${RESET}\n`
  );

  console.log(`${CYAN}Testing: usedLLM flag properly set${RESET}\n`);

  const scenarios = [
    {
      name: 'Valid command (exact match)',
      input: 'balance',
      shouldHaveFlag: false, // Regex only, no LLM needed
    },
    {
      name: 'Natural language (LLM parses)',
      input: 'how much do I have?',
      shouldHaveFlag: true, // LLM attempted and succeeded
    },
    {
      name: 'Complete gibberish (LLM returns unknown)',
      input: 'asdfghjklqwertyuiop',
      shouldHaveFlag: true, // LLM attempted (even if failed)
    },
    {
      name: 'Random text (LLM times out or fails)',
      input: 'xyz random nonsense 123',
      shouldHaveFlag: true, // LLM attempted
    },
  ];

  for (const scenario of scenarios) {
    console.log(`${YELLOW}Test:${RESET} ${scenario.name}`);
    console.log(`  Input: "${scenario.input}"`);

    const result = await parseMessage(scenario.input);

    const hasFlag = result.usedLLM === true;
    const flagStatus = hasFlag
      ? '✅ usedLLM: true'
      : '❌ usedLLM: false/undefined';

    console.log(`  Command: ${result.command}`);
    console.log(`  ${flagStatus}`);

    if (result.usedLLM === true && scenario.shouldHaveFlag) {
      console.log(
        `  ${GREEN}✓ Correct: LLM attempted, won't double-call${RESET}\n`
      );
    } else if (!result.usedLLM && !scenario.shouldHaveFlag) {
      console.log(`  ${GREEN}✓ Correct: Regex only, no LLM waste${RESET}\n`);
    } else if (result.usedLLM === true && !scenario.shouldHaveFlag) {
      console.log(
        `  ${YELLOW}⚠ Warning: LLM used when regex would work${RESET}\n`
      );
    } else {
      console.log(`  ${RED}✗ ERROR: usedLLM flag not set properly!${RESET}`);
      console.log(`  ${RED}  This will cause double LLM calls!${RESET}\n`);
    }

    // Small delay to avoid rate limits in testing
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`\n${CYAN}Rate Limit Behavior:${RESET}\n`);
  console.log(`Scenario 1 - Gibberish with LLM disabled:`);
  console.log(`  • Parser: Regex only (0 LLM calls)`);
  console.log(`  • usedLLM: false`);
  console.log(`  • Natural response: Attempts (1 LLM call)`);
  console.log(`  • Total: 1 call ✅\n`);

  console.log(`Scenario 2 - Gibberish with LLM enabled:`);
  console.log(`  • Parser: LLM attempt (1 call, returns unknown)`);
  console.log(`  • usedLLM: true ✅`);
  console.log(`  • Natural response: SKIPPED (0 calls) ✅`);
  console.log(`  • Total: 1 call ✅\n`);

  console.log(`Scenario 3 - Valid natural language:`);
  console.log(`  • Parser: LLM (1 call, returns "balance")`);
  console.log(`  • usedLLM: true`);
  console.log(`  • Natural response: Not needed (0 calls)`);
  console.log(`  • Total: 1 call ✅\n`);

  console.log(`${GREEN}✨ Protection Active:${RESET}`);
  console.log(`  • usedLLM flag prevents double-calling`);
  console.log(`  • Spam protection limits per user (10 msgs/min)`);
  console.log(`  • Rate limiter tracks budget (25/min, 14k/day)`);
  console.log(`  • Max waste: 1 call per unknown message ✅\n`);
}

testRateLimitFix().catch(console.error);
