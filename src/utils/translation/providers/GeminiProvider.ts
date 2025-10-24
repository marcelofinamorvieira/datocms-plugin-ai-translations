import type { TranslationProvider, ProviderCapabilities, VendorId, StreamOptions } from '../types';
import { GoogleGenerativeAI } from '@google/generative-ai';

type GeminiProviderConfig = {
  apiKey: string;
  model: string;
  // Optional knobs for future parity; unused for now
  temperature?: number;
  maxOutputTokens?: number;
};

export default class GeminiProvider implements TranslationProvider {
  public readonly vendor: VendorId = 'google';
  public readonly capabilities: ProviderCapabilities = { streaming: true };
  private readonly genAI: GoogleGenerativeAI;
  private readonly modelId: string;
  private readonly temperature?: number;
  private readonly maxOutputTokens?: number;

  constructor(cfg: GeminiProviderConfig) {
    this.genAI = new GoogleGenerativeAI(cfg.apiKey);
    this.modelId = cfg.model;
    this.temperature = cfg.temperature;
    this.maxOutputTokens = cfg.maxOutputTokens;
  }

  async *streamText(prompt: string, _options?: StreamOptions): AsyncIterable<string> {
    const model = this.genAI.getGenerativeModel({ model: this.modelId });
    // gemini expects a parts/contents structure
    const request = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: this.temperature,
        maxOutputTokens: this.maxOutputTokens,
      },
    } as any;

    const result = await model.generateContentStream(request);
    for await (const item of result.stream) {
      const text = (item as any).text?.();
      if (text) {
        yield text as string;
      }
    }
  }

  async completeText(prompt: string, _options?: StreamOptions): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: this.modelId });
    const request = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: this.temperature,
        maxOutputTokens: this.maxOutputTokens,
      },
    } as any;
    const result = await model.generateContent(request);
    return result.response?.text?.() ?? '';
  }
}
