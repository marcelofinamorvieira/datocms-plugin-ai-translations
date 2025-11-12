/**
 * Vendor-agnostic utility to translate an array of strings, preserving
 * placeholders and formatting tokens. Uses vendor-specific array APIs when
 * available (DeepL) and falls back to a JSON-array prompting strategy for
 * chat models (OpenAI, Gemini, Anthropic).
 */
import type { TranslationProvider } from './types';
import { normalizeProviderError } from './ProviderErrors';
import { mapDatoToDeepL, isFormalitySupported } from './DeepLMap';
import { resolveGlossaryId } from './DeepLGlossary';

type Options = {
  isHTML?: boolean;
  formality?: 'default'|'more'|'less';
  recordContext?: string;
};

type TokenMap = { safe: string; orig: string }[];

/**
 * Checks if a curly brace section is an ICU message format.
 * ICU messages have the pattern: \{variable, type, ...\}
 * where type is one of: plural, select, selectordinal, number, date, time
 * 
 * @param text - The text to check for ICU message format
 * @returns True if the text is an ICU message format
 */
function isICUMessage(text: string): boolean {
  // Match ICU format: {variable, type, ...}
  // The variable name followed by comma, then a known ICU type
  const icuPattern = /^\{[^,}]+,\s*(plural|select|selectordinal|number|date|time)\s*,/;
  return icuPattern.test(text);
}

/**
 * Extracts the complete ICU message from text starting at a given position.
 * Handles nested braces by counting depth.
 * 
 * @param text - The text to extract from
 * @param startPos - The starting position in the text
 * @returns An object with the extracted message and end position, or null if not an ICU message
 */
function extractICUMessage(text: string, startPos: number): { message: string; endPos: number } | null {
  if (text[startPos] !== '{') return null;
  
  let depth = 0;
  let i = startPos;
  
  while (i < text.length) {
    if (text[i] === '{') {
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        const message = text.substring(startPos, i + 1);
        if (isICUMessage(message)) {
          return { message, endPos: i + 1 };
        }
        return null;
      }
    }
    i++;
  }
  
  return null;
}

function tokenize(text: string): { safe: string; map: TokenMap } {
  const map: TokenMap = [];
  let safe = text;
  let idx = 0;
  
  // First pass: temporarily protect ICU messages from being matched by placeholder patterns
  // We'll use a special marker that won't match any of our patterns
  const icuProtections: Array<{ marker: string; original: string }> = [];
  let i = 0;
  
  while (i < safe.length) {
    if (safe[i] === '{') {
      const icuMatch = extractICUMessage(safe, i);
      if (icuMatch) {
        // Replace ICU message with a temporary marker
        const marker = `⟪ICU_${icuProtections.length}⟫`;
        icuProtections.push({ marker, original: icuMatch.message });
        safe = safe.substring(0, i) + marker + safe.substring(icuMatch.endPos);
        i += marker.length;
        continue;
      }
    }
    i++;
  }
  
  // Second pass: apply standard placeholder patterns
  // ICU messages are now protected and won't be matched
  const patterns = [
    /\{\{[^}]+\}\}/g, // {{var}}
    /\{[^}]+\}/g,     // {var}
    /%[0-9]*\$?[sd]/g,  // %s, %1$s
    /:[a-zA-Z_][a-zA-Z0-9_-]*/g, // :slug
  ];
  
  for (const re of patterns) {
    safe = safe.replace(re, (m) => {
      const token = `⟦PH_${idx++}⟧`;
      map.push({ safe: token, orig: m });
      return token;
    });
  }
  
  // Third pass: restore ICU messages
  for (const { marker, original } of icuProtections) {
    safe = safe.split(marker).join(original);
  }
  
  return { safe, map };
}

function detokenize(text: string, map: TokenMap): string {
  let out = text;
  for (const { safe, orig } of map) {
    out = out.split(safe).join(orig);
  }
  return out;
}

/**
 * Translates an array of string segments from one locale to another.
 * Placeholders like `\{\{var\}\}`, `\{slug\}` and printf-style tokens are protected
 * before sending to the provider and restored afterward.
 * 
 * ICU message format strings (e.g., `\{count, plural, =0 \{text\} other \{text\}\}`)
 * are preserved and passed to the AI for translation, allowing the model to
 * translate the content within while maintaining the ICU structure.
 *
 * @param provider - Active translation provider.
 * @param pluginParams - Plugin configuration and vendor-specific flags.
 * @param segments - String segments to translate, kept in order.
 * @param fromLocale - Source locale code (e.g. "en").
 * @param toLocale - Target locale code (e.g. "pt-BR").
 * @param opts - Options such as HTML mode and formality.
 * @returns Translated segments with placeholders restored.
 */
export async function translateArray(
  provider: TranslationProvider,
  pluginParams: any,
  segments: string[],
  fromLocale: string,
  toLocale: string,
  opts: Options = {}
): Promise<string[]> {
  if (!Array.isArray(segments) || segments.length === 0) return segments;

  // Protect placeholders
  const tokenMaps: TokenMap[] = [];
  const protectedSegments = segments.map((s) => {
    const { safe, map } = tokenize(String(s ?? ''));
    tokenMaps.push(map);
    return safe;
  });

  try {
    let out: string[] = [];
    if ((provider as any).vendor === 'deepl' && typeof (provider as any).translateArray === 'function') {
      // DeepL native array translation
      const deepL = provider as any;
      const target = mapDatoToDeepL(toLocale, 'target');
      const source = fromLocale ? mapDatoToDeepL(fromLocale, 'source') : undefined;
      const formality = opts.formality && isFormalitySupported(target) ? opts.formality : undefined;
      out = await deepL.translateArray(protectedSegments, {
        sourceLang: source,
        targetLang: target,
        isHTML: !!opts.isHTML,
        formality,
        preserveFormatting: pluginParams?.deeplPreserveFormatting !== false,
        ignoreTags: ['notranslate', 'ph'],
        nonSplittingTags: ['a','code','pre','strong','em','ph','notranslate'],
        splittingTags: [],
        glossaryId: resolveGlossaryId(pluginParams, fromLocale, toLocale),
      });
    } else {
      // Chat vendors: JSON-array prompt
      const from = fromLocale;
      const to = toLocale;
      const instruction = `Translate the following array of strings from ${from} to ${to}. Return ONLY a valid JSON array of the exact same length, preserving placeholders like {foo}, {{bar}}, and tokens like ⟦PH_0⟧. For ICU message format (e.g., {count, plural, ...}), translate only the text content within the nested braces while preserving the ICU structure. Do not explain.`;
      const arrayLiteral = JSON.stringify(protectedSegments);
      const prompt = `${instruction}\n${arrayLiteral}`;
      const txt = await provider.completeText(prompt);
      // Parse result safely
      let arr: unknown = [];
      try { arr = JSON.parse((txt || '').trim()); } catch {
        // hard repair: try to extract between first [ and last ]
        const start = txt.indexOf('[');
        const end = txt.lastIndexOf(']');
        arr = start >=0 && end>start ? JSON.parse(txt.slice(start, end+1)) : [];
      }
      if (!Array.isArray(arr)) throw new Error('Model did not return a JSON array');
      // Length repair
      const fixed: string[] = [];
      for (let i=0; i<segments.length; i++) {
        const v = arr[i];
        fixed.push(typeof v === 'string' ? v : String(segments[i] ?? ''));
      }
      out = fixed;
    }

    // Reinsert tokens
    return out.map((t, i) => detokenize(String(t ?? ''), tokenMaps[i]));
  } catch (error) {
    const norm = normalizeProviderError(error, (provider as any).vendor || 'openai');
    throw new Error(norm.message);
  }
}
