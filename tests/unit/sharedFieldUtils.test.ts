import { describe, it, expect } from 'vitest';
import { prepareFieldTypePrompt, getExactSourceValue } from '../../src/utils/translation/SharedFieldUtils';

describe('SharedFieldUtils', () => {
  it('prepareFieldTypePrompt adds mapping for simple fields', () => {
    const prompt = prepareFieldTypePrompt('single_line');
    expect(prompt).toMatch(/Return the response in the format of/);
  });

  it('prepareFieldTypePrompt skips structured_text and rich_text specifics', () => {
    const p1 = prepareFieldTypePrompt('structured_text');
    const p2 = prepareFieldTypePrompt('rich_text');
    expect(p1).toBe('Return the response in the format of ');
    expect(p2).toBe('Return the response in the format of ');
  });

  it('getExactSourceValue handles hyphenated locales', () => {
    const data = { 'en': 'Hello', 'pt-BR': 'Olá' } as Record<string, unknown>;
    expect(getExactSourceValue(data, 'pt-br')).toBe('Olá');
    expect(getExactSourceValue(data, 'EN')).toBe('Hello');
  });
});

