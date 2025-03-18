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
 * @param recordContext - optional context from the record to aid translation.
 * @returns the updated SEO object with translated title/description.
 */
export async function translateSeoFieldValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  fieldTypePrompt: string,
  streamCallbacks?: StreamCallbacks,
  recordContext = ''
): Promise<unknown> {
  const seoObject = fieldValue as Record<string, unknown>;
  const seoObjectToTranslate = {
    title: seoObject.title || '',
    description: seoObject.description || '',
  };

  try {
    // Extract language names for better prompt clarity
    const fromLocaleName = locale.getByTag(fromLocale)?.name || fromLocale;
    const toLocaleName = locale.getByTag(toLocale)?.name || toLocale;

    // Base prompt with replaceable placeholders
    const prompt = (pluginParams.prompt || '')
      .replace('{fieldValue}', JSON.stringify(seoObjectToTranslate))
      .replace('{fromLocale}', fromLocaleName)
      .replace('{toLocale}', toLocaleName)
      .replace('{recordContext}', recordContext || 'Record context: No additional context available.');

    // Using template literal instead of string concatenation as per linting rules
    const formattedPrompt = `${prompt}\n${fieldTypePrompt}`;

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