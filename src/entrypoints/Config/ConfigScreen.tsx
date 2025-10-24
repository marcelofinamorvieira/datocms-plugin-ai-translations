// ConfigScreen.tsx
// ------------------------------------------------------
// This component defines the plugin's configuration screen inside DatoCMS.
// It allows the user to set the OpenAI API Key, select a GPT model, and choose
// which field types can be translated.

import type { RenderConfigScreenCtx } from 'datocms-plugin-sdk';
import {
  Button,
  Canvas,
  CaretDownIcon,
  CaretUpIcon,
  Dropdown,
  DropdownMenu,
  DropdownOption,
  SelectField,
  Spinner,
  SwitchField,
  TextField,
} from 'datocms-react-ui';
import s from '../styles.module.css';
import DeepLProvider from '../../utils/translation/providers/DeepLProvider';
import { normalizeProviderError } from '../../utils/translation/ProviderErrors';
import { useEffect, useState, useMemo, useCallback } from 'react';
import ReactTextareaAutosize from 'react-textarea-autosize';
import { defaultPrompt } from '../../prompts/DefaultPrompt';
import { buildClient } from '@datocms/cma-client-browser';
import { listRelevantOpenAIModels } from '../../utils/translation/OpenAIModels';
import { listRelevantGeminiModels } from '../../utils/translation/GeminiModels';
import { listRelevantAnthropicModels } from '../../utils/translation/AnthropicModels';

/**
 * The shape of the plugin parameters we store in DatoCMS.
 * These fields are updated on the plugin configuration screen
 * and used throughout the plugin for translation.
 */
export type ctxParamsType = {
  // Vendor selection and credentials
  vendor?: 'openai' | 'google' | 'anthropic';
  gptModel: string; // The GPT model used for translations (OpenAI)
  apiKey: string; // The API key used to authenticate with OpenAI
  // Google (Gemini) settings
  googleApiKey?: string;
  geminiModel?: string;
  // Anthropic (Claude) settings
  anthropicApiKey?: string;
  anthropicModel?: string;
  // DeepL settings
  deeplEndpoint?: 'auto'|'pro'|'free';
  deeplUseFree?: boolean;
  deeplFormality?: 'default'|'more'|'less';
  deeplPreserveFormatting?: boolean;
  deeplIgnoreTags?: string;
  deeplNonSplittingTags?: string;
  deeplSplittingTags?: string;
  deeplProxyUrl?: string;
  // DeepL glossary settings
  deeplGlossaryId?: string; // default glossary id (optional)
  deeplGlossaryPairs?: string; // per-pair mapping text (optional)
  translationFields: string[]; // List of field editor types that can be translated
  translateWholeRecord: boolean; // Whether to allow entire record translation
  translateBulkRecords: boolean; // Whether to allow bulk records translation in tabular view
  prompt: string; // The prompt template used by the translation logic
  modelsToBeExcludedFromThisPlugin: string[]; // List of model API keys to exclude from translation
  rolesToBeExcludedFromThisPlugin: string[]; // List of role IDs to exclude from translation
  apiKeysToBeExcludedFromThisPlugin: string[]; // List of API keys to exclude from translation
  enableDebugging: boolean; // Whether to enable detailed console logging for debugging
};

/**
 * A mapping from field editor types to their user-friendly labels.
 * Used to present a friendly multi-select of possible translatable fields.
 */
export const translateFieldTypes = {
  single_line: 'Single line string',
  markdown: 'Markdown',
  wysiwyg: 'HTML Editor',
  textarea: 'Textarea',
  slug: 'Slug',
  json: 'JSON',
  seo: 'SEO',
  structured_text: 'Structured Text',
  rich_text: 'Modular Content',
  file: 'Media Fields',
};

export const modularContentVariations = ['framed_single_block'];

/**
 * Fetches the list of available models from OpenAI using the provided API key.
 * It sets the list of model IDs or an error message in the local component state.
 *
 * @param apiKey - Your OpenAI API key
 * @param setOptions - Callback to set the retrieved models in state
 */
async function fetchAvailableModels(
  apiKey: string,
  setOptions: React.Dispatch<React.SetStateAction<string[]>>,
  setGptModel: React.Dispatch<React.SetStateAction<string>>,
  setRecommended: React.Dispatch<React.SetStateAction<string | null>>
) {
  try {
    const models = await listRelevantOpenAIModels(apiKey);
    setOptions(models.length > 0 ? models : ['No compatible models found']);

    // Recommend gpt‑4.1‑mini (fast & broadly available), then 4o‑mini, then 4.1
    const prefer41Mini = models.find((m) => /^gpt-4\.1(\b|[.-])/.test(m) && /(^|[.-])mini\b/i.test(m));
    const prefer4oMini = models.find((m) => /^gpt-4o(\b|[.-])/.test(m) && /(^|[.-])mini\b/i.test(m));
    const prefer41 = models.find((m) => /^gpt-4\.1(\b|[.-])/.test(m));
    const preferAnyMini = models.find((m) => /(^|[.-])mini\b/i.test(m) && !/^gpt-5(\b|[.-])/.test(m));
    const recommended = prefer41Mini || prefer4oMini || prefer41 || preferAnyMini || models[0] || null;
    setRecommended(recommended);
  } catch (error) {
    console.error('Error fetching OpenAI models:', error);
    setOptions(['Invalid API Key']);
    setGptModel('None');
    setRecommended(null);
  }
}

/**
 * Persists the updated plugin parameters to DatoCMS.
 * If successful, displays a success message; otherwise, alerts the user of an error.
 *
 * @param ctx - The DatoCMS render context
 * @param apiKey - The new OpenAI API key
 * @param gptModel - The chosen GPT model
 * @param translationFields - The field types that can be translated
 * @param translateWholeRecord - Whether entire record translation is allowed
 * @param prompt - User-defined or default translation prompt
 * @param modelsToBeExcludedFromThisPlugin - List of model API keys to exclude from translation
 * @param rolesToBeExcludedFromThisPlugin - List of role IDs to exclude from translation
 * @param apiKeysToBeExcludedFromThisPlugin - List of API keys to exclude from translation
 * @param setIsLoading - Toggles the local loading state
 */
const updatePluginParams = async (
  ctx: RenderConfigScreenCtx,
  vendor: 'openai' | 'google' | 'anthropic' | 'deepl',
  apiKey: string,
  gptModel: string,
  googleApiKey: string,
  geminiModel: string,
  anthropicApiKey: string,
  anthropicModel: string,
  deeplEndpoint: 'auto'|'pro'|'free',
  deeplUseFree: boolean,
  deeplFormality: 'default'|'more'|'less',
  deeplPreserveFormatting: boolean,
  deeplIgnoreTags: string,
  deeplNonSplittingTags: string,
  deeplSplittingTags: string,
  deeplProxyUrl: string,
  deeplGlossaryId: string,
  deeplGlossaryPairs: string,
  translationFields: string[],
  translateWholeRecord: boolean,
  translateBulkRecords: boolean,
  prompt: string,
  modelsToBeExcludedFromThisPlugin: string[],
  rolesToBeExcludedFromThisPlugin: string[],
  apiKeysToBeExcludedFromThisPlugin: string[],
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
  enableDebugging: boolean
) => {
  setIsLoading(true);
  try {
    await ctx.updatePluginParameters({
      vendor,
      apiKey,
      gptModel,
      googleApiKey,
      geminiModel,
      anthropicApiKey,
      anthropicModel,
      deeplEndpoint,
      deeplUseFree,
      deeplFormality,
      deeplPreserveFormatting,
      deeplIgnoreTags,
      deeplNonSplittingTags,
      deeplSplittingTags,
      deeplProxyUrl,
      deeplGlossaryId,
      deeplGlossaryPairs,
      translationFields,
      translateWholeRecord,
      translateBulkRecords,
      prompt,
      modelsToBeExcludedFromThisPlugin,
      rolesToBeExcludedFromThisPlugin,
      apiKeysToBeExcludedFromThisPlugin,
      enableDebugging,
    });

    ctx.notice('Plugin options updated successfully!');
  } catch (error) {
    console.error('Error updating plugin parameters:', error);
    ctx.alert('Failed to update plugin options. Please try again.');
  } finally {
    setIsLoading(false);
  }
};

/**
 * Main config screen component. Users interact with these fields
 * to adjust plugin behavior and integration with OpenAI.
 *
 * @param props - Contains the RenderConfigScreenCtx from DatoCMS
 */
export default function ConfigScreen({ ctx }: { ctx: RenderConfigScreenCtx }) {
  // Retrieve existing plugin params or use defaults if not set
  const pluginParams = ctx.plugin.attributes.parameters as ctxParamsType;

  // Local state for the API key
  const [vendor, setVendor] = useState<'openai' | 'google' | 'anthropic' | 'deepl'>(pluginParams.vendor ?? 'openai');
  const [apiKey, setApiKey] = useState(pluginParams.apiKey ?? '');
  const [googleApiKey, setGoogleApiKey] = useState(pluginParams.googleApiKey ?? '');

  // Local state for the selected GPT model
  const [gptModel, setGptModel] = useState(
    pluginParams.gptModel ?? 'None'
  );
  const [geminiModel, setGeminiModel] = useState(pluginParams.geminiModel ?? 'gemini-1.5-flash');
  const [anthropicApiKey, setAnthropicApiKey] = useState(pluginParams.anthropicApiKey ?? '');
  const [anthropicModel, setAnthropicModel] = useState(pluginParams.anthropicModel ?? 'claude-3.5-haiku-latest');
  const [deeplEndpoint, _setDeeplEndpoint] = useState<'auto'|'pro'|'free'>(pluginParams.deeplEndpoint ?? 'auto');
  const [deeplUseFree, setDeeplUseFree] = useState<boolean>(pluginParams.deeplUseFree ?? false);
  const [deeplFormality, setDeeplFormality] = useState<'default'|'more'|'less'>(pluginParams.deeplFormality ?? 'default');
  const [deeplPreserveFormatting, setDeeplPreserveFormatting] = useState<boolean>(pluginParams.deeplPreserveFormatting ?? true);
  const [deeplIgnoreTags, setDeeplIgnoreTags] = useState<string>(pluginParams.deeplIgnoreTags ?? 'notranslate,ph');
  const [deeplNonSplittingTags, setDeeplNonSplittingTags] = useState<string>(pluginParams.deeplNonSplittingTags ?? 'a,code,pre,strong,em,ph,notranslate');
  const [deeplSplittingTags, setDeeplSplittingTags] = useState<string>(pluginParams.deeplSplittingTags ?? '');
  const [deeplProxyUrl, setDeeplProxyUrl] = useState<string>(pluginParams.deeplProxyUrl ?? '');
  const [deeplGlossaryId, setDeeplGlossaryId] = useState<string>(pluginParams.deeplGlossaryId ?? '');
  const [deeplGlossaryPairs, setDeeplGlossaryPairs] = useState<string>(pluginParams.deeplGlossaryPairs ?? '');
  const [showDeeplAdvanced, setShowDeeplAdvanced] = useState<boolean>(false);
  const [isTestingProxy, setIsTestingProxy] = useState<boolean>(false);
  const [testProxyMessage, setTestProxyMessage] = useState<string>('');
  const [testProxyStatus, setTestProxyStatus] = useState<'idle'|'success'|'error'>('idle');

  // Local state for which field types can be translated
  const [translationFields, setTranslationFields] = useState<string[]>(
    Array.isArray(pluginParams.translationFields)
      ? pluginParams.translationFields
      : Object.keys(translateFieldTypes)
  );

  // Local state for models to be excluded from translation
  const [modelsToBeExcluded, setModelsToBeExcluded] = useState<string[]>(
    pluginParams.modelsToBeExcludedFromThisPlugin ?? []
  );

  // Local state for roles to be excluded from translation
  const [rolesToBeExcluded, setRolesToBeExcluded] = useState<string[]>(
    pluginParams.rolesToBeExcludedFromThisPlugin ?? []
  );

  // Local state for API keys to be excluded from translation
  const [apiKeysToBeExcluded, setApiKeysToBeExcluded] = useState<string[]>(
    pluginParams.apiKeysToBeExcludedFromThisPlugin ?? []
  );

  // Local state to allow entire record translation
  const [translateWholeRecord, setTranslateWholeRecord] = useState<boolean>(
    typeof pluginParams.translateWholeRecord === 'boolean'
      ? pluginParams.translateWholeRecord
      : true
  );

  // Local state to allow bulk records translation
  const [translateBulkRecords, setTranslateBulkRecords] = useState<boolean>(
    typeof pluginParams.translateBulkRecords === 'boolean'
      ? pluginParams.translateBulkRecords
      : true
  );

  // Local state for the translation prompt (includes placeholders like {fieldValue})
  const [prompt, setPrompt] = useState(pluginParams.prompt ?? defaultPrompt);

  // Local state for debugging
  const [enableDebugging, setEnableDebugging] = useState<boolean>(
    typeof pluginParams.enableDebugging === 'boolean'
      ? pluginParams.enableDebugging
      : false
  );

  // Performance concurrency is now fully automatic; no user setting.

  // A loading state to indicate asynchronous operations (like saving or model fetching)
  const [isLoading, setIsLoading] = useState(false);

  // Holds all possible GPT models fetched from the OpenAI API
  const [listOfModels, setListOfModels] = useState<string[]>([
    'Insert a valid OpenAI API Key',
  ]);

  // Top recommended model (first in the filtered/sorted list)
  const [recommendedModel, setRecommendedModel] = useState<string | null>(null);
  const [listOfGeminiModels, setListOfGeminiModels] = useState<string[]>(['Insert a valid Google API Key']);
  const [recommendedGeminiModel, setRecommendedGeminiModel] = useState<string | null>(null);
  const [listOfAnthropicModels, setListOfAnthropicModels] = useState<string[]>(['Insert a valid Anthropic API Key']);
  const [recommendedAnthropicModel, setRecommendedAnthropicModel] = useState<string | null>(null);

  const [listOfFields, setListOfFields] = useState<
    {
      id: string;
      name: string;
      model: string;
    }[]
  >([]);

  // Add state for exclusion rules visibility
  const [showExclusionRules, setShowExclusionRules] = useState<boolean>(false);

  // Calculate if any exclusion rules are set
  const hasExclusionRules = useMemo(() => {
    return (
      modelsToBeExcluded.length > 0 ||
      rolesToBeExcluded.length > 0 ||
      apiKeysToBeExcluded.length > 0
    );
  }, [modelsToBeExcluded, rolesToBeExcluded, apiKeysToBeExcluded]);

  useEffect(() => {
    // Force show exclusion rules if any are set
    if (hasExclusionRules) {
      setShowExclusionRules(true);
    }
  }, [hasExclusionRules]);

  /**
   * When the user updates or removes the API key, we refetch the model list.
   * If there's no API key provided, we show a placeholder message.
   */

  useEffect(() => {
    if (vendor === 'openai' && apiKey) {
      // Process all item types, including modular blocks
      for (const itemTypeID in ctx.itemTypes) {
        ctx.loadItemTypeFields(itemTypeID).then((fields) => {
          setListOfFields((prevFields) => {
            const itemType = ctx.itemTypes[itemTypeID];
            const isBlock = itemType?.attributes.modular_block;
            const modelName = itemType?.attributes.name;

            const newFields = fields.map((field) => ({
              id: field.id,
              name: field.attributes.label,
              model: isBlock ? `${modelName} block` : modelName ?? '',
            }));

            // Create a Set of existing IDs for O(1) lookup
            const existingIds = new Set(prevFields.map((field) => field.id));

            // Only add fields that don't already exist
            const uniqueNewFields = newFields.filter(
              (field) => !existingIds.has(field.id)
            );

            return [...prevFields, ...uniqueNewFields];
          });
        });
      }
    }
  }, [ctx.itemTypes, apiKey, ctx.loadItemTypeFields, vendor]);

  useEffect(() => {
    if (vendor === 'openai' && apiKey) {
      fetchAvailableModels(
        apiKey,
        setListOfModels,
        setGptModel,
        setRecommendedModel
      ).catch(console.error);
    } else {
      if (vendor === 'openai') {
        setListOfModels(['Insert a valid OpenAI API Key']);
        setGptModel('None');
        setRecommendedModel(null);
      }
    }
  }, [apiKey, vendor]);

  // Load Gemini models dynamically when Google vendor + key
  useEffect(() => {
    async function loadGemini() {
      if (vendor !== 'google') return;
      if (!googleApiKey) {
        setListOfGeminiModels(['Insert a valid Google API Key']);
        setRecommendedGeminiModel(null);
        return;
      }
      try {
        const models = await listRelevantGeminiModels(googleApiKey);
        setListOfGeminiModels(models.length > 0 ? models : ['No compatible models found']);
        // Prefer the latest flash as default recommendation
        const prefer25Flash = models.find((m) => /^gemini-2\.5.*flash/i.test(m));
        const prefer2Flash = models.find((m) => /^gemini-2\.0.*flash/i.test(m));
        const prefer15Flash = models.find((m) => /^gemini-1\.5.*flash/i.test(m));
        const recommended = prefer25Flash || prefer2Flash || prefer15Flash || models[0] || null;
        setRecommendedGeminiModel(recommended);
        // Auto-select when unset
        if (!pluginParams.geminiModel && recommended) {
          setGeminiModel(recommended);
        }
      } catch (e) {
        console.error('Error fetching Gemini models:', e);
        setListOfGeminiModels(['Invalid API Key']);
        setRecommendedGeminiModel(null);
      }
    }
    loadGemini();
  }, [vendor, googleApiKey, pluginParams.geminiModel]);

  // Load Anthropic models dynamically when Anthropic vendor + key
  useEffect(() => {
    async function loadClaude() {
      if (vendor !== 'anthropic') return;
      if (!anthropicApiKey) {
        setListOfAnthropicModels(['Insert a valid Anthropic API Key']);
        setRecommendedAnthropicModel(null);
        return;
      }
      try {
        const models = await listRelevantAnthropicModels(anthropicApiKey);
        setListOfAnthropicModels(models.length > 0 ? models : ['No compatible models found']);
        const preferHaiku = models.find((m) => /haiku/i.test(m) && /3\.5|latest/i.test(m));
        const preferSonnet = models.find((m) => /sonnet/i.test(m) && /3\.5|latest/i.test(m));
        const recommended = preferHaiku || preferSonnet || models[0] || null;
        setRecommendedAnthropicModel(recommended);
        if (!pluginParams.anthropicModel && recommended) setAnthropicModel(recommended);
      } catch (e) {
        console.error('Error fetching Claude models:', e);
        setListOfAnthropicModels(['Invalid API Key']);
        setRecommendedAnthropicModel(null);
      }
    }
    loadClaude();
  }, [vendor, anthropicApiKey, pluginParams.anthropicModel]);

  // If we detect a recommended model and the current selection is unset or None,
  // adopt the recommendation automatically.
  useEffect(() => {
    if (vendor === 'openai' && recommendedModel && (gptModel === 'None' || !pluginParams.gptModel)) {
      setGptModel(recommendedModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendedModel]);

  const normalizeList = useCallback((list?: string[]) => {
    return Array.isArray(list) ? [...list].sort().join(',') : '';
  }, []);

  /**
   * Checks if the user has changed any of the config fields,
   * so we can enable or disable the "Save" button accordingly.
   */
  const isFormDirty = useMemo(() => {
    const sortedSelectedFields = [...translationFields].sort().join(',');
    const sortedConfiguredFields =
      pluginParams.translationFields
        ? [...pluginParams.translationFields].sort().join(',')
        : Object.keys(translateFieldTypes).sort().join(',');
    const sortedSelectedModels = [...modelsToBeExcluded].sort().join(',');
    const sortedConfiguredModels = normalizeList(pluginParams.modelsToBeExcludedFromThisPlugin);
    const sortedSelectedRoles = [...rolesToBeExcluded].sort().join(',');
    const sortedConfiguredRoles = normalizeList(pluginParams.rolesToBeExcludedFromThisPlugin);
    const sortedSelectedApiKeys = [...apiKeysToBeExcluded].sort().join(',');
    const sortedConfiguredApiKeys = normalizeList(pluginParams.apiKeysToBeExcludedFromThisPlugin);

    return (
      apiKey !== (pluginParams.apiKey ?? '') ||
    vendor !== (pluginParams.vendor ?? 'openai') ||
    googleApiKey !== (pluginParams.googleApiKey ?? '') ||
    geminiModel !== (pluginParams.geminiModel ?? 'gemini-1.5-flash') ||
    anthropicApiKey !== (pluginParams.anthropicApiKey ?? '') ||
    anthropicModel !== (pluginParams.anthropicModel ?? 'claude-3.5-haiku-latest') ||
    deeplEndpoint !== (pluginParams.deeplEndpoint ?? 'auto') ||
    deeplUseFree !== (pluginParams.deeplUseFree ?? false) ||
    deeplFormality !== (pluginParams.deeplFormality ?? 'default') ||
    deeplPreserveFormatting !== (pluginParams.deeplPreserveFormatting ?? true) ||
    deeplIgnoreTags !== (pluginParams.deeplIgnoreTags ?? 'notranslate,ph') ||
    deeplNonSplittingTags !== (pluginParams.deeplNonSplittingTags ?? 'a,code,pre,strong,em,ph,notranslate') ||
    deeplSplittingTags !== (pluginParams.deeplSplittingTags ?? '') ||
    deeplProxyUrl !== (pluginParams.deeplProxyUrl ?? '') ||
    deeplGlossaryId !== (pluginParams.deeplGlossaryId ?? '') ||
    deeplGlossaryPairs !== (pluginParams.deeplGlossaryPairs ?? '') ||
      gptModel !== (pluginParams.gptModel ?? 'None') ||
      sortedSelectedFields !== sortedConfiguredFields ||
      translateWholeRecord !== (pluginParams.translateWholeRecord ?? true) ||
      translateBulkRecords !== (pluginParams.translateBulkRecords ?? true) ||
      prompt !== (pluginParams.prompt ?? defaultPrompt) ||
      sortedSelectedModels !== sortedConfiguredModels ||
      sortedSelectedRoles !== sortedConfiguredRoles ||
      sortedSelectedApiKeys !== sortedConfiguredApiKeys ||
      enableDebugging !== (pluginParams.enableDebugging ?? false)
    );
  }, [
    vendor,
    apiKey,
    googleApiKey,
    geminiModel,
    anthropicApiKey,
    anthropicModel,
    gptModel,
    translationFields,
    translateWholeRecord,
    translateBulkRecords,
    prompt,
    deeplEndpoint,
    deeplUseFree,
    deeplFormality,
    deeplPreserveFormatting,
    deeplIgnoreTags,
    deeplNonSplittingTags,
    deeplSplittingTags,
    deeplProxyUrl,
    modelsToBeExcluded,
    rolesToBeExcluded,
    apiKeysToBeExcluded,
    enableDebugging,
    normalizeList,
    pluginParams.vendor,
    pluginParams.apiKey,
    pluginParams.googleApiKey,
    pluginParams.geminiModel,
    pluginParams.anthropicApiKey,
    pluginParams.anthropicModel,
    pluginParams.deeplEndpoint,
    pluginParams.deeplUseFree,
    pluginParams.deeplFormality,
    pluginParams.deeplPreserveFormatting,
    pluginParams.deeplIgnoreTags,
    pluginParams.deeplNonSplittingTags,
    pluginParams.deeplSplittingTags,
    pluginParams.deeplProxyUrl,
    pluginParams.deeplGlossaryId,
    pluginParams.deeplGlossaryPairs,
    pluginParams.gptModel,
    pluginParams.translationFields,
    pluginParams.translateWholeRecord,
    pluginParams.translateBulkRecords,
    pluginParams.prompt,
    pluginParams.modelsToBeExcludedFromThisPlugin,
    pluginParams.rolesToBeExcludedFromThisPlugin,
    pluginParams.apiKeysToBeExcludedFromThisPlugin,
    pluginParams.enableDebugging,
  ]);

  const availableModels = useMemo(() => {
    return Object.entries(ctx.itemTypes)
      .map(([_key, value]) => {
        return {
          apiKey: value?.attributes.api_key,
          name: value?.attributes.name,
          isBlock: value?.attributes.modular_block,
        };
      })
      .filter((item) => !item.isBlock);
  }, [ctx.itemTypes]);

  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const client = buildClient({ apiToken: ctx.currentUserAccessToken as string, environment: ctx.environment });
    client.roles.list().then((roles) => {
      setRoles(roles.map((role) => ({ id: role.id, name: role.name })));
    });
  }, [ctx.currentUserAccessToken, ctx.environment]);

  return (
    // Canvas is a Datocms React UI wrapper for consistent styling
    <Canvas ctx={ctx}>
      <div>
        {/* Vendor selection */}
        <div className={s.fieldSpacing}>
          <SelectField
            name="vendor"
            id="vendor"
            label="AI Vendor"
            value={{ label: vendor === 'openai' ? 'OpenAI (ChatGPT)' : vendor === 'google' ? 'Google (Gemini)' : vendor === 'anthropic' ? 'Anthropic (Claude)' : 'DeepL', value: vendor }}
            selectInputProps={{
              options: [
                { label: 'OpenAI (ChatGPT)', value: 'openai' },
                { label: 'Google (Gemini)', value: 'google' },
                { label: 'Anthropic (Claude)', value: 'anthropic' },
                { label: 'DeepL', value: 'deepl' },
              ],
            }}
            onChange={(opt) => {
            const v = Array.isArray(opt) ? (opt[0]?.value as 'openai'|'google'|'anthropic'|'deepl') : (opt as any)?.value;
            if (v) setVendor(v);
          }}
          />
        </div>

        {vendor === 'openai' ? (
          <>
            {/* OpenAI API Key */}
            <div className={s.fieldSpacing}>
              <TextField
                required
                name="openAIAPIKey"
                id="openAIAPIKey"
                label="OpenAI API Key"
                value={apiKey}
                onChange={(newValue) => setApiKey(newValue)}
                placeholder="sk-..."
              />
            </div>

            {/* GPT Model dropdown selector */}
            <div className={s.dropdownLabel}>
              <span className={s.label}>GPT Model*</span>
              <span className={s.tooltipContainer}>
                ⓘ
                <span className={`${s.tooltipText} ${s.leftAnchorTooltip}`}>
                  <div style={{ textAlign: 'left' }}>
                    <div><b>Default:</b> gpt-4.1-mini — fastest and broadly available.</div>
                    <div><b>High-stakes short copy:</b> gpt-4.1</div>
                    <div><b>Large or budget batches:</b> gpt-4o-mini</div>
                  </div>
                </span>
              </span>
              <div className={s.modelSelect}>
                <Dropdown
                  renderTrigger={({ open, onClick }) => (
                    <Button
                      onClick={onClick}
                      rightIcon={open ? <CaretUpIcon /> : <CaretDownIcon />}
                    >
                      {gptModel}
                    </Button>
                  )}
                >
                  <DropdownMenu>
                    {listOfModels.map((model) => (
                      <DropdownOption key={model} onClick={() => setGptModel(model)}>
                        {model}
                      </DropdownOption>
                    ))}
                  </DropdownMenu>
                </Dropdown>
                <button
                  onClick={() => {
                    if (recommendedModel) {
                      setGptModel(recommendedModel);
                      ctx.notice(`Selected ${recommendedModel}`);
                    }
                  }}
                  className={s.tooltipConfig}
                  type="button"
                  disabled={!recommendedModel}
                >
                  {recommendedModel
                    ? `Recommended: ${recommendedModel}`
                    : 'No compatible models detected'}
                </button>
              </div>
            </div>
          </>
        ) : vendor === 'google' ? (
          <>
            {/* Google API Key */}
            <div className={s.fieldSpacing}>
              <TextField
                required
                name="googleApiKey"
                id="googleApiKey"
                label="Google API Key"
                value={googleApiKey}
                onChange={(newValue) => setGoogleApiKey(newValue)}
                placeholder="AIza..."
              />
            </div>

            {/* Gemini model select */}
            <div className={s.dropdownLabel}>
              <span className={s.label}>Gemini Model*</span>
              <span className={s.tooltipContainer}>
                ⓘ
                <span className={`${s.tooltipText} ${s.leftAnchorTooltip}`}>
                  <div style={{ textAlign: 'left' }}>
                    <div><b>Default:</b> gemini-2.5-flash — best balance of quality/cost/latency.</div>
                    <div><b>High-stakes short copy:</b> gemini-2.5-pro (or 2.0-pro).</div>
                    <div><b>Large or budget batches:</b> gemini-2.5-flash-lite.</div>
                  </div>
                </span>
              </span>
              <div className={s.modelSelect}>
                <SelectField
                  name="geminiModel"
                  id="geminiModel"
                  label=""
                  value={{ label: geminiModel, value: geminiModel }}
                  selectInputProps={{ options: listOfGeminiModels.map((m) => ({ label: m, value: m })) }}
                  onChange={(newValue) => {
                    if (!Array.isArray(newValue)) setGeminiModel((newValue as any)?.value || geminiModel);
                  }}
                />
                <button
                  onClick={() => {
                    if (recommendedGeminiModel) {
                      setGeminiModel(recommendedGeminiModel);
                      ctx.notice(`Selected ${recommendedGeminiModel}`);
                    }
                  }}
                  className={s.tooltipConfig}
                  type="button"
                  disabled={!recommendedGeminiModel}
                >
                  {recommendedGeminiModel ? `Recommended: ${recommendedGeminiModel}` : 'No compatible models detected'}
                </button>
              </div>
            </div>
          </>
        ) : vendor === 'anthropic' ? (
          <>
            {/* Anthropic API Key */}
            <div className={s.fieldSpacing}>
              <TextField
                required
                name="anthropicApiKey"
                id="anthropicApiKey"
                label="Anthropic API Key"
                value={anthropicApiKey}
                onChange={(v) => setAnthropicApiKey(v)}
                placeholder="sk-ant-..."
              />
            </div>

            {/* Claude Model */}
            <SelectField
              name="anthropicModel"
              id="anthropicModel"
              label="Claude Model"
              hint={recommendedAnthropicModel ? `Recommended: ${recommendedAnthropicModel}` : undefined}
              value={{ label: anthropicModel, value: anthropicModel }}
              selectInputProps={{ options: listOfAnthropicModels.map((m) => ({ label: m, value: m })) }}
              onChange={(newValue) => {
                if (!Array.isArray(newValue)) setAnthropicModel((newValue as any)?.value || anthropicModel);
              }}
            />
          </>
        ) : (
          <>
            {/* Proxy URL (REQUIRED) with tooltip explaining CORS */}
            <div className={s.fieldSpacing}>
              <label className={s.label} htmlFor="deeplProxyUrl" style={{ display: 'flex', alignItems: 'center' }}>
                Proxy URL*
                <div className={s.tooltipContainer}>
                  ⓘ
                  <div className={`${s.tooltipText} ${s.leftAnchorTooltip}`}>
                    DeepL blocks browser requests (no CORS). Use a tiny serverless
                    endpoint you control (e.g., Vercel/Netlify/Cloudflare) that forwards
                    requests to DeepL and adds CORS + the Authorization header server‑side.
                    Paste that endpoint URL here.
                  </div>
                </div>
              </label>
              <TextField
                name="deeplProxyUrl"
                id="deeplProxyUrl"
                label=""
                value={deeplProxyUrl}
                onChange={setDeeplProxyUrl}
                placeholder="https://yourdomain.com/api/deepl"
              />
              <div className={`${s.switchField} ${s.buttonRow}`}>
                <Button
                  buttonType="muted"
                  onClick={() => {
                    const url = 'https://github.com/marcelofinamorvieira/datocms-plugin-ai-translations/blob/master/docs/DeepL-Proxy-CLI.md';
                    try { window.open(url, '_blank', 'noopener'); } catch { ctx.notice('Open this URL: ' + url); }
                  }}
                >
                  How to set up this proxy
                </Button>
                <Button
                  buttonType="muted"
                  disabled={isTestingProxy}
                  onClick={async () => {
                    if (!deeplProxyUrl) { setTestProxyStatus('error'); setTestProxyMessage('Enter a Proxy URL first.'); return; }
                    setTestProxyMessage('');
                    setTestProxyStatus('idle');
                    setIsTestingProxy(true);
                    try {
                      const base = deeplUseFree ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
                      const provider = new DeepLProvider({ apiKey: '', baseUrl: base, proxyUrl: deeplProxyUrl });
                      const out = await provider.translateArray(['Hello world'], { targetLang: 'DE' });
                      const sample = (out?.[0] ?? '').toString();
                      if (sample) {
                        setTestProxyStatus('success');
                        setTestProxyMessage(`Proxy OK. DeepL responded: ${sample.slice(0, 64)}${sample.length > 64 ? '…' : ''}`);
                      } else {
                        setTestProxyStatus('success');
                        setTestProxyMessage('Proxy OK. DeepL responded (empty body).');
                      }
                    } catch (err) {
                      const norm = normalizeProviderError(err, 'deepl');
                      setTestProxyStatus('error');
                      setTestProxyMessage(norm.message + (norm.hint ? ` — ${norm.hint}` : ''));
                    } finally {
                      setIsTestingProxy(false);
                    }
                  }}
                >
                  {isTestingProxy ? 'Testing…' : 'Test proxy'}
                </Button>
              </div>
              {testProxyMessage && (
                <div
                  className={s.inlineStatus}
                  style={{ color: testProxyStatus === 'success' ? '#237804' : testProxyStatus === 'error' ? '#cf1322' : undefined }}
                >
                  {testProxyMessage}
                </div>
              )}
              
            </div>

            {/* DeepL Endpoint toggle + Formality */}
            <div className={s.switchField}>
              <SwitchField
                name="deeplUseFree"
                id="deeplUseFree"
                label="Use DeepL Free endpoint (api-free.deepl.com)"
                value={deeplUseFree}
                onChange={(val) => setDeeplUseFree(val)}
              />
            </div>

            <div className={s.fieldSpacing}>
              <label className={s.label} htmlFor="deeplFormality">Formality</label>
              <SelectField
                name="deeplFormality"
                id="deeplFormality"
                label=""
                value={{ label: deeplFormality, value: deeplFormality }}
                selectInputProps={{
                  options: [
                    { label: 'default', value: 'default' },
                    { label: 'more', value: 'more' },
                    { label: 'less', value: 'less' },
                  ],
                }}
                onChange={(nv) => { if (!Array.isArray(nv)) setDeeplFormality((nv as any).value); }}
              />
            </div>

            {/* Advanced settings toggle */}
            <div className={s.switchField}>
              <Button buttonType="muted" onClick={() => setShowDeeplAdvanced((v) => !v)}>
                {showDeeplAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
              </Button>
            </div>

            {showDeeplAdvanced && (
              <div style={{ marginTop: 8 }}>
                {/* Preserve formatting */}
                <div className={s.switchField}>
                  <SwitchField
                    name="deeplPreserveFormatting"
                    id="deeplPreserveFormatting"
                    label="Preserve formatting"
                    value={deeplPreserveFormatting}
                    onChange={setDeeplPreserveFormatting}
                  />
                </div>

                {/* Advanced tags */}
                <div className={s.fieldSpacing}>
                  <TextField
                    name="deeplIgnoreTags"
                    id="deeplIgnoreTags"
                    label="Ignore tags (CSV)"
                    value={deeplIgnoreTags}
                    onChange={setDeeplIgnoreTags}
                  />
                </div>
                <div className={s.fieldSpacing}>
                  <TextField
                    name="deeplNonSplittingTags"
                    id="deeplNonSplittingTags"
                    label="Non-splitting tags (CSV)"
                    value={deeplNonSplittingTags}
                    onChange={setDeeplNonSplittingTags}
                  />
                </div>
                <div className={s.fieldSpacing}>
                  <TextField
                    name="deeplSplittingTags"
                    id="deeplSplittingTags"
                    label="Splitting tags (CSV)"
                    value={deeplSplittingTags}
                    onChange={setDeeplSplittingTags}
                  />
                </div>

                {/* Glossary settings */}
                <div className={s.fieldSpacing}>
                  <label className={s.label} htmlFor="deeplGlossaryId" style={{ display: 'flex', alignItems: 'center' }}>
                    Default glossary ID
                    <div className={s.tooltipContainer}>
                      ⓘ
                      <div className={`${s.tooltipText} ${s.leftAnchorTooltip}`}>
                        Optional DeepL glossary ID (e.g., gls-abc123) applied when
                        translating with DeepL. You can override per language pair
                        via the mapping below.
                      </div>
                    </div>
                  </label>
                  <TextField
                    name="deeplGlossaryId"
                    id="deeplGlossaryId"
                    label=""
                    value={deeplGlossaryId}
                    onChange={setDeeplGlossaryId}
                    placeholder="gls-..."
                  />
                </div>

                <div className={s.fieldSpacing}>
                  <label className={s.label} htmlFor="deeplGlossaryPairs" style={{ display: 'flex', alignItems: 'center' }}>
                    Glossaries by language pair
                    <div className={s.tooltipContainer}>
                      ⓘ
                      <div className={`${s.tooltipText} ${s.leftAnchorTooltip}`}>
                        One per line. Use either Dato locales or DeepL codes.
                        Supports wildcards, e.g. *-&gt;pt-BR=gls-123 (any source to pt-BR).
                        Examples: EN-&gt;DE=gls-abc123, en-US-&gt;pt-BR: gls-xyz789, *-&gt;de=gls-777
                      </div>
                    </div>
                  </label>
                  <ReactTextareaAutosize
                    className={s.textarea}
                    id="deeplGlossaryPairs"
                    value={deeplGlossaryPairs}
                    onChange={(e) => setDeeplGlossaryPairs(e.target.value)}
                    minRows={2}
                    placeholder={"EN->DE=gls-...\nen-US->pt-BR=gls-..."}
                  />
                </div>

                {/* Proxy moved to required field above */}
              </div>
            )}
          </>
        )}

        {/* Performance: concurrency is automatic with adaptive backoff */}

        {/* A multi-select component that lets users choose which field types can be translated */}
        <SelectField
          name="fieldsWithTranslationOption"
          id="fieldsWithTranslationOption"
          label="Fields that can be translated"
          value={translationFields.map((field) => ({
            label:
              translateFieldTypes[field as keyof typeof translateFieldTypes],
            value: field,
          }))}
          selectInputProps={{
            isMulti: true,
            options: Object.entries(translateFieldTypes).map(
              ([value, label]) => ({
                label,
                value,
              })
            ),
          }}
          onChange={(newValue) => {
            const selectedFields = newValue.map((v) => v.value);
            setTranslationFields(selectedFields);
          }}
        />
        {/* A switch field to allow translation of the entire record from the sidebar */}
        <div className={s.switchField}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <SwitchField
              name="translateWholeRecord"
              id="translateWholeRecord"
              label="Allow translation of the whole record from the sidebar"
              value={translateWholeRecord}
              onChange={(newValue) => setTranslateWholeRecord(newValue)}
            />
            {/* Tooltip container with image for sidebar translation */}
            <div className={s.tooltipContainer}>
              ⓘ
              <div className={`${s.tooltipText} ${s.imageTooltip}`}>
                <img 
                  src="/public/assets/sidebar-translation-example.png" 
                  alt="Sidebar translation example"
                  style={{ width: '100%', maxWidth: '420px' }}
                />
                <div style={{ marginTop: '10px', fontWeight: 'bold' }}>Sidebar Translation</div>
                <div style={{ fontSize: '12px' }}>Translate an entire record from the sidebar panel</div>
              </div>
            </div>
          </div>
        </div>

        {/* A switch field to allow bulk records translation */}
        <div className={s.switchField}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <SwitchField
              name="translateBulkRecords"
              id="translateBulkRecords"
              label="Allow bulk records translation in tabular view"
              value={translateBulkRecords}
              onChange={(newValue) => setTranslateBulkRecords(newValue)}
            />
            {/* Tooltip container with image for bulk translation */}
            <div className={s.tooltipContainer}>
              ⓘ
              <div className={`${s.tooltipText} ${s.imageTooltip}`}>
                <img 
                  src="/public/assets/bulk-translation-example.png" 
                  alt="Bulk records translation example"
                  style={{ width: '100%', maxWidth: '420px' }}
                />
                <div style={{ marginTop: '10px', fontWeight: 'bold' }}>Bulk Translation</div>
                <div style={{ fontSize: '12px' }}>Translate multiple records at once in the tabular view</div>
              </div>
            </div>
          </div>
        </div>

        {/* A switch field to enable debug logging */}
        <div className={s.switchField}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <SwitchField
              name="enableDebugging"
              id="enableDebugging"
              label="Enable debug logging"
              value={enableDebugging}
              onChange={(newValue) => setEnableDebugging(newValue)}
            />
            {/* Tooltip container styled like the translation prompt tooltip */}
            <div className={s.tooltipContainer}>
              ⓘ
              <div className={s.tooltipText}>
                When enabled, detailed logs of translation requests and responses will be displayed in the browser console.
                This helps with troubleshooting and understanding how the plugin processes content.
              </div>
            </div>
          </div>
        </div>

        {/* Switch field to toggle exclusion rules visibility */}
        <div
          className={s.switchField}
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <SwitchField
            name="showExclusionRules"
            id="showExclusionRules"
            label="Show exclusion rules"
            value={showExclusionRules}
            onChange={(newValue) => setShowExclusionRules(newValue)}
          />
          {hasExclusionRules && (
            <div className={s.warningTooltip}>
              ⓘ
              <div className={s.tooltipText}>
                There are exclusion rules present. If the plugin is not being
                displayed in a model or field where you expect it, please review
                them.
              </div>
            </div>
          )}
        </div>

        {showExclusionRules && (
          <div className={s.exclusionRules}>
            <div style={{ marginTop: '16px' }}>
              <SelectField
                name="modelsToBeExcludedFromTranslation"
                id="modelsToBeExcludedFromTranslation"
                label="Models to be excluded from this plugin"
                value={modelsToBeExcluded.map((modelKey) => {
                  const model = availableModels.find(
                    (m) => m.apiKey === modelKey
                  );
                  return {
                    label: model?.name ?? modelKey,
                    value: modelKey,
                  };
                })}
                selectInputProps={{
                  isMulti: true,
                  options: availableModels.map((model) => ({
                    label: model.name ?? '',
                    value: model.apiKey ?? '',
                  })),
                }}
                onChange={(newValue) => {
                  const selectedModels = newValue.map((v) => v.value);
                  setModelsToBeExcluded(selectedModels);
                }}
              />
            </div>

            <div style={{ marginTop: '16px' }}>
              <SelectField
                name="rolesToBeExcludedFromTranslation"
                id="rolesToBeExcludedFromTranslation"
                label="Roles to be excluded from using this plugin"
                value={rolesToBeExcluded.map((roleId) => {
                  const role = roles.find((r) => r.id === roleId);
                  return {
                    label: role?.name ?? roleId,
                    value: roleId,
                  };
                })}
                selectInputProps={{
                  isMulti: true,
                  options: roles.map((role) => ({
                    label: role.name ?? '',
                    value: role.id ?? '',
                  })),
                }}
                onChange={(newValue) => {
                  const selectedRoles = newValue.map((v) => v.value);
                  setRolesToBeExcluded(selectedRoles);
                }}
              />
            </div>

            <div style={{ marginTop: '16px' }}>
              <SelectField
                name="apiKeysToBeExcludedFromTranslation"
                id="apiKeysToBeExcludedFromTranslation"
                label="Field API keys to be excluded from using this plugin"
                value={apiKeysToBeExcluded.map((apiKey) => ({
                  label: `${
                    listOfFields.find((field) => field.id === apiKey)?.name
                  } (${
                    listOfFields.find((field) => field.id === apiKey)?.model
                  })`,
                  value: apiKey,
                }))}
                selectInputProps={{
                  isMulti: true,
                  options: listOfFields.map((field) => ({
                    label: `${field.name} (${field.model})`,
                    value: field.id,
                  })),
                }}
                onChange={(newValue) => {
                  const selectedApiKeys = newValue.map((v) => v.value);
                  setApiKeysToBeExcluded(selectedApiKeys);
                }}
              />
            </div>
          </div>
        )}

        {/* Prompt input is not applicable to DeepL; hide for that vendor */}
        {vendor !== 'deepl' && (
          <div className={s.promptContainer}>
            <label
              className={s.label}
              style={{ display: 'flex', alignItems: 'center' }}
              htmlFor="translation-prompt"
            >
              Translation prompt*
              <div className={s.tooltipContainer}>
                ⓘ
                <div className={`${s.tooltipText} ${s.leftAnchorTooltip}`}>
                  Use &#123;fieldValue&#125;, &#123;fromLocale&#125;, and
                  &#123;toLocale&#125; in your prompt to reference the content and
                  source/target languages. Changing the prompt can break the
                  plugin, so proceed with caution.
                </div>
              </div>
            </label>
            <ReactTextareaAutosize
              required
              className={s.textarea}
              placeholder="Enter your prompt here"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              id="translation-prompt"
              aria-labelledby="translation-prompt"
            />
          </div>
        )}

        {/* A button to save the configuration updates. It is disabled if nothing changed or if saving is in progress. */}
        <div className={s.buttons}>
          <Button
            fullWidth
            disabled={
              (vendor === 'openai' && (gptModel === 'None' || !apiKey)) ||
              (vendor === 'google' && (!googleApiKey || !geminiModel)) ||
              (vendor === 'anthropic' && (!anthropicApiKey || !anthropicModel)) ||
              (vendor === 'deepl' && (!deeplProxyUrl)) ||
              ([...translationFields].sort().join(',') ===
                Object.keys(translateFieldTypes).sort().join(',') &&
                translateWholeRecord === true &&
                translateBulkRecords === true &&
                prompt === defaultPrompt &&
                modelsToBeExcluded.length === 0 &&
                rolesToBeExcluded.length === 0 &&
                apiKeysToBeExcluded.length === 0)
            }
            buttonType="muted"
            onClick={() => {
              setVendor('openai');
              setGptModel(recommendedModel ?? 'gpt-4.1-mini');
              setTranslationFields(Object.keys(translateFieldTypes));
              setTranslateWholeRecord(true);
              setTranslateBulkRecords(true);
              setPrompt(defaultPrompt);
              setModelsToBeExcluded([]);
              setRolesToBeExcluded([]);
              setApiKeysToBeExcluded([]);
              ctx.notice(
                '<h1>Plugin options restored to defaults</h1>\n<p>Save to apply changes</p>'
              );
            }}
          >
            Restore to defaults
          </Button>
          <Button
            disabled={!isFormDirty || isLoading}
            fullWidth
            buttonType="primary"
            onClick={() =>
              updatePluginParams(
                ctx,
                vendor,
                apiKey,
                gptModel,
                googleApiKey,
                geminiModel,
                anthropicApiKey,
                anthropicModel,
                deeplEndpoint,
                deeplUseFree,
                deeplFormality,
                deeplPreserveFormatting,
                deeplIgnoreTags,
                deeplNonSplittingTags,
                deeplSplittingTags,
                deeplProxyUrl,
                deeplGlossaryId,
                deeplGlossaryPairs,
                translationFields,
                translateWholeRecord,
                translateBulkRecords,
                prompt,
                modelsToBeExcluded,
                rolesToBeExcluded,
                apiKeysToBeExcluded,
                setIsLoading,
                enableDebugging
              )
            }
          >
            {isLoading ? 'Saving...' : 'Save'}
            {isLoading && <Spinner size={24} />}
          </Button>
        </div>
      </div>
    </Canvas>
  );
}
