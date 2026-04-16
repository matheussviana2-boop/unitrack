const http = require('http');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  if(req.method==='OPTIONS'){res.status(200).end();return;}
  const url='http://aefsistemas.inf.br/brasilsat/api/viagem/viagens/?chave=VkVkak9WQlJOVFptUVhGSVdHSnVORGt5UWpVeVFuTlJkdz09';
  try{
    const data=await new Promise((resolve,reject)=>{
      http.get(url,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>resolve(d));}).on('error',reject);
    });
    res.setHeader('Content-Type','application/json');
    res.status(200).send(data);
  }catch(e){res.status(502).json({error:e.message});}
};
