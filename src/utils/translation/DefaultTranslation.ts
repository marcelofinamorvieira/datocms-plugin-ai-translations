/**
 * DefaultTranslation.ts
 * ------------------------------------------------------
 * This module provides translation logic for standard text fields in DatoCMS,
 * such as single_line, markdown, and JSON fields. It implements a generalized
 * approach for translating simple text content using OpenAI's API.
 * 
 * The module is responsible for:
 * - Formatting prompts for the AI model
 * - Managing streaming responses and cancellation
 * - Handling errors during translation
 * - Supporting contextual information to improve translation quality
 */

import type OpenAI from 'openai';
import type { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';
import { createLogger } from '../logging/Logger';

/**
 * Interface for handling streaming responses during translation.
 */
type StreamCallbacks = {
  onStream?: (chunk: string) => void;
  onComplete?: () => void;
  checkCancellation?: () => boolean;
  abortSignal?: AbortSignal;
};

/**
 * Translates a basic text field value using OpenAI's language model
 * 
 * This function handles the translation of simple text-based field types by
 * constructing an appropriate prompt, sending it to OpenAI, and handling the
 * streamed response. It supports providing record context for improved translation
 * accuracy and offers streaming callbacks for UI updates.
 * 
 * @param fieldValue - The value to translate (typically a string)
 * @param pluginParams - Configuration parameters for the plugin
 * @param toLocale - Target locale code
 * @param fromLocale - Source locale code
 * @param openai - OpenAI client instance
 * @param streamCallbacks - Optional callbacks for streaming translation updates
 * @param recordContext - Additional context about the record being translated
 * @returns The translated text
 */
export async function translateDefaultFieldValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  streamCallbacks?: StreamCallbacks,
  recordContext = ''
): Promise<unknown> {
  // If nothing to translate, return as is
  if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
    return fieldValue;
  }

  // Format locale names for better prompt clarity, handling hyphenated locales
  // For hyphenated locales like "pt-br", use just the language part for displaying
  const fromLanguageCode = fromLocale.split('-')[0];
  const toLanguageCode = toLocale.split('-')[0];

  let fromLocaleName = fromLocale;
  let toLocaleName = toLocale;

  try {
    // Use English as the display language to get consistent names
    const localeMapper = new Intl.DisplayNames(['en'], { type: 'language' });
    const fromLanguageName = localeMapper.of(fromLanguageCode);
    const toLanguageName = localeMapper.of(toLanguageCode);

    // Format the locale display names
    if (fromLocale.includes('-')) {
      const fromRegion = fromLocale.split('-')[1];
      fromLocaleName = `${fromLanguageName} (${fromRegion})`;
    } else {
      fromLocaleName = fromLanguageName || fromLocale;
    }

    if (toLocale.includes('-')) {
      const toRegion = toLocale.split('-')[1];
      toLocaleName = `${toLanguageName} (${toRegion})`;
    } else {
      toLocaleName = toLanguageName || toLocale;
    }
  } catch (error) {
    // Fallback in case the locale codes aren't recognized by Intl
    console.warn(`Error formatting locale names for ${fromLocale}/${toLocale}:`, error);
  }

  // Create logger for this module
  const logger = createLogger(pluginParams, 'DefaultTranslation');

  // Construct prompt using the template system 
  const prompt = (pluginParams.prompt || '')
    .replace('{fieldValue}', String(fieldValue))
    .replace('{fromLocale}', fromLocaleName)
    .replace('{toLocale}', toLocaleName)
    .replace('{recordContext}', recordContext || 'Record context: No additional context available.');
  
  // Log the prompt being sent to OpenAI
  logger.logPrompt('Translating default field value', prompt);

  try {
    let translatedText = '';
    const stream = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: pluginParams.gptModel,
      stream: true,
    }, {
      signal: streamCallbacks?.abortSignal
    });

    for await (const chunk of stream) {
      // Check for cancellation during streaming
      if (streamCallbacks?.checkCancellation?.()) {
        logger.info('Translation cancelled by user');
        if (streamCallbacks?.onComplete) {
          streamCallbacks.onComplete();
        }
        return translatedText || fieldValue; // Return whatever we have so far or the original
      }

      const content = chunk.choices[0]?.delta?.content || '';
      translatedText += content;

      if (streamCallbacks?.onStream) {
        streamCallbacks.onStream(translatedText);
      }
    }

    if (streamCallbacks?.onComplete) {
      streamCallbacks.onComplete();
    }

    // Log the response received from OpenAI
    logger.logResponse('Received translation result', translatedText);

    return translatedText;
  } catch (error) {
    logger.error('Translation error', error);
    throw error;
  }
}

/**
 * Type guard to verify if a provided object is a valid StreamCallbacks instance
 * 
 * This utility function helps validate that a given object conforms to the
 * StreamCallbacks interface before attempting to use its methods. It performs
 * runtime type checking to ensure the callback functions exist and are of the
 * correct type.
 * 
 * @param callbacks - The object to check
 * @returns True if the object is a valid StreamCallbacks instance
 */
export function isValidStreamCallbacks(callbacks: unknown): callbacks is { onStream?: (chunk: string) => void; onComplete?: () => void; checkCancellation?: () => boolean; abortSignal?: AbortSignal } {
  if (!callbacks) return false;
  const cb = callbacks as { onStream?: unknown; onComplete?: unknown; checkCancellation?: unknown; abortSignal?: unknown };
  return typeof cb === 'object' && 
    (typeof cb.onStream === 'function' || cb.onStream === undefined) &&
    (typeof cb.onComplete === 'function' || cb.onComplete === undefined) &&
    (typeof cb.checkCancellation === 'function' || cb.checkCancellation === undefined) &&
    (typeof cb.abortSignal === 'object' || cb.abortSignal === undefined);
}
