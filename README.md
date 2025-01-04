# AI Translations

This plugin integrates with DatoCMS and provides on-demand AI-powered translations for your fields. You can also optionally translate entire records if multiple locales are set up. This README covers setup, configuration, and usage details.

## Configuration

On the plugin’s Settings screen:

1. **OpenAI API Key**: Paste a valid OpenAI API key. The plugin uses this key for translation requests.
2. **GPT Model**: Select one of the available GPT-based models. Make sure your chosen model supports your needs.
3. **Translatable Field Types**: Pick which field editor types (single_line, markdown, structured_text, etc.) can be translated.
4. **Translate Whole Record**: Decide if you want the sidebar feature that translates every localized field in the record.
5. **Prompt Template**: Customize how translations are requested. The plugin uses placeholders like `{fieldValue}`, `{fromLocale}`, `{toLocale}`.

Save your changes. The plugin is now ready.

## Usage

### Field-Level Translations

For each translatable field:

1. Hover over the field’s dropdown menu in the DatoCMS record editor.
2. Select “Translate to” -> Choose a target locale or “All locales.”
3. The plugin uses your OpenAI settings to generate a translation.
4. The field updates automatically.

You can also pull content from a different locale by choosing “Translate from” to copy and translate that locale’s content into your current locale.

### Whole-Record Translations

If enabled:

1. Open a record that has multiple locales.
2. The “DatoGPT Translate” panel appears in the sidebar.
3. Select source and target locales, then click “Translate Entire Record.”
4. All translatable fields get updated with AI translations.

## Excluding Models or Roles

- **Models to Exclude**: You can specify model API keys that shouldn’t be affected by translations.
- **Roles to Exclude**: Certain roles can be restricted from using or seeing the plugin features.

## Troubleshooting

- **Invalid API Key**: Ensure your OpenAI API key is correct and has sufficient usage limits.
- **Localization**: Make sure your project has at least two locales, otherwise translation actions won’t appear.
