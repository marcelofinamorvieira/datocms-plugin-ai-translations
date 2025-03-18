// StructuredTextTranslation.ts
// ------------------------------------------------------
// This file manages translations of structured text fields, including
// extracting text nodes, translating block nodes, and reassembling.

import type OpenAI from 'openai';
import type { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';
import { translateFieldValue } from './TranslateField';
import { createLogger } from '../logging/Logger';
import {
  extractTextValues,
  reconstructObject,
  insertObjectAtIndex,
  removeIds
} from './utils';

type StreamCallbacks = {
  onStream?: (chunk: string) => void;
  onComplete?: () => void;
  checkCancellation?: () => boolean;
  abortSignal?: AbortSignal;
};

// Define structured text node types for better type safety
interface StructuredTextNode {
  type?: string;
  value?: string;
  item?: string;
  originalIndex?: number;
  [key: string]: unknown;
}

/**
 * Translates a structured text field value
 */
export async function translateStructuredTextValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  apiToken: string,
  streamCallbacks?: StreamCallbacks,
  recordContext = ''
): Promise<unknown> {
  // Create logger
  const logger = createLogger(pluginParams, 'StructuredTextTranslation');

  // Skip translation if null or not an array
  if (!fieldValue || !Array.isArray(fieldValue)) {
    logger.info('Invalid structured text value', fieldValue);
    return fieldValue;
  }

  logger.info('Translating structured text field', { nodeCount: fieldValue.length });

  // Remove any 'id' fields
  const noIdFieldValue = removeIds(fieldValue) as StructuredTextNode[];

  // Separate out block nodes and track their original positions
  const blockNodes = noIdFieldValue.reduce<StructuredTextNode[]>(
    (acc, node, index) => {
      if (node?.type === 'block') {
        acc.push({ ...node, originalIndex: index });
      }
      return acc;
    },
    []
  );

  // Filter out block nodes for inline translation first
  const fieldValueWithoutBlocks = noIdFieldValue.filter(
    (node) => node?.type !== 'block'
  );

  // Extract text strings from the structured text
  const textValues = extractTextValues(fieldValueWithoutBlocks);
  
  if (textValues.length === 0) {
    logger.info('No text values found to translate');
    return fieldValue;
  }

  logger.info(`Found ${textValues.length} text nodes to translate`);

  // Format locales for better prompt clarity
  const localeMapper = new Intl.DisplayNames([fromLocale], { type: 'language' });
  const fromLocaleName = localeMapper.of(fromLocale) || fromLocale;
  const toLocaleName = localeMapper.of(toLocale) || toLocale;

  // Construct the prompt using the template system for consistency
  let prompt = (pluginParams.prompt || '')
    .replace(
      '{fieldValue}',
      `translate the following string array ${JSON.stringify(
        textValues,
        null,
        2
      )}`
    )
    .replace('{fromLocale}', fromLocaleName)
    .replace('{toLocale}', toLocaleName)
    .replace('{recordContext}', recordContext || 'Record context: No additional context available.');

  prompt += '\nReturn the translated strings array in a valid JSON format. The number of returned strings should match the original. Do not trim any empty strings or spaces. Return just the array of strings, do not nest the array into an object.  The number of returned strings should match the original. Spaces and empty strings should remain unaltered. Do not remove any empty strings or spaces.';

  // Log the prompt being sent
  logger.logPrompt('Structured text translation prompt', prompt);

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

    // Log response
    logger.logResponse('Structured text translation response', translatedText);

    try {
      const translatedValues = JSON.parse(translatedText);

      if (!Array.isArray(translatedValues)) {
        logger.warning('Translation response is not an array', translatedValues);
        return fieldValue;
      }

      if (translatedValues.length !== textValues.length) {
        logger.warning(
          `Translation mismatch: got ${translatedValues.length} values, expected ${textValues.length}`,
          { original: textValues, translated: translatedValues }
        );
        return fieldValue;
      }

      // Reconstruct the inline text portion with the newly translated text
      const reconstructedObject = reconstructObject(
        fieldValueWithoutBlocks,
        translatedValues
      ) as StructuredTextNode[];

      // Insert block nodes back into their original positions
      let finalReconstructedObject = reconstructedObject;

      // If there are block nodes, translate them separately
      if (blockNodes.length > 0) {
        logger.info(`Translating ${blockNodes.length} block nodes`);
        
        // Key change: Pass the entire blockNodes array to translateFieldValue
        // and use 'rich_text' as the field type instead of translating each block separately
        const translatedBlockNodes = await translateFieldValue(
          blockNodes,
          pluginParams,
          toLocale,
          fromLocale,
          'rich_text', // Use rich_text instead of block
          openai,
          '',
          apiToken,
          '',
          streamCallbacks,
          recordContext
        ) as StructuredTextNode[];

        // Insert translated blocks back at their original positions
        for (const node of translatedBlockNodes) {
          if (node.originalIndex !== undefined) {
            finalReconstructedObject = insertObjectAtIndex(
              finalReconstructedObject,
              node,
              node.originalIndex
            );
          }
        }
      }

      // Remove temporary 'originalIndex' keys
      const cleanedReconstructedObject = (finalReconstructedObject as StructuredTextNode[]).map(
        ({ originalIndex, ...rest }) => rest
      );

      logger.info('Successfully translated structured text');
      return cleanedReconstructedObject;
    } catch (jsonError) {
      logger.error('Failed to parse translation response as JSON', jsonError);
      return fieldValue;
    }
  } catch (error) {
    logger.error('Structured text translation error', error);
    throw error;
  }
}
