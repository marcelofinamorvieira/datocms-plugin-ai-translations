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

import type { TranslationProvider } from './types';
import { normalizeProviderError } from './ProviderErrors';
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
  provider: TranslationProvider,
  _streamCallbacks?: StreamCallbacks,
  recordContext = ''
): Promise<unknown> {
  // If nothing to translate, return as is
  if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
    return fieldValue;
  }

  // Format locale names for better prompt clarity, handling hyphenated locales
  // For hyphenated locales like "pt-br", use just the language part for displaying
  // No display‑name formatting required for array helper path

  // Create logger for this module
  const logger = createLogger(pluginParams, 'DefaultTranslation');

  try {
    // Translate as a single-element array to align with DeepL + chat vendors via helper
    const { translateArray } = await import('./translateArray');
    const [translated] = await translateArray(provider, pluginParams, [String(fieldValue)], fromLocale, toLocale, { isHTML: false, recordContext });
    return translated;
  } catch (error) {
    const normalized = normalizeProviderError(error, provider.vendor);
    logger.error(`Translation error: ${normalized.message}`, { code: normalized.code, hint: normalized.hint });
    throw new Error(normalized.message);
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
