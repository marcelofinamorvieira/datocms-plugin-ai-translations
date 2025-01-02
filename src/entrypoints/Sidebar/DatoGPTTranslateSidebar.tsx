import { RenderItemFormSidebarPanelCtx } from 'datocms-plugin-sdk';
import { Button, Canvas, SelectField } from 'datocms-react-ui';
import { useState } from 'react';
import { ctxParamsType } from '../Config/ConfigScreen';
import { motion, AnimatePresence } from 'framer-motion';
import { translateRecordFields } from '../../utils/translateRecordFields';
import { ChatBubble } from './Components/ChatbubbleTranslate';

/**
 * DatoGPTTranslateSidebar.tsx
 *
 * This file renders a sidebar panel in the DatoCMS UI that allows users to translate
 * all fields of a record from a source locale into one or more target locales.
 *
 * Features:
 * - Lets the user pick a "From" locale (source) and multiple "To" locales (targets).
 * - On clicking "Translate all fields", all translatable fields in the record are translated.
 * - Displays a loading spinner while the translation is in progress.
 *   Each bubble represents a field-locale translation. When translation starts for a field-locale,
 *   a bubble appears. When that translation completes, the bubble updates to a completed state.
 *
 * State variables:
 * - selectedLocale: The source locale for translation (default: the first locale in internalLocales).
 * - selectedLocales: The target locales to translate into (all locales except the source by default).
 * - isLoading: Boolean indicating if the translation is currently in progress.
 * - translationBubbles: An array of objects representing the translation bubbles on the UI.
 *   Each bubble has { fieldLabel: string, locale: string, status: 'pending'|'done' }.
 *
 * Steps:
 * 1. User picks locales.
 * 2. Click "Translate all fields".
 * 3. The translateRecordFields utility function translates each field-locale pair and
 *    calls our onStart and onComplete callbacks for each translation.
 * 4. onStart callback adds a bubble with status 'pending', onComplete updates it to 'done'.
 * 5. Once all translations finish, isLoading is set to false and user gets a success message.
 */

type PropTypes = {
  ctx: RenderItemFormSidebarPanelCtx;
};

export default function DatoGPTTranslateSidebar({ ctx }: PropTypes) {
  // Retrieve plugin parameters, expecting API keys and model details
  const pluginParams = ctx.plugin.attributes.parameters as ctxParamsType;

  // The first locale in internalLocales is considered the source/base locale
  const [selectedLocale, setSelectedLocale] = useState<string>(
    (ctx.formValues.internalLocales as Array<string>)[0]
  );

  // By default, all other locales are target locales
  const [selectedLocales, setSelectedLocales] = useState<Array<string>>(
    (ctx.formValues.internalLocales as Array<string>).filter(
      (locale) => locale !== selectedLocale
    )
  );

  // isLoading tracks if translation is in progress
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // translationBubbles stores the chat-like bubble info.
  // Each bubble: { fieldLabel: string, locale: string, status: 'pending'|'done' }
  const [translationBubbles, setTranslationBubbles] = useState<
    {
      fieldLabel: string;
      locale: string;
      status: 'pending' | 'done';
      fieldPath: string;
    }[]
  >([]);

  // If no valid API key or model is configured, prompt user to fix configuration
  if (!pluginParams.apiKey || !pluginParams.gptModel) {
    return (
      <Canvas ctx={ctx}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Button
            buttonType="muted"
            onClick={() =>
              ctx.navigateTo(
                '/configuration/plugins/' + ctx.plugin.id + '/edit'
              )
            }
          >
            Insert a valid OpenAI API Key <br /> and select a GPT & DALL-E Model
          </Button>
        </div>
      </Canvas>
    );
  }

  /**
   * handleTranslateAllFields
   *
   * Called when "Translate all fields" is clicked.
   * Sets the loading state and calls translateRecordFields with callbacks.
   */
  async function handleTranslateAllFields() {
    setIsLoading(true);
    setTranslationBubbles([]);

    try {
      await translateRecordFields(
        ctx,
        pluginParams,
        selectedLocales,
        selectedLocale,
        {
          onStart: (fieldLabel, locale, fieldPath) => {
            // Add a new bubble to represent this translation's start
            setTranslationBubbles((prev) => [
              ...prev,
              { fieldLabel, locale, status: 'pending', fieldPath },
            ]);
          },
          onComplete: (fieldLabel, locale) => {
            // Update the bubble to 'done' status
            setTranslationBubbles((prev) =>
              prev.map((bubble) =>
                bubble.fieldLabel === fieldLabel && bubble.locale === locale
                  ? { ...bubble, status: 'done' }
                  : bubble
              )
            );
          },
        }
      );

      // After success, show success message
      ctx.notice('All fields translated successfully');
    } catch (error: any) {
      // Show error alert if something goes wrong
      ctx.alert(
        error.message || 'An unknown error occurred during translation'
      );
    } finally {
      // Return to idle state regardless of outcome
      setIsLoading(false);
    }
  }

  return (
    <Canvas ctx={ctx}>
      <AnimatePresence mode="wait">
        {!isLoading ? (
          // When not loading, show the configuration form
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              marginBottom: '1rem',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: '1rem',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <h3>From</h3>
              <SelectField
                name="fromLocale"
                id="fromLocale"
                label=""
                value={[{ label: selectedLocale, value: selectedLocale }]}
                selectInputProps={{
                  isMulti: false,
                  options: (
                    ctx.formValues.internalLocales as Array<string>
                  ).map((locale) => ({
                    label: locale,
                    value: locale,
                  })),
                }}
                onChange={(newValue) => {
                  const newSourceLocale = newValue?.value || selectedLocale;
                  setSelectedLocale(newSourceLocale);
                  setSelectedLocales(
                    (ctx.formValues.internalLocales as Array<string>).filter(
                      (locale) => locale !== newSourceLocale
                    )
                  );
                }}
              />
              <h3>To</h3>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <SelectField
                name="toLocales"
                id="toLocales"
                label=""
                value={selectedLocales.map((locale) => ({
                  label: locale,
                  value: locale,
                }))}
                selectInputProps={{
                  isMulti: true,
                  options: (ctx.formValues.internalLocales as Array<string>)
                    .filter((locale) => locale !== selectedLocale)
                    .map((locale) => ({
                      label: locale,
                      value: locale,
                    })),
                }}
                onChange={(newValue) => {
                  setSelectedLocales(
                    newValue?.map((locale) => locale.value) || []
                  );
                }}
              />
            </div>

            <Button fullWidth onClick={handleTranslateAllFields}>
              Translate all fields
            </Button>
          </motion.div>
        ) : (
          // When loading, show spinner and translation bubbles
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              padding: '0 16px',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {translationBubbles.map((bubble, index) => (
                <div
                  key={index}
                  onClick={() => {
                    ctx.scrollToField(bubble.fieldPath, bubble.locale);
                  }}
                >
                  <ChatBubble
                    key={index}
                    index={index}
                    bubble={bubble}
                    theme={ctx.theme}
                  />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Canvas>
  );
}
