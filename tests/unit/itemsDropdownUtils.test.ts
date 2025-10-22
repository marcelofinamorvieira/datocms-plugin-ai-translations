import { describe, it, expect } from 'vitest';
import { parseActionId, shouldTranslateField, buildTranslatedUpdatePayload } from '../../src/utils/translation/ItemsDropdownUtils';
import type { ctxParamsType } from '../../src/entrypoints/Config/ConfigScreen';

describe('ItemsDropdownUtils', () => {
  it('parseActionId parses simple locales', () => {
    const { fromLocale, toLocale } = parseActionId('translateRecord-en-pt');
    expect(fromLocale).toBe('en');
    expect(toLocale).toBe('pt');
  });

  it('parseActionId parses hyphenated source and target locales', () => {
    const { fromLocale, toLocale } = parseActionId('translateRecord-en-US-pt-BR');
    expect(fromLocale).toBe('en-US');
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

  it('buildTranslatedUpdatePayload skips translating excluded fields', async () => {
    const pluginParams = {
      gptModel: 'gpt-5-mini',
      apiKey: 'test',
      translationFields: ['single_line'],
      translateWholeRecord: true,
      translateBulkRecords: true,
      prompt: '',
      modelsToBeExcludedFromThisPlugin: [],
      rolesToBeExcludedFromThisPlugin: [],
      apiKeysToBeExcludedFromThisPlugin: ['field123'],
      enableDebugging: false,
    } satisfies ctxParamsType;

    const record = {
      id: '1',
      item_type: { id: 'model' },
      title: { 'en-US': 'Hello', 'pt-BR': 'Olá existente' },
    } as any;

    const fieldTypeDictionary = {
      title: { editor: 'single_line', id: 'field123', isLocalized: true },
    };

    const result = await buildTranslatedUpdatePayload(
      record,
      'en-US',
      'pt-BR',
      fieldTypeDictionary,
      {} as any,
      pluginParams,
      'token',
      'main'
    );

    expect(result.title['pt-BR']).toBe('Olá existente');
  });
});
