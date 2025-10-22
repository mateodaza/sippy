#!/usr/bin/env ts-node
/**
 * LLM Status Observability Demo
 *
 * Shows detailed tracking of why LLM was/wasn't used
 */

import 'dotenv/config';
import { parseMessage } from './src/utils/messageParser.js';

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

async function demo() {
  console.log(
    `\n${YELLOW}╔═══════════════════════════════════════════╗${RESET}`
  );
  console.log(`${YELLOW}║   LLM Status Observability Demo 📊       ║${RESET}`);
  console.log(
    `${YELLOW}╚═══════════════════════════════════════════╝${RESET}\n`
  );

  const scenarios = [
    {
      name: 'Valid natural language',
      input: 'how much do I have?',
      expectedStatus: 'success',
    },
    {
      name: 'Complete gibberish',
      input: 'asdfghjklqwertyuiop',
      expectedStatus: 'low-confidence',
    },
  ];

  for (const scenario of scenarios) {
    console.log(`${CYAN}Scenario: ${scenario.name}${RESET}`);
    console.log(`Input: "${scenario.input}"`);

    const result = await parseMessage(scenario.input);

    console.log(`Command: ${result.command}`);
    console.log(`LLM Status: ${result.llmStatus || 'not set'}`);
    console.log(`Used LLM: ${result.usedLLM ? 'yes' : 'no'}\n`);

    // Small delay
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`${GREEN}📊 Status Values & Meanings:${RESET}\n`);
  console.log(`✅ success          - LLM parsed successfully`);
  console.log(`🔒 disabled         - USE_LLM=false (feature off)`);
  console.log(`⏱️  rate-limited     - Hit 25/min or 14k/day limit`);
  console.log(`⏰ timeout          - LLM took >3 seconds`);
  console.log(`❌ error            - Network/API error`);
  console.log(`🤔 low-confidence   - LLM returned null (confidence <0.7)`);
  console.log(`⚠️  validation-failed - Send command didn't pass checks\n`);

  console.log(`${GREEN}💡 Use Cases:${RESET}\n`);
  console.log(`1. Monitoring: Track success rate by status`);
  console.log(`2. Debugging: See why LLM fell back to regex`);
  console.log(`3. Optimization: Identify common failure patterns`);
  console.log(`4. Alerts: Get notified when rate limits hit`);
  console.log(`5. A/B Testing: Compare LLM vs regex performance\n`);

  console.log(`${GREEN}✨ Production Logging Example:${RESET}\n`);
  console.log(`📨 Message from +573001234567`);
  console.log(`🎯 Command: balance`);
  console.log(`✅ LLM Status: success`);
  console.log(`→ User gets fast, natural response\n`);

  console.log(`📨 Message from +573001234567 (spam burst)`);
  console.log(`🎯 Command: unknown`);
  console.log(`⏱️  LLM Status: rate-limited`);
  console.log(`→ Regex fallback protects budget\n`);
}

demo().catch(console.error);
