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
 */
export type ctxParamsType = {
  gptModel: string;
  apiKey: string;
  translationFields: string[];
  translateWholeRecord: boolean;
  prompt: string;
};

/**
 * A mapping from field editor types to their user-friendly labels.
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
 * @param apiKey - your OpenAI API key.
 * @param setOptions - callback to set the retrieved models in state.
 */
async function fetchAvailableModels(
  apiKey: string,
  setOptions: React.Dispatch<React.SetStateAction<string[]>>
) {
  try {
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    const list = await openai.models.list();
    // We only store the model IDs
    setOptions(list.data.map((option) => option.id));
  } catch (error) {
    console.error('Error fetching OpenAI models:', error);
    setOptions(['Failed to fetch models']);
  }
}

/**
 * Persists the updated plugin parameters to DatoCMS.
 * @param ctx - the DatoCMS render context.
 * @param apiKey - new OpenAI API key.
 * @param gptModel - chosen GPT model.
 * @param translationFields - which field types can be translated.
 * @param translateWholeRecord - whether to enable entire record translation.
 * @param prompt - user-defined or default translation prompt.
 * @param setIsLoading - toggles the local loading state.
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
  setIsLoading(true);
  try {
    await ctx.updatePluginParameters({
      apiKey,
      gptModel,
      translationFields,
      translateWholeRecord,
      prompt,
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
 * @param props - contains the RenderConfigScreenCtx from DatoCMS
 */
export default function ConfigScreen({ ctx }: { ctx: RenderConfigScreenCtx }) {
  // Extract existing plugin params or fallback to defaults
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

  // Local state for the translation prompt
  const [prompt, setPrompt] = useState(pluginParams.prompt ?? defaultPrompt);

  // Manage loading for asynchronous operations
  const [isLoading, setIsLoading] = useState(false);

  // Holds all possible GPT models fetched from the OpenAI API
  const [listOfModels, setListOfModels] = useState<string[]>([
    'Insert a valid OpenAI API Key',
  ]);

  /**
   * When the user updates or removes the API key, refetch the model list.
   */
  useEffect(() => {
    if (apiKey) {
      fetchAvailableModels(apiKey, setListOfModels).catch(console.error);
    } else {
      setListOfModels(['Insert a valid OpenAI API Key']);
    }
  }, [apiKey]);

  /**
   * Check if the user has changed any of the config fields,
   * so we can enable or disable the Save button accordingly.
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
    <Canvas ctx={ctx}>
      <div>
        {/* API Key input */}
        <TextField
          required
          name="openAIAPIKey"
          id="openAIAPIKey"
          label="OpenAI API Key"
          value={apiKey}
          onChange={(newValue) => setApiKey(newValue)}
          placeholder="sk-..."
        />

        {/* GPT Model selector */}
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
          <span className={s.tooltipConfig}>Using gpt-4o-mini is recommended</span>
        </div>

        {/* Field types multi-select */}
        <SelectField
          name="fieldsWithTranslationOption"
          id="fieldsWithTranslationOption"
          label="Fields that can be translated"
          value={translationFields.map((field) => ({
            label: translateFieldTypes[field as keyof typeof translateFieldTypes],
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

        {/* Prompt input */}
        <div className={s.promptContainer}>
          <span className={s.label}>Translation prompt*</span>
          <ReactTextareaAutosize
            required
            className={s.textarea}
            placeholder="Enter your prompt here"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        {/* Switch to enable translating entire record */}
        <div className={s.switchField}>
          <SwitchField
            name="translateWholeRecord"
            id="translateWholeRecord"
            label="Allow translation of the whole record from the sidebar"
            value={translateWholeRecord}
            onChange={(newValue) => setTranslateWholeRecord(newValue)}
          />
        </div>

        {/* Save button (enabled only if form is dirty) */}
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