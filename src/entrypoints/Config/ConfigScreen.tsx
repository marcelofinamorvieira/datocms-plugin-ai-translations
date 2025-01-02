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
};

/**
 * Fetches the list of available models from OpenAI using the provided API key.
 * It sets the list of model IDs or an error message in the local component state.
 *
 * @param apiKey - Your OpenAI API key
 * @param setOptions - Callback to set the retrieved models in state
 */
async function fetchAvailableModels(
  apiKey: string,
  setOptions: React.Dispatch<React.SetStateAction<string[]>>
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
    setOptions(['Failed to fetch models']);
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
 * @param setIsLoading - Toggles the local loading state
 */
const updatePluginParams = async (
  ctx: RenderConfigScreenCtx,
  apiKey: string,
  gptModel: string,
  translationFields: string[],
  translateWholeRecord: boolean,
  prompt: string,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
) => {
  // Enter a loading state while we update the plugin parameters
  setIsLoading(true);
  try {
    // Update the plugin parameters in DatoCMS
    await ctx.updatePluginParameters({
      apiKey,
      gptModel,
      translationFields,
      translateWholeRecord,
      prompt,
    });

    // Notify the user of success
    ctx.notice('Plugin options updated successfully!');
  } catch (error) {
    console.error('Error updating plugin parameters:', error);
    // Alert the user if something goes wrong
    ctx.alert('Failed to update plugin options. Please try again.');
  } finally {
    // Exit the loading state
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
  const [gptModel, setGptModel] = useState(pluginParams.gptModel ?? 'None');

  // Local state for which field types can be translated
  const [translationFields, setTranslationFields] = useState<string[]>(
    Array.isArray(pluginParams.translationFields) &&
      pluginParams.translationFields.length > 0
      ? pluginParams.translationFields
      : Object.keys(translateFieldTypes)
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

  /**
   * When the user updates or removes the API key, we refetch the model list.
   * If there's no API key provided, we show a placeholder message.
   */
  useEffect(() => {
    if (apiKey) {
      fetchAvailableModels(apiKey, setListOfModels).catch(console.error);
    } else {
      setListOfModels(['Insert a valid OpenAI API Key']);
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
      prompt !== (pluginParams.prompt ?? defaultPrompt)
    );
  }, [
    apiKey,
    gptModel,
    translationFields,
    translateWholeRecord,
    prompt,
    pluginParams.apiKey,
    pluginParams.gptModel,
    pluginParams.translationFields,
    pluginParams.translateWholeRecord,
    pluginParams.prompt,
  ]);

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
        <div className={s.modelSelect}>
          <span>GPT Model:</span>
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
          <span className={s.tooltipConfig}>
            Using gpt-4o-mini is recommended
          </span>
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

        {/* A button to save the configuration updates. It is disabled if nothing changed or if saving is in progress. */}
        <div className={s.buttons}>
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
