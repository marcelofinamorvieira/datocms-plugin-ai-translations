# AI Translations

This plugin integrates with the OpenAI API and provides on-demand AI-powered translations for your fields. You can also optionally translate entire records.

![47659](https://github.com/user-attachments/assets/2aae06c5-d2fb-404d-ae76-08b5ebd55759)

![31841](https://github.com/user-attachments/assets/a1b4e9aa-d79e-4807-8b90-16b06b65852c)

## Changelog

See the [CHANGELOG.md](./CHANGELOG.md) file for details about all the latest features and improvements.

## Configuration

On the plugin's Settings screen:

1. **OpenAI API Key**: Paste a valid OpenAI API key. The plugin uses this key for translation requests.
2. **GPT Model**: Select one of the available GPT-based models. Only GPT-4.1 and GPT-4o variants are permitted.
    - mini: Balanced cost (~$0.02/$0.04) & quality.
    - nano: Fastest & cheapest (~$0.01/$0.02), lower nuance.
    - normal: Highest fidelity (~$0.03/$0.06), higher latency & cost.
3. **Translatable Field Types**: Pick which field editor types (single_line, markdown, structured_text, etc.) can be translated.
4. **Translate Whole Record**: Decide if you want the sidebar feature that allows users to translate every localized field in the record at once.
5. **Prompt Template**: Customize how translations are requested. The plugin uses placeholders like `{fieldValue}`, `{fromLocale}`, `{toLocale}`, and `{recordContext}`.

_**Models**_: To ensure optimal translation quality, latency, and cost predictability, only GPT-4.1 and GPT-4o families are supported. These models balance fidelity, speed, and price for translation workflows.

Save your changes. The plugin is now ready.

## Usage

### Field-Level Translations

For each translatable field:

1. Click on the field's dropdown menu in the DatoCMS record editor (on the top right of the field)
2. Select "Translate to" -> Choose a target locale or "All locales."
3. The plugin uses your OpenAI settings to generate a translation.
4. The field updates automatically.

You can also pull content from a different locale by choosing "Translate from" to copy and translate that locale's content into your current locale.

### Whole-Record Translations

If enabled:

1. Open a record that has multiple locales.
2. The "DatoGPT Translate" panel appears in the sidebar.
3. Select source and target locales, then click "Translate Entire Record."
4. All translatable fields get updated with AI translations.

## Contextual Translations

The plugin now supports context-aware translations through the `{recordContext}` placeholder:

- **Benefits**:
  - Better understanding of specialized terminology
  - Improved consistency across related fields
  - More accurate translations that respect the overall content meaning
  - Appropriate tone and style based on context

## Customizing Prompts

You can customize the translation prompt template in the plugin settings:

- Use `{fieldValue}` to represent the content to translate
- Use `{fromLocale}` and `{toLocale}` to specify languages
- Use `{recordContext}` to include the automatically generated record context

## Excluding Models or Roles

- **Models to Exclude**: You can specify model API keys that shouldn't be affected by translations.
- **Roles to Exclude**: Certain roles can be restricted from using or seeing the plugin features.

## Troubleshooting

- **Invalid API Key**: Ensure your OpenAI API key is correct and has sufficient usage limits.
- **Localization**: Make sure your project has at least two locales, otherwise translation actions won’t appear.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
