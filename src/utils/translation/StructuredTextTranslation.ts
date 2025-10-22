/**
 * StructuredTextTranslation.ts
 * ------------------------------------------------------
 * This file manages translations of structured text fields from DatoCMS.
 * It handles extracting text nodes, translating block nodes, and reassembling
 * the content after translation while preserving the original structure.
 * 
 * The module provides functionality to:
 * - Extract and track text values from structured text nodes
 * - Process block nodes separately to maintain rich formatting
 * - Translate content while preserving structure
 * - Handle streaming responses from OpenAI API
 */

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

/**
 * Callback interfaces for handling streaming responses.
 */
type StreamCallbacks = {
  onStream?: (chunk: string) => void;
  onComplete?: () => void;
  checkCancellation?: () => boolean;
  abortSignal?: AbortSignal;
};

/**
 * Interface representing a structured text node from DatoCMS.
 * Includes standard properties and allows for additional dynamic properties.
 */
interface StructuredTextNode {
  type?: string;
  value?: string;
  item?: string;
  originalIndex?: number;
  [key: string]: unknown;
}

/**
 * Ensures the array lengths match, with fallback strategies if they don't
 * 
 * @param originalValues - Original array of text values.
 * @param translatedValues - Translated array that might need adjustment.
 * @returns Adjusted translated values array matching original length.
 */
function ensureArrayLengthsMatch(originalValues: string[], translatedValues: string[]): string[] {
  if (originalValues.length === translatedValues.length) {
    return translatedValues;
  }
  
  // If too few elements, pad with values from the original array
  if (translatedValues.length < originalValues.length) {
    return [
      ...translatedValues,
      ...originalValues.slice(translatedValues.length).map(val => 
        // If it's an empty string, keep it empty
        // Otherwise use the original value
        val.trim() === '' ? '' : val
      )
    ];
  }
  
  // If too many elements, truncate to match original length
  return translatedValues.slice(0, originalValues.length);
}

/**
 * Translates a structured text field value while preserving its structure
 * 
 * @param initialValue - The structured text field value to translate
 * @param pluginParams - Plugin configuration parameters
 * @param toLocale - Target locale code
 * @param fromLocale - Source locale code
 * @param openai - OpenAI client instance
 * @param apiToken - DatoCMS API token
 * @param environment - Dato environment
 * @param streamCallbacks - Optional callbacks for streaming responses
 * @param recordContext - Optional context about the record being translated
 * @returns The translated structured text value
 */
export async function translateStructuredTextValue(
  initialValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  apiToken: string,
  environment: string,
  streamCallbacks?: StreamCallbacks,
  recordContext = ''
): Promise<unknown> {
  // Create logger
  const logger = createLogger(pluginParams, 'StructuredTextTranslation');
  
  let fieldValue = initialValue;
  let isAPIResponse = false;

  if((fieldValue as { document: { children: unknown[] } })?.document?.children?.length) {
    fieldValue = (fieldValue as { document: { children: unknown[] } })?.document?.children
    isAPIResponse = true
  }

  // Skip translation if null or not an array
  if (!fieldValue || (!Array.isArray(fieldValue) || fieldValue.length === 0)) {
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

  // Clear, explicit instructions for array handling
  prompt += `
IMPORTANT: Your response must be a valid JSON array of strings with EXACTLY ${textValues.length} elements. Each element corresponds to the same position in the original array.
- Preserve ALL empty strings - do not remove or modify them
- Maintain the exact array length
- Return only the array of strings in valid JSON format
- Do not nest the array in an object
- Preserve all whitespace and spacing patterns`;

  // Log the prompt being sent
  logger.logPrompt('Structured text translation prompt', prompt);

  try {
    let translatedText = '';
    const stream = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: pluginParams.gptModel,
      stream: true,
    }, {
      // Enable aborting the streaming request
      signal: streamCallbacks?.abortSignal,
    });

    for await (const chunk of stream) {
      // Cooperative cancellation
      if (streamCallbacks?.checkCancellation?.()) {
        logger.info('Structured text translation cancelled by user');
        if (streamCallbacks?.onComplete) {
          streamCallbacks.onComplete();
        }
        return fieldValue; // return original content
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

    // Log response
    logger.logResponse('Structured text translation response', translatedText);

    try {
      // Clean up response text to handle cases where API might return non-JSON format
      const cleanedTranslatedText = translatedText.trim()
        // If response starts with backticks (code block), remove them
        .replace(/^```json\n/, '')
        .replace(/^```\n/, '')
        .replace(/\n```$/, '');
      
      const translatedValues = JSON.parse(cleanedTranslatedText);

      if (!Array.isArray(translatedValues)) {
        logger.warning('Translation response is not an array', translatedValues);
        return fieldValue;
      }

      // Check for length mismatch and attempt recovery
      let processedTranslatedValues = translatedValues;
      
      if (translatedValues.length !== textValues.length) {
        logger.warning(
          `Translation mismatch: got ${translatedValues.length} values, expected ${textValues.length}`,
          { original: textValues, translated: translatedValues }
        );
        
        // Try to fix the length mismatch rather than abandoning the translation
        processedTranslatedValues = ensureArrayLengthsMatch(textValues, translatedValues);
        
        logger.info('Adjusted translated values to match original length', {
          adjustedLength: processedTranslatedValues.length
        });
      }

      // Reconstruct the inline text portion with the newly translated text
      const reconstructedObject = reconstructObject(
        fieldValueWithoutBlocks,
        processedTranslatedValues
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
          environment,
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

      if(isAPIResponse) {
        return {
          document: {
            children: cleanedReconstructedObject,
            type: "root"
          },
          schema: "dast"
        }
      }

      logger.info('Successfully translated structured text');
      return cleanedReconstructedObject;
    } catch (jsonError) {
      logger.error('Failed to parse translation response as JSON', jsonError);
      // More descriptive error information to help with debugging
      logger.error('Raw response text', { text: translatedText });
      return fieldValue;
    }
  } catch (error) {
    logger.error('Error during structured text translation', error);
    return fieldValue;
  }
}
