import type { TranslationProvider } from './types';
import OpenAIProvider from './providers/OpenAIProvider';
import GeminiProvider from './providers/GeminiProvider';
import AnthropicProvider from './providers/AnthropicProvider';
import DeepLProvider from './providers/DeepLProvider';
import type { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';

// Simple memoization by key to avoid recreating clients excessively
const cache = new Map<string, TranslationProvider>();

export function getProvider(pluginParams: ctxParamsType): TranslationProvider {
  const vendor = (pluginParams as any).vendor ?? 'openai';

  if (vendor === 'google') {
    const apiKey = (pluginParams as any).googleApiKey || '';
    const model = (pluginParams as any).geminiModel || '';
    if (apiKey && model) {
      const key = `google:${apiKey}:${model}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const provider = new GeminiProvider({ apiKey, model });
      cache.set(key, provider);
      return provider;
    }
    // Fallback to OpenAI if Google is selected but incomplete
  }

  if (vendor === 'anthropic') {
    const apiKey = (pluginParams as any).anthropicApiKey || '';
    const model = (pluginParams as any).anthropicModel || '';
    if (apiKey && model) {
      const key = `anthropic:${apiKey}:${model}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const provider = new AnthropicProvider({ apiKey, model });
      cache.set(key, provider);
      return provider;
    }
  }

  if (vendor === 'deepl') {
    const apiKey = '';
    const useFreeToggle = (pluginParams as any).deeplUseFree === true;
    const endpointSetting = (pluginParams as any).deeplEndpoint || 'auto';
    // Resolve endpoint: honor explicit setting; otherwise decide based on toggle or key suffix (:fx = Free)
    const shouldUseFree = endpointSetting === 'free'
      ? true
      : endpointSetting === 'pro'
      ? false
      : (useFreeToggle || /:fx\b/i.test(apiKey));
    const baseUrl = shouldUseFree ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
    const proxyUrl = (pluginParams as any).deeplProxyUrl || '';
    if (proxyUrl) {
      const key = `deepl:${apiKey}:${baseUrl}:${proxyUrl}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const provider = new DeepLProvider({ apiKey, baseUrl, proxyUrl: proxyUrl || undefined });
      cache.set(key, provider);
      return provider;
    }
  }

  // Default / OpenAI path
  const apiKey = pluginParams.apiKey;
  const model = pluginParams.gptModel;
  const key = `openai:${apiKey}:${model}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const provider = new OpenAIProvider({ apiKey, model });
  cache.set(key, provider);
  return provider;
}
