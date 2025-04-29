/**
 * Utilities for handling DatoCMS record translations via dropdown actions
 */
import type { buildClient } from '@datocms/cma-client-browser';
import type OpenAI from 'openai';
import type { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';
import type { ExecuteItemsDropdownActionCtx } from 'datocms-plugin-sdk';
import { translateFieldValue, generateRecordContext } from './TranslateField';
import { fieldPrompt } from '../../prompts/FieldPrompts';

/**
 * Defines a DatoCMS record structure with common fields
 */
export type DatoCMSRecordFromAPI = {
  id: string;
  item_type: { id: string };
  [key: string]: unknown;
};

/**
 * Parses the action ID to extract fromLocale and toLocale
 */
export function parseActionId(actionId: string): { fromLocale: string; toLocale: string } {
  const actionParts = actionId.split('-');
  const [fromLocale, toLocale] = actionParts.slice(-2);
  return { fromLocale, toLocale };
}

/**
 * Fetches records with pagination based on item IDs
 */
export async function fetchRecordsWithPagination(
  client: ReturnType<typeof buildClient>, 
  itemIds: string[]
): Promise<DatoCMSRecordFromAPI[]> {
  const allRecords: DatoCMSRecordFromAPI[] = [];
  let page = 1;
  const pageSize = 30;
  let hasMorePages = true;
  
  while (hasMorePages) {
    const response: DatoCMSRecordFromAPI[] = await client.items.list({
      filter: {
        ids: itemIds.join(',')
      },
      nested: true,
      page: {
        offset: (page - 1) * pageSize,
        limit: pageSize
      }
    });
    
    allRecords.push(...response);
    hasMorePages = response.length === pageSize;
    page++;
  }
  
  return allRecords;
}

/**
 * Translates and updates all records
 */
export async function translateAndUpdateRecords(
  records: DatoCMSRecordFromAPI[],
  client: ReturnType<typeof buildClient>,
  openai: OpenAI,
  fromLocale: string,
  toLocale: string,
  fieldTypeDictionary: Record<string, { editor: string; id: string; isLocalized: boolean }>,
  pluginParams: ctxParamsType,
  ctx: ExecuteItemsDropdownActionCtx
): Promise<void> {
  for (const record of records) {
    const translatedFields = await translateRecordFields(
      record,
      fromLocale,
      toLocale,
      fieldTypeDictionary,
      openai,
      pluginParams,
      ctx.currentUserAccessToken || ''
    );

    await client.items.update(record.id, {
      ...translatedFields
    });

    ctx.notice('Record translated successfully');
  }
}

/**
 * Translates all fields for a single record
 */
export async function translateRecordFields(
  record: DatoCMSRecordFromAPI,
  fromLocale: string,
  toLocale: string,
  fieldTypeDictionary: Record<string, { editor: string; id: string; isLocalized: boolean }>,
  openai: OpenAI,
  pluginParams: ctxParamsType,
  accessToken: string
): Promise<Record<string, unknown>> {
  const translatedFields: Record<string, unknown> = {};
  
  for (const field in record) {
    if (!shouldTranslateField(field, record, fromLocale, fieldTypeDictionary)) {
      continue;
    }

    translatedFields[field] = record[field];

    const fieldValue = (record[field] as Record<string, unknown>)[fromLocale];
    const fieldType = fieldTypeDictionary[field].editor;
    const fieldTypePrompt = prepareFieldTypePrompt(fieldType);
  
    const translatedValue = await translateFieldValue(
      fieldValue,
      pluginParams,
      toLocale,
      fromLocale,
      fieldType,
      openai,
      fieldTypePrompt,
      accessToken,
      fieldTypeDictionary[field].id,
      undefined,
      generateRecordContext(record, fromLocale)
    );

    (translatedFields[field] as Record<string, unknown>)[toLocale] = translatedValue;
  }
  
  return translatedFields;
}

/**
 * Determines if a field should be translated
 */
export function shouldTranslateField(
  field: string, 
  record: DatoCMSRecordFromAPI, 
  fromLocale: string, 
  fieldTypeDictionary: Record<string, { editor: string; id: string; isLocalized: boolean }>
): boolean {
  // Skip system fields that shouldn't be translated
  if (
    ['id', 'creator', 'meta', 'type', 'item_type'].includes(field) || 
    !record[field] || 
    !(record[field] as Record<string, unknown>)[fromLocale] || 
    !fieldTypeDictionary[field]?.isLocalized
  ) {
    return false;
  }
  
  return true;
}

/**
 * Prepares the field-specific prompt based on field type
 */
export function prepareFieldTypePrompt(fieldType: string): string {
  let fieldTypePrompt = 'Return the response in the format of ';
  const baseFieldPrompts = fieldPrompt;
  // Structured and rich text fields use specialized prompts defined elsewhere
  if (fieldType !== 'structured_text' && fieldType !== 'rich_text') {
    fieldTypePrompt +=
      baseFieldPrompts[fieldType as keyof typeof baseFieldPrompts] || '';
  }
  
  return fieldTypePrompt;
}

/**
 * Builds a dictionary of field types for an item type
 */
export async function buildFieldTypeDictionary(
  client: ReturnType<typeof buildClient>, 
  itemTypeId: string
) {
  const fields = await client.fields.list(itemTypeId);
  return fields.reduce((acc: Record<string, { editor: string; id: string; isLocalized: boolean }>, field: {
    api_key: string;
    appearance: { editor: string };
    id: string;
    localized: boolean;
  }) => {
    acc[field.api_key] = {
      editor: field.appearance.editor,
      id: field.id,
      isLocalized: field.localized
    };
    return acc;
  }, {});
}