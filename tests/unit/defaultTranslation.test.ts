import { describe, it, expect } from 'vitest';
import { translateDefaultFieldValue } from '../../src/utils/translation/DefaultTranslation';

// Minimal plugin params shape for tests
const pluginParams = {
  gptModel: 'gpt-4.1-mini',
  apiKey: 'key',
  translationFields: ['single_line'],
  translateWholeRecord: true,
  translateBulkRecords: true,
  prompt: '{fieldValue}',
  modelsToBeExcludedFromThisPlugin: [],
  rolesToBeExcludedFromThisPlugin: [],
  apiKeysToBeExcludedFromThisPlugin: [],
  enableDebugging: false,
} as any;

// Mock OpenAI client for the fast-return paths we test
const mockOpenAI = {
  chat: {
    completions: {
      create: async () => {
        const chunks = [
          { choices: [{ delta: { content: 'Hola' } }] },
        ];
        // Return an async iterable
        return {
          async *[Symbol.asyncIterator]() {
            for (const c of chunks) yield c as any;
          },
        } as any;
      },
    },
  },
} as any;

describe('translateDefaultFieldValue', () => {
  it('returns value as-is for null/empty input', async () => {
    const out1 = await translateDefaultFieldValue(null, pluginParams, 'es', 'en', mockOpenAI);
    const out2 = await translateDefaultFieldValue('', pluginParams, 'es', 'en', mockOpenAI);
    expect(out1).toBeNull();
    expect(out2).toBe('');
  });
});

