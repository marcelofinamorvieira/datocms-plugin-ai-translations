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
import { createLogger } from '../logging/Logger';

/**
 * Interface for SEO field object structure
 */
export interface SeoObject {
  title?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Interface for handling streaming translation updates.
 */
type StreamCallbacks = {
  onStream?: (chunk: string) => void;
  onComplete?: () => void;
  checkCancellation?: () => boolean;
  abortSignal?: AbortSignal;
};

/**
 * Translates SEO field values while preserving their object structure
 * 
 * This function extracts the title and description from an SEO object,
 * translates them using OpenAI, and reconstructs the object with the
 * translated values. It handles streaming updates for UI feedback and
 * uses record context to improve translation quality when available.
 *
 * @param fieldValue - The SEO field object to translate
 * @param pluginParams - Plugin configuration parameters
 * @param toLocale - Target locale code for translation
 * @param fromLocale - Source locale code for translation
 * @param openai - OpenAI client instance
 * @param fieldTypePrompt - Additional prompt for SEO format instructions
 * @param streamCallbacks - Optional callbacks for streaming updates
 * @param recordContext - Optional context about the record being translated
 * @returns The translated SEO object
 */
export async function translateSeoFieldValue(
  fieldValue: SeoObject | undefined | null,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  fieldTypePrompt: string,
  streamCallbacks?: StreamCallbacks,
  recordContext = ''
): Promise<SeoObject> {
  const logger = createLogger(pluginParams, 'translateSeoFieldValue');
  logger.info('Starting SEO field translation', { fromLocale, toLocale });

  if (!fieldValue) {
    return { title: '', description: '' };
  }
  
  const seoObject = fieldValue;
  const seoObjectToTranslate = {
    title: seoObject.title || '',
    description: seoObject.description || '',
  };
  
  logger.info('SEO object to translate', seoObjectToTranslate);

  try {
    // Extract language names for better prompt clarity
    const fromLocaleName = locale.getByTag(fromLocale)?.name || fromLocale;
    const toLocaleName = locale.getByTag(toLocale)?.name || toLocale;
    
    logger.info(`Translating from ${fromLocaleName} to ${toLocaleName}`);

    // Base prompt with replaceable placeholders
    const prompt = (pluginParams.prompt || '')
      .replace('{fieldValue}', JSON.stringify(seoObjectToTranslate))
      .replace('{fromLocale}', fromLocaleName)
      .replace('{toLocale}', toLocaleName)
      .replace('{recordContext}', recordContext || 'Record context: No additional context available.');

    // Using template literal as per linting rules
    const formattedPrompt = `${prompt}\n${fieldTypePrompt}`;
    logger.info('Formatted prompt prepared for translation');
    // Log prompt only when debugging is enabled
    logger.logPrompt('SEO translation prompt', formattedPrompt);

    let translatedText = '';
    logger.info('Initiating OpenAI stream for translation');
    const stream = await openai.chat.completions.create({
      messages: [{ role: 'user', content: formattedPrompt }],
      model: pluginParams.gptModel,
      stream: true,
    }, {
      // Allow cancellation of in-flight requests from UI
      signal: streamCallbacks?.abortSignal,
    });

    for await (const chunk of stream) {
      // Support cooperative cancellation during streaming
      if (streamCallbacks?.checkCancellation?.()) {
        logger.info('SEO translation cancelled by user');
        if (streamCallbacks?.onComplete) {
          streamCallbacks.onComplete();
        }
        return seoObjectToTranslate; // Return original values if cancelled
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

    logger.info(`Received translated text with length ${translatedText.length}`);

    // Clean up the response to ensure it's valid JSON
    let sanitizedText = translatedText.trim();
    
    // Remove potential markdown code block markers
    sanitizedText = sanitizedText.replace(/^```(json)?\n?/i, '').replace(/```$/i, '');
    
    // Handle potential unintended characters at the beginning
    if (!sanitizedText.startsWith('{')) {
      const jsonStart = sanitizedText.indexOf('{');
      if (jsonStart !== -1) {
        sanitizedText = sanitizedText.substring(jsonStart);
      }
    }
    
    // Handle potential unintended characters at the end
    const lastBrace = sanitizedText.lastIndexOf('}');
    if (lastBrace !== -1 && lastBrace < sanitizedText.length - 1) {
      sanitizedText = sanitizedText.substring(0, lastBrace + 1);
    }
    
    logger.info(`Sanitized JSON: ${sanitizedText}`);

    // Parse the returned object with error handling
    let returnedSeoObject: SeoObject = { title: '', description: '' };
    try {
      returnedSeoObject = JSON.parse(sanitizedText || '{}');
      logger.info('Successfully parsed translated SEO object');
    } catch (parseError) {
      logger.error(`JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      logger.error(`Attempted to parse: ${sanitizedText}`);
      
      // Fallback: extract title and description with regex
      logger.info('Attempting fallback extraction with regex');
      const titleMatch = /"title"\s*:\s*"([^"]+)"/i.exec(sanitizedText);
      const descriptionMatch = /"description"\s*:\s*"([^"]+)"/i.exec(sanitizedText);
      
      returnedSeoObject = {
        title: titleMatch ? titleMatch[1] : seoObject.title,
        description: descriptionMatch ? descriptionMatch[1] : seoObject.description
      };
      
      logger.info(`Fallback extraction result: ${JSON.stringify(returnedSeoObject)}`);
    }

    // Update the original seoObject
    // Enforce character limits for SEO content
    if (returnedSeoObject.title && returnedSeoObject.title.length > 60) {
      logger.info(`SEO title exceeds 60 character limit (${returnedSeoObject.title.length}). Truncating...`);
      returnedSeoObject.title = `${returnedSeoObject.title.substring(0, 57)}...`;
    }
    
    if (returnedSeoObject.description && returnedSeoObject.description.length > 160) {
      logger.info(`SEO description exceeds 160 character limit (${returnedSeoObject.description.length}). Truncating...`);
      returnedSeoObject.description = `${returnedSeoObject.description.substring(0, 157)}...`;
    }
    
    seoObject.title = (returnedSeoObject.title as string) || (seoObject.title as string);
    seoObject.description = (returnedSeoObject.description as string) || (seoObject.description as string);
    
    logger.info('SEO translation completed successfully');
    return seoObject;
  } catch (error) {
    logger.error('SEO translation error:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}
