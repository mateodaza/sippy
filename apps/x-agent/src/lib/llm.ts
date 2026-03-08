import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { config } from './config.js';

let _client: ReturnType<typeof createOpenRouter> | null = null;

/** Get or create the OpenRouter client singleton. */
export function getLLMClient() {
  if (!_client) {
    _client = createOpenRouter({
      apiKey: config.openrouterApiKey(),
    });
  }
  return _client;
}
