#!/usr/bin/env ts-node
/**
 * Test Spanish Natural Responses
 */

import 'dotenv/config';
import { parseMessage } from './src/utils/messageParser.js';
import { generateNaturalResponse } from './src/services/llm.service.js';

const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

async function testSpanishResponses() {
  console.log(
    `\n${YELLOW}╔═══════════════════════════════════════════╗${RESET}`
  );
  console.log(`${YELLOW}║   Spanish Natural Response Test 🇪🇸      ║${RESET}`);
  console.log(
    `${YELLOW}╚═══════════════════════════════════════════╝${RESET}\n`
  );

  const testCases = [
    'Que es esto?',
    '¿Qué es esto?',
    'que es esto',
    'no entiendo',
    'ayudame',
  ];

  for (const input of testCases) {
    console.log(`${CYAN}User:${RESET} "${input}"\n`);

    // Step 1: Parser
    const parsed = await parseMessage(input);
    console.log(
      `Parser result: ${parsed.command} (llmStatus: ${parsed.llmStatus})`
    );

    // Step 2: Natural response (simulating server logic)
    const shouldTryNatural =
      !parsed.usedLLM ||
      parsed.llmStatus === 'low-confidence' ||
      parsed.llmStatus === 'validation-failed';

    if (parsed.command === 'unknown' && shouldTryNatural) {
      console.log(`Trying natural response...`);
      const response = await generateNaturalResponse(input);

      if (response) {
        console.log(`${GREEN}Bot:${RESET} ${response}\n`);
      } else {
        console.log(`${YELLOW}Fallback to command list${RESET}\n`);
      }
    } else {
      console.log(`Command handled: ${parsed.command}\n`);
    }

    // Delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`${GREEN}✨ Key Points:${RESET}`);
  console.log(`  • Parser may return "unknown" with low confidence`);
  console.log(`  • Natural response generator gets a second chance`);
  console.log(`  • Replies in user's language (Spanish)`);
  console.log(`  • Conversational and helpful\n`);
}

testSpanishResponses().catch(console.error);
