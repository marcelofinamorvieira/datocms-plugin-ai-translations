// StructuredTextTranslation.ts
// ------------------------------------------------------
// This file manages translations of structured text fields, including
// extracting text nodes, translating block nodes, and reassembling.

import type OpenAI from 'openai';
import locale from 'locale-codes';
import type { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';
import { translateFieldValue } from './TranslateField';
import {
  extractTextValues,
  insertObjectAtIndex,
  reconstructObject,
} from './utils';
import { removeIds } from './utils';

type StreamCallbacks = {
  onStream?: (chunk: string) => void;
  onComplete?: () => void;
};

/**
 * Translates a structured text field, also handling block nodes that can contain nested fields.
 * @param fieldValue - the structured text data array.
 * @param pluginParams - plugin parameters for the model configuration.
 * @param toLocale - target locale code.
 * @param fromLocale - source locale code.
 * @param openai - instance of the OpenAI client.
 * @param apiToken - DatoCMS user access token for fetching block structures.
 * @param streamCallbacks - optional stream callbacks for handling translation progress.
 * @returns updated structured text data with all strings translated.
 */
export async function translateStructuredTextValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  apiToken: string,
  streamCallbacks?: StreamCallbacks
): Promise<unknown> {
  const noIdFieldValue = removeIds(fieldValue);

  // Define specific types for structured text nodes
  type StructuredTextNode = {
    type?: string;
    [key: string]: unknown;
  };

  type BlockNode = StructuredTextNode & {
    originalIndex: number;
  };

  const noIdFieldValueArray = noIdFieldValue as StructuredTextNode[];
  
  const blockNodes = noIdFieldValueArray.reduce<BlockNode[]>(
    (acc, node, index) => {
      if (node?.type === 'block') {
        acc.push({ ...node, originalIndex: index });
      }
      return acc;
    },
    []
  );

  const fieldValueWithoutBlocks = noIdFieldValueArray.filter(
    (node: StructuredTextNode) => node?.type !== 'block'
  );

  const textValues = extractTextValues(fieldValueWithoutBlocks);

  const fromLocaleName = locale.getByTag(fromLocale)?.name || fromLocale;
  const toLocaleName = locale.getByTag(toLocale)?.name || toLocale;
  let prompt = pluginParams.prompt
    .replace(
      '{fieldValue}',
      `translate the following string array ${JSON.stringify(
        textValues,
        null,
        2
      )}`
    )
    .replace('{fromLocale}', fromLocaleName)
    .replace('{toLocale}', toLocaleName);

  prompt += '\nReturn the translated strings array in a valid JSON format. The number of returned strings should match the original. Do not trim any empty strings or spaces. Return just the array of strings, do not nest the array into an object.  The number of returned strings should match the original. Spaces and empty strings should remain unaltered. Do not remove any empty strings or spaces.';

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

    // Parse the inline translations array
    const returnedTextValues = JSON.parse(translatedText || '[]');

    // Reconstruct the inline text portion with the newly translated text
    const reconstructedObject = reconstructObject(
      fieldValueWithoutBlocks,
      returnedTextValues
    );

    let finalReconstructedObject = reconstructedObject;

    if (blockNodes.length > 0) {
      // Translate block nodes individually using translateFieldValue
      const translatedBlockNodes = await translateFieldValue(
        blockNodes,
        pluginParams,
        toLocale,
        fromLocale,
        'rich_text',
        openai,
        '',
        apiToken,
        '',
        streamCallbacks
      ) as BlockNode[];
      for (const node of translatedBlockNodes) {
        finalReconstructedObject = insertObjectAtIndex(
          finalReconstructedObject as StructuredTextNode[],
          node,
          node.originalIndex
        );
      }
    }

    // Remove temporary 'originalIndex' keys
    const cleanedReconstructedObject = (finalReconstructedObject as StructuredTextNode[]).map(
      ({
        originalIndex,
        ...rest
      }: {
        originalIndex?: number;
        [key: string]: unknown;
      }) => rest
    );

    return cleanedReconstructedObject;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}
