# DeepL Proxy via CLI (Only for DeepL)

DeepL’s API blocks browser-origin requests (no CORS). For this plugin, a tiny proxy is required only when using DeepL. The proxy forwards POST bodies to DeepL and injects the Authorization header server‑side.

Below are precise, CLI-only quickstarts for Cloudflare Workers, Vercel, and Netlify.

Important
- Keep your DeepL key on the server (env vars). Never expose it in the browser.
- Choose the right upstream host:
  - Free keys (end with `:fx`) → `https://api-free.deepl.com`
  - Pro keys → `https://api.deepl.com`
- In the plugin, set Settings → DeepL → Proxy URL to your deployed endpoint base; the plugin will call `POST <proxy>/v2/translate`.

<details>
<summary>Cloudflare Workers (wrangler)</summary>

Prereqs
- Node 18+ and npm
- `npm i -g wrangler`

Steps
1) Init project
```
mkdir deepl-proxy-cf && cd deepl-proxy-cf
wrangler init --yes --type=javascript
```

2) Replace `src/index.js` with:
```
export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    const upstream = new URL('/v2/translate', env.DEEPL_BASE_URL || 'https://api.deepl.com');
    const body = await req.text();
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

3) Add env vars
```
wrangler secret put DEEPL_AUTH_KEY
```
Paste your key when prompted.

In `wrangler.toml`, add:
```
[vars]
DEEPL_BASE_URL = "https://api-free.deepl.com" # or https://api.deepl.com
```

4) Deploy
```
wrangler deploy
```

5) Use in plugin
- Copy your Worker URL (e.g., `https://<name>.<account>.workers.dev`) into Settings → DeepL → Proxy URL.

</details>

<details>
<summary>Vercel (vercel CLI)</summary>

Prereqs
- Node 18+ and npm
- `npm i -g vercel`

Steps
1) Init project
```
mkdir deepl-proxy-vercel && cd deepl-proxy-vercel
npm init -y
mkdir -p api
```

2) Create `api/deepl.js`:
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

3) Login and link
```
vercel login
vercel link --yes
```

4) Add env vars (interactive)
```
vercel env add DEEPL_AUTH_KEY production
vercel env add DEEPL_BASE_URL production
```
Set `DEEPL_BASE_URL` to `https://api-free.deepl.com` (Free) or `https://api.deepl.com` (Pro).

5) Deploy
```
vercel deploy --prod --yes
```

6) Use in plugin
- Proxy URL: `https://<your-app>.vercel.app/api/deepl`

</details>

<details>
<summary>Netlify (netlify-cli)</summary>

Prereqs
- Node 18+ and npm
- `npm i -g netlify-cli`

Steps
1) Init project
```
mkdir deepl-proxy-netlify && cd deepl-proxy-netlify
netlify init --manual
mkdir -p netlify/functions
```

2) Create `netlify/functions/deepl-proxy.js`:
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

3) Set env vars
```
netlify env:set DEEPL_AUTH_KEY <your-key>
netlify env:set DEEPL_BASE_URL https://api-free.deepl.com   # or https://api.deepl.com
```

4) Deploy
```
netlify deploy --build --prod
```

5) Use in plugin
- Proxy URL: `https://<yoursite>.netlify.app/.netlify/functions/deepl-proxy`

</details>

Testing
- In plugin settings, click “Test proxy”. You should see a green “Proxy OK …” message.
- If you see “Wrong endpoint for your API key”, match Free (:fx) keys to `api-free.deepl.com` and Pro keys to `api.deepl.com`.

This proxy is only required for DeepL. OpenAI, Google (Gemini), and Anthropic (Claude) work from the browser with their standard API keys.

