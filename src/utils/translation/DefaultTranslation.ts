// DefaultTranslation.ts
// ------------------------------------------------------
// This file provides translation logic for simple text fields,
// such as single_line, markdown, JSON, etc. It uses the
// configured OpenAI model to translate from one locale to another.

import OpenAI from 'openai';
import locale from 'locale-codes';
import { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';

/**
 * Translate a simple textual field value (string-based).
 * @param fieldValue - current field value to translate.
 * @param pluginParams - plugin parameters containing model config.
 * @param toLocale - target locale for translation.
 * @param fromLocale - source locale for translation.
 * @param openai - instance of the OpenAI client.
 * @param fieldTypePrompt - instructions to format the return data properly.
 * @returns translated field value as a string or JSON string as needed.
 */
export async function translateDefaultFieldValue(
  fieldValue: unknown,
  pluginParams: ctxParamsType,
  toLocale: string,
  fromLocale: string,
  openai: OpenAI,
  fieldTypePrompt: string,
): Promise<string> {
  // Use locale-codes for locale names
  const fromLocaleName = locale.getByTag(fromLocale)?.name || fromLocale;
  const toLocaleName = locale.getByTag(toLocale)?.name || toLocale;

  // Construct prompt
  let formattedPrompt = pluginParams.prompt
    .replace('{fieldValue}', String(fieldValue))
    .replace('{fromLocale}', fromLocaleName)
    .replace('{toLocale}', toLocaleName);

  formattedPrompt += `\n${fieldTypePrompt}`;

  // Send request to OpenAI
  const completion = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: formattedPrompt,
      },
    ],
    model: pluginParams.gptModel,
  });

  // Handle special JSON responses
  if (
    fieldTypePrompt ===
    'Return the response in the format of A valid JSON string. Only return the json string, nothing else'
  ) {
    return completion.choices[0].message.content || '';
  }

  // Strip extra quotes if any
  return (completion.choices[0].message.content || '').replace(/"/g, '');
}