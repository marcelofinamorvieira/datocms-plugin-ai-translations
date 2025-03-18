/**
 * FileFieldTranslation.ts
 * ------------------------------------------------------
 * This module handles translation of metadata associated with file fields in DatoCMS,
 * such as alt text, title, and other custom metadata fields that may be attached
 * to file uploads. It supports both single file fields and gallery (array of files) fields.
 * 
 * The module provides functionality to:
 * - Extract translatable metadata from file objects
 * - Process both single files and galleries (collections of files)
 * - Preserve file structure while updating only the relevant metadata
 * - Stream translation progress back to the UI
 */

import type OpenAI from 'openai';
import type { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';
import { createLogger } from '../logging/Logger';

/**
 * Interface for streaming translation updates to the UI
 * 
 * @interface StreamCallbacks
 * @property {Function} onStream - Callback for incremental translation updates
 * @property {Function} onComplete - Callback when translation is complete
 */
type StreamCallbacks = {
  onStream?: (chunk: string) => void;
  onComplete?: () => void;
};

/**
 * Translates metadata for file and gallery fields
 * 
 * This function handles both single file fields and gallery fields (arrays of files).
 * It extracts the metadata from each file object, translates text-based metadata fields,
 * and reconstructs the file objects with the translated metadata while preserving
 * other properties like URLs, dimensions, etc.
 * 
 * @param {unknown} fieldValue - The file or gallery field data to translate
 * @param {ctxParamsType} pluginParams - Plugin configuration parameters
 * @param {string} toLocale - Target locale code for translation
 * @param {string} fromLocale - Source locale code for translation
 * @param {OpenAI} openai - Instance of OpenAI client for translation
 * @param {StreamCallbacks} streamCallbacks - Optional callbacks for streaming progress updates
 * @param {string} recordContext - Optional context about the record to improve translation quality
 * @returns {Promise<unknown>} - Updated file field data with translated metadata
 */
export async function translateFileFieldValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  streamCallbacks?: StreamCallbacks,
  recordContext = ''
): Promise<unknown> {
  // Create logger for this module
  const logger = createLogger(pluginParams, 'FileFieldTranslation');
  
  // If no value, return as is
  if (!fieldValue) {
    logger.info('No field value to translate');
    return fieldValue;
  }

  // Handle gallery type (array of file objects)
  if (Array.isArray(fieldValue)) {
    if (fieldValue.length === 0) {
      logger.info('Empty array, nothing to translate');
      return fieldValue;
    }

    logger.info(`Translating gallery with ${fieldValue.length} files`);
    
    // Translate each file in the gallery
    const translatedFiles = await Promise.all(
      fieldValue.map(async (file) => {
        return translateSingleFileMetadata(
          file,
          pluginParams,
          toLocale,
          fromLocale,
          openai,
          streamCallbacks,
          recordContext
        );
      })
    );

    return translatedFiles;
  }

  // Handle single file field
  logger.info('Translating single file metadata');
  return translateSingleFileMetadata(
    fieldValue,
    pluginParams,
    toLocale,
    fromLocale,
    openai,
    streamCallbacks,
    recordContext
  );
}

/**
 * Translates metadata for a single file object
 * 
 * This function extracts text-based metadata fields from a file object,
 * translates them using OpenAI, and then merges the translated metadata
 * back into the original file object, preserving all non-metadata properties.
 * It only translates string-type metadata values, leaving other types untouched.
 * 
 * @param {unknown} fileValue - The file object containing metadata to translate
 * @param {ctxParamsType} pluginParams - Plugin configuration parameters
 * @param {string} toLocale - Target locale code for translation
 * @param {string} fromLocale - Source locale code for translation
 * @param {OpenAI} openai - Instance of OpenAI client for translation
 * @param {StreamCallbacks} streamCallbacks - Optional callbacks for streaming progress updates
 * @param {string} recordContext - Optional context about the record to improve translation quality
 * @returns {Promise<unknown>} - Updated file object with translated metadata
 */
async function translateSingleFileMetadata(
  fileValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  streamCallbacks?: StreamCallbacks,
  recordContext = ''
): Promise<unknown> {
  // Create logger for this function
  const logger = createLogger(pluginParams, 'FileFieldTranslation.translateSingleFileMetadata');
  
  // If not an object with metadata, return as is
  if (!fileValue || typeof fileValue !== 'object') {
    logger.info('No valid file object to translate');
    return fileValue;
  }

  const fileObj = fileValue as Record<string, unknown>;
  const metadata = fileObj.metadata as Record<string, unknown>;

  if (!metadata) {
    logger.info('No metadata found in file object');
    return fileValue;
  }

  // Extract translatable metadata fields
  const metadataToTranslate: Record<string, unknown> = {};
  for (const key in metadata) {
    // Only include string values for translation
    if (metadata[key] && typeof metadata[key] === 'string') {
      metadataToTranslate[key] = metadata[key];
    }
  }

  // If no translatable metadata, return as is
  if (Object.keys(metadataToTranslate).length === 0) {
    logger.info('No translatable string metadata found');
    return fileValue;
  }

  logger.info('Translating file metadata', metadataToTranslate);

  // Format locale codes for better prompt clarity
  const localeMapper = new Intl.DisplayNames([fromLocale], { type: 'language' });
  const fromLocaleName = localeMapper.of(fromLocale) || fromLocale;
  const toLocaleName = localeMapper.of(toLocale) || toLocale;

  // Use template-based prompt system for consistency
  const prompt = (pluginParams.prompt || '')
    .replace('{fieldValue}', JSON.stringify(metadataToTranslate))
    .replace('{fromLocale}', fromLocaleName)
    .replace('{toLocale}', toLocaleName)
    .replace('{recordContext}', recordContext || 'Record context: No additional context available.');

  // Log the prompt
  logger.logPrompt('File metadata translation prompt', prompt);

  try {
    let translatedText = '';
    const stream = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
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

    // Log the response
    logger.logResponse('File metadata translation response', translatedText);

    // Parse the translated metadata
    const translatedMetadata = JSON.parse(translatedText || '{}');

    // Update the original file object with translated metadata
    return {
      ...fileObj,
      metadata: {
        ...metadata,
        ...translatedMetadata,
      },
    };
  } catch (error) {
    logger.error('File metadata translation error', error);
    throw error;
  }
}
