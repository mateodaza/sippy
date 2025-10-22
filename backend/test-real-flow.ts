#!/usr/bin/env ts-node
import 'dotenv/config';
import { parseMessage } from './src/utils/messageParser.js';

async function test() {
  console.log('Testing real flow:\n');
  
  const result = await parseMessage('que es esto');
  console.log('Parse result:', JSON.stringify(result, null, 2));
  console.log('\nusedLLM:', result.usedLLM);
  console.log('llmStatus:', result.llmStatus);
  
  // Server logic
  if (!result.usedLLM) {
    console.log('\n✅ Would call generateNaturalResponse');
  } else {
    console.log('\n❌ Skips generateNaturalResponse (usedLLM is true)');
    console.log('   → User gets robotic command list instead');
  }
}

test();
