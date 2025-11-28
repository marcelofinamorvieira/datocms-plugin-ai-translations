/**
 * OpenAIConfig.tsx
 * Configuration component for OpenAI vendor settings.
 */

import {
  Button,
  CaretDownIcon,
  CaretUpIcon,
  Dropdown,
  DropdownMenu,
  DropdownOption,
  TextField,
} from 'datocms-react-ui';
import s from '../../styles.module.css';

export interface OpenAIConfigProps {
  apiKey: string;
  setApiKey: (value: string) => void;
  gptModel: string;
  setGptModel: (value: string) => void;
  listOfModels: string[];
}

export default function OpenAIConfig({
  apiKey,
  setApiKey,
  gptModel,
  setGptModel,
  listOfModels,
}: OpenAIConfigProps) {
  return (
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
        </div>
      </div>
    </>
  );
}

