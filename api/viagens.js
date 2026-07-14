const http = require('http');

/* ── Chaves BrasilSat ativas ──
   Todas usam o MESMO endpoint, mudando apenas a chave.
   Para adicionar outra conta no futuro, é só incluir a chave abaixo. */
const CHAVES = [
  'VkVkak9WQlJOVFptUVhGSVdHSnVORGt5UWpVeVFuTlJkdz09',
  'WXpKR2ExcHFaek5PYWxaeVl6SkdiblI1WW1ONFlqVXlNelU9'
];

const BASE = 'http://aefsistemas.inf.br/brasilsat/api/viagem/viagens/?chave=';
const TIMEOUT_MS = 8000;
const VERSION_TAG = 'multi-key-v2';

function fetchText(url){
  return new Promise((resolve)=>{
    let done = false;
    const finish = (val)=>{ if(!done){ done = true; resolve(val); } };
    const req = http.get(url, r=>{
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>finish({ok:true, body:d}));
    });
    req.on('error', e => finish({ok:false, error:e.message}));
    req.setTimeout(TIMEOUT_MS, ()=>{ req.destroy(); finish({ok:false, error:'timeout'}); });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Unitrack-Version', VERSION_TAG);
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }

  const meta = { version: VERSION_TAG, chaves: [] };

  try{
    const respostas = await Promise.all(CHAVES.map(ch => fetchText(BASE + ch)));

    let merged = [];
    let baseObj = null;

    respostas.forEach((r, i) => {
      const info = { index: i, ok: r.ok };
      if(!r.ok){ info.erro = r.error; meta.chaves.push(info); return; }
      try{
        const json = JSON.parse(r.body);
        const arr = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : null);
        if(arr){
          if(!baseObj && !Array.isArray(json)) baseObj = json;
          merged = merged.concat(arr);
          info.itens = arr.length;
        }else{
          info.erro = 'formato inesperado';
          info.amostra = r.body.slice(0,120);
        }
      }catch(e){
        info.erro = 'JSON inválido: ' + e.message;
      }
      meta.chaves.push(info);
    });

    meta.total = merged.length;

    res.setHeader('Content-Type','application/json');

    if(baseObj){
      const out = Object.assign({}, baseObj, { data: merged, _meta: meta });
      res.status(200).json(out);
    }else{
      res.status(200).json({ status:200, data:merged, _meta:meta });
    }
  }catch(e){
    res.status(502).json({ error: e.message, _meta: meta });
  }
};
