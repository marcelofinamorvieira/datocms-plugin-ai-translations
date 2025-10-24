// Vendor-agnostic translation types and interfaces
// -------------------------------------------------

export type VendorId = 'openai' | 'google' | 'anthropic' | 'deepl';

export interface ProviderCapabilities {
  streaming: boolean;
}

export interface StreamOptions {
  abortSignal?: AbortSignal;
}

export interface TranslationProvider {
  readonly vendor: VendorId;
  readonly capabilities: ProviderCapabilities;
  streamText(prompt: string, options?: StreamOptions): AsyncIterable<string>;
  completeText(prompt: string, options?: StreamOptions): Promise<string>;
}
