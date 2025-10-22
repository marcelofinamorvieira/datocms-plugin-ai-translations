/**
 * translateRecordFields.ts
 * ------------------------------------------------------
 * This module provides functionality for batch translating all localizable fields
 * in a DatoCMS record from a source locale to multiple target locales.
 * 
 * The module orchestrates the translation process by:
 * 1. Filtering fields to identify which ones are localizable and translatable
 * 2. Managing the translation workflow for each field-locale combination
 * 3. Providing real-time progress updates via callbacks
 * 4. Supporting cancellation of in-progress translations
 * 5. Automatically updating form values with translated content
 * 
 * This serves as the foundation for the record-level translation features in the plugin.
 *
 * See also: `buildTranslatedUpdatePayload` in
 * `src/utils/translation/ItemsDropdownUtils.ts` for the table/bulk flow that
 * operates on CMA records and returns an update payload instead of writing to
 * the form via `ctx.setFieldValue(...)`.
 */

import type { RenderItemFormSidebarPanelCtx } from 'datocms-plugin-sdk';
import OpenAI from 'openai';
import {
  type ctxParamsType,
  modularContentVariations,
} from '../entrypoints/Config/ConfigScreen';
import { prepareFieldTypePrompt, getExactSourceValue } from './translation/SharedFieldUtils';
import { translateFieldValue, generateRecordContext } from './translation/TranslateField';
import { createLogger } from './logging/Logger';

// Options for the translation process. Provides callback hooks that allow the
// UI to respond to translation events and enables cancellation support for
// long-running translations.
type TranslateOptions = {
  onStart?: (fieldLabel: string, locale: string, fieldPath: string) => void;
  onComplete?: (fieldLabel: string, locale: string, fieldPath: string) => void;
  onStream?: (
    fieldLabel: string,
    locale: string,
    fieldPath: string,
    content: string
  ) => void;
  checkCancellation?: () => boolean;
  abortSignal?: AbortSignal;
};

// Represents a map where keys are locale codes and values are the field
// content in that specific locale.
interface LocalizedField {
  [locale: string]: unknown;
}

/**
 * Translates all eligible fields in a record to multiple target locales
 * 
 * This function is the main entry point for batch translating record fields. It:
 * 1. Identifies which fields are localizable and configured for translation
 * 2. Extracts values from the source locale
 * 3. Translates each field to each target locale using the appropriate specialized translator
 * 4. Updates the form values with the translated content
 * 5. Provides progress feedback through the supplied callback functions
 * 
 * Translation can be cancelled at any point using the checkCancellation callback
 * or the abortSignal.
 * 
 * @param ctx - DatoCMS sidebar context providing access to form values and fields
 * @param pluginParams - Plugin configuration parameters
 * @param targetLocales - Array of locale codes to translate into
 * @param sourceLocale - Source locale code to translate from
 * @param options - Optional callbacks and cancellation controls
 * @returns Resolves when all translations are complete or cancelled
 */
export async function translateRecordFields(
  ctx: RenderItemFormSidebarPanelCtx,
  pluginParams: ctxParamsType,
  targetLocales: string[],
  sourceLocale: string,
  options: TranslateOptions = {}
): Promise<void> {
  const logger = createLogger(pluginParams, 'translateRecordFields');
  // Initialize OpenAI client for translation
  const openai = new OpenAI({
    apiKey: pluginParams.apiKey,
    dangerouslyAllowBrowser: true,
  });

  const currentFormValues = ctx.formValues;

  // Precompute record context once per run (was recomputed per field-locale)
  const recordContext = generateRecordContext(currentFormValues, sourceLocale);

  // Throttle streaming UI updates to ~30fps per fieldPath
  const STREAM_THROTTLE_MS = 33;
  const lastStreamAt = new Map<string, number>();

  // Get all fields that belong to the current item type
  const fieldsArray = Object.values(ctx.fields).filter(
    (field) => field?.relationships.item_type.data.id === ctx.itemType.id
  );

  // Small helper to yield to the UI thread to avoid visible stalls
  const nextFrame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  // Build a list of jobs (each field-locale translation) to run with adaptive concurrency
  type Job = { id: string; run: () => Promise<void>; retries: number };
  const jobs: Job[] = [];

  for (const field of fieldsArray) {
    if (!field || !field.attributes) {
      continue; // Skip invalid fields
    }
    
    // Check for user-initiated cancellation
    if (options.checkCancellation?.()) {
      return; // Exit early if translation was cancelled
    }
    
    const fieldType = field.attributes.appearance.editor;
    const fieldValue = currentFormValues[field.attributes.api_key];

    // Determine if this field is eligible for translation based on configuration
    let isFieldTranslatable =
      pluginParams.translationFields.includes(fieldType);

    // Handle special cases for rich_text/modular content and file/gallery fields
    if (
      (pluginParams.translationFields.includes('rich_text') &&
        modularContentVariations.includes(fieldType)) ||
      (pluginParams.translationFields.includes('file') &&
        fieldType === 'gallery')
    ) {
      isFieldTranslatable = true;
    }

    // Skip fields that are not translatable, not localized, or explicitly excluded
    if (
      !isFieldTranslatable ||
      !field.attributes.localized ||
      pluginParams.apiKeysToBeExcludedFromThisPlugin.includes(field.id)
    ) {
      continue;
    }

    // Skip if field is not an object of localized values
    if (!(fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue))) {
      continue;
    }

    // Resolve exact-cased locale key and pull its value
    const sourceLocaleValue = getExactSourceValue(
      fieldValue as Record<string, unknown>,
      sourceLocale
    );

    // Skip if source locale missing or empty
    if (sourceLocaleValue === undefined || sourceLocaleValue === null || sourceLocaleValue === '') {
      continue;
    }

    // Skip empty modular content arrays
    if (
      Array.isArray(sourceLocaleValue) &&
      (sourceLocaleValue as unknown[]).length === 0
    ) {
      continue;
    }

    // Use field label for UI display, falling back to API key if no label is defined
    const fieldLabel = field.attributes.label || field.attributes.api_key;

    // Process each target locale for this field as tasks
    for (const locale of targetLocales) {
      const fieldPath = `${field.attributes.api_key}.${locale}`;
      const fieldTypePrompt = prepareFieldTypePrompt(fieldType);

      jobs.push({ id: fieldPath, retries: 0, run: async () => {
        // Cancellation check before starting
        if (options.checkCancellation?.()) return;

        const start = performance.now?.() ?? Date.now();
        options.onStart?.(fieldLabel, locale, fieldPath);

        // Set up streaming callbacks to provide real-time updates
        const streamCallbacks = {
          onStream: (chunk: string) => {
            const now = Date.now();
            const last = lastStreamAt.get(fieldPath) ?? 0;
            if (now - last >= STREAM_THROTTLE_MS) {
              lastStreamAt.set(fieldPath, now);
              options.onStream?.(fieldLabel, locale, fieldPath, chunk);
            }
          },
          onComplete: () => {
            options.onComplete?.(fieldLabel, locale, fieldPath);
          },
          checkCancellation: options.checkCancellation,
          abortSignal: options.abortSignal,
        };

        // Perform the actual translation with streaming support
        const translatedFieldValue = await translateFieldValue(
          (fieldValue as LocalizedField)[sourceLocale],
          pluginParams,
          locale,
          sourceLocale,
          fieldType,
          openai,
          fieldTypePrompt,
          ctx.currentUserAccessToken as string,
          field.id,
          ctx.environment,
          streamCallbacks,
          recordContext
        );

        // Yield one frame to let UI apply the 'done' animation before writing the form value
        await nextFrame();
        ctx.setFieldValue(fieldPath, translatedFieldValue);
        const end = performance.now?.() ?? Date.now();
        logger.info('Task finished', { fieldPath, ms: Math.round(end - start) });
      }});
    }
  }

  // Adaptive concurrency scheduler with simple AIMD (additive-increase, multiplicative-decrease)
  // Derive a sensible cap from the chosen model; scheduler auto-tunes under this
  const model = String(pluginParams.gptModel || '').toLowerCase();
  const MAX_CAP = (() => {
    if (/(^|-)nano$/.test(model) || model.includes('nano')) return 6;
    if (/(^|-)mini$/.test(model) || model.includes('mini')) return 5;
    // heavier general models
    return 3;
  })();
  let currentConcurrency = MAX_CAP; // start at configured cap
  let active = 0;
  let nextIndex = 0;
  let successStreak = 0;
  const MAX_RETRIES = 3;

  const isCancelled = () => !!options.checkCancellation?.();

  const isRateLimitError = (err: unknown): boolean => {
    const anyErr = err as { status?: number; code?: string; message?: string };
    return (
      anyErr?.status === 429 ||
      anyErr?.code === 'rate_limit_exceeded' ||
      /\b429\b|rate limit|Too Many Requests/i.test(String(anyErr?.message))
    );
  };

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let resolveDone: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  const schedule = () => {
    if (isCancelled()) {
      if (active === 0) resolveDone();
      return;
    }
    while (active < currentConcurrency && nextIndex < jobs.length) {
      const idx = nextIndex++;
      const job = jobs[idx];
      active++;
      job
        .run()
        .then(() => {
          successStreak += 1;
          if (successStreak >= 3 && currentConcurrency < MAX_CAP) {
            currentConcurrency += 1;
            successStreak = 0;
            logger.info('Increased concurrency', { currentConcurrency });
          }
        })
        .catch(async (err) => {
          successStreak = 0;
          if (isRateLimitError(err) && job.retries < MAX_RETRIES) {
            job.retries += 1;
            currentConcurrency = Math.max(1, Math.ceil(currentConcurrency / 2));
            logger.warning('Rate limit detected; backing off', {
              job: job.id,
              retries: job.retries,
              currentConcurrency,
            });
            // Requeue with exponential backoff
            await delay(400 * job.retries);
            jobs.push(job);
          } else {
            logger.error('Job failed', { job: job.id, err });
            // No requeue; bubble remains in its last visual state
          }
        })
        .finally(() => {
          active--;
          if (nextIndex >= jobs.length && active === 0) {
            resolveDone();
          } else {
            schedule();
          }
        });
    }
  };

  schedule();
  await done;
}
