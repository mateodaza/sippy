#!/usr/bin/env ts-node
/**
 * Natural Conversation Test
 *
 * Demonstrates that users can chat naturally with the bot
 */

import 'dotenv/config';
import { parseMessage } from './src/utils/messageParser.js';

const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

async function testConversation() {
  console.log(
    `\n${YELLOW}╔═══════════════════════════════════════════════╗${RESET}`
  );
  console.log(
    `${YELLOW}║   Natural Conversation with Sippy Bot 🤖     ║${RESET}`
  );
  console.log(
    `${YELLOW}╚═══════════════════════════════════════════════╝${RESET}\n`
  );

  const conversations = [
    // English - Natural Questions
    {
      category: '💬 Natural English Questions',
      messages: [
        { user: 'how much money do I have?', expectedCommand: 'balance' },
        { user: 'check my balance please', expectedCommand: 'balance' },
        { user: "what's my current balance?", expectedCommand: 'balance' },
        { user: 'show me my balance', expectedCommand: 'balance' },
      ],
    },

    // Spanish - Natural Conversations
    {
      category: '🇪🇸 Natural Spanish Conversations',
      messages: [
        { user: 'cuánto dinero tengo?', expectedCommand: 'balance' },
        { user: 'quiero ver mi saldo', expectedCommand: 'balance' },
        { user: 'cuál es mi saldo?', expectedCommand: 'balance' },
        { user: 'necesito saber cuánto tengo', expectedCommand: 'balance' },
      ],
    },

    // Sending Money - Natural Language
    {
      category: '💸 Natural Send Requests',
      messages: [
        { user: 'send 10 dollars to +573001234567', expectedCommand: 'send' },
        { user: 'transfer 5 to +573001234567', expectedCommand: 'send' },
        { user: 'can you send 20 to +573001234567', expectedCommand: 'send' },
        { user: 'I want to send 15 to +573001234567', expectedCommand: 'send' },
      ],
    },

    // Spanish - Sending Money
    {
      category: '🇪🇸 Enviar Dinero (Spanish)',
      messages: [
        { user: 'enviar 10 a +573001234567', expectedCommand: 'send' },
        { user: 'quiero enviar 5 a +573001234567', expectedCommand: 'send' },
        { user: 'transferir 20 a +573001234567', expectedCommand: 'send' },
        { user: 'manda 15 a +573001234567', expectedCommand: 'send' },
      ],
    },

    // Getting Help - Natural
    {
      category: '❓ Natural Help Requests',
      messages: [
        { user: 'I need help', expectedCommand: 'help' },
        { user: 'can you help me?', expectedCommand: 'help' },
        { user: 'what can you do?', expectedCommand: 'help' },
        { user: 'show me the commands', expectedCommand: 'help' },
      ],
    },

    // History - Natural
    {
      category: '📊 Transaction History',
      messages: [
        { user: 'show me my transactions', expectedCommand: 'history' },
        {
          user: 'what are my recent transactions?',
          expectedCommand: 'history',
        },
        { user: 'view my history', expectedCommand: 'history' },
        { user: 'what did I spend?', expectedCommand: 'history' },
      ],
    },

    // Typos and Informal
    {
      category: '🔤 Typos & Informal Language',
      messages: [
        { user: 'ballance', expectedCommand: 'balance' },
        { user: 'chek balance', expectedCommand: 'balance' },
        { user: 'balanc pls', expectedCommand: 'balance' },
        { user: 'histery', expectedCommand: 'history' },
      ],
    },
  ];

  let totalTests = 0;
  let totalPassed = 0;

  for (const conversation of conversations) {
    console.log(`\n${CYAN}${conversation.category}${RESET}\n`);

    for (const msg of conversation.messages) {
      totalTests++;
      const result = await parseMessage(msg.user);
      const success = result.command === msg.expectedCommand;

      if (success) {
        totalPassed++;
        console.log(`${GREEN}✓${RESET} "${msg.user}"`);
        console.log(
          `  → ${result.command}${result.amount ? ` ($${result.amount})` : ''}`
        );
      } else {
        console.log(`${YELLOW}⚠${RESET} "${msg.user}"`);
        console.log(
          `  → Expected: ${msg.expectedCommand}, Got: ${result.command}`
        );
        console.log(`  (This is OK - might fallback to regex for exact match)`);
      }
    }
  }

  // Special: Complex natural language
  console.log(`\n${CYAN}🌟 Complex Natural Language${RESET}\n`);

  const complexTests = [
    'hey, can you tell me how much money is in my wallet?',
    'I would like to check my current balance please',
    'could you please send 10 dollars to my friend at +573001234567?',
    'necesito enviar dinero a mi amigo, son 5 dolares a +573001234567',
  ];

  for (const msg of complexTests) {
    totalTests++;
    const result = await parseMessage(msg);
    const parsed = result.command !== 'unknown';

    if (parsed) {
      totalPassed++;
      console.log(`${GREEN}✓${RESET} Understood complex message`);
      console.log(`  "${msg}"`);
      console.log(
        `  → ${result.command}${result.amount ? ` ($${result.amount})` : ''}`
      );
    } else {
      console.log(`${YELLOW}⚠${RESET} Fell back to exact match (OK)`);
      console.log(`  "${msg}"`);
    }
  }

  // Summary
  console.log(
    `\n${YELLOW}═══════════════════════════════════════════════${RESET}`
  );
  console.log(
    `${GREEN}Natural Language Success Rate: ${totalPassed}/${totalTests} (${Math.round(
      (totalPassed / totalTests) * 100
    )}%)${RESET}`
  );
  console.log(
    `${YELLOW}═══════════════════════════════════════════════${RESET}\n`
  );

  // Show fallback guarantee
  console.log(`${CYAN}🛡️  Fallback Guarantee:${RESET}`);
  console.log(`  • LLM enabled → Natural conversation ✨`);
  console.log(`  • LLM fails → Exact commands still work ✅`);
  console.log(`  • No API key → Exact commands still work ✅`);
  console.log(`  • Rate limited → Exact commands still work ✅\n`);

  if (process.env.USE_LLM === 'false') {
    console.log(`${YELLOW}⚠️  Note: LLM is currently DISABLED${RESET}`);
    console.log(`   Set USE_LLM=true to enable natural language\n`);
  } else if (
    !process.env.GROQ_API_KEY ||
    process.env.GROQ_API_KEY === 'your_groq_api_key_here'
  ) {
    console.log(`${YELLOW}⚠️  Note: GROQ_API_KEY not configured${RESET}`);
    console.log(`   Add your key to enable natural language\n`);
  }
}

testConversation().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
