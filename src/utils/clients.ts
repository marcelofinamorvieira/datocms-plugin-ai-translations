/**
 * Utilities for creating and configuring API clients
 */
import { buildClient } from '@datocms/cma-client-browser';
import OpenAI from 'openai';

/**
 * Creates a DatoCMS client with the provided access token
 */
export function buildDatoCMSClient(accessToken: string) {
  return buildClient({
    apiToken: accessToken
  });
}

/**
 * Creates an OpenAI client with the provided API key
 */
export function createOpenAIClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true
  });
}
