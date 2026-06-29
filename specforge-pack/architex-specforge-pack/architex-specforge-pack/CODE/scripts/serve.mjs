import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const port = process.env.PORT || 4177;
const root = normalize(process.cwd() + '/dist');
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json' };
http.createServer(async (req,res)=>{
  try {
    const path = normalize(join(root, req.url === '/' ? '/index.html' : req.url));
    if (!path.startsWith(root)) throw new Error('bad path');
    const data = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] || 'text/plain' }); res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, () => console.log(`SpecForge demo: http://127.0.0.1:${port}`));
