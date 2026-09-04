/**
 * MnogoTV Resolver v3.0.0
 *
 * Не универсальный CORS-прокси, а маленький resolver:
 *   /health
 *   /sources?imdb=tt...
 *   /collaps/config?imdb=tt...
 *   /media?url=https://...&ref=https://api.ortified.ws/
 *
 * Collaps повторяет рабочую схему online_mod:
 * api.ortified.ws -> api.kinogram.best -> makePlayer -> HLS.
 *
 * /media нужен, чтобы внешний Android-плеер получал обычный URL:
 * Worker сам добавляет нужные Origin/Referer/User-Agent и переписывает
 * вложенные m3u8/сегменты.
 */

const VERSION = '3.0.0';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Range',
  'Access-Control-Expose-Headers':
    'Content-Type,Content-Length,Content-Range,Accept-Ranges',
};

function cors(headers = {}) {
  const h = new Headers(headers);
  Object.entries(CORS).forEach(([k, v]) => h.set(k, v));
  return h;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: cors({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    }),
  });
}

function text(data, status = 200, type = 'text/plain; charset=utf-8') {
  return new Response(data, {
    status,
    headers: cors({
      'Content-Type': type,
      'Cache-Control': 'no-store',
    }),
  });
}

function validImdb(value) {
  value = String(value || '').trim();
  return /^tt\d+$/i.test(value) ? value : '';
}

function safeHttps(raw) {
  try {
    const u = new URL(String(raw || ''));

    if (u.protocol !== 'https:') return null;

    const host = u.hostname.toLowerCase();

    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.local')
    ) {
      return null;
    }

    return u;
  } catch (_) {
    return null;
  }
}

function validCollapsRef(raw) {
  const u = safeHttps(raw);
  if (!u) return null;

  const h = u.hostname.toLowerCase();

  if (
    h === 'api.ortified.ws' ||
    h.endsWith('.ortified.ws') ||
    h === 'api.kinogram.best' ||
    h.endsWith('.kinogram.best')
  ) {
    return u;
  }

  return null;
}

async function fetchSources(imdb) {
  const target = new URL('https://fbphdplay.top/api/players');
  target.searchParams.set('imdb', imdb);

  const r = await fetch(target.toString(), {
    headers: {
      Accept: 'application/json',
      Origin: 'https://mnogotv.com',
      Referer: 'https://mnogotv.com/',
      'User-Agent': UA,
    },
    redirect: 'follow',
    cf: {
      cacheTtl: 30,
      cacheEverything: false,
    },
  });

  return r;
}

function extractBalancedArgument(source, callName) {
  source = String(source || '');

  const pos = source.indexOf(callName + '(');
  if (pos < 0) return '';

  const start = source.indexOf('(', pos) + 1;

  let depth = 1;
  let quote = '';
  let escape = false;
  let templateDepth = 0;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (quote) {
      if (ch === '\\') {
        escape = true;
        continue;
      }

      if (quote === '`' && ch === '$' && source[i + 1] === '{') {
        templateDepth++;
        i++;
        continue;
      }

      if (quote === '`' && ch === '}' && templateDepth > 0) {
        templateDepth--;
        continue;
      }

      if (ch === quote && templateDepth === 0) {
        quote = '';
      }

      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;

    if (depth === 0) {
      return source.slice(start, i).trim();
    }
  }

  return '';
}

async function fetchCollaps(imdb) {
  const hosts = [
    'https://api.ortified.ws/embed/imdb/' + encodeURIComponent(imdb),
    'https://api.kinogram.best/embed/imdb/' + encodeURIComponent(imdb),
  ];

  let last = '';

  for (const url of hosts) {
    try {
      const u = new URL(url);

      const r = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          Origin: u.origin,
          Referer: u.origin + '/',
          'User-Agent': UA,
        },
        redirect: 'follow',
        cf: {
          cacheTtl: 30,
          cacheEverything: false,
        },
      });

      const html = await r.text();

      if (!r.ok) {
        last = 'HTTP ' + r.status;
        continue;
      }

      const config = extractBalancedArgument(html, 'makePlayer');

      if (!config) {
        last = 'makePlayer не найден';
        continue;
      }

      return {
        ok: true,
        config,
        ref: u.origin + '/',
        host: u.hostname,
      };
    } catch (e) {
      last = String(e && e.message ? e.message : e);
    }
  }

  return {
    ok: false,
    error: last || 'Collaps недоступен',
  };
}

function upstreamHeaders(target, request, ref) {
  const h = new Headers();

  h.set('Accept', request.headers.get('Accept') || '*/*');
  h.set('User-Agent', UA);

  const range = request.headers.get('Range');
  if (range) h.set('Range', range);

  const r = validCollapsRef(ref);

  if (r) {
    h.set('Origin', r.origin);
    h.set('Referer', r.href);
  }

  return h;
}

function copyMediaHeaders(src) {
  const out = cors();

  [
    'Content-Type',
    'Content-Length',
    'Content-Range',
    'Accept-Ranges',
    'ETag',
    'Last-Modified',
  ].forEach((name) => {
    const value = src.get(name);
    if (value) out.set(name, value);
  });

  out.set('Cache-Control', 'no-store');
  return out;
}

function mediaRelayUrl(workerOrigin, upstream, ref) {
  const u = new URL('/media', workerOrigin);
  u.searchParams.set('url', upstream);
  u.searchParams.set('ref', ref);
  return u.toString();
}

function rewriteManifest(body, manifestUrl, workerOrigin, ref) {
  const base = new URL(manifestUrl);

  function resolve(raw) {
    try {
      const abs = new URL(raw, base).toString();
      return mediaRelayUrl(workerOrigin, abs, ref);
    } catch (_) {
      return raw;
    }
  }

  return String(body || '')
    .split(/\r?\n/)
    .map((line) => {
      if (!line) return line;

      if (line[0] !== '#') {
        return resolve(line.trim());
      }

      return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        return 'URI="' + resolve(uri) + '"';
      });
    })
    .join('\n');
}

export default {
  async fetch(request) {
    const u = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: cors(),
      });
    }

    if (u.pathname === '/health') {
      return json({
        ok: true,
        service: 'mnogotv-resolver',
        version: VERSION,
        endpoints: [
          '/health',
          '/sources',
          '/collaps/config',
          '/media',
        ],
      });
    }

    if (u.pathname === '/sources') {
      const imdb = validImdb(u.searchParams.get('imdb'));

      if (!imdb) {
        return json({
          ok: false,
          error: 'invalid imdb',
        }, 400);
      }

      try {
        const r = await fetchSources(imdb);
        const raw = await r.text();

        if (!r.ok) {
          return json({
            ok: false,
            error: 'players HTTP ' + r.status,
          }, 502);
        }

        let data = null;

        try {
          data = JSON.parse(raw);
        } catch (_) {
          return json({
            ok: false,
            error: 'invalid players json',
          }, 502);
        }

        let list = data && data.data !== undefined
          ? data.data
          : data;

        if (!Array.isArray(list)) list = [];

        const sources = [];
        const seen = new Set();

        for (const item of list) {
          if (!item || !item.type) continue;

          const type = String(item.type);
          const key = type.toLowerCase();

          if (seen.has(key)) continue;
          seen.add(key);

          sources.push({
            type,
            name: item.name || item.title || type,
            iframeUrl: item.iframeUrl || '',
          });
        }

        return json({
          ok: true,
          imdb,
          sources,
        });
      } catch (e) {
        return json({
          ok: false,
          error: String(e && e.message ? e.message : e),
        }, 502);
      }
    }

    if (u.pathname === '/collaps/config') {
      const imdb = validImdb(u.searchParams.get('imdb'));

      if (!imdb) {
        return json({
          ok: false,
          error: 'invalid imdb',
        }, 400);
      }

      const result = await fetchCollaps(imdb);
      return json(result, result.ok ? 200 : 502);
    }

    if (u.pathname === '/media') {
      const raw = u.searchParams.get('url') || '';
      const refRaw = u.searchParams.get('ref') || '';

      const target = safeHttps(raw);
      const ref = validCollapsRef(refRaw);

      if (!target || !ref) {
        return text('Invalid media request', 400);
      }

      try {
        const r = await fetch(target.toString(), {
          method: request.method === 'HEAD' ? 'HEAD' : 'GET',
          headers: upstreamHeaders(target, request, ref.href),
          redirect: 'follow',
          cf: {
            cacheTtl: 0,
            cacheEverything: false,
          },
        });

        const type = (r.headers.get('Content-Type') || '').toLowerCase();
        const looksM3u8 =
          type.includes('mpegurl') ||
          target.pathname.toLowerCase().includes('.m3u8');

        if (request.method !== 'HEAD' && looksM3u8) {
          const body = await r.text();

          const rewritten = rewriteManifest(
            body,
            target.toString(),
            u.origin,
            ref.href
          );

          return new Response(rewritten, {
            status: r.status,
            headers: cors({
              'Content-Type':
                'application/vnd.apple.mpegurl; charset=utf-8',
              'Cache-Control': 'no-store',
            }),
          });
        }

        return new Response(
          request.method === 'HEAD' ? null : r.body,
          {
            status: r.status,
            headers: copyMediaHeaders(r.headers),
          }
        );
      } catch (e) {
        return text(
          String(e && e.message ? e.message : e),
          502
        );
      }
    }

    return json({
      ok: true,
      service: 'mnogotv-resolver',
      version: VERSION,
      endpoints: [
        '/health',
        '/sources',
        '/collaps/config',
        '/media',
      ],
    });
  },
};
