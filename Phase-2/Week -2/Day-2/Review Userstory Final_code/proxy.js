const http  = require('http');
const https = require('https');
const url   = require('url');

const PORT = 8080;

http.createServer((req, res) => {

  // ── CORS preflight ──────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders());
    res.end();
    return;
  }

  // ── Parse target URL ────────────────────────────────────────
  const target = decodeURIComponent(req.url.slice(1));
  if (!target.startsWith('http')) {
    res.writeHead(400, corsHeaders());
    res.end('Usage: http://localhost:8080/<full-target-url>');
    return;
  }

  const parsed  = url.parse(target);
  const isHttps = parsed.protocol === 'https:';
  const port    = parsed.port || (isHttps ? 443 : 80);

  // ── Collect body as a single buffer ─────────────────────────
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    // ── Build a CLEAN header set — nothing from the browser leaks
    const outHeaders = {
      'host'   : parsed.hostname,
      'accept' : 'application/json',
    };

    // Forward only safe, explicit headers from the original request
    if (req.headers['authorization'])  outHeaders['authorization']    = req.headers['authorization'];
    if (req.headers['content-type'])   outHeaders['content-type']     = req.headers['content-type'];
    if (req.headers['x-atlassian-token']) outHeaders['x-atlassian-token'] = req.headers['x-atlassian-token'];
    if (body.length > 0)               outHeaders['content-length']   = String(body.length);

    const options = {
      hostname : parsed.hostname,
      port,
      path     : parsed.path || '/',
      method   : req.method,
      headers  : outHeaders,
    };

    const lib = isHttps ? https : http;

    const proxyReq = lib.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        ...corsHeaders(),
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, corsHeaders());
      res.end('Proxy error: ' + err.message);
    });

    if (body.length > 0) {
      proxyReq.write(body);
    }
    proxyReq.end();
  });

}).listen(PORT, '127.0.0.1', () => {
  console.log(`\n✅  CORS Proxy running at http://localhost:${PORT}`);
  console.log('    Forwarding only clean headers — no browser fingerprint leaked.');
  console.log('    Press Ctrl+C to stop.\n');
});

function corsHeaders() {
  return {
    'access-control-allow-origin'  : '*',
    'access-control-allow-methods' : 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers' : '*',
    'access-control-max-age'       : '86400',
  };
}
