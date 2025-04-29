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
  type ExecuteFieldDropdownActionCtx,
  type FieldDropdownActionsCtx,
  type ItemFormSidebarPanelsCtx,
  type ItemType,
  type RenderFieldExtensionCtx,
  type ExecuteItemsDropdownActionCtx,
  type Item,
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
import TranslateField, { generateRecordContext, translateFieldValue } from './utils/translation/TranslateField';
import DatoGPTTranslateSidebar from './entrypoints/Sidebar/DatoGPTTranslateSidebar';
import { Button, Canvas } from 'datocms-react-ui';
import LoadingAddon from './entrypoints/LoadingAddon';
import { defaultPrompt } from './prompts/DefaultPrompt';
import { buildClient } from '@datocms/cma-client-browser';
import OpenAI from 'openai';
import { fieldPrompt } from './prompts/FieldPrompts';

// Utility for getting locale name by tag
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
  itemsDropdownActions(_itemType: ItemType, ctx: ItemDropdownActionsCtx) {

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
    
    // Build DatoCMS client
    const client = buildDatoCMSClient(ctx.currentUserAccessToken);
    
    // Fetch all records with pagination
    const records = await fetchRecordsWithPagination(client, items.map(item => item.id));
    
    // Create OpenAI client
    const openai = createOpenAIClient(pluginParams.apiKey);

    // Build a dictionary of field types for the first record's item type
    const fieldTypeDictionary = await buildFieldTypeDictionary(client, records[0].item_type.id);
    
    // Process and translate each record
    await translateAndUpdateRecords(
      records, 
      client, 
      openai, 
      fromLocale, 
      toLocale, 
      fieldTypeDictionary, 
      pluginParams, 
      ctx
    );

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
});

/**
 * Parses the action ID to extract fromLocale and toLocale
 */
function parseActionId(actionId: string): { fromLocale: string; toLocale: string } {
  const actionParts = actionId.split('-');
  const [fromLocale, toLocale] = actionParts.slice(-2);
  return { fromLocale, toLocale };
}

/**
 * Creates a DatoCMS client with the provided access token
 */
function buildDatoCMSClient(accessToken: string) {
  return buildClient({
    apiToken: accessToken
  });
}

/**
 * Creates an OpenAI client with the provided API key
 */
function createOpenAIClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true
  });
}

/**
 * Fetches records with pagination based on item IDs
 */
async function fetchRecordsWithPagination(client: ReturnType<typeof buildClient>, itemIds: string[]) {
  const allRecords: DatoCMSRecord[] = [];
  let page = 1;
  const pageSize = 30;
  let hasMorePages = true;
  
  while (hasMorePages) {
    const response: DatoCMSRecord[] = await client.items.list({
      filter: {
        ids: itemIds.join(',')
      },
      nested: true,
      page: {
        offset: (page - 1) * pageSize,
        limit: pageSize
      }
    });
    
    allRecords.push(...response);
    hasMorePages = response.length === pageSize;
    page++;
  }
  
  return allRecords;
}

/**
 * Builds a dictionary of field types for an item type
 */
async function buildFieldTypeDictionary(client: ReturnType<typeof buildClient>, itemTypeId: string) {
  const fields = await client.fields.list(itemTypeId);
  return fields.reduce((acc: Record<string, { editor: string; id: string; isLocalized: boolean }>, field: {
    api_key: string;
    appearance: { editor: string };
    id: string;
    localized: boolean;
  }) => {
    acc[field.api_key] = {
      editor: field.appearance.editor,
      id: field.id,
      isLocalized: field.localized
    };
    return acc;
  }, {});
}

/**
 * Determines if a field should be translated
 */
function shouldTranslateField(
  field: string, 
  record: DatoCMSRecord, 
  fromLocale: string, 
  fieldTypeDictionary: Record<string, { editor: string; id: string; isLocalized: boolean }>
): boolean {
  // Skip system fields that shouldn't be translated
  if (
    ['id', 'creator', 'meta', 'type', 'item_type'].includes(field) || 
    !record[field] || 
    !(record[field] as Record<string, unknown>)[fromLocale] || 
    !fieldTypeDictionary[field]?.isLocalized
  ) {
    return false;
  }
  
  return true;
}

/**
 * Prepares the field-specific prompt based on field type
 */
function prepareFieldTypePrompt(fieldType: string): string {
  let fieldTypePrompt = 'Return the response in the format of ';
  const fieldPromptObject = fieldPrompt;
  const baseFieldPrompts = fieldPromptObject ? fieldPromptObject : {};
  
  // Structured and rich text fields use specialized prompts defined elsewhere
  if (fieldType !== 'structured_text' && fieldType !== 'rich_text') {
    fieldTypePrompt +=
      baseFieldPrompts[fieldType as keyof typeof baseFieldPrompts] || '';
  }
  
  return fieldTypePrompt;
}

/**
 * Defines a DatoCMS record structure with common fields
 */
type DatoCMSRecord = {
  id: string;
  item_type: { id: string };
  [key: string]: unknown;
};

/**
 * Translates and updates all records
 */
async function translateAndUpdateRecords(
  records: DatoCMSRecord[],
  client: ReturnType<typeof buildClient>,
  openai: OpenAI,
  fromLocale: string,
  toLocale: string,
  fieldTypeDictionary: Record<string, { editor: string; id: string; isLocalized: boolean }>,
  pluginParams: ctxParamsType,
  ctx: ExecuteItemsDropdownActionCtx
) {
  for (const record of records) {
    const translatedFields = await translateRecordFields(
      record,
      fromLocale,
      toLocale,
      fieldTypeDictionary,
      openai,
      pluginParams,
      ctx.currentUserAccessToken || ''
    );

    await client.items.update(record.id, {
      ...translatedFields
    });

    ctx.notice('Record translated successfully');
  }
}

/**
 * Translates all fields for a single record
 */
async function translateRecordFields(
  record: DatoCMSRecord,
  fromLocale: string,
  toLocale: string,
  fieldTypeDictionary: Record<string, { editor: string; id: string; isLocalized: boolean }>,
  openai: OpenAI,
  pluginParams: ctxParamsType,
  accessToken: string
): Promise<Record<string, unknown>> {
  const translatedFields: Record<string, unknown> = {};
  
  for (const field in record) {
    if (!shouldTranslateField(field, record, fromLocale, fieldTypeDictionary)) {
      continue;
    }

    translatedFields[field] = record[field];

    const fieldValue = (record[field] as Record<string, unknown>)[fromLocale];
    const fieldType = fieldTypeDictionary[field].editor;
    const fieldTypePrompt = prepareFieldTypePrompt(fieldType);
  
    const translatedValue = await translateFieldValue(
      fieldValue,
      pluginParams,
      toLocale,
      fromLocale,
      fieldType,
      openai,
      fieldTypePrompt,
      accessToken,
      fieldTypeDictionary[field].id,
      undefined,
      generateRecordContext(record, fromLocale)
    );

    (translatedFields[field] as Record<string, unknown>)[toLocale] = translatedValue;
  }
  
  return translatedFields;
}
