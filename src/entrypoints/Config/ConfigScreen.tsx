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

/**
 * Props type for the ConfigScreen component.
 * @property ctx - The context provided by DatoCMS for rendering the config screen.
 */
type Props = {
  ctx: RenderConfigScreenCtx;
};

/**
 * Type definition for the plugin parameters.
 * @property gptModel - The selected GPT model.
 * @property apiKey - The OpenAI API key.
 */
export type ctxParamsType = {
  gptModel: string;
  apiKey: string;
  translationFields: string[];
  translateWholeRecord: boolean;
};

export const translateFieldTypes = {
  single_line: 'Singe line string',
  markdown: 'Markdown',
  wysiwyg: 'HTML Editor',
  textarea: 'Textarea',
  slug: 'Slug',
  json: 'JSON',
  seo: 'SEO',
  structured_text: 'Structured Text',
};

/**
 * Fetches available models from OpenAI using the provided API key.
 * @param apiKey - The OpenAI API key.
 * @param setOptions - State setter to update the list of available models.
 */
async function fetchAvailableModels(
  apiKey: string,
  setOptions: React.Dispatch<React.SetStateAction<string[]>>
) {
  try {
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    const list = await openai.models.list();
    // Extract and set the model IDs from the fetched data
    setOptions(list.data.map((option) => option.id));
  } catch (error) {
    console.error('Error fetching OpenAI models:', error);
    setOptions(['Failed to fetch models']);
  }
}

/**
 * Updates the plugin parameters with the provided values.
 * @param ctx - The context provided by DatoCMS.
 * @param apiKey - The OpenAI API key to be saved.
 * @param gptModel - The selected GPT model to be saved.
 * @param setIsLoading - State setter to manage the loading state.
 */
const updatePluginParams = async (
  ctx: RenderConfigScreenCtx,
  apiKey: string,
  gptModel: string,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
) => {
  setIsLoading(true);
  try {
    // Update the plugin parameters with the new values
    await ctx.updatePluginParameters({ apiKey, gptModel });
    ctx.notice('Plugin options updated successfully!');
  } catch (error) {
    console.error('Error updating plugin parameters:', error);
    ctx.alert('Failed to update plugin options. Please try again.');
  } finally {
    setIsLoading(false);
  }
};

/**
 * ConfigScreen component renders the configuration UI for the plugin.
 * It includes fields for OpenAI API Key, GPT Model selection
 * The Save button is enabled only when there are unsaved changes.
 *
 * @param Props - The properties passed to the component.
 * @returns JSX.Element representing the configuration screen.
 */
export default function ConfigScreen({ ctx }: Props) {
  // Extract initial plugin parameters
  const pluginParams = ctx.plugin.attributes.parameters as ctxParamsType;

  // State for GPT Model selection, initialized with plugin parameter or default 'None'
  const [gptModel, setGptModel] = useState(pluginParams.gptModel ?? 'None');

  // State for OpenAI API Key, initialized with plugin parameter or empty string
  const [apiKey, setApiKey] = useState(pluginParams.apiKey ?? '');

  // Loading state to manage asynchronous operations
  const [isLoading, setIsLoading] = useState(false);

  // State to hold the list of available GPT models
  const [listOfModels, setListOfModels] = useState<string[]>([
    'Insert a valid OpenAI API Key',
  ]);

  /**
   * useEffect hook to fetch available GPT models whenever the API key changes.
   * Ensures models are fetched only when a valid API key is provided.
   */
  useEffect(() => {
    if (apiKey) {
      fetchAvailableModels(apiKey, setListOfModels).catch(console.error);
    }
    // Dependency array ensures this effect runs only when apiKey changes
  }, [apiKey]);

  /**
   * useMemo hook to determine if the form has unsaved changes.
   * Compares current state with initial plugin parameters.
   * Returns true if any field has been modified.
   */
  const isFormDirty = useMemo(() => {
    return (
      apiKey !== (pluginParams.apiKey ?? '') ||
      gptModel !== (pluginParams.gptModel ?? 'None')
    );
  }, [apiKey, gptModel, pluginParams.apiKey, pluginParams.gptModel]);

  const translationFields = Array.isArray(pluginParams.translationFields)
    ? pluginParams.translationFields
    : Object.keys(translateFieldTypes);

  return (
    <Canvas ctx={ctx}>
      {/* TextField for OpenAI API Key */}
      <TextField
        required
        name="openAIAPIKey"
        id="openAIAPIKey"
        label="OpenAI API Key"
        value={apiKey}
        onChange={(newValue) => setApiKey(newValue)}
        placeholder="sk-..."
      />

      {/* Dropdown for GPT Model selection */}
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
            {/* Display a message if models failed to load */}
            {listOfModels.length === 1 && (
              <DropdownOption>{listOfModels[0]}</DropdownOption>
            )}
            {/* List available GPT models */}
            {listOfModels
              .filter((model) => model.toLowerCase().includes('gpt'))
              .map((model) => (
                <DropdownOption onClick={() => setGptModel(model)} key={model}>
                  {model}
                </DropdownOption>
              ))}
          </DropdownMenu>
        </Dropdown>
        <span className={s.tooltipConfig}>
          Using gpt-4o-mini is recommended
        </span>
      </div>

      <SelectField
        name="fieldsWithTranslationOption"
        id="fieldsWithTranslationOption"
        label="Fields with the 'Translate' option"
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
          //todo: implement
        }}
      />

      <div className={s.switchField}>
        <SwitchField
          name="translateWholeRecord"
          id="translateWholeRecord"
          label="Allow translation of the whole record from the sidebar"
          value={pluginParams.translateWholeRecord}
          onChange={
            (newValue) => {}
            //todo: implement
          }
        />
      </div>

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

              setIsLoading
            )
          }
        >
          {isLoading ? 'Saving...' : 'Save'}{' '}
          {isLoading && <Spinner size={24} />}
        </Button>
      </div>
    </Canvas>
  );
}