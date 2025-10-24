import type { TranslationProvider, ProviderCapabilities, VendorId, StreamOptions } from '../types';

type AnthropicProviderConfig = {
  apiKey: string;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
  baseUrl?: string; // optional override
};

export default class AnthropicProvider implements TranslationProvider {
  public readonly vendor: VendorId = 'anthropic';
  public readonly capabilities: ProviderCapabilities = { streaming: false };
  private readonly apiKey: string;
  private readonly model: string;
  private readonly temperature?: number;
  private readonly maxOutputTokens?: number;
  private readonly baseUrl: string;

  constructor(cfg: AnthropicProviderConfig) {
    this.apiKey = cfg.apiKey;
    this.model = cfg.model;
    this.temperature = cfg.temperature;
    this.maxOutputTokens = cfg.maxOutputTokens ?? 1024;
    this.baseUrl = cfg.baseUrl ?? 'https://api.anthropic.com/v1/messages';
  }

  async *streamText(prompt: string, options?: StreamOptions): AsyncIterable<string> {
    // Non-streaming implementation: yield the final text once.
    const txt = await this.completeText(prompt, options);
    if (txt) {
      yield txt;
    }
  }

  async completeText(prompt: string, options?: StreamOptions): Promise<string> {
    const controller = new AbortController();
    const signal = options?.abortSignal;
    if (signal) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const body = {
      model: this.model,
      max_output_tokens: this.maxOutputTokens,
      temperature: this.temperature,
      messages: [
        { role: 'user', content: prompt }
      ],
    } as Record<string, unknown>;

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      let msg = res.statusText;
      try {
        const err = await res.json();
        msg = err?.error?.message || msg;
      } catch {}
      const e = new Error(msg);
      (e as any).status = res.status;
      throw e;
    }

    const data = await res.json();
    const parts: string[] = [];
    const content = Array.isArray(data?.content) ? data.content : [];
    for (const c of content) {
      if (c?.type === 'text' && typeof c?.text === 'string') {
        parts.push(c.text);
      }
    }
    return parts.join('');
  }
}

