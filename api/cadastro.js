const http = require('http');
const https = require('https');

const CONTAS = [
  { id: 'conta_1', chave: 'VkVkak9WQlJOVFptUVhGSVdHSnVORGt5UWpVeVFuTlJkdz09' },
  { id: 'conta_2', chave: 'WXpKR2ExcHFaek5PYWxaeVl6SkdiblI1WW1ONFlqVXlNelU9' }
];

const BASE_VEICULOS = 'http://aefsistemas.inf.br/brasilsat/api/integracao/veiculo?chave=';
const BASE_SETORES = 'http://aefsistemas.inf.br/brasilsat/api/integracao/setor?chave=';
const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 4;
const VERSION_TAG = 'cadastro-setores-v1';

function requestText(url, redirects = 0) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => { if (!done) { done = true; resolve(value); } };
    let parsed;
    try { parsed = new URL(url); } catch (e) { return finish({ ok:false, error:'URL inválida: '+e.message }); }
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(parsed, {
      headers: { 'Accept':'application/json,text/plain,*/*', 'User-Agent':'UniTrack/4.0' }
    }, (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if ([301,302,303,307,308].includes(status) && location) {
        response.resume();
        if (redirects >= MAX_REDIRECTS) return finish({ ok:false, status, error:'Muitos redirecionamentos' });
        return requestText(new URL(location, parsed).toString(), redirects + 1).then(finish);
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => body += chunk);
      response.on('end', () => finish({ ok:status>=200&&status<300, status, body }));
    });
    req.on('error', e => finish({ ok:false, error:e.message }));
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); finish({ ok:false, error:'timeout' }); });
  });
}

function findArray(value, depth = 0) {
  if (depth > 4 || value == null) return null;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'object') return null;
  for (const key of ['data','veiculos','setores','result','results','items','list','retorno']) {
    if (Object.prototype.hasOwnProperty.call(value,key)) {
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

function text(value) { return value == null ? '' : String(value).trim(); }
function normalize(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toUpperCase();
}
const IGNORADOS = new Set(['PADRAO','GARAGISTAS','TESTE VALE']);

async function fetchList(url) {
  const response = await requestText(url);
  if (!response.ok) return { ok:false, error:response.error || `HTTP ${response.status}`, status:response.status || null, data:[] };
  try {
    const json = JSON.parse((response.body || '').replace(/^\uFEFF/,'').trim());
    const data = findArray(json);
    if (!data) return { ok:false, error:'JSON sem lista de dados', status:response.status, data:[] };
    return { ok:true, status:response.status, data };
  } catch (e) {
    return { ok:false, error:'JSON inválido: '+e.message, status:response.status, data:[] };
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  // Cache compartilhado por 24h na Vercel/CDN. O navegador pode revalidar sem consultar a origem novamente.
  res.setHeader('Cache-Control','public, max-age=300, s-maxage=86400, stale-while-revalidate=3600');
  res.setHeader('X-Unitrack-Version', VERSION_TAG);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const meta = { version:VERSION_TAG, contas:[] };
  const setores = [];
  const veiculos = [];

  try {
    await Promise.all(CONTAS.map(async (conta, sourceKey) => {
      const [rv, rs] = await Promise.all([
        fetchList(BASE_VEICULOS + encodeURIComponent(conta.chave)),
        fetchList(BASE_SETORES + encodeURIComponent(conta.chave))
      ]);
      const info = { contaId:conta.id, sourceKey, veiculosOk:rv.ok, setoresOk:rs.ok };
      if (!rv.ok) info.erroVeiculos = rv.error;
      if (!rs.ok) info.erroSetores = rs.error;

      const mapaSetor = new Map();
      rs.data.forEach(item => {
        const codigo = text(item.codigosetor ?? item.codigoSetor ?? item.codigo);
        const nome = text(item.setor ?? item.nome ?? item.descricao);
        if (!codigo || !nome || IGNORADOS.has(normalize(nome))) return;
        const id = `${conta.id}:${codigo}`;
        mapaSetor.set(codigo, { id, codigo, nome, contaId:conta.id, sourceKey });
      });

      mapaSetor.forEach(setor => setores.push(setor));

      rv.data.forEach(item => {
        const codigoSetor = text(item.codigosetor ?? item.codigoSetor);
        const setor = mapaSetor.get(codigoSetor);
        if (!setor) return;
        const codigoVeiculo = text(item.codigoveiculo ?? item.codigoVeiculo ?? item.codigo);
        const frota = text(item.frota ?? item.prefixo ?? item.veiculo);
        const placa = text(item.placa);
        veiculos.push({
          id: `${conta.id}:${codigoVeiculo || frota || placa}`,
          contaId:conta.id,
          sourceKey,
          codigoVeiculo,
          frota,
          placa,
          marca:text(item.marca),
          modelo:text(item.modelo),
          ativo:text(item.ativo),
          setorId:setor.id,
          setorCodigo:setor.codigo,
          setorNome:setor.nome
        });
      });

      info.setoresValidos = mapaSetor.size;
      info.veiculosValidos = veiculos.filter(v => v.sourceKey === sourceKey).length;
      meta.contas.push(info);
    }));

    setores.sort((a,b) => a.nome.localeCompare(b.nome,'pt-BR'));
    veiculos.sort((a,b) => (a.frota || a.placa).localeCompare((b.frota || b.placa),'pt-BR'));
    meta.totalSetores = setores.length;
    meta.totalVeiculos = veiculos.length;

    if (!setores.length) {
      res.status(502).json({ error:'Nenhuma conta retornou setores válidos', setores:[], veiculos:[], _meta:meta });
      return;
    }
    res.status(200).json({ status:200, setores, veiculos, _meta:meta });
  } catch (e) {
    res.status(502).json({ error:e.message, setores:[], veiculos:[], _meta:meta });
  }
};
