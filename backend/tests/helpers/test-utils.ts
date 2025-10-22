/**
 * Test Utilities
 * Common helpers and utilities for tests
 */

// Color codes for terminal output
export const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

// Test result tracking
export class TestRunner {
  passed = 0;
  failed = 0;
  private suiteName: string;

  constructor(suiteName: string) {
    this.suiteName = suiteName;
  }

  printHeader() {
    console.log(`\n${colors.yellow}${'═'.repeat(60)}${colors.reset}`);
    console.log(`${colors.yellow}   ${this.suiteName}${colors.reset}`);
    console.log(`${colors.yellow}${'═'.repeat(60)}${colors.reset}\n`);
  }

  printSection(title: string) {
    console.log(`\n${colors.cyan}${title}${colors.reset}\n`);
  }

  assert(condition: boolean, testName: string, details?: string): boolean {
    if (condition) {
      console.log(`${colors.green}✓${colors.reset} ${testName}`);
      this.passed++;
      return true;
    } else {
      console.log(`${colors.red}✗${colors.reset} ${testName}`);
      if (details) console.log(`  ${details}`);
      this.failed++;
      return false;
    }
  }

  printSummary() {
    console.log(`\n${colors.yellow}${'═'.repeat(60)}${colors.reset}`);
    console.log(`${colors.green}Passed: ${this.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${this.failed}${colors.reset}`);
    console.log(`${colors.yellow}${'═'.repeat(60)}${colors.reset}\n`);

    if (this.failed > 0) {
      console.log(`${colors.red}Some tests failed!${colors.reset}\n`);
      process.exit(1);
    } else {
      console.log(`${colors.green}All tests passed! ✨${colors.reset}\n`);
    }
  }
}

// Test phone numbers (for consistent testing)
export const TEST_PHONES = {
  MAIN: '573116613414',
  TEST: '573001234567',
  FORMATTED: '+573001234567',
};

// Check environment setup
export function checkLLMStatus() {
  const llmEnabled = process.env.USE_LLM !== 'false';
  const hasKey =
    process.env.GROQ_API_KEY &&
    process.env.GROQ_API_KEY !== 'your_groq_api_key_here';

  console.log(
    `LLM Status: ${
      llmEnabled ? colors.green + 'ENABLED' : colors.yellow + 'DISABLED'
    }${colors.reset}`
  );
  console.log(
    `GROQ_API_KEY: ${hasKey ? colors.green + 'SET' : colors.red + 'NOT SET'}${
      colors.reset
    }\n`
  );

  return { llmEnabled, hasKey };
}
