import { RenderItemFormSidebarPanelCtx } from 'datocms-plugin-sdk';
import OpenAI from 'openai';
import { ctxParamsType } from '../entrypoints/Config/ConfigScreen';
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
  const fieldsArray = Object.values(ctx.fields);

  for (const field of fieldsArray) {
    const fieldType = field!.attributes.appearance.editor;
    const fieldValue = currentFormValues[field!.attributes.api_key];

    // If field is not localized or doesn't have a value in the source locale, skip
    if (!field!.attributes.localized) continue;
    if (
      !(
        fieldValue &&
        typeof fieldValue === 'object' &&
        !Array.isArray(fieldValue) &&
        fieldValue[sourceLocale as keyof typeof fieldValue] !== undefined
      )
    ) {
      continue;
    }

    // Determine a simple field label for the UI
    const fieldLabel = field!.attributes.label || field!.attributes.api_key;

    // For each target locale, translate the field
    for (const locale of targetLocales) {
      if (typeof (fieldValue as LocalizedField)[locale] !== 'undefined') {
        // We assume a translation might still be relevant if user chooses to overwrite
        // We proceed anyway, or we could skip if we only translate empty fields
      }

      // Inform the sidebar that translation for this field-locale is starting
      options.onStart?.(
        fieldLabel,
        locale,
        field!.attributes.api_key + '.' + locale
      );

      // Determine field type prompt
      let fieldTypePrompt = 'Return the response in the format of ';
      const fieldPromptObject = fieldPrompt;
      if (fieldType !== 'structured_text' && fieldType !== 'rich_text') {
        fieldTypePrompt +=
          fieldPromptObject[fieldType as keyof typeof fieldPrompt];
      }

      const baseFieldPrompts = fieldPromptObject ? fieldPromptObject : {};

      // If structured or rich text, a special prompt is handled inside translateFieldValue.
      if (fieldType !== 'structured_text' && fieldType !== 'rich_text') {
        fieldTypePrompt +=
          baseFieldPrompts[fieldType as keyof typeof baseFieldPrompts] || '';
      }

      // Translate the field value
      const translatedFieldValue = await translateFieldValue(
        (fieldValue as LocalizedField)[sourceLocale],
        pluginParams,
        locale,
        sourceLocale,
        fieldType,
        openai,
        fieldTypePrompt,
        ctx.currentUserAccessToken!
      );

      // Update form values with the translated field
      ctx.setFieldValue(
        field!.attributes.api_key + '.' + locale,
        translatedFieldValue
      );

      // Inform the sidebar that this field-locale translation is completed
      options.onComplete?.(fieldLabel, locale);
    }
  }
}
