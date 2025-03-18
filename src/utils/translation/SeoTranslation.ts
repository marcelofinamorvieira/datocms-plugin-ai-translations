/**
 * SeoTranslation.ts
 * ------------------------------------------------------
 * This module handles the translation of SEO field values in DatoCMS.
 * SEO fields are structured objects that typically contain title and
 * description properties, which need specialized handling during translation
 * to maintain their structure while updating their content.
 * 
 * The module provides functionality to:
 * - Parse SEO field objects
 * - Maintain field structure during translation
 * - Format localized SEO content for better user experience
 */

import type OpenAI from 'openai';
import locale from 'locale-codes';
import type { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';

/**
 * Interface for handling streaming translation updates
 * 
 * @interface StreamCallbacks
 * @property {Function} onStream - Callback for incremental translation updates
 * @property {Function} onComplete - Callback for when translation is complete
 */
type StreamCallbacks = {
  onStream?: (chunk: string) => void;
  onComplete?: () => void;
};

/**
 * Translates SEO field values while preserving their object structure
 * 
 * This function extracts the title and description from an SEO object,
 * translates them using OpenAI, and reconstructs the object with the
 * translated values. It handles streaming updates for UI feedback and
 * uses record context to improve translation quality when available.
 *
 * @param {unknown} fieldValue - The SEO field object to translate
 * @param {ctxParamsType} pluginParams - Plugin configuration parameters
 * @param {string} toLocale - Target locale code for translation
 * @param {string} fromLocale - Source locale code for translation
 * @param {OpenAI} openai - OpenAI client instance
 * @param {string} fieldTypePrompt - Additional prompt for SEO format instructions
 * @param {StreamCallbacks} streamCallbacks - Optional callbacks for streaming updates
 * @param {string} recordContext - Optional context about the record being translated
 * @returns {Promise<unknown>} - The translated SEO object
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