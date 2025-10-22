/**
 * Utilities for creating and configuring API clients
 */
import { buildClient } from '@datocms/cma-client-browser';
import OpenAI from 'openai';

/**
 * Creates a DatoCMS CMA client with the provided access token and environment.
 *
 * @param accessToken - Current user API token.
 * @param environment - Dato environment slug.
 * @returns A configured CMA client instance.
 */
export function buildDatoCMSClient(accessToken: string, environment: string) {
  return buildClient({
    apiToken: accessToken,
    environment
  });
}

/**
 * Creates an OpenAI client with the provided API key.
 *
 * @param apiKey - OpenAI API Key provided via plugin settings.
 * @returns A configured OpenAI client instance.
 */
export function createOpenAIClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true
  });
}
