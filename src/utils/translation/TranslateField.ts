// TranslateField.ts
// ------------------------------------------------------
// This main entry point coordinates the logic for translating
// various field types by delegating to specialized modules.

import OpenAI from 'openai';
import { buildClient } from '@datocms/cma-client-browser';
import { ExecuteFieldDropdownActionCtx } from 'datocms-plugin-sdk';
import {
  ctxParamsType,
  modularContentVariations,
} from '../../entrypoints/Config/ConfigScreen';
import { fieldPrompt } from '../../prompts/FieldPrompts';
import { translateDefaultFieldValue } from './DefaultTranslation';
import { translateSeoFieldValue } from './SeoTranslation';
import { translateStructuredTextValue } from './StructuredTextTranslation';
import { deleteItemIdKeys } from './utils';

type StreamCallbacks = {
  onStream?: (chunk: string) => void;
  onComplete?: () => void;
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
  streamCallbacks?: StreamCallbacks
): Promise<unknown> {
  // If this field type is not in the plugin config or has no value, return as is
  let isFieldTranslatable = pluginParams.translationFields.includes(fieldType);

  if (
    pluginParams.translationFields.includes('rich_text') &&
    modularContentVariations.includes(fieldType)
  ) {
    isFieldTranslatable = true;
  }

  if (!isFieldTranslatable || !fieldValue) {
    return fieldValue;
  }

  const commonArgs = [
    fieldValue,
    pluginParams,
    toLocale,
    fromLocale,
    openai,
  ] as const;

  switch (fieldType) {
    case 'seo':
      return translateSeoFieldValue(
        ...commonArgs,
        fieldTypePrompt,
        streamCallbacks
      );
    case 'structured_text':
      return translateStructuredTextValue(
        ...commonArgs,
        apiToken,
        streamCallbacks
      );
    case 'rich_text':
      return translateBlockValue(...commonArgs, apiToken, streamCallbacks);
    default:
      return translateDefaultFieldValue(
        ...commonArgs,
        fieldTypePrompt,
        streamCallbacks
      );
  }
}

/**
 * Specifically handles block-based fields in a rich text.
 */
export async function translateBlockValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  apiToken: string,
  streamCallbacks?: StreamCallbacks
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
        apiToken,
        streamCallbacks
      );
    }
  }

  return cleanedFieldValue;
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
  streamCallbacks?: StreamCallbacks
) => {
  if (pluginParams.apiKeysToBeExcludedFromThisPlugin.includes(ctx.field.id)) {
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
    ctx.currentUserAccessToken!,
    streamCallbacks
  );

  // Set the new value in the correct locale
  ctx.setFieldValue(fieldPathArray.join('.'), translated);

  // Re-enable the field
  ctx.disableField(ctx.fieldPath, false);
};

export default TranslateField;
