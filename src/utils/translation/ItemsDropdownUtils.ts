/**
 * Utilities for handling DatoCMS record translations via dropdown actions
 */
import type { buildClient } from '@datocms/cma-client-browser';
import type OpenAI from 'openai';
import type { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';
import type { ExecuteItemsDropdownActionCtx } from 'datocms-plugin-sdk';
import { translateFieldValue, generateRecordContext, findExactLocaleKey } from './TranslateField';
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
 * Properly handles hyphenated locales like "pt-BR"
 */
export function parseActionId(actionId: string): { fromLocale: string; toLocale: string } {
  // Action ID format is typically: "translateRecord-en-pt-BR" or "translateRecord-en-pt"
  // First we need to remove the prefix
  const prefix = "translateRecord-";
  const localesString = actionId.startsWith(prefix) ? actionId.substring(prefix.length) : actionId;

  // Split by the first hyphen to separate source and target locales
  const firstHyphenIndex = localesString.indexOf('-');
  if (firstHyphenIndex === -1) {
    // Fallback if format is unexpected
    console.error(`Invalid action ID format: ${actionId}`);
    return { fromLocale: 'en', toLocale: 'en' };
  }

  const fromLocale = localesString.substring(0, firstHyphenIndex);
  const toLocale = localesString.substring(firstHyphenIndex + 1);

  return { fromLocale, toLocale };
}

/**
 * Fetches records with pagination based on item IDs
 * Always retrieves the most recent draft state
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
      version: 'current', // Explicitly request the draft/current version
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
 * Checks if an object has a specific key (including in nested objects)
 * Supports both regular locale codes and hyphenated locales (e.g., "pt-br")
 */
function hasKeyDeep(obj: Record<string, unknown>, targetKey: string): boolean {
  if (!obj || typeof obj !== 'object') return false;

  // Normalize targetKey to handle hyphenated locales like "pt-br"
  const normalizedTargetKey = targetKey.toLowerCase();

  // Direct match check (case-insensitive to handle inconsistencies)
  for (const key in obj) {
    if (key.toLowerCase() === normalizedTargetKey) {
      return true;
    }
  }

  // Recursive check in nested objects
  return Object.values(obj).some(value => {
    if (typeof value === 'object' && value !== null) {
      return hasKeyDeep(value as Record<string, unknown>, targetKey);
    }
    return false;
  });
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
  // Helper function to send progress updates to the modal
  const updateProgress = (recordIndex: number, recordId: string, status: 'processing' | 'completed' | 'error', message?: string) => {
    interface WindowWithProgressUpdate extends Window {
      __translationProgressUpdate?: (update: {
        recordIndex: number;
        recordId: string;
        status: 'processing' | 'completed' | 'error';
        message?: string;
      }) => void;
    }
    
    const win = window as unknown as WindowWithProgressUpdate;
    if (typeof win.__translationProgressUpdate === 'function') {
      win.__translationProgressUpdate({
        recordIndex,
        recordId,
        status,
        message
      });
    }
  };
  
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    
    // Check if translation was cancelled by the user
    interface WindowWithCancellation extends Window {
      __translationCancelled?: boolean;
    }
    
    const win = window as unknown as WindowWithCancellation;
    if (win.__translationCancelled) {
      updateProgress(i, record.id, 'error', 'Translation cancelled by user');
      return;
    }
    
    // Update progress to 'processing'
    updateProgress(i, record.id, 'processing');
    
    try {
      // Check if the record has the fromLocale key
      if (!hasKeyDeep(record as Record<string, unknown>, fromLocale)) {
        const errorMsg = `Record does not have the source locale '${fromLocale}'`;
        console.error(`Record ${record.id} ${errorMsg}`);
        ctx.alert(`Error: Record ID ${record.id} ${errorMsg}`);
        updateProgress(i, record.id, 'error', errorMsg);
        continue; // Skip to the next record
      }
      
      // Update processing status with more details
      updateProgress(i, record.id, 'processing', 'Translating fields...');
      
      const translatedFields = await translateRecordFields(
        record,
        fromLocale,
        toLocale,
        fieldTypeDictionary,
        openai,
        pluginParams,
        ctx.currentUserAccessToken || '',
        ctx.environment
      );
      
      // Update processing status for saving
      updateProgress(i, record.id, 'processing', 'Saving translated content...');

      await client.items.update(record.id, {
        ...translatedFields
      });

      // Update progress to 'completed'
      updateProgress(i, record.id, 'completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error translating record ${record.id}:`, errorMessage);
      updateProgress(i, record.id, 'error', `Translation failed: ${errorMessage}`);
    }
  }
  
  // Don't show the notice here since we're managing feedback through the modal
  // instead of ctx.notice('Record translated successfully');
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
  accessToken: string,
  environment: string
): Promise<Record<string, unknown>> {
  const updatePayload: Record<string, Record<string, unknown>> = {};

  // Initialize payload with all localized fields from the record's schema
  // to ensure they are all considered.
  for (const fieldApiKey in fieldTypeDictionary) {
    if (fieldTypeDictionary[fieldApiKey].isLocalized) {
      // Start with existing localized data for this field from the record, or empty object.
      updatePayload[fieldApiKey] = (record[fieldApiKey] as Record<string, unknown>) || {};
    }
  }

  // Process fields that are present on the record and should be translated
  for (const field in record) {
    if (!fieldTypeDictionary[field]?.isLocalized) {
      // Skip non-localized fields or fields not in the current item type's schema dictionary
      continue;
    }

    // Ensure the field is initialized in updatePayload if it wasn't caught by the first loop
    // (e.g. fieldTypeDictionary might be from a slightly different source than live record keys)
    if (!updatePayload[field]) {
      updatePayload[field] = (record[field] as Record<string, unknown>) || {};
    }
    
    if (!shouldTranslateField(field, record, fromLocale, fieldTypeDictionary)) {
      // If not translatable (e.g., source empty), but is localized, ensure toLocale: null is set
      // if it's not already present.
      if (!(toLocale in updatePayload[field])) {
         updatePayload[field][toLocale] = null;
      }
      continue;
    }

    // At this point, field is localized and should be translated.
    // updatePayload[field] already contains other locales from the initialization loop or record.

    // Handle hyphenated locales by finding the exact field key that matches the fromLocale
    const fieldData = record[field] as Record<string, unknown>;
    const fromLocaleKey = findExactLocaleKey(fieldData, fromLocale);
    const sourceValue = fromLocaleKey ? fieldData[fromLocaleKey] : undefined;

    const fieldType = fieldTypeDictionary[field].editor;
    const fieldTypePrompt = prepareFieldTypePrompt(fieldType);

    try {
      if (sourceValue === null || sourceValue === undefined || sourceValue === '') {
        updatePayload[field][toLocale] = null;
      } else {
        const translatedValue = await translateFieldValue(
          sourceValue,
          pluginParams,
          toLocale,
          fromLocale,
          fieldType,
          openai,
          fieldTypePrompt,
          accessToken,
          fieldTypeDictionary[field].id,
          environment,
          undefined,
          generateRecordContext(record, fromLocale)
        );
        // Ensure we use the exact case-sensitive toLocale key as expected by DatoCMS
        updatePayload[field][toLocale] = translatedValue;
      }
    } catch (error) {
      // On error during translation for this specific field, set its target locale to null.
      updatePayload[field][toLocale] = null;
      console.error(`Error translating field ${field} for record ${record.id} in ItemsDropdownUtils:`, error);
      // Depending on desired behavior, you might want to collect these errors
      // or re-throw if one field error should stop the whole batch.
      // For now, it just sets to null and continues.
    }
  }
  
  // Final check: Ensure all localized fields defined in the schema have the toLocale key.
  // This catches localized fields that might not have been on the original `record` object
  // or were not processed in the loop above for any reason.
  for (const fieldApiKey in fieldTypeDictionary) {
    if (fieldTypeDictionary[fieldApiKey].isLocalized) {
      if (!updatePayload[fieldApiKey]) {
        // Localized field from schema not yet in payload (e.g., was not on 'record' object)
        updatePayload[fieldApiKey] = {}; // Initialize as empty object
      }
      // If toLocale is still not set for this localized field, default it to null.
      if (!(toLocale in updatePayload[fieldApiKey])) {
        updatePayload[fieldApiKey][toLocale] = null;
      }
    }
  }
  
  return updatePayload;
}

/**
 * Determines if a field should be translated
 * Properly handles hyphenated locales
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
    !fieldTypeDictionary[field]?.isLocalized
  ) {
    return false;
  }

  // Check for the source locale in the field data with proper hyphenated locale support
  const fieldData = record[field] as Record<string, unknown>;
  const exactFromLocaleKey = findExactLocaleKey(fieldData, fromLocale);

  // Only translate if the source locale exists and has a value
  if (!exactFromLocaleKey || !fieldData[exactFromLocaleKey]) {
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

// Using findExactLocaleKey imported from TranslateField.ts

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