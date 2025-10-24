// Maps Dato locales to DeepL language codes and checks formality support

const FORMALITY_SUPPORTED = new Set([
  'DE', 'FR', 'IT', 'ES', 'NL', 'PL', 'PT-PT', 'PT-BR' // DeepL docs list
]);

export function mapDatoToDeepL(locale: string, _mode: 'source'|'target'): string {
  if (!locale) return 'EN';
  const lc = locale.toLowerCase();
  // Normalize Chinese to ZH (DeepL uses ZH without script)
  if (lc.startsWith('zh')) return 'ZH';
  // Handle Portuguese variants
  if (lc.startsWith('pt-br')) return 'PT-BR';
  if (lc.startsWith('pt-pt') || lc === 'pt') return 'PT-PT';
  // English variants
  if (lc.startsWith('en-us')) return 'EN-US';
  if (lc.startsWith('en-gb')) return 'EN-GB';
  if (lc.startsWith('en')) return 'EN';
  // Spanish variants
  if (lc.startsWith('es')) return 'ES';
  if (lc.startsWith('fr')) return 'FR';
  if (lc.startsWith('it')) return 'IT';
  if (lc.startsWith('de')) return 'DE';
  if (lc.startsWith('nl')) return 'NL';
  if (lc.startsWith('pl')) return 'PL';
  if (lc.startsWith('ja')) return 'JA';
  if (lc.startsWith('ru')) return 'RU';
  // Fallback: uppercase first two letters
  const lang = lc.split('-')[0].toUpperCase();
  return lang.length === 2 ? lang : 'EN';
}

export function isFormalitySupported(target: string): boolean {
  return FORMALITY_SUPPORTED.has(target.toUpperCase());
}
