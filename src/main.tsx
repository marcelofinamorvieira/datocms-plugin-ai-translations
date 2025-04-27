/**
 * main.tsx
 * -------------------------------------------
 * This file connects the plugin to DatoCMS,
 * defines field dropdown actions, and triggers
 * the translation logic when actions are invoked.
 */

import {
  connect,
  type DropdownAction,
  type DropdownActionGroup,
  type ExecuteFieldDropdownActionCtx,
  type FieldDropdownActionsCtx,
  type ItemFormSidebarPanelsCtx,
  type ItemType,
  type RenderFieldExtensionCtx,
  type RenderItemFormSidebarPanelCtx,
} from 'datocms-plugin-sdk';
import 'datocms-react-ui/styles.css';
import ConfigScreen, {
  type ctxParamsType,
  modularContentVariations,
  translateFieldTypes,
} from './entrypoints/Config/ConfigScreen';
import { render } from './utils/render';
import locale from 'locale-codes';
import TranslateField from './utils/translation/TranslateField';
import DatoGPTTranslateSidebar from './entrypoints/Sidebar/DatoGPTTranslateSidebar';
import { Button, Canvas } from 'datocms-react-ui';
import LoadingAddon from './entrypoints/LoadingAddon';
import { defaultPrompt } from './prompts/DefaultPrompt';

const localeSelect = locale.getByTag;

/**
 * Helper function to get nested values by dot/bracket notation
 * @param obj - object to traverse
 * @param path - dot/bracket string path
 * @returns the located value if any
 */
function getValueAtPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key: string) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') {
      return undefined;
    }
    
    const index = Number(key);
    return Number.isNaN(index) 
      ? (acc as Record<string, unknown>)[key] 
      : (acc as unknown[])[index];
  }, obj);
}

// This SVG icon string is used for the OpenAI label
const openAIIcon =
  '<svg fill="#000000" role="img" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><title>OpenAI icon</title><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813z"></path></g></svg>';

/**
 * Primary plugin connection point.
 */
connect({
  /**
   * Render the configuration screen, used in the plugin settings.
   */
  onBoot(ctx) {
    const pluginParams = ctx.plugin.attributes.parameters as ctxParamsType;

    // Set default values for undefined parameters
    if (!pluginParams.translationFields) {
      ctx.updatePluginParameters({
        ...pluginParams,
        translationFields: Object.keys(translateFieldTypes),
      });
    }
    if (typeof pluginParams.translateWholeRecord === 'undefined') {
      ctx.updatePluginParameters({
        ...pluginParams,
        translateWholeRecord: true,
      });
    }
    if (!pluginParams.prompt) {
      ctx.updatePluginParameters({
        ...pluginParams,
        prompt: defaultPrompt,
      });
    }
    if (!pluginParams.modelsToBeExcludedFromThisPlugin) {
      ctx.updatePluginParameters({
        ...pluginParams,
        modelsToBeExcludedFromThisPlugin: [],
      });
    }
    if (!pluginParams.rolesToBeExcludedFromThisPlugin) {
      ctx.updatePluginParameters({
        ...pluginParams,
        rolesToBeExcludedFromThisPlugin: [],
      });
    }
    if (!pluginParams.apiKeysToBeExcludedFromThisPlugin) {
      ctx.updatePluginParameters({
        ...pluginParams,
        apiKeysToBeExcludedFromThisPlugin: [],
      });
    }
    if (!pluginParams.gptModel) {
      ctx.updatePluginParameters({
        ...pluginParams,
        gptModel: 'gpt-4o-mini',
      });
    }
  },

  renderConfigScreen(ctx) {
    return render(<ConfigScreen ctx={ctx} />);
  },

  /**
   * Registers a sidebar panel if 'translateWholeRecord' is enabled.
   */
  itemFormSidebarPanels(model: ItemType, ctx: ItemFormSidebarPanelsCtx) {
    const pluginParams = ctx.plugin.attributes.parameters as ctxParamsType;
    const isRoleExcluded =
      pluginParams.rolesToBeExcludedFromThisPlugin.includes(ctx.currentRole.id);
    const isModelExcluded =
      pluginParams.modelsToBeExcludedFromThisPlugin.includes(
        model.attributes.api_key
      );

    if (
      !pluginParams.translateWholeRecord ||
      isModelExcluded ||
      isRoleExcluded
    ) {
      return [];
    }

    return [
      {
        id: 'datoGptTranslateSidebar',
        label: 'DatoGPT Translate',
        placement: ['after', 'info'],
      },
    ];
  },

  /**
   * Render the actual sidebar panel if more than one locale is available.
   */
  renderItemFormSidebarPanel(
    sidebarPanelId,
    ctx: RenderItemFormSidebarPanelCtx
  ) {
    const pluginParams = ctx.plugin.attributes.parameters as ctxParamsType;
    if (
      !pluginParams.apiKey ||
      !pluginParams ||
      !pluginParams.gptModel ||
      pluginParams.gptModel === 'None'
    ) {
      return render(
        <Canvas ctx={ctx}>
          <Button
            fullWidth
            onClick={() =>
              ctx.navigateTo(`/configuration/plugins/${ctx.plugin.id}/edit`)
            }
          >
            Please insert a valid API Key <br /> and select a GPT Model
          </Button>
        </Canvas>
      );
    }
    if (sidebarPanelId === 'datoGptTranslateSidebar') {
      if (
        Array.isArray(ctx.formValues.internalLocales) &&
        ctx.formValues.internalLocales.length > 1
      ) {
        return render(<DatoGPTTranslateSidebar ctx={ctx} />);
      }
      return render(
        <Canvas ctx={ctx}>
          <p>
            For the translate feature to work, you need to have more than one
            locale in this record.
          </p>
        </Canvas>
      );
    }
    return null;
  },

  /**
   * Creates dropdown actions for each translatable field.
   */
  fieldDropdownActions(_field, ctx: FieldDropdownActionsCtx) {
    const pluginParams = ctx.plugin.attributes.parameters as ctxParamsType;
    const openaAIIconObject = {
      type: 'svg',
      viewBox: '0 0 28 28',
      content: openAIIcon,
    };

    const menuOpenAIIconObject = {
      type: 'svg',
      viewBox: '0 -8 33 33',
      content: openAIIcon,
    };

    // If plugin is not configured with an API key or GPT model, show an error
    if (
      !pluginParams.apiKey ||
      !pluginParams ||
      !pluginParams.gptModel ||
      pluginParams.gptModel === 'None'
    ) {
      return [
        {
          id: 'not-configured',
          label: 'Please insert a valid API Key and select a GPT Model',
          icon: openaAIIconObject,
        } as DropdownAction,
      ];
    }

    const isModelExcluded =
      pluginParams.modelsToBeExcludedFromThisPlugin.includes(
        ctx.itemType.attributes.api_key
      );

    const isRoleExcluded =
      pluginParams.rolesToBeExcludedFromThisPlugin.includes(ctx.currentRole.id);

    const isFieldExcluded =
      pluginParams.apiKeysToBeExcludedFromThisPlugin.includes(ctx.field.id);

    let isFieldTranslatable = pluginParams.translationFields.includes(
      ctx.field.attributes.appearance.editor
    );

    if (
      (pluginParams.translationFields.includes('rich_text') &&
        modularContentVariations.includes(
          ctx.field.attributes.appearance.editor
        )) ||
      (pluginParams.translationFields.includes('file') &&
        ctx.field.attributes.appearance.editor === 'gallery')
    ) {
      isFieldTranslatable = true;
    }

    if (
      isModelExcluded ||
      isRoleExcluded ||
      isFieldExcluded ||
      !isFieldTranslatable
    ) {
      return [];
    }

    // Extract field type from field's appearance
    const fieldType = ctx.field.attributes.appearance.editor;

    // Attempt to get field value from form values
    const fieldValue =
      ctx.formValues[ctx.field.attributes.api_key] ||
      (ctx.parentField?.attributes.localized &&
        getValueAtPath(ctx.formValues, ctx.fieldPath));

    // Specialized check for structured text that might appear empty
    let isEmptyStructuredText =
      fieldType === 'structured_text' &&
      Array.isArray(fieldValue) &&
      fieldValue.length === 1 &&
      typeof fieldValue[0] === 'object' &&
      fieldValue[0] !== null &&
      'type' in fieldValue[0] &&
      fieldValue[0].type === 'paragraph' &&
      fieldValue[0].children?.length === 1 &&
      fieldValue[0].children[0].text === '';

    let hasFieldValueInThisLocale = !!fieldValue && !isEmptyStructuredText;

    // Check if there are multiple locales in this record
    const hasOtherLocales =
      Array.isArray(ctx.formValues.internalLocales) &&
      ctx.formValues.internalLocales.length > 1;

    // Check if field is localized
    const isLocalized = ctx.field.attributes.localized;

    // Additional check if fieldValue is an object keyed by locales
    if (
      fieldValue &&
      typeof fieldValue === 'object' &&
      !Array.isArray(fieldValue) &&
      ctx.locale in (fieldValue as Record<string, unknown>)
    ) {
      const fieldValueInThisLocale = (fieldValue as Record<string, unknown>)[
        ctx.locale
      ];

      isEmptyStructuredText =
        fieldType === 'structured_text' &&
        Array.isArray(fieldValueInThisLocale) &&
        fieldValueInThisLocale.length === 1 &&
        typeof fieldValueInThisLocale[0] === 'object' &&
        fieldValueInThisLocale[0] !== null &&
        'type' in fieldValueInThisLocale[0] &&
        fieldValueInThisLocale[0].type === 'paragraph' &&
        fieldValueInThisLocale[0].children.length === 1 &&
        fieldValueInThisLocale[0].children[0].text === '';

      hasFieldValueInThisLocale =
        !!fieldValueInThisLocale && !isEmptyStructuredText;
    }

    const actionsArray: (DropdownAction | DropdownActionGroup)[] = [];
    const availableLocales = ctx.formValues.internalLocales as string[];

    // "Translate to" actions
    if (isLocalized && hasOtherLocales && hasFieldValueInThisLocale) {
      actionsArray.push({
        label: 'Translate to',
        icon: menuOpenAIIconObject,
        actions: [
          {
            id: 'translateTo.allLocales',
            label: 'All locales',
            icon: 'globe',
          },
          ...availableLocales
            .filter((locale) => locale !== ctx.locale)
            .map((locale) => ({
              id: `translateTo.${locale}`,
              label: localeSelect(locale)?.name,
              icon: 'globe',
            })),
        ],
      } as DropdownActionGroup);
    }

    // "Translate from" actions
    if (isLocalized && hasOtherLocales) {
      actionsArray.push({
        label: 'Translate from',
        icon: menuOpenAIIconObject,
        actions: [
          ...availableLocales
            .filter((locale) => locale !== ctx.locale)
            .map((locale) => ({
              id: `translateFrom.${locale}`,
              label: localeSelect(locale)?.name,
              icon: 'globe',
            })),
        ],
      } as DropdownActionGroup);
    }

    return actionsArray;
  },

  renderFieldExtension(fieldExtensionId: string, ctx: RenderFieldExtensionCtx) {
    switch (fieldExtensionId) {
      case 'loadingAddon':
        return render(<LoadingAddon ctx={ctx} />);
    }
  },

  /**
   * Handler for the actual translation action triggered from the dropdown.
   */
  async executeFieldDropdownAction(
    actionId: string,
    ctx: ExecuteFieldDropdownActionCtx
  ) {
    const pluginParams = ctx.plugin.attributes.parameters as ctxParamsType;
    const locales = ctx.formValues.internalLocales as string[];
    const fieldType = ctx.field.attributes.appearance.editor;
    const fieldValue = ctx.formValues[ctx.field.attributes.api_key];

    // "translateFrom" flow
    if (actionId.startsWith('translateFrom')) {
      const locale = actionId.split('.')[1];

      const fieldValueInSourceLocale = (
        fieldValue as Record<string, unknown>
      )?.[locale];
      if (!fieldValueInSourceLocale) {
        ctx.alert(
          `The field on the ${localeSelect(locale)?.name} locale is empty`
        );
        return;
      }

      ctx.customToast({
        type: 'warning',
        message: `Translating "${ctx.field.attributes.label}" from ${
          localeSelect(locale)?.name
        }...`,
        dismissAfterTimeout: true,
      });
      const translatedValue = await TranslateField(
        fieldValueInSourceLocale,
        ctx,
        pluginParams,
        ctx.locale,
        locale,
        fieldType
      );

      // Persist translated value into the current editing locale
      await ctx.setFieldValue(
        `${ctx.field.attributes.api_key}.${ctx.locale}`,
        translatedValue
      );
      ctx.notice(
        `Translated "${ctx.field.attributes.label}" from ${
          localeSelect(locale)?.name
        }`
      );

      return;
    }

    // "translateTo" flow
    if (actionId.startsWith('translateTo')) {
      const locale = actionId.split('.')[1];

      // Translate to all locales
      if (locale === 'allLocales') {
        ctx.customToast({
          type: 'warning',
          message: `Translating "${ctx.field.attributes.label}" to all locales...`,
          dismissAfterTimeout: true,
        });
        for (const loc of locales) {
          if (loc === ctx.locale) continue;
          const translatedValue = await TranslateField(
            (fieldValue as Record<string, unknown>)?.[ctx.locale],
            ctx,
            pluginParams,
            loc,
            ctx.locale,
            fieldType
          );

          await ctx.setFieldValue(
            `${ctx.field.attributes.api_key}.${loc}`,
            translatedValue
          );
        }
        ctx.notice(`Translated "${ctx.field.attributes.label}" to all locales`);
        return;
      }

      // Translate to a specific locale
      ctx.customToast({
        dismissAfterTimeout: true,
        type: 'warning',
        message: `Translating "${ctx.field.attributes.label}" to ${
          localeSelect(locale)?.name
        }...`,
      });

      const translatedValue = await TranslateField(
        (fieldValue as Record<string, unknown>)?.[ctx.locale],
        ctx,
        pluginParams,
        locale,
        ctx.locale,
        fieldType
      );

      await ctx.setFieldValue(
        `${ctx.field.attributes.api_key}.${locale}`,
        translatedValue
      );
      ctx.notice(
        `Translated "${ctx.field.attributes.label}" to ${
          localeSelect(locale)?.name
        }`
      );
      return;
    }

    // If the plugin is not configured, navigate to its config screen
    if (actionId === 'not-configured') {
      ctx.navigateTo(`/configuration/plugins/${ctx.plugin.id}/edit`);
    }
  },
});
