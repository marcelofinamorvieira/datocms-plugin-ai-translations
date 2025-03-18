// TranslateField.ts
// ------------------------------------------------------
// This main entry point coordinates the logic for translating
// various field types by delegating to specialized modules.

import OpenAI from 'openai';
import { buildClient } from '@datocms/cma-client-browser';
import type { ExecuteFieldDropdownActionCtx } from 'datocms-plugin-sdk';
import { 
  type ctxParamsType,
  modularContentVariations,
} from '../../entrypoints/Config/ConfigScreen';
import { fieldPrompt } from '../../prompts/FieldPrompts';
import { translateDefaultFieldValue } from './DefaultTranslation';
import { translateSeoFieldValue } from './SeoTranslation';
import { translateStructuredTextValue } from './StructuredTextTranslation';
import { translateFileFieldValue } from './FileFieldTranslation';
import { deleteItemIdKeys } from './utils';
import { createLogger } from '../logging/Logger';

/**
 * Callbacks for streaming translation results.
 */
export type StreamCallbacks = {
  onStream?: (chunk: string) => void;
  onComplete?: () => void;
  checkCancellation?: () => boolean;
  abortSignal?: AbortSignal;
};

/**
 * Main function to handle field translation. Decides which specialized
 * translator to use based on field type, e.g., 'seo', 'structured_text'.
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
  fieldId: string,
  streamCallbacks?: StreamCallbacks,
  recordContext = ''
): Promise<unknown> {
  const logger = createLogger(pluginParams, 'translateFieldValue');
  
  logger.info(`Translating field of type: ${fieldType}`, { fromLocale, toLocale });
  
  // If this field type is not in the plugin config or has no value, return as is
  let isFieldTranslatable = pluginParams.translationFields.includes(fieldType);

  if (pluginParams.apiKeysToBeExcludedFromThisPlugin.includes(fieldId)) {
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
        fieldValue,
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
 * Specifically handles block-based fields in a rich text.
 */
async function translateBlockValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  apiToken: string,
  fieldType: string,
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

  const client = buildClient({ apiToken });

  for (const block of cleanedFieldValue) {
    // Determine the block model ID
    const blockModelId = block.itemTypeId || block.blockModelId;
    if (!blockModelId) continue;

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
    for (const field in block) {
      if (
        field === 'itemTypeId' ||
        field === 'originalIndex' ||
        field === 'blockModelId' ||
        field === 'type' ||
        field === 'children'
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

      block[field] = await translateFieldValue(
        block[field],
        pluginParams,
        toLocale,
        fromLocale,
        fieldTypeDictionary[field]?.editor || '',
        openai,
        nestedPrompt,
        apiToken,
        fieldTypeDictionary[field]?.id || '',
        streamCallbacks,
        recordContext
      );
    }
  }

  logger.info('Block translation completed');
  return isFramedSingleBlock ? cleanedFieldValue[0] : cleanedFieldValue;
}

/**
 * This is the top-level function called by the plugin to translate
 * a field to a given locale.
 */
const TranslateField = async (
  fieldValue: unknown,
  ctx: ExecuteFieldDropdownActionCtx,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  fieldType: string,
  streamCallbacks?: StreamCallbacks,
  recordContext = ''
) => {
  const logger = createLogger(pluginParams, 'TranslateField');
  
  if (pluginParams.apiKeysToBeExcludedFromThisPlugin.includes(ctx.field.id)) {
    logger.info('Field excluded from translation by configuration', { fieldId: ctx.field.id });
    return;
  }

  // Break down fieldPath to point to the target locale in a localized field
  const fieldPathArray = ctx.fieldPath.split('.');
  fieldPathArray[fieldPathArray.length - 1] = toLocale;

  // Disable the original field during translation
  ctx.disableField(ctx.fieldPath, true);

  // Determine the format prompt
  let fieldTypePrompt = 'Return the response in the format of ';
  if (fieldType !== 'structured_text' && fieldType !== 'rich_text') {
    const typePromptKey = fieldType as keyof typeof fieldPrompt;
    fieldTypePrompt += fieldPrompt[typePromptKey] || '';
  }

  // Create a new OpenAI client
  const newOpenai = new OpenAI({
    apiKey: pluginParams.apiKey,
    dangerouslyAllowBrowser: true,
  });

  // Execute the translation
  const translated = await translateFieldValue(
    fieldValue,
    pluginParams,
    toLocale,
    fromLocale,
    fieldType,
    newOpenai,
    fieldTypePrompt,
    ctx.currentUserAccessToken || '',
    ctx.field.id,
    streamCallbacks,
    recordContext
  );

  // Set the new value in the correct locale
  ctx.setFieldValue(fieldPathArray.join('.'), translated);

  // Re-enable the field
  ctx.disableField(ctx.fieldPath, false);
};

/**
 * Generates context about a record to improve translation accuracy.
 * This extracts relevant information from the record's values in the source locale.
 */
export function generateRecordContext(formValues: Record<string, unknown>, sourceLocale: string): string {
  if (!formValues) return '';
  
  // Extract title or name if available
  const titleField = Object.entries(formValues).find(([key]) => 
    key.toLowerCase().includes('title') || key.toLowerCase().includes('name')
  );
  
  // Extract description if available
  const descriptionField = Object.entries(formValues).find(([key]) => 
    key.toLowerCase().includes('description') || key.toLowerCase().includes('summary')
  );
  
  let context = '';
  
  if (titleField?.[1] && typeof titleField[1] === 'object' && titleField[1] !== null && sourceLocale in titleField[1]) {
    const value = (titleField[1] as Record<string, string>)[sourceLocale];
    context += `Title: ${value}\n`;
  }
  
  if (descriptionField?.[1] && typeof descriptionField[1] === 'object' && descriptionField[1] !== null && sourceLocale in descriptionField[1]) {
    const value = (descriptionField[1] as Record<string, string>)[sourceLocale];
    context += `Description: ${value}\n`;
  }
  
  return context;
}

export default TranslateField;
