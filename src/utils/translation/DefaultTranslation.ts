// DefaultTranslation.ts
// ------------------------------------------------------
// This file provides translation logic for simple text fields,
// such as single_line, markdown, JSON, etc. It uses the
// configured OpenAI model to translate from one locale to another.

import type OpenAI from 'openai';
import type { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';

type StreamCallbacks = {
  onStream?: (chunk: string) => void;
  onComplete?: () => void;
};

export async function translateDefaultFieldValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  fieldTypePrompt: string,
  streamCallbacks?: StreamCallbacks
): Promise<unknown> {
  if (!fieldValue || typeof fieldValue !== 'string') {
    return fieldValue;
  }

  const prompt = `Translate the following text from ${fromLocale} to ${toLocale}. ${fieldTypePrompt}:\n\n${fieldValue}`;

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

    return translatedText;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}
