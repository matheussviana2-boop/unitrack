const http = require('http');

/* ── Chaves BrasilSat ativas ──
   Todas usam o MESMO endpoint, mudando apenas a chave.
   Para somar outra conta/frota no futuro, basta acrescentar a chave abaixo. */
const CHAVES = [
  'VkVkak9WQlJOVFptUVhGSVdHSnVORGt5UWpVeVFuTlJkdz09',
  'WXpKR2ExcHFaek5PYWxaeVl6SkdiblI1WW1ONFlqVXlNelU9'
];

const BASE = 'http://aefsistemas.inf.br/brasilsat/api/viagem/viagens/?chave=';

/* campos onde a BrasilSat costuma colocar o array de viagens/linhas */
const CAMPOS = ['viagens','viagem','linhas','data','result','results','items','list'];

function fetchText(url){
  return new Promise((resolve,reject)=>{
    http.get(url, r=>{ let d=''; r.on('data',c=>d+=c); r.on('end',()=>resolve(d)); }).on('error',reject);
  });
}

/* Extrai o array de itens de uma resposta.
   Aceita array puro OU objeto que contém o array sob uma das chaves conhecidas. */
function extrair(txt){
  let json;
  try{ json = JSON.parse(txt); }catch(e){ return { arr:null, campo:null, raw:txt }; }
  if(Array.isArray(json)) return { arr:json, campo:null };
  for(const k of CAMPOS){
    if(Array.isArray(json[k])) return { arr:json[k], campo:k, base:json };
  }
  return { arr:null, campo:null, raw:txt, base:json };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }

  try{
    // busca todas as chaves em paralelo; falha de uma não derruba as outras
    const respostas = await Promise.all(
      CHAVES.map(ch => fetchText(BASE + ch).catch(()=>null))
    );

    let merged = [];
    let outField;          // undefined = ainda indefinido | null = array puro | string = campo
    let baseObj = null;
    let rawFallback = null;

    for(const txt of respostas){
      if(txt == null) continue;
      const ex = extrair(txt);
      if(ex.arr){
        if(outField === undefined){ outField = ex.campo; baseObj = ex.base || null; }
        merged = merged.concat(ex.arr);
      }else if(rawFallback === null){
        rawFallback = ex.raw;   // resposta não-JSON: guardada como fallback
      }
    }

    res.setHeader('Content-Type','application/json');

    // nenhuma resposta virou array -> devolve a 1a crua (comportamento antigo)
    if(merged.length === 0 && rawFallback !== null){
      res.status(200).send(rawFallback);
      return;
    }

    // reconstrói no mesmo formato da resposta original
    if(outField){
      res.status(200).json(Object.assign({}, baseObj, { [outField]: merged }));
    }else{
      res.status(200).json(merged);
    }
  }catch(e){
    res.status(502).json({ error: e.message });
  }
};
