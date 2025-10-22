#!/usr/bin/env ts-node
/**
 * Test: One LLM Call with Natural Response
 */

import 'dotenv/config';
import { parseMessage } from './src/utils/messageParser.js';

const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

async function test() {
  console.log(
    `\n${YELLOW}╔═══════════════════════════════════════════╗${RESET}`
  );
  console.log(`${YELLOW}║   One-Call Natural Response Test ✨      ║${RESET}`);
  console.log(
    `${YELLOW}╚═══════════════════════════════════════════╝${RESET}\n`
  );

  const testCases = [
    'que es esto',
    '¿qué es esto?',
    'what is this',
    'random gibberish xyz',
  ];

  for (const input of testCases) {
    console.log(`${CYAN}Input:${RESET} "${input}"`);

    const result = await parseMessage(input);

    console.log(`Command: ${result.command}`);
    console.log(`LLM Status: ${result.llmStatus || 'N/A'}`);
    console.log(`Used LLM: ${result.usedLLM ? 'yes (1 call)' : 'no'}`);

    if (result.helpfulMessage) {
      console.log(`${GREEN}Helpful Message:${RESET}`);
      console.log(`  ${result.helpfulMessage}`);
    } else {
      console.log(
        `${YELLOW}No helpful message (will show command list)${RESET}`
      );
    }

    console.log('');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`${GREEN}✨ Benefits:${RESET}`);
  console.log(`  • Only 1 LLM call per message (parser includes response)`);
  console.log(`  • Natural, conversational replies in user's language`);
  console.log(`  • No double-call rate limit waste`);
  console.log(`  • Parser is now conversational by default\n`);
}

test().catch(console.error);
