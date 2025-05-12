/**
 * TranslateField.ts
 * ------------------------------------------------------
 * This module serves as the main orchestrator for the AI translation system.
 * It coordinates the logic for translating various field types in DatoCMS by
 * delegating to specialized translator modules based on field type.
 * 
 * The module handles field type detection and routing to the appropriate
 * specialized translators for complex fields like SEO, structured text,
 * rich text, and file fields.
 */

import OpenAI from 'openai';
import { buildClient } from '@datocms/cma-client-browser';
import type { ExecuteFieldDropdownActionCtx } from 'datocms-plugin-sdk';
import { 
  type ctxParamsType,
  modularContentVariations,
} from '../../entrypoints/Config/ConfigScreen';
import { fieldPrompt } from '../../prompts/FieldPrompts';
import { translateDefaultFieldValue } from './DefaultTranslation';
import { type SeoObject, translateSeoFieldValue } from './SeoTranslation';
import { translateStructuredTextValue } from './StructuredTextTranslation';
import { translateFileFieldValue } from './FileFieldTranslation';
import { deleteItemIdKeys } from './utils';
import { createLogger } from '../logging/Logger';

/**
 * Defines the callback interface for streaming translation results
 * 
 * @interface StreamCallbacks
 * @property {Function} onStream - Callback triggered for each chunk of translated content
 * @property {Function} onComplete - Callback triggered when translation is complete
 * @property {Function} checkCancellation - Function to check if translation should be cancelled
 * @property {AbortSignal} abortSignal - Signal for aborting translation operation
 */
export type StreamCallbacks = {
  onStream?: (chunk: string) => void;
  onComplete?: () => void;
  checkCancellation?: () => boolean;
  abortSignal?: AbortSignal;
};

/**
 * Routes field translation to the appropriate specialized translator based on field type
 * 
 * This function serves as the primary decision point for determining which translator
 * to use for a given field. It examines the field type and delegates to specialized
 * translators for complex fields (SEO, structured text, etc.) or falls back to the
 * default translator for simple field types.
 * 
 * @param {unknown} fieldValue - The value of the field to translate
 * @param {ctxParamsType} pluginParams - Plugin configuration parameters
 * @param {string} toLocale - Target locale code
 * @param {string} fromLocale - Source locale code
 * @param {string} fieldType - The DatoCMS field type
 * @param {OpenAI} openai - OpenAI client instance
 * @param {string} fieldTypePrompt - Additional prompt for special field types
 * @param {string} apiToken - DatoCMS API token
 * @param {string | undefined} fieldId - ID of the field being translated
 * @param {StreamCallbacks} streamCallbacks - Optional callbacks for streaming translations
 * @param {string} recordContext - Additional context about the record being translated
 * @returns {Promise<unknown>} - The translated field value
 */
export async function translateFieldValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  fieldType: string,
  openai: OpenAI,
  fieldTypePrompt: string,
  apiToken: string,
  fieldId: string | undefined,
  environment: string,
  streamCallbacks?: StreamCallbacks,
  recordContext = ''
): Promise<unknown> {
  const logger = createLogger(pluginParams, 'translateFieldValue');
  
  logger.info(`Translating field of type: ${fieldType}`, { fromLocale, toLocale });
  
  // If this field type is not in the plugin config or has no value, return as is
  let isFieldTranslatable = pluginParams.translationFields.includes(fieldType);

  // Convert fieldId to a string to handle the undefined case
  const safeFieldId = fieldId || '';

  if (pluginParams.apiKeysToBeExcludedFromThisPlugin.includes(safeFieldId)) {
    return fieldValue;
  }

  if (
    (pluginParams.translationFields.includes('rich_text') &&
      modularContentVariations.includes(fieldType)) ||
    (pluginParams.translationFields.includes('file') && fieldType === 'gallery')
  ) {
    isFieldTranslatable = true;
  }

  if (!isFieldTranslatable || !fieldValue) {
    return fieldValue;
  }

  switch (fieldType) {
    case 'seo':
      return translateSeoFieldValue(
        fieldValue as SeoObject,
        pluginParams,
        toLocale,
        fromLocale,
        openai,
        fieldTypePrompt,
        streamCallbacks,
        recordContext
      );
    case 'structured_text':
      return translateStructuredTextValue(
        fieldValue,
        pluginParams,
        toLocale,
        fromLocale,
        openai,
        apiToken,
        environment,
        streamCallbacks,
        recordContext
      );
    case 'rich_text':
    case 'framed_single_block':
      return translateBlockValue(
        fieldValue,
        pluginParams,
        toLocale,
        fromLocale,
        openai,
        apiToken,
        fieldType,
        environment,
        streamCallbacks,
        recordContext
      );
    case 'file':
    case 'gallery':
      return translateFileFieldValue(
        fieldValue,
        pluginParams,
        toLocale,
        fromLocale,
        openai,
        streamCallbacks,
        recordContext
      );
    default:
      return translateDefaultFieldValue(
        fieldValue,
        pluginParams,
        toLocale,
        fromLocale,
        openai,
        streamCallbacks,
        recordContext
      );
  }
}

/**
 * Translates modular content and framed block fields
 * 
 * This specialized translator handles block-based content structures,
 * including nested fields within blocks. It dynamically fetches field metadata
 * for each block and processes each field according to its type.
 * 
 * @param {unknown} fieldValue - The block value to translate
 * @param {ctxParamsType} pluginParams - Plugin configuration parameters
 * @param {string} toLocale - Target locale code
 * @param {string} fromLocale - Source locale code 
 * @param {OpenAI} openai - OpenAI client instance
 * @param {string} apiToken - DatoCMS API token
 * @param {string} fieldType - The specific block field type
 * @param {StreamCallbacks} streamCallbacks - Optional callbacks for streaming translations
 * @param {string} recordContext - Additional context about the record being translated
 * @returns {Promise<unknown>} - The translated block value
 */
async function translateBlockValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  apiToken: string,
  fieldType: string,
  environment: string,
  streamCallbacks?: StreamCallbacks,
  recordContext = ''
) {
  const logger = createLogger(pluginParams, 'translateBlockValue');
  logger.info('Translating block value');
  
  const isFramedSingleBlock = fieldType === 'framed_single_block';
  // Clean block array from any leftover item IDs
  const cleanedFieldValue = deleteItemIdKeys(
    !isFramedSingleBlock ? fieldValue : [fieldValue]
  ) as Array<Record<string, unknown>>;

  const client = buildClient({ apiToken, environment });

  for (const block of cleanedFieldValue) {
    // Determine the block model ID
    // biome-ignore lint/suspicious/noExplicitAny: <i need to type blocks here>
    const blockModelId = block.itemTypeId || block.blockModelId || (block as any)?.relationships?.item_type?.data?.id ||(block as any)?.item?.relationships?.item_type?.data?.id;
    if (!blockModelId) {
      logger.warning('Block model ID not found', block);
      continue;
    }

    // Fetch fields for this specific block
    const fields = await client.fields.list(blockModelId as string);
    const fieldTypeDictionary = fields.reduce((acc, field) => {
      acc[field.api_key] = {
        editor: field.appearance.editor,
        id: field.id,
      };
      return acc;
    }, {} as Record<string, { editor: string; id: string }>);

    // Translate each field within the block
    if (block.attributes) {
      // Process fields in block.attributes
      await processBlockFields(block.attributes as Record<string, unknown>, fieldTypeDictionary);
    // biome-ignore lint/suspicious/noExplicitAny: <i need to type blocks here>
    } else if ((block as any).item?.attributes) {
      // biome-ignore lint/suspicious/noExplicitAny: <i need to type blocks here>
      await processBlockFields((block as any).item.attributes as Record<string, unknown>, fieldTypeDictionary);
    } else {
      await processBlockFields(block, fieldTypeDictionary);
    }

    // Helper function to process fields and avoid code duplication
    async function processBlockFields(
      source: Record<string, unknown>,
      fieldTypeDictionary: Record<string, { editor: string; id: string }>
    ) {
      for (const field in source) {
        if (
          field === 'itemTypeId' ||
          field === 'originalIndex' ||
          field === 'blockModelId' ||
          field === 'type' ||
          field === 'children' ||
          field === "relationships" ||
          field === "attributes" // Skip the attributes object itself
        ) {
          continue;
        }

        // Show progress if using streaming callbacks
        if (streamCallbacks?.onStream) {
          streamCallbacks.onStream(`Translating block field: ${field}...`);
        }
        
        // Check for cancellation
        if (streamCallbacks?.checkCancellation?.()) {
          logger.info('Translation cancelled by user');
          return cleanedFieldValue;
        }

        let nestedPrompt = ' Return the response in the format of ';
        nestedPrompt +=
          fieldPrompt[fieldTypeDictionary[field]?.editor as keyof typeof fieldPrompt] ||
          '';

        source[field] = await translateFieldValue(
          source[field],
          pluginParams,
          toLocale,
          fromLocale,
          fieldTypeDictionary[field]?.editor || 'text',
          openai,
          nestedPrompt,
          apiToken,
          fieldTypeDictionary[field]?.id || '',
          environment,
          streamCallbacks,
          recordContext
        );
      }
    }
  }

  logger.info('Block translation completed');
  return isFramedSingleBlock ? cleanedFieldValue[0] : cleanedFieldValue;
}

/**
 * Main entry point for translating a field value from one locale to another
 * 
 * This function is the primary interface called by the DatoCMS plugin UI.
 * It handles all the setup, including creating an OpenAI client, generating
 * record context, and managing streaming responses back to the UI.
 * 
 * @param {unknown} fieldValue - The field value to translate
 * @param {ExecuteFieldDropdownActionCtx} ctx - DatoCMS plugin context
 * @param {ctxParamsType} pluginParams - Plugin configuration parameters
 * @param {string} toLocale - Target locale code
 * @param {string} fromLocale - Source locale code
 * @param {string} fieldType - The DatoCMS field type
 * @param {StreamCallbacks} streamCallbacks - Optional callbacks for streaming translations
 * @param {string} recordContext - Additional context about the record being translated
 * @returns {Promise<unknown>} - The translated field value
 */
async function TranslateField(
  fieldValue: unknown,
  ctx: ExecuteFieldDropdownActionCtx,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  fieldType: string,
  environment: string,
  streamCallbacks?: StreamCallbacks,
  recordContext = ''
) {
  const apiToken = await ctx.currentUserAccessToken;
  // Create OpenAI client instance
  const openai = new OpenAI({
    apiKey: pluginParams.apiKey,
    dangerouslyAllowBrowser: true,
  });

  try {
    const logger = createLogger(pluginParams, 'TranslateField');
    logger.info('Starting field translation', { fieldType, fromLocale, toLocale });

    // Generate record context if not provided or use the existing one
    const contextToUse = ctx.formValues && !recordContext
      ? generateRecordContext(ctx.formValues, fromLocale)
      : recordContext;

    if (streamCallbacks?.onStream) {
      streamCallbacks.onStream('Loading...');
    }

    // Get the field API key and ensure it's always a string
    // Using nullish coalescing operator to handle undefined value
    const fieldApiKey = ctx.fieldPath ?? '';

    let fieldTypePrompt = 'Return the response in the format of ';
    const fieldPromptObject = fieldPrompt;
    const baseFieldPrompts = fieldPromptObject ? fieldPromptObject : {};
    
    // Structured and rich text fields use specialized prompts defined elsewhere
    if (fieldType !== 'structured_text' && fieldType !== 'rich_text') {
      fieldTypePrompt +=
        baseFieldPrompts[fieldType as keyof typeof baseFieldPrompts] || '';
    }
  

    const translatedValue = await translateFieldValue(
      fieldValue,
      pluginParams,
      toLocale,
      fromLocale,
      fieldType,
      openai,
      fieldTypePrompt,
      apiToken as string,
      fieldApiKey, // This is already a string because of the nullish coalescing operator
      environment,
      streamCallbacks,
      contextToUse
    );

    logger.info('Field translation completed');
    return translatedValue;
  } catch (error) {
    console.error('Translation failed:', error);
    throw error;
  }
}

/**
 * Generates descriptive context about a record to improve translation accuracy
 * 
 * This function extracts key information from a record's source locale values
 * to provide context for the AI model, helping it understand the content
 * it's translating. It focuses on title, name, and content fields.
 * 
 * @param {Record<string, unknown>} formValues - The current form values from DatoCMS
 * @param {string} sourceLocale - The source locale code
 * @returns {string} - Formatted context string for use in translation prompts
 */
export function generateRecordContext(formValues: Record<string, unknown>, sourceLocale: string): string {
  if (!formValues) return '';

  let contextStr = 'Content context: ';
  let hasAddedContext = false;

  // Look for values that might represent titles, names, or main content
  for (const key in formValues) {
    const val = formValues[key];
    // Only use string values from the source locale
    if (typeof val === 'object' && val !== null) {
      const localized = val as Record<string, unknown>;
      if (typeof localized[sourceLocale] === 'string') {
        const value = localized[sourceLocale] as string;
        if (value && value.length < 300) {
          // Focus on fields likely to contain important context
          if (
            key.toLowerCase().includes('title') ||
            key.toLowerCase().includes('name') ||
            key.toLowerCase().includes('content') ||
            key.toLowerCase().includes('description')
          ) {
            contextStr += `${key}: ${value}. `;
            hasAddedContext = true;
          }
        }
      }
    }
  }

  return hasAddedContext ? contextStr : '';
}

/**
 * Helper function to find the exact case-sensitive locale key in an object.
 * This is essential for properly handling hyphenated locales (e.g., "pt-BR", "pt-br")
 * as DatoCMS requires exact case matches for locale keys.
 *
 * @param obj The object containing locale keys
 * @param localeCode The locale code to search for (case-insensitive)
 * @returns The exact locale key as it appears in the object, or undefined if not found
 */
export function findExactLocaleKey(obj: Record<string, unknown>, localeCode: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;

  const normalizedLocale = localeCode.toLowerCase();

  for (const key in obj) {
    if (key.toLowerCase() === normalizedLocale) {
      return key; // Return the exact key with original casing
    }
  }

  return undefined;
}

export default TranslateField;
