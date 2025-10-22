import { describe, it, expect } from 'vitest';
import { findExactLocaleKey, generateRecordContext } from '../../src/utils/translation/TranslateField';

describe('TranslateField helpers', () => {
  it('findExactLocaleKey finds correct case', () => {
    const obj = { 'pt-BR': 'Olá', 'en': 'Hello' } as Record<string, unknown>;
    expect(findExactLocaleKey(obj, 'pt-br')).toBe('pt-BR');
    expect(findExactLocaleKey(obj, 'EN')).toBe('en');
    expect(findExactLocaleKey(obj, 'fr')).toBeUndefined();
  });

  it('generateRecordContext extracts short, relevant fields', () => {
    const formValues = {
      title: { en: 'Short title' },
      description: { en: 'A brief description' },
      other: { en: 'x'.repeat(400) },
    } as Record<string, unknown>;
    const ctx = generateRecordContext(formValues, 'en');
    expect(ctx).toContain('title: Short title');
    expect(ctx).toContain('description: A brief description');
    expect(ctx).not.toContain('other');
  });
});

