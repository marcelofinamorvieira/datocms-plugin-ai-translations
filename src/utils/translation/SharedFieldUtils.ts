/**
 * SharedFieldUtils.ts
 * Small, side-effect-free helpers shared by form and CMA flows.
 */

import { fieldPrompt } from '../../prompts/FieldPrompts';
import { findExactLocaleKey } from './TranslateField';

/**
 * Field metadata dictionary keyed by field API key.
 */
export type FieldTypeDictionary = Record<string, { editor: string; id: string; isLocalized: boolean }>;

/**
 * Builds the field-type specific prompt snippet used to instruct the model
 * on the expected return format.
 *
 * Structured and rich text fields use specialized translators, so they
 * intentionally skip the fieldPrompt mapping.
 *
 * @param fieldType - The DatoCMS editor identifier for the field.
 * @returns The prompt suffix describing the desired return format.
 */
export function prepareFieldTypePrompt(fieldType: string): string {
  let fieldTypePrompt = 'Return the response in the format of ';
  if (fieldType !== 'structured_text' && fieldType !== 'rich_text') {
    fieldTypePrompt += fieldPrompt[fieldType as keyof typeof fieldPrompt] || '';
  }
  return fieldTypePrompt;
}

/**
 * Resolves the exact-cased locale key inside a localized value object and
 * returns its corresponding value.
 *
 * @param fieldData - A localized value object, e.g. `{ en: 'Hello', 'pt-BR': 'Olá' }`.
 * @param fromLocale - The desired source locale (case-insensitive).
 * @returns The value for the exact-matching locale key, or undefined if absent.
 */
export function getExactSourceValue(
  fieldData: Record<string, unknown> | undefined,
  fromLocale: string
): unknown {
  if (!fieldData || typeof fieldData !== 'object') return undefined;
  const exact = findExactLocaleKey(fieldData as Record<string, unknown>, fromLocale);
  return exact ? (fieldData as Record<string, unknown>)[exact] : undefined;
}
