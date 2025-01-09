import { RenderItemFormSidebarPanelCtx } from 'datocms-plugin-sdk';
import OpenAI from 'openai';
import {
  ctxParamsType,
  modularContentVariations,
} from '../entrypoints/Config/ConfigScreen';
import { fieldPrompt } from '../prompts/FieldPrompts';
import { translateFieldValue } from './translation/TranslateField';

/**
 * translateRecordFields.ts
 *
 * This utility function translates all translatable fields of a record from a given source locale
 * into multiple target locales. It leverages the translateFieldValue function for each field-locale pair.
 *
 * Newly added functionality:
 * - Accepts callbacks (onStart and onComplete) to report the start and completion of each
 *   field-locale translation. These callbacks are used by the DatoGPTTranslateSidebar to display
 *   chat-like bubbles showing translation progress.
 *
 * Process:
 * 1. Fetch all fields for the current model.
 * 2. For each field that can be translated, iterate over the target locales.
 * 3. For each field-locale pair, call onStart callback, then translate, then onComplete callback.
 *
 * Parameters:
 * - ctx: DatoCMS sidebar panel context, providing form values, field list, etc.
 * - pluginParams: Configuration parameters including API Key, model, etc.
 * - targetLocales: Array of locales into which we want to translate fields.
 * - sourceLocale: The locale from which fields are translated.
 * - options: An object with callbacks:
 *    onStart(fieldLabel: string, locale: string)
 *    onComplete(fieldLabel: string, locale: string)
 *
 * Returns: Promise<void> once all translations are done.
 */

type TranslateOptions = {
  onStart?: (fieldLabel: string, locale: string, fieldPath: string) => void;
  onComplete?: (fieldLabel: string, locale: string) => void;
  onStream?: (fieldLabel: string, locale: string, content: string) => void;
};

interface LocalizedField {
  [locale: string]: any;
}

export async function translateRecordFields(
  ctx: RenderItemFormSidebarPanelCtx,
  pluginParams: ctxParamsType,
  targetLocales: string[],
  sourceLocale: string,
  options: TranslateOptions = {}
) {
  // Ensure we have an OpenAI instance ready
  const openai = new OpenAI({
    apiKey: pluginParams.apiKey,
    dangerouslyAllowBrowser: true,
  });

  const currentFormValues = ctx.formValues;

  // We'll translate only fields that can be translated (excluded by `fieldsThatDontNeedTranslation` in TranslateField)
  // We'll rely on translateFieldValue to skip irrelevant fields.
  // For each field, if it's localized and can be translated, we do so.
  const fieldsArray = Object.values(ctx.fields).filter(
    (field) => field?.relationships.item_type.data.id === ctx.itemType.id
  );

  for (const field of fieldsArray) {
    const fieldType = field!.attributes.appearance.editor;
    const fieldValue = currentFormValues[field!.attributes.api_key];

    // If field is not localized or doesn't have a value in the source locale, skip
    let isFieldTranslatable =
      pluginParams.translationFields.includes(fieldType);

    if (
      (pluginParams.translationFields.includes('rich_text') &&
        modularContentVariations.includes(fieldType)) ||
      (pluginParams.translationFields.includes('file') &&
        fieldType === 'gallery')
    ) {
      isFieldTranslatable = true;
    }

    if (
      !isFieldTranslatable ||
      !field!.attributes.localized ||
      pluginParams.apiKeysToBeExcludedFromThisPlugin.includes(field!.id)
    )
      continue;
    if (
      !(
        fieldValue &&
        typeof fieldValue === 'object' &&
        !Array.isArray(fieldValue) &&
        fieldValue[sourceLocale as keyof typeof fieldValue]
      )
    ) {
      continue;
    }

    const sourceLocaleValue =
      fieldValue[sourceLocale as keyof typeof fieldValue];

    //if the field is a localized modular content, and the source locale is empty, skip
    if (
      Array.isArray(sourceLocaleValue) &&
      (sourceLocaleValue as any[]).length === 0
    ) {
      continue;
    }

    // Determine a simple field label for the UI
    const fieldLabel = field!.attributes.label || field!.attributes.api_key;

    // For each target locale, translate the field
    for (const locale of targetLocales) {
      // Inform the sidebar that translation for this field-locale is starting
      options.onStart?.(
        fieldLabel,
        locale,
        field!.attributes.api_key + '.' + locale
      );

      // Determine field type prompt
      let fieldTypePrompt = 'Return the response in the format of ';
      const fieldPromptObject = fieldPrompt;

      const baseFieldPrompts = fieldPromptObject ? fieldPromptObject : {};

      // If structured or rich text, a special prompt is handled inside translateFieldValue.
      if (fieldType !== 'structured_text' && fieldType !== 'rich_text') {
        fieldTypePrompt +=
          baseFieldPrompts[fieldType as keyof typeof baseFieldPrompts] || '';
      }

      // Create streaming callbacks for this field-locale pair
      const streamCallbacks = {
        onStream: (chunk: string) => {
          options.onStream?.(fieldLabel, locale, chunk);
        },
        onComplete: () => {
          options.onComplete?.(fieldLabel, locale);
        },
      };

      // Translate the field value with streaming support
      const translatedFieldValue = await translateFieldValue(
        (fieldValue as LocalizedField)[sourceLocale],
        pluginParams,
        locale,
        sourceLocale,
        fieldType,
        openai,
        fieldTypePrompt,
        ctx.currentUserAccessToken!,
        streamCallbacks
      );

      // Update form values with the translated field
      ctx.setFieldValue(
        field!.attributes.api_key + '.' + locale,
        translatedFieldValue
      );
    }
  }
}
