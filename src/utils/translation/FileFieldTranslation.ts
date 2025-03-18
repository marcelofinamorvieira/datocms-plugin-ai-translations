// FileFieldTranslation.ts
// ------------------------------------------------------
// This file handles translation of metadata associated with file fields,
// such as alt text, title, or other custom metadata fields.

import type OpenAI from 'openai';
import type { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';
import { createLogger } from '../logging/Logger';

type StreamCallbacks = {
  onStream?: (chunk: string) => void;
  onComplete?: () => void;
};

/**
 * Translates metadata for file and gallery fields.
 * @param fieldValue - the file or gallery field data.
 * @param pluginParams - plugin parameters for model configuration.
 * @param toLocale - target locale code.
 * @param fromLocale - source locale code.
 * @param openai - instance of OpenAI client.
 * @param streamCallbacks - optional stream callbacks for handling translation progress.
 * @param recordContext - optional context from the record to aid translation.
 * @returns updated file field data with translated metadata.
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
 * Translates a single file field metadata
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
