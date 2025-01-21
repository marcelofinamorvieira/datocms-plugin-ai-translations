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
import { useEffect, useState, useMemo } from 'react';
import OpenAI from 'openai';
import ReactTextareaAutosize from 'react-textarea-autosize';
import { defaultPrompt } from '../../prompts/DefaultPrompt';
import { buildClient } from '@datocms/cma-client-browser';

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
  prompt: string; // The prompt template used by the translation logic
  modelsToBeExcludedFromThisPlugin: string[]; // List of model API keys to exclude from translation
  rolesToBeExcludedFromThisPlugin: string[]; // List of role IDs to exclude from translation
  apiKeysToBeExcludedFromThisPlugin: string[]; // List of API keys to exclude from translation
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
  setGptModel: React.Dispatch<React.SetStateAction<string>>
) {
  try {
    // Create an instance of the OpenAI API client
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

    // Fetch the list of all available models
    const list = await openai.models.list();

    // Map each model object to its ID and store in the component state
    setOptions(list.data.map((option) => option.id));
  } catch (error) {
    console.error('Error fetching OpenAI models:', error);
    // If an error occurs, notify the user that we failed to fetch model list
    setOptions(['Invalid API Key']);
    setGptModel('None');
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
  prompt: string,
  modelsToBeExcludedFromThisPlugin: string[],
  rolesToBeExcludedFromThisPlugin: string[],
  apiKeysToBeExcludedFromThisPlugin: string[],
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
) => {
  setIsLoading(true);
  try {
    await ctx.updatePluginParameters({
      apiKey,
      gptModel,
      translationFields,
      translateWholeRecord,
      prompt,
      modelsToBeExcludedFromThisPlugin,
      rolesToBeExcludedFromThisPlugin,
      apiKeysToBeExcludedFromThisPlugin,
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
    pluginParams.gptModel ?? 'gpt-4o-mini'
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

  // Local state for the translation prompt (includes placeholders like {fieldValue})
  const [prompt, setPrompt] = useState(pluginParams.prompt ?? defaultPrompt);

  // A loading state to indicate asynchronous operations (like saving or model fetching)
  const [isLoading, setIsLoading] = useState(false);

  // Holds all possible GPT models fetched from the OpenAI API
  const [listOfModels, setListOfModels] = useState<string[]>([
    'Insert a valid OpenAI API Key',
  ]);

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
  }, [ctx.itemTypes]);

  useEffect(() => {
    if (apiKey) {
      fetchAvailableModels(apiKey, setListOfModels, setGptModel).catch(
        console.error
      );
    } else {
      setListOfModels(['Insert a valid OpenAI API Key']);
      setGptModel('None');
    }
  }, [apiKey]);

  /**
   * Checks if the user has changed any of the config fields,
   * so we can enable or disable the "Save" button accordingly.
   */
  const isFormDirty = useMemo(() => {
    return (
      apiKey !== (pluginParams.apiKey ?? '') ||
      gptModel !== (pluginParams.gptModel ?? 'None') ||
      translationFields.sort().join(',') !==
        (pluginParams.translationFields?.sort().join(',') ??
          Object.keys(translateFieldTypes).sort().join(',')) ||
      translateWholeRecord !== (pluginParams.translateWholeRecord ?? true) ||
      prompt !== (pluginParams.prompt ?? defaultPrompt) ||
      modelsToBeExcluded.sort().join(',') !==
        (pluginParams.modelsToBeExcludedFromThisPlugin?.sort().join(',') ??
          '') ||
      rolesToBeExcluded.sort().join(',') !==
        (pluginParams.rolesToBeExcludedFromThisPlugin?.sort().join(',') ??
          '') ||
      apiKeysToBeExcluded.sort().join(',') !==
        (pluginParams.apiKeysToBeExcludedFromThisPlugin?.sort().join(',') ?? '')
    );
  }, [
    apiKey,
    gptModel,
    translationFields,
    translateWholeRecord,
    prompt,
    modelsToBeExcluded,
    rolesToBeExcluded,
    apiKeysToBeExcluded,
    pluginParams.apiKey,
    pluginParams.gptModel,
    pluginParams.translationFields,
    pluginParams.translateWholeRecord,
    pluginParams.prompt,
    pluginParams.modelsToBeExcludedFromThisPlugin,
    pluginParams.rolesToBeExcludedFromThisPlugin,
    pluginParams.apiKeysToBeExcludedFromThisPlugin,
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
    const client = buildClient({ apiToken: ctx.currentUserAccessToken! });
    client.roles.list().then((roles) => {
      setRoles(roles.map((role) => ({ id: role.id, name: role.name })));
    });
  }, []);

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
                {listOfModels.length === 1 && (
                  <DropdownOption>{listOfModels[0]}</DropdownOption>
                )}
                {listOfModels
                  .filter((model) => model.toLowerCase().includes('gpt'))
                  .map((model) => (
                    <DropdownOption
                      key={model}
                      onClick={() => setGptModel(model)}
                    >
                      {model}
                    </DropdownOption>
                  ))}
              </DropdownMenu>
            </Dropdown>
            <span
              onClick={() => {
                setGptModel('gpt-4o-mini');
                ctx.notice('Selected gpt-4o-mini');
              }}
              className={s.tooltipConfig}
            >
              Using gpt-4o-mini is recommended
            </span>
          </div>
        </div>

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
          <SwitchField
            name="translateWholeRecord"
            id="translateWholeRecord"
            label="Allow translation of the whole record from the sidebar"
            value={translateWholeRecord}
            onChange={(newValue) => setTranslateWholeRecord(newValue)}
          />
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
              &#9432;
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
          >
            Translation prompt*
            {/* Tooltip container to show the info text on hover */}
            <div className={s.tooltipContainer}>
              &#9432;
              {/* Actual tooltip text that appears on hover */}
              <div className={s.tooltipText}>
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
          />
        </div>

        {/* A button to save the configuration updates. It is disabled if nothing changed or if saving is in progress. */}
        <div className={s.buttons}>
          <Button
            fullWidth
            disabled={
              gptModel === 'None' ||
              (translationFields.sort().join(',') ===
                Object.keys(translateFieldTypes).sort().join(',') &&
                translateWholeRecord === true &&
                prompt === defaultPrompt &&
                modelsToBeExcluded.length === 0 &&
                rolesToBeExcluded.length === 0 &&
                apiKeysToBeExcluded.length === 0)
            }
            buttonType="muted"
            onClick={() => {
              setGptModel('gpt-4o-mini');
              setTranslationFields(Object.keys(translateFieldTypes));
              setTranslateWholeRecord(true);
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
                prompt,
                modelsToBeExcluded,
                rolesToBeExcluded,
                apiKeysToBeExcluded,
                setIsLoading
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
