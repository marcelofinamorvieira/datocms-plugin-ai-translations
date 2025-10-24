import type { TranslationProvider, ProviderCapabilities, VendorId, StreamOptions } from '../types';

type DeepLTranslateOpts = {
  sourceLang?: string;
  targetLang: string;
  isHTML?: boolean;
  formality?: 'default'|'more'|'less';
  preserveFormatting?: boolean;
  ignoreTags?: string[];
  nonSplittingTags?: string[];
  splittingTags?: string[];
};

/**
 * DeepL API provider with native array translation support. Uses fetch
 * directly and supports optional proxy URL routing.
 */
export default class DeepLProvider implements TranslationProvider {
  public readonly vendor: VendorId = 'deepl';
  public readonly capabilities: ProviderCapabilities = { streaming: false };
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly proxyUrl?: string;

  /**
   * Creates a DeepL provider bound to a base endpoint or proxy.
   *
   * @param cfg - API key and optional base/proxy URLs.
   */
  constructor(cfg: { apiKey: string; baseUrl?: string; proxyUrl?: string }) {
    this.apiKey = cfg.apiKey;
    this.baseUrl = (cfg.baseUrl || 'https://api.deepl.com');
    this.proxyUrl = cfg.proxyUrl;
  }

  /**
   * Emits a single completion to satisfy the streaming interface.
   *
   * @param prompt - Prompt text to translate.
   * @param options - Optional abort signal (unused).
   */
  async *streamText(prompt: string, options?: StreamOptions): AsyncIterable<string> {
    const txt = await this.completeText(prompt, options);
    if (txt) yield txt;
  }

  /**
   * Fallback single-string translation implemented in terms of the array API.
   *
   * @param prompt - Text to translate.
   * @param _options - Optional abort signal (unused).
   * @returns Translated text in English.
   */
  async completeText(prompt: string, _options?: StreamOptions): Promise<string> {
    // Fallback single-string translation via DeepL
    const arr = await this.translateArray([prompt], { targetLang: 'EN' });
    return arr[0] || '';
  }

  /**
   * Translates an array of segments using the DeepL JSON API.
   *
   * @param segments - String segments to translate.
   * @param opts - Translation options including languages and HTML handling.
   * @returns Translated segments in order.
   */
  async translateArray(segments: string[], opts: DeepLTranslateOpts): Promise<string[]> {
    if (!segments.length) return segments;
    const url = (this.proxyUrl || this.baseUrl).replace(/\/$/, '') + '/v2/translate';
    const out: string[] = new Array(segments.length);
    const batchSize = 45;
    const headers: Record<string,string> = { 'content-type': 'application/json' };
    if (!this.proxyUrl) headers['Authorization'] = `DeepL-Auth-Key ${this.apiKey}`;

    for (let i=0; i<segments.length; i+=batchSize) {
      const slice = segments.slice(i, i+batchSize);
      const postUrl = this.proxyUrl
        ? this.proxyUrl.replace(/\/$/, '') + '/v2/translate'
        : url;
      const body: Record<string, unknown> = {
        text: slice,
        target_lang: opts.targetLang,
      };
      if (opts.sourceLang) body.source_lang = opts.sourceLang;
      if (opts.isHTML) body.tag_handling = 'html';
      if (opts.formality && opts.formality !== 'default') body.formality = opts.formality;
      // JSON API expects a boolean here; using '0'/'1' causes
      // "Value for 'preserve_formatting' not supported".
      body.preserve_formatting = opts.preserveFormatting !== false;
      if (opts.ignoreTags?.length) body.ignore_tags = opts.ignoreTags;
      if (opts.nonSplittingTags?.length) body.non_splitting_tags = opts.nonSplittingTags;
      if (opts.splittingTags?.length) body.splitting_tags = opts.splittingTags;

      const res = await fetch(postUrl, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        let msg = res.statusText;
        try { const err = await res.json(); msg = err?.message || err?.error?.message || msg; } catch {}
        if (/wrong endpoint/i.test(msg)) {
          const isFreeKey = /:fx\b/i.test(this.apiKey);
          const usingPro = /api\.deepl\.com/i.test(this.baseUrl);
          const hint = isFreeKey && usingPro
            ? 'Your key looks like a Free key (:fx), but the Pro endpoint is configured. In Settings → DeepL, enable "Use DeepL Free endpoint (api-free.deepl.com)".'
            : (!isFreeKey && /api-free\.deepl\.com/i.test(this.baseUrl))
            ? 'A Pro key is being used with the Free endpoint. In Settings → DeepL, disable "Use DeepL Free endpoint" to use api.deepl.com.'
            : 'Ensure the endpoint matches your plan: api-free.deepl.com for Free (:fx) keys; api.deepl.com for Pro.';
          msg = `DeepL: wrong endpoint for your API key. ${hint}`;
        }
        const e = new Error(msg);
        (e as any).status = res.status;
        throw e;
      }
      const data = await res.json();
      const translations: string[] = Array.isArray(data?.translations) ? data.translations.map((t: any) => String(t?.text ?? '')) : [];
      for (let j=0; j<slice.length; j++) out[i+j] = translations[j] ?? slice[j];
    }
    return out;
  }
}
