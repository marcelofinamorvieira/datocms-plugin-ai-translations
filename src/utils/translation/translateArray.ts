import type { TranslationProvider } from './types';
import { normalizeProviderError } from './ProviderErrors';
import { mapDatoToDeepL, isFormalitySupported } from './DeepLMap';

type Options = {
  isHTML?: boolean;
  formality?: 'default'|'more'|'less';
  recordContext?: string;
};

type TokenMap = { safe: string; orig: string }[];

function tokenize(text: string): { safe: string; map: TokenMap } {
  const patterns = [
    /\{\{[^}]+\}\}/g, // {{var}}
    /\{[^}]+\}/g,       // {var}
    /%[0-9]*\$?[sd]/g,  // %s, %1$s
    /:[a-zA-Z_][a-zA-Z0-9_-]*/g, // :slug
  ];
  const map: TokenMap = [];
  let safe = text;
  let idx = 0;
  for (const re of patterns) {
    safe = safe.replace(re, (m) => {
      const token = `⟦PH_${idx++}⟧`;
      map.push({ safe: token, orig: m });
      return token;
    });
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
      });
    } else {
      // Chat vendors: JSON-array prompt
      const from = fromLocale;
      const to = toLocale;
      const instruction = `Translate the following array of strings from ${from} to ${to}. Return ONLY a valid JSON array of the exact same length, preserving placeholders like {foo}, {{bar}}, and tokens like ⟦PH_0⟧. Do not explain.`;
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
