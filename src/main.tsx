/**
 * main.tsx
 * -------------------------------------------
 * This file connects the plugin to DatoCMS,
 * defines field dropdown actions, and triggers
 * the translation logic when actions are invoked.
 */

import {
  connect,
  type ItemDropdownActionsCtx,
  type DropdownAction,
  type DropdownActionGroup,
  type RenderFieldExtensionCtx,
  type ExecuteFieldDropdownActionCtx,
  type FieldDropdownActionsCtx,
  type ItemType,
  type ItemFormSidebarPanelsCtx,
  type ExecuteItemsDropdownActionCtx,
  type Item,
  type RenderItemFormSidebarPanelCtx,
  type RenderModalCtx,
} from 'datocms-plugin-sdk';

import {
  Button,
  Canvas,
} from 'datocms-react-ui';

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
import LoadingAddon from './entrypoints/LoadingAddon';
import { defaultPrompt } from './prompts/DefaultPrompt';
import TranslationProgressModal from './components/TranslationProgressModal';

// Utility for getting locale name by tag
const localeSelect = locale.getByTag;

// Import refactored utility functions and types
import { parseActionId } from './utils/translation/ItemsDropdownUtils';

/**
 * Helper function to get nested values by dot/bracket notation
 * @param obj - object to traverse
 * @param path - dot/bracket string path
 */
function getValueAtPath(obj: Record<string, unknown> | unknown[], path: string): unknown {
  // Handle both dot and bracket notation
  const parts = path.replace(/\[([^\]]+)\]/g, '.$1').split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Primary plugin connection point.
 */
connect({
  onBoot(ctx) {
    const pluginParams = ctx.plugin.attributes.parameters as ctxParamsType;
    
    if (!pluginParams.apiKey) {
      ctx.alert('Please add an API key in the settings page');
    }

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
  itemsDropdownActions(_itemType: ItemType, ctx: ItemDropdownActionsCtx) {
    const pluginParams = ctx.plugin.attributes.parameters as ctxParamsType;
    
    // Check for feature toggle and exclusion rules
    const isRoleExcluded = pluginParams.rolesToBeExcludedFromThisPlugin?.includes(ctx.currentRole.id);
    const isModelExcluded = pluginParams.modelsToBeExcludedFromThisPlugin?.includes(_itemType.attributes.api_key);
    
    // Return empty array if bulk translation is disabled or if role/model is excluded
    if ((typeof pluginParams.translateBulkRecords === 'boolean' && !pluginParams.translateBulkRecords) ||
        isRoleExcluded || 
        isModelExcluded) {
      return [];
    }

    return ctx.site.attributes.locales.map((locale) => ({
      label: `Translate Record from ${locale}`,
      icon: "language",
      actions: ctx.site.attributes.locales.filter((targetLocale) => targetLocale !== locale).map((targetLocale) => ({
        label: `to ${targetLocale}`,
        icon: "globe",
        id: `translateRecord-${locale}-${targetLocale}`,
      }))
    }));
  },

  async executeItemsDropdownAction(actionId: string, items: Item[], ctx: ExecuteItemsDropdownActionCtx) {
    if (!ctx.currentUserAccessToken) {
      ctx.alert('No user access token found');
      return;
    }

    // Parse action ID to get locale information
    const { fromLocale, toLocale } = parseActionId(actionId);
    
    const pluginParams = ctx.plugin.attributes.parameters as ctxParamsType;
    
    // Open a modal to show translation progress and handle translation process
    const modalPromise = ctx.openModal({
      id: 'translationProgressModal',
      title: 'Translation Progress',
      width: 'l',
      parameters: {
        totalRecords: items.length,
        fromLocale,
        toLocale,
        accessToken: ctx.currentUserAccessToken,
        pluginParams,
        itemIds: items.map(item => item.id)
      }
    });
    
    try {
      // Wait for the modal to be closed by the user
      const result = await modalPromise;
      
      if (result && (result as TranslationModalResult).completed) {
        ctx.notice(`Successfully translated ${items.length} record(s) from ${fromLocale} to ${toLocale}`);
      } else if (result && (result as TranslationModalResult).canceled) {
        ctx.notice(`Translation from ${fromLocale} to ${toLocale} was canceled`);
      }
    } catch (error) {
      ctx.alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return;
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
          icon: "language",
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
        icon: "language",
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
        icon: "language",
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
  
  /**
   * Renders modal components.
   */
  renderModal(modalId: string, ctx: RenderModalCtx) {
    switch (modalId) {
      case 'translationProgressModal':
        // Properly type the parameters to match the expected interface
        return render(<TranslationProgressModal 
          ctx={ctx} 
          parameters={ctx.parameters as {
            totalRecords: number;
            fromLocale: string;
            toLocale: string;
            accessToken: string;
            pluginParams: ctxParamsType;
            itemIds: string[];
          }} 
        />);
      default:
        return null;
    }
  }
});

interface TranslationModalResult {
  completed: boolean;
  canceled: boolean;
}
