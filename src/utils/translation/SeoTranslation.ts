// SeoTranslation.ts
// ------------------------------------------------------
// This file focuses on translating SEO fields, which are objects
// typically containing title and description, plus optional image metadata.

import type OpenAI from 'openai';
import locale from 'locale-codes';
import type { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';

type StreamCallbacks = {
  onStream?: (chunk: string) => void;
  onComplete?: () => void;
};

/**
 * Translates an SEO field value, which usually contains title/description.
 * @param fieldValue - the SEO data object.
 * @param pluginParams - plugin parameters for the model configuration.
 * @param toLocale - target locale for translation.
 * @param fromLocale - source locale for translation.
 * @param openai - OpenAI client instance.
 * @param fieldTypePrompt - additional instructions for formatting.
 * @param streamCallbacks - optional stream callbacks for handling translation progress.
 * @returns the updated SEO object with translated title/description.
 */
export async function translateSeoFieldValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  fieldTypePrompt: string,
  streamCallbacks?: StreamCallbacks
): Promise<unknown> {
  const seoObject = fieldValue as Record<string, unknown>;
  const seoObjectToTranslate = {
    title: seoObject.title || '',
    description: seoObject.description || '',
  };

  const fromLocaleName = locale.getByTag(fromLocale)?.name || fromLocale;
  const toLocaleName = locale.getByTag(toLocale)?.name || toLocale;

  let formattedPrompt = pluginParams.prompt
    .replace('{fieldValue}', JSON.stringify(seoObjectToTranslate))
    .replace('{fromLocale}', fromLocaleName)
    .replace('{toLocale}', toLocaleName);

  formattedPrompt += `\n${fieldTypePrompt}`;

  try {
    let translatedText = '';
    const stream = await openai.chat.completions.create({
      messages: [{ role: 'user', content: formattedPrompt }],
      model: pluginParams.gptModel,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      translatedText += content;
      if (streamCallbacks?.onStream) {
        streamCallbacks.onStream(translatedText);
      }
    }

    if (streamCallbacks?.onComplete) {
      streamCallbacks.onComplete();
    }

    // Parse the returned object
    const returnedSeoObject = JSON.parse(translatedText || '{}');

    // Update the original seoObject
    seoObject.title = returnedSeoObject.title || seoObject.title;
    seoObject.description = returnedSeoObject.description || seoObject.description;

    return seoObject;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}