# Sippy Backend Tests

Clean, organized test suite for the Sippy backend.

## Structure

```
tests/
├── helpers/           # Shared test utilities
│   └── test-utils.ts  # Common helpers, colors, test runner class
├── unit/             # Unit tests (fast, isolated)
│   ├── message-parser.test.ts
│   └── phone-validation.test.ts
├── integration/      # Integration tests (services, database)
│   └── wallet-operations.test.ts
├── llm/              # LLM-specific tests
│   ├── natural-language.test.ts
│   └── edge-cases.test.ts
├── e2e/              # End-to-end tests (full flow)
│   └── full-flow.test.ts
└── run-all.ts        # Master test runner
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run specific test suites
pnpm test:unit          # Unit tests only
pnpm test:llm           # LLM tests only
pnpm test:integration   # Integration tests only
pnpm test:e2e           # E2E tests only

# Run individual test files
tsx tests/unit/message-parser.test.ts
```

## Test Categories

### Unit Tests

Fast, isolated tests with no external dependencies:

- **message-parser.test.ts**: Tests message parsing (regex, LLM, fallback)
- **phone-validation.test.ts**: Tests phone number validation and normalization

### LLM Tests

Tests for natural language understanding:

- **natural-language.test.ts**: Conversational AI, bilingual support
- **edge-cases.test.ts**: LLM failure handling, fallback behavior

### Integration Tests

Tests that interact with services:

- **wallet-operations.test.ts**: Wallet creation, balance checking

### E2E Tests

Complete user flow tests:

- **full-flow.test.ts**: Simulates real user interactions

## Writing Tests

Use the `TestRunner` class from `helpers/test-utils.ts`:

```typescript
import { TestRunner, checkLLMStatus } from '../helpers/test-utils.js';

const runner = new TestRunner('My Test Suite');

async function runTests() {
  runner.printHeader();
  runner.printSection('Section Name');

  runner.assert(condition, 'Test description', 'Optional error details');

  runner.printSummary();
}
```

## Environment

Tests use the same `.env` configuration as the main app:

- `USE_LLM`: Enable/disable LLM features
- `GROQ_API_KEY`: Required for LLM tests
- Database and wallet configurations for integration/e2e tests

## Notes

- All tests are executable TypeScript files using `tsx`
- Tests can be run individually or as a suite
- LLM tests will still pass if LLM is disabled (they test fallback behavior)
- Integration/E2E tests require proper environment configuration
