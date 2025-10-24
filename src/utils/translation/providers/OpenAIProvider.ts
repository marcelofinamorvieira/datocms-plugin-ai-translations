import OpenAI from 'openai';
import type { TranslationProvider, ProviderCapabilities, VendorId, StreamOptions } from '../types';

type OpenAIProviderConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  organization?: string;
};

export default class OpenAIProvider implements TranslationProvider {
  public readonly vendor: VendorId = 'openai';
  public readonly capabilities: ProviderCapabilities = { streaming: true };
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(cfg: OpenAIProviderConfig) {
    this.client = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseUrl,
      organization: cfg.organization,
      dangerouslyAllowBrowser: true,
    });
    this.model = cfg.model;
  }

  async *streamText(prompt: string, options?: StreamOptions): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      },
      { signal: options?.abortSignal }
    );

    for await (const chunk of stream) {
      const content = (chunk as any)?.choices?.[0]?.delta?.content || '';
      if (content) {
        yield content as string;
      }
    }
  }

  async completeText(prompt: string, options?: StreamOptions): Promise<string> {
    const resp = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      },
      { signal: options?.abortSignal }
    );
    return resp.choices?.[0]?.message?.content ?? '';
  }
}
