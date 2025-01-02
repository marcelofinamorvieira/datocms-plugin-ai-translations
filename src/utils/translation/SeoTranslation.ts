// SeoTranslation.ts
// ------------------------------------------------------
// This file focuses on translating SEO fields, which are objects
// typically containing title and description, plus optional image metadata.

import OpenAI from 'openai';
import locale from 'locale-codes';
import { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';

/**
 * Translates an SEO field value, which usually contains title/description.
 * @param fieldValue - the SEO data object.
 * @param pluginParams - plugin parameters for the model configuration.
 * @param toLocale - target locale for translation.
 * @param fromLocale - source locale for translation.
 * @param openai - OpenAI client instance.
 * @param fieldTypePrompt - additional instructions for formatting.
 * @returns the updated SEO object with translated title/description.
 */
export async function translateSeoFieldValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  fieldTypePrompt: string
): Promise<Record<string, string>> {
  // Ensure we can safely treat fieldValue as an object
  const seoObject = fieldValue as Record<string, string>;
  const seoObjectToTranslate = {
    title: seoObject.title || '',
    description: seoObject.description || '',
  };

  // Use locale-codes for locale names
  const fromLocaleName = locale.getByTag(fromLocale)?.name || fromLocale;
  const toLocaleName = locale.getByTag(toLocale)?.name || toLocale;

  // Build the prompt
  let formattedPrompt = pluginParams.prompt
    .replace('{fieldValue}', JSON.stringify(seoObjectToTranslate))
    .replace('{fromLocale}', fromLocaleName)
    .replace('{toLocale}', toLocaleName);

  formattedPrompt += `\n${fieldTypePrompt}`;

  // Get the translation
  const seoCompletion = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: formattedPrompt,
      },
    ],
    model: pluginParams.gptModel,
  });

  // Parse the returned object
  const returnedSeoObject = JSON.parse(
    seoCompletion.choices[0].message.content || '{}'
  );

  // Update the original seoObject
  seoObject.title = returnedSeoObject.title || seoObject.title;
  seoObject.description = returnedSeoObject.description || seoObject.description;

  return seoObject;
}