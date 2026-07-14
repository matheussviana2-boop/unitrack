const http = require('http');
const https = require('https');

const CHAVES = [
  'VkVkak9WQlJOVFptUVhGSVdHSnVORGt5UWpVeVFuTlJkdz09',
  'WXpKR2ExcHFaek5PYWxaeVl6SkdiblI1WW1ONFlqVXlNelU9'
];

const BASE = 'http://aefsistemas.inf.br/brasilsat/api/cenibra/posicao?chave=';
const TIMEOUT_MS = 12000;
const VERSION_TAG = 'multi-key-v3';
const MAX_REDIRECTS = 4;

function requestText(url, redirects = 0) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (value) => {
      if (!finished) {
        finished = true;
        resolve(value);
      }
    };

    let parsed;
    try { parsed = new URL(url); }
    catch (e) { finish({ ok: false, error: 'URL inválida: ' + e.message }); return; }

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(parsed, {
      headers: {
        'Accept': 'application/json,text/plain,*/*',
        'User-Agent': 'UniTrack/3.0'
      }
    }, (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;

      if ([301, 302, 303, 307, 308].includes(status) && location) {
        response.resume();
        if (redirects >= MAX_REDIRECTS) {
          finish({ ok: false, status, error: 'Muitos redirecionamentos' });
          return;
        }
        const nextUrl = new URL(location, parsed).toString();
        requestText(nextUrl, redirects + 1).then(finish);
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        const ok = status >= 200 && status < 300;
        finish({ ok, status, body, contentType: response.headers['content-type'] || '' });
      });
    });

    req.on('error', (e) => finish({ ok: false, error: e.message }));
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error('timeout'));
      finish({ ok: false, error: 'timeout' });
    });
  });
}

function findArray(value, depth = 0) {
  if (depth > 4 || value == null) return null;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'object') return null;

  const preferred = ['data','posicao','posicoes','veiculos','result','results','items','list','frota','retorno'];
  for (const key of preferred) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = findArray(value[key], depth + 1);
      if (found) return found;
    }
  }
  for (const child of Object.values(value)) {
    const found = findArray(child, depth + 1);
    if (found) return found;
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Unitrack-Version', VERSION_TAG);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const meta = { version: VERSION_TAG, chaves: [] };

  try {
    const respostas = await Promise.all(CHAVES.map((chave) => requestText(BASE + encodeURIComponent(chave))));
    const merged = [];
    let baseObj = null;

    respostas.forEach((r, index) => {
      const info = { index, ok: r.ok, httpStatus: r.status || null };
      if (!r.ok) {
        info.erro = r.error || `HTTP ${r.status}`;
        info.amostra = r.body ? r.body.slice(0, 160) : '';
        meta.chaves.push(info);
        return;
      }

      try {
        const json = JSON.parse((r.body || '').replace(/^\uFEFF/, '').trim());
        const arr = findArray(json);
        if (!arr) {
          info.ok = false;
          info.erro = 'Formato JSON sem lista de posições';
          info.amostra = r.body.slice(0, 160);
        } else {
          if (!baseObj && !Array.isArray(json)) baseObj = json;
          arr.forEach((item) => {
            if (item && typeof item === 'object') merged.push({ ...item, _sourceKey: index });
          });
          info.itens = arr.length;
        }
      } catch (e) {
        info.ok = false;
        info.erro = 'JSON inválido: ' + e.message;
        info.amostra = (r.body || '').slice(0, 160);
      }
      meta.chaves.push(info);
    });

    meta.total = merged.length;
    meta.sucessos = meta.chaves.filter((x) => x.ok).length;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (meta.sucessos === 0) {
      res.status(502).json({ error: 'Nenhuma chave retornou posições válidas', data: [], _meta: meta });
      return;
    }

    const out = baseObj && typeof baseObj === 'object'
      ? { ...baseObj, data: merged, _meta: meta }
      : { status: 200, data: merged, _meta: meta };
    res.status(200).json(out);
  } catch (e) {
    res.status(502).json({ error: e.message, data: [], _meta: meta });
  }
};
