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
import { useEffect, useState, useMemo, useCallback } from 'react';
import ReactTextareaAutosize from 'react-textarea-autosize';
import { defaultPrompt } from '../../prompts/DefaultPrompt';
import { buildClient } from '@datocms/cma-client-browser';
import { listRelevantOpenAIModels } from '../../utils/translation/OpenAIModels';

/**
 * The shape of the plugin parameters we store in DatoCMS.
 * These fields are updated on the plugin configuration screen
 * and used throughout the plugin for translation.
 */
export type ctxParamsType = {
  gptModel: string; // The GPT model used for translations
  apiKey: string; // The API key used to authenticate with OpenAI
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

    // Prefer gpt‑5‑mini when available; else gpt‑5; else first item.
    const preferMini = models.find((m) => /^(gpt-5([.-]|$).*)?mini\b/.test(m) || /^(gpt-5([.-]|$)).*\bmini\b/.test(m));
    const preferGpt5 = models.find((m) => /^gpt-5(\b|[.-])/.test(m));
    const recommended = preferMini || preferGpt5 || models[0] || null;
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
  apiKey: string,
  gptModel: string,
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
      apiKey,
      gptModel,
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
  const [apiKey, setApiKey] = useState(pluginParams.apiKey ?? '');

  // Local state for the selected GPT model
  const [gptModel, setGptModel] = useState(
    pluginParams.gptModel ?? 'None'
  );

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
    if (apiKey) {
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
  }, [ctx.itemTypes, apiKey, ctx.loadItemTypeFields]);

  useEffect(() => {
    if (apiKey) {
      fetchAvailableModels(
        apiKey,
        setListOfModels,
        setGptModel,
        setRecommendedModel
      ).catch(console.error);
    } else {
      setListOfModels(['Insert a valid OpenAI API Key']);
      setGptModel('None');
      setRecommendedModel(null);
    }
  }, [apiKey]);

  // If we detect a recommended model and the current selection is unset or None,
  // adopt the recommendation automatically.
  useEffect(() => {
    if (recommendedModel && (gptModel === 'None' || !pluginParams.gptModel)) {
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
    apiKey,
    gptModel,
    translationFields,
    translateWholeRecord,
    translateBulkRecords,
    prompt,
    modelsToBeExcluded,
    rolesToBeExcluded,
    apiKeysToBeExcluded,
    enableDebugging,
    normalizeList,
    pluginParams.apiKey,
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
        {/* Text field for entering the OpenAI API key */}
        <TextField
          required
          name="openAIAPIKey"
          id="openAIAPIKey"
          label="OpenAI API Key"
          value={apiKey}
          onChange={(newValue) => setApiKey(newValue)}
          placeholder="sk-..."
        />

        {/* GPT Model dropdown selector */}
        <div className={s.dropdownLabel}>
          <span className={s.label}>GPT Model*</span>
          <span className={s.tooltipContainer}>
            ⓘ
            <span className={`${s.tooltipText} ${s.leftAnchorTooltip}`}>
              <div style={{ textAlign: 'left' }}>
                <div><b>Default:</b> gpt-5-mini — best quality/cost/latency balance.</div>
                <div><b>High-stakes short copy:</b> gpt-5</div>
                <div><b>Large or budget batches:</b> gpt-5-nano</div>
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

        {/* Prompt input section, including a custom hover-based tooltip for placeholders usage */}
        <div className={s.promptContainer}>
          <label
            className={s.label}
            style={{ display: 'flex', alignItems: 'center' }}
            htmlFor="translation-prompt"
          >
            Translation prompt*
            {/* Tooltip container to show the info text on hover */}
            <div className={s.tooltipContainer}>
              ⓘ
              {/* Actual tooltip text that appears on hover */}
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

        {/* A button to save the configuration updates. It is disabled if nothing changed or if saving is in progress. */}
        <div className={s.buttons}>
          <Button
            fullWidth
            disabled={
              gptModel === 'None' ||
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
              setGptModel(recommendedModel ?? 'gpt-5-mini');
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
                apiKey,
                gptModel,
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
