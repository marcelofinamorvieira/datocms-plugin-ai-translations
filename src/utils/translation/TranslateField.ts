// TranslateField.ts
// ------------------------------------------------------
// This main entry point coordinates the logic for translating
// various field types by delegating to specialized modules.

import OpenAI from 'openai';
import { buildClient } from '@datocms/cma-client-browser';
import { ExecuteFieldDropdownActionCtx } from 'datocms-plugin-sdk';
import { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';
import { fieldPrompt } from '../../prompts/FieldPrompts';
import { translateDefaultFieldValue } from './DefaultTranslation';
import { translateSeoFieldValue } from './SeoTranslation';
import { translateStructuredTextValue } from './StructuredTextTranslation';
import { deleteItemIdKeys } from './utils';

/**
 * Main function to handle field translation. Decides which specialized
 * translator to use based on field type, e.g., 'seo', 'structured_text'.
 * @param fieldValue - current field value to be translated.
 * @param pluginParams - plugin config containing OpenAI keys, selected models, etc.
 * @param toLocale - target locale code.
 * @param fromLocale - source locale code.
 * @param fieldType - the field editor type (e.g. 'seo', 'structured_text').
 * @param openai - instance of the OpenAI client.
 * @param fieldTypePrompt - prompt additions for formatting the result.
 * @param apiToken - DatoCMS user token to fetch block or model data if necessary.
 * @returns the translated value for the field.
 */
export async function translateFieldValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  fieldType: string,
  openai: OpenAI,
  fieldTypePrompt: string,
  apiToken: string
): Promise<unknown> {
  // If this field type is not in the plugin config or has no value, return as is
  if (!pluginParams.translationFields.includes(fieldType) || !fieldValue) {
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
        fieldTypePrompt
      );
    case 'structured_text':
      return translateStructuredTextValue(
        fieldValue,
        pluginParams,
        toLocale,
        fromLocale,
        openai,
        apiToken
      );
    case 'rich_text':
      // treat "rich_text" as a set of blocks
      return translateBlockValue(
        fieldValue,
        pluginParams,
        toLocale,
        fromLocale,
        openai,
        apiToken
      );
    default:
      return translateDefaultFieldValue(
        fieldValue,
        pluginParams,
        toLocale,
        fromLocale,
        openai,
        fieldTypePrompt
      );
  }
}

/**
 * Specifically handles block-based fields in a rich text.
 * @param fieldValue - the block array from a structured text.
 * @param pluginParams - plugin config for the translation.
 * @param toLocale - target locale code.
 * @param fromLocale - source locale code.
 * @param openai - instance of OpenAI.
 * @param apiToken - DatoCMS user token, needed to fetch block fields.
 */
export async function translateBlockValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  apiToken: string
) {
  // Clean block array from any leftover item IDs
  const cleanedFieldValue = deleteItemIdKeys(fieldValue);

  const client = buildClient({ apiToken });

  for (const block of cleanedFieldValue as any[]) {
    // Determine the block model ID
    const blockModelId = block.itemTypeId || block.blockModelId;
    if (!blockModelId) continue;

    // Fetch fields for this specific block
    const fields = await client.fields.list(blockModelId);
    const fieldTypeDictionary = fields.reduce((acc, field) => {
      acc[field.api_key] = field.appearance.editor;
      return acc;
    }, {} as Record<string, string>);

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

      let nestedPrompt = ' Return the response in the format of ';
      nestedPrompt +=
        fieldPrompt[fieldTypeDictionary[field] as keyof typeof fieldPrompt] ||
        '';

      block[field] = await translateFieldValue(
        block[field],
        pluginParams,
        toLocale,
        fromLocale,
        fieldTypeDictionary[field],
        openai,
        nestedPrompt,
        apiToken
      );
    }
  }

  return cleanedFieldValue;
}

/**
 * This is the top-level function called by the plugin to translate
 * a field to a given locale. It handles UI changes (disable, re-enable)
 * and then updates the field with the translated content.
 * @param fieldValue - current field value to be translated.
 * @param ctx - the DatoCMS action context object.
 * @param pluginParams - plugin config with model, API key, etc.
 * @param toLocale - target locale.
 * @param fromLocale - source locale.
 * @param fieldType - the type of field being translated.
 */
const TranslateField = async (
  fieldValue: unknown,
  ctx: ExecuteFieldDropdownActionCtx,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  fieldType: string
) => {
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
    ctx.currentUserAccessToken!
  );

  
  // Set the new value in the correct locale
  ctx.setFieldValue(fieldPathArray.join('.'), translated);

  // Re-enable the field
  ctx.disableField(ctx.fieldPath, false);
};

export default TranslateField;
