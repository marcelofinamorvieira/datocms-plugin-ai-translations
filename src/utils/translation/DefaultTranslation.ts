// DefaultTranslation.ts
// ------------------------------------------------------
// This file provides translation logic for simple text fields,
// such as single_line, markdown, JSON, etc. It uses the
// configured OpenAI model to translate from one locale to another.

import type OpenAI from 'openai';
import type { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';
import { createLogger } from '../logging/Logger';

type StreamCallbacks = {
  onStream?: (chunk: string) => void;
  onComplete?: () => void;
  checkCancellation?: () => boolean;
  abortSignal?: AbortSignal;
};

/**
 * Translates a simple text field value using OpenAI.
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
 * Function to check if streamCallbacks is provided and valid
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
