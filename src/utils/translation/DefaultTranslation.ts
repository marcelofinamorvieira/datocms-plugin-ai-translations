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
 * Interface for handling streaming responses during translation
 * 
 * @interface StreamCallbacks
 * @property {Function} onStream - Handler for incremental translation results
 * @property {Function} onComplete - Handler called when translation completes
 * @property {Function} checkCancellation - Function to check if translation should be cancelled
 * @property {AbortSignal} abortSignal - Signal for aborting the API request
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
 * @param {unknown} fieldValue - The value to translate (typically a string)
 * @param {ctxParamsType} pluginParams - Configuration parameters for the plugin
 * @param {string} toLocale - Target locale code
 * @param {string} fromLocale - Source locale code
 * @param {OpenAI} openai - OpenAI client instance
 * @param {StreamCallbacks} streamCallbacks - Optional callbacks for streaming translation updates
 * @param {string} recordContext - Additional context about the record being translated
 * @returns {Promise<unknown>} - The translated text
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

  // Format locale names for better prompt clarity
  const localeMapper = new Intl.DisplayNames([fromLocale], { type: 'language' });
  const fromLocaleName = localeMapper.of(fromLocale) || fromLocale;
  const toLocaleName = localeMapper.of(toLocale) || toLocale;

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
 * @param {unknown} callbacks - The object to check
 * @returns {boolean} - True if the object is a valid StreamCallbacks instance
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
