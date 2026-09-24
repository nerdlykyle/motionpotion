import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root = fileURLToPath(new URL('.',import.meta.url));
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2','.json':'application/json','.glb':'model/gltf-binary'};
const server = createServer(async(req,res)=>{
  try {
    const url = new URL(req.url,'http://localhost');
    const path = decodeURIComponent(url.pathname);
    const relative = path.replace(/^\/+/, '') || 'index.html';
    let file = resolve(root,relative);
    if(!file.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403);res.end('Forbidden');return;}
    if((await stat(file)).isDirectory())file=resolve(file,'index.html');
    const data=await readFile(file);
    const headers = {'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes'};
    // Safari requests video byte ranges even for small loops. Match Pages so
    // local mobile playback exercises the same delivery behavior as production.
    if (req.headers.range && req.method !== 'HEAD') {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      const start = match?.[1] ? Number(match[1]) : Math.max(0, data.length - Number(match?.[2]));
      const end = match?.[1] && match[2] ? Math.min(Number(match[2]), data.length - 1) : data.length - 1;
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= data.length) {
        res.writeHead(416, {...headers,'Content-Range':'bytes */'+data.length}); res.end(); return;
      }
      res.writeHead(206, {...headers,'Content-Range':'bytes '+start+'-'+end+'/'+data.length,'Content-Length':end-start+1});
      res.end(data.subarray(start,end+1)); return;
    }
    res.writeHead(200, {...headers,'Content-Length':data.length});
    res.end(req.method === 'HEAD' ? undefined : data);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log(`Motion Potion preview: http://localhost:${server.address().port}`));
