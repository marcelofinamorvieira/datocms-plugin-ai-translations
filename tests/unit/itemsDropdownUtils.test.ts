import { describe, it, expect } from 'vitest';
import { parseActionId, shouldTranslateField } from '../../src/utils/translation/ItemsDropdownUtils';

describe('ItemsDropdownUtils', () => {
  it('parseActionId parses hyphenated locales', () => {
    const { fromLocale, toLocale } = parseActionId('translateRecord-en-pt-BR');
    expect(fromLocale).toBe('en');
    expect(toLocale).toBe('pt-BR');
  });

  it('shouldTranslateField returns true only if source locale exists and localized', () => {
    const record = {
      title: { en: 'Hello' },
      item_type: { id: 'X' },
      id: '1',
    } as any;
    const dict = {
      title: { editor: 'single_line', id: 'f1', isLocalized: true },
    };
    expect(shouldTranslateField('title', record, 'en', dict)).toBe(true);
    expect(shouldTranslateField('title', record, 'pt-BR', dict)).toBe(false);
  });
});

