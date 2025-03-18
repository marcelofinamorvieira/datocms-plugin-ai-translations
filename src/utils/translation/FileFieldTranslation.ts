// FileFieldTranslation.ts
// ------------------------------------------------------
// This file handles translations of file fields, which may include
// metadata like alt text, title, etc.

import type OpenAI from 'openai';
import locale from 'locale-codes';
import type { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';
import { fieldPrompt } from '../../prompts/FieldPrompts';

type StreamCallbacks = {
  onStream?: (chunk: string) => void;
  onComplete?: () => void;
};

/**
 * Translates metadata associated with file fields (e.g., alt text, title).
 * @param fieldValue - the file field data object
 * @param pluginParams - plugin parameters for the model configuration
 * @param toLocale - target locale for translation
 * @param fromLocale - source locale for translation
 * @param openai - OpenAI client instance
 * @param apiToken - DatoCMS API token
 * @param fieldType - type of the field being translated
 * @param streamCallbacks - optional stream callbacks for handling translation progress
 * @returns the updated file field object with translated metadata
 */
export async function translateFileFieldValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  fieldType: string,
  streamCallbacks?: StreamCallbacks
): Promise<unknown> {
  // If no value, return as is
  if (!fieldValue) {
    return fieldValue;
  }

  // Handle gallery type (array of file objects)
  if (fieldType === 'gallery' && Array.isArray(fieldValue)) {
    if (fieldValue.length === 0) {
      return fieldValue;
    }
    const translatedFiles = await Promise.all(
      fieldValue.map(async (fileObj) => {
        return await translateSingleFileObject(
          fileObj,
          pluginParams,
          toLocale,
          fromLocale,
          openai,
          streamCallbacks
        );
      })
    );
    return translatedFiles;
  }

  // Handle single file object
  return await translateSingleFileObject(
    fieldValue,
    pluginParams,
    toLocale,
    fromLocale,
    openai,
    streamCallbacks
  );
}

async function translateSingleFileObject(
  fileValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  streamCallbacks?: StreamCallbacks
): Promise<unknown> {
  // If not an object with metadata, return as is
  if (!fileValue || typeof fileValue !== 'object') {
    return fileValue;
  }

  const fileObject = fileValue as Record<string, unknown>;
  const metadataToTranslate = {
    alt: fileObject.alt || '',
    title: fileObject.title || '',
    // Add other translatable metadata fields as needed
  };

  if (!metadataToTranslate.alt && !metadataToTranslate.title) {
    return fileValue;
  }

  const fromLocaleName = locale.getByTag(fromLocale)?.name || fromLocale;
  const toLocaleName = locale.getByTag(toLocale)?.name || toLocale;

  let formattedPrompt = pluginParams.prompt
    .replace('{fieldValue}', JSON.stringify(metadataToTranslate))
    .replace('{fromLocale}', fromLocaleName)
    .replace('{toLocale}', toLocaleName);

  formattedPrompt += `\n${fieldPrompt.file}`;

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

    // Parse the translated metadata
    const translatedMetadata = JSON.parse(translatedText || '{}');

    // Update the original file object with translated metadata
    return {
      ...fileObject,
      alt: translatedMetadata.alt || fileObject.alt,
      title: translatedMetadata.title || fileObject.title,
    };
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}
