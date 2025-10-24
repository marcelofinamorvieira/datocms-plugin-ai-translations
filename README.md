# AI Translations

This plugin integrates with AI providers and provides on-demand AI-powered translations for your fields. You can also translate entire records or perform bulk translations across multiple records and models.

![47659](https://github.com/user-attachments/assets/2aae06c5-d2fb-404d-ae76-08b5ebd55759)

![31841](https://github.com/user-attachments/assets/a1b4e9aa-d79e-4807-8b90-16b06b65852c)

## Changelog

See the [CHANGELOG.md](./CHANGELOG.md) file for details about all the latest features and improvements.

## Configuration

On the plugin's Settings screen:

1. **AI Vendor**: Choose your provider — OpenAI (ChatGPT), Google (Gemini), or Anthropic (Claude).
2. If you chose OpenAI:
   - **OpenAI API Key**: Paste a valid OpenAI key.
   - **GPT Model**: After entering your key, the plugin lists relevant chat models and highlights a recommended default.
     - Default: gpt‑4.1‑mini (fastest and broadly available)
     - High‑stakes short copy: gpt‑4.1
     - Large or budget batches: gpt‑4o‑mini
3. If you chose Google (Gemini):
   - **Google API Key**: Paste a valid key from a GCP project with the Generative Language API enabled.
   - **Gemini Model**: Recommended `gemini-2.5-flash` (fast/cost‑effective default). For the highest fidelity, use `gemini-2.5-pro`. For very large or budget batches, consider `gemini-2.5-flash-lite`.
4. **Translatable Field Types**: Pick which field editor types (single_line, markdown, structured_text, etc.) can be translated.
5. **Translate Whole Record**: Enable the sidebar that translates every localized field in a record.
6. **Translate Bulk Records**: Enable bulk translations from table view or via the dedicated page.
7. **AI Bulk Translations Page**: Translate whole models at once.
8. **Prompt Template**: Customize how translations are requested. Use `{fieldValue}`, `{fromLocale}`, `{toLocale}`, and `{recordContext}`.

### Key Restrictions and Security
- Keys are stored in plugin settings and used client‑side. Do not share your workspace publicly.
- Prefer restricting keys:
  - OpenAI: regular secret key; rotate periodically.
  - Google: restrict by HTTP referrer and enable only the Generative Language API.
- The plugin redacts API keys from debug logs automatically.

_**Models**_
- OpenAI: the list is dynamic for your account; the plugin filters out embeddings, audio/whisper/tts, moderation, image, and realtime models, prioritizing general-purpose chat models used for translation.
- Google: provides a fixed list in settings (`gemini-1.5-flash` and `gemini-1.5-pro`).

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

### Bulk Translations from Table View

Translate multiple records at once from any table view:

1. In the Content area, navigate to any model's table view
2. Select multiple records by checking the boxes on the left side
3. Click the three dots dropdown in the bar at the bottom (to the right of the bar)
4. Choose your source and target languages
5. The translation modal will show progress as all selected records are translated

![Bulk Translations Table View](https://raw.githubusercontent.com/marcelofinamorvieira/datocms-plugin-ai-translations/refs/heads/master/public/assets/bulk-translation-example.png)

### AI Bulk Translations Page

The plugin includes a dedicated page for translating multiple models at once:

1. Go to Settings → AI Bulk Translations (in the sidebar)
2. Select your source and target languages
3. Choose one or more models to translate (block models are excluded)
4. Click "Start Bulk Translation"
5. The modal will display progress as all records from the selected models are translated

![AI Bulk Translations Page](https://github.com/user-attachments/assets/eefd5f25-efc7-4f3b-bf49-ff05d623b35c)

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

- **Invalid API Key**: Ensure your key matches the selected vendor and has access.
- **Rate Limit/Quota**: Reduce concurrency/batch size, switch to a lighter model, or increase your vendor quota.
- **Model Not Found**: Verify the exact model id exists for your account/region and is spelled correctly.
- **Localization**: Make sure your project has at least two locales, otherwise translation actions won't appear.

## DeepL Requires a Proxy (Why and How)

DeepL’s API does not support browser‑origin requests (no CORS). If you call DeepL directly from the plugin (which runs in the browser), the preflight request fails and you’ll see network/CORS errors. To use DeepL in this plugin, you must route requests through a small server you control (a “proxy”).

What the proxy must do
- Accept a POST with JSON body that matches DeepL’s `/v2/translate` input. The plugin sends bodies like:
  - `{ "text": ["Hello"], "target_lang": "DE", ... }`
- Add CORS headers to the response (at minimum `Access-Control-Allow-Origin: *` for testing; you can restrict later).
- Forward the request to DeepL’s API with the Authorization header added server‑side:
  - `Authorization: DeepL-Auth-Key <YOUR_KEY>`
- Choose the proper upstream host:
  - Free keys (end with `:fx`) → `https://api-free.deepl.com`
  - Pro keys → `https://api.deepl.com`

Plugin settings to use with a proxy
- In Settings → DeepL, set “Proxy URL” to the base of your function (examples below) — the plugin will call `POST <proxy>/v2/translate`.
- If your key ends with `:fx`, also enable “Use DeepL Free endpoint (api-free.deepl.com)” so validation and error messages match your plan.
- Use the “Test proxy” button: we send a tiny "Hello world" test, and show inline success/error feedback.

Security notes
- Never expose the DeepL key in the browser. Keep it in your serverless function/env.
- For production, restrict CORS to `https://admin.datocms.com` and your own preview domains instead of `*`.
- Do not log request bodies or headers; avoid leaving keys in logs.

### Option A: Cloudflare Workers

Environment vars
- `DEEPL_AUTH_KEY` — your DeepL key
- `DEEPL_BASE_URL` — `https://api-free.deepl.com` (Free) or `https://api.deepl.com` (Pro)

Worker (wrangler.toml configured; minimal example)
```
export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    const upstream = new URL('/v2/translate', env.DEEPL_BASE_URL || 'https://api.deepl.com');
    const body = await req.text(); // passthrough JSON body

    const resp = await fetch(upstream, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `DeepL-Auth-Key ${env.DEEPL_AUTH_KEY}`,
      },
      body,
    });

    const text = await resp.text();
    return new Response(text, { status: resp.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
}
```

Deploy
- `wrangler deploy`
- Set `DEEPL_AUTH_KEY` and `DEEPL_BASE_URL` in your Worker’s environment.
- Copy the Worker URL (e.g., `https://your-worker.yourname.workers.dev`) into the plugin’s “Proxy URL”.

### Option B: Vercel Serverless Function (Next.js API Route)

Environment vars (Project Settings → Environment Variables):
- `DEEPL_AUTH_KEY` — your key
- `DEEPL_BASE_URL` — `https://api-free.deepl.com` or `https://api.deepl.com`

Create `pages/api/deepl.ts` (or `app/api/deepl/route.ts` for App Router):
```
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const upstream = `${process.env.DEEPL_BASE_URL || 'https://api.deepl.com'}/v2/translate`;
  const r = await fetch(upstream, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_AUTH_KEY}`,
    },
    body: JSON.stringify(req.body ?? {}),
  });
  const text = await r.text();
  res.status(r.status).setHeader('Content-Type', 'application/json').send(text);
}
```

Deploy
- `vercel deploy` (or push to GitHub with Vercel connected).
- Set env vars, redeploy, then use `https://your-app.vercel.app/api/deepl` as the “Proxy URL”.

Note on Vercel Deployment Protection
- If your Vercel organization enforces Deployment Protection, unauthenticated public requests return 401.
- Go to Vercel → Project → Settings → Deployment Protection and either disable protection for this project or add a public bypass so DatoCMS can call the endpoint.
- After changing this setting, the proxy should be reachable from the plugin’s “Test proxy” and during translations.

### Option C: Netlify Functions

Environment vars (Netlify dashboard → Site settings → Environment):
- `DEEPL_AUTH_KEY`, `DEEPL_BASE_URL`

Create `netlify/functions/deepl-proxy.ts`:
```
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } };
  }
  const upstream = `${process.env.DEEPL_BASE_URL || 'https://api.deepl.com'}/v2/translate`;
  const r = await fetch(upstream, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_AUTH_KEY}`,
    },
    body: event.body || '{}',
  });
  const text = await r.text();
  return {
    statusCode: r.status,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: text,
  };
};
```

Deploy
- `netlify deploy` (or via the Netlify app/CLI). Use `/.netlify/functions/deepl-proxy` as your “Proxy URL”.

### Testing and common errors

- Use the “Test proxy” button in plugin settings to verify connectivity.
- Wrong endpoint for key (403 / “Wrong endpoint”):
  - Free key (`…:fx`) must target `api-free.deepl.com`. Pro keys must target `api.deepl.com`.
  - Fix by setting `DEEPL_BASE_URL` accordingly (and/or toggle “Use DeepL Free endpoint” in the plugin).
- CORS errors: ensure your proxy responds to OPTIONS and includes `Access-Control-Allow-Origin`.
- 414/URI too long: means you’re not POSTing a body through your proxy. The examples above use POST and won’t hit this.
- 429/Rate limit: lower concurrency or try smaller batches; upgrade plan if needed.

Endpoint selection (Free vs Pro)
- The example proxies choose the upstream via an environment variable `DEEPL_BASE_URL`.
- Set `DEEPL_BASE_URL` to `https://api-free.deepl.com` if your key ends with `:fx` (DeepL Free), otherwise to `https://api.deepl.com` (Pro).
- In the plugin settings, the toggle “Use DeepL Free endpoint (api-free.deepl.com)” should match the proxy’s `DEEPL_BASE_URL` so errors and validations are consistent. A mismatch will surface as a “Wrong endpoint for your API key” error.

That’s it — once your proxy passes the test, DeepL translations (including large Structured Text fields) will work end‑to‑end.

See also
- CLI step‑by‑steps for deploying a proxy (Cloudflare, Vercel, Netlify): docs/DeepL-Proxy-CLI.md

## Migration Notes

- Existing installations continue to work with OpenAI by default; your current `apiKey` and `gptModel` remain valid.
- To use Google (Gemini):
  1. In Google Cloud, enable the Generative Language API for your project.
  2. Create an API key and restrict it by HTTP referrer if possible.
  3. In the plugin settings, switch vendor to Google (Gemini), paste the key, and select a Gemini model.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
