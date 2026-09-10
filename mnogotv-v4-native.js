/* MnogoTV/Lampa 5.0.6-collaps | CollapsAdapter SHA-256: 9375ff10722fb5e2e1e6c64b41000e5573d4ef9af25746df3886734be2c78a58 */
(function (global) {
    'use strict';

    /* ADAPTER:COLLAPS:BEGIN */
    function CollapsAdapter(core) {
        var Lampa = global.Lampa;
        var cache = { ids: {} };
        var errText = core.errText;
        var log = core.log;
        var notify = core.notify;
        var requestJson = core.requestJson;
        var resolverUrl = core.resolverUrl;

        /* COLLAPS_REFERENCE_BLOCK_BEGIN */
    var COLLAPS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
    var COLLAPS_HOST = 'https://api.ortified.ws';
    var COLLAPS_REF = COLLAPS_HOST + '/';

    function silentText(url, headers, ok, fail) {
        var network = null;

        try {
            network = new Lampa.Reguest();
        } catch (e) {
            try {
                network = new Lampa.Request();
            } catch (e2) {}
        }

        if (
            !network ||
            typeof network.silent !== 'function'
        ) {
            fail(
                new Error(
                    'Lampa.Reguest.silent недоступен'
                )
            );
            return;
        }

        try {
            network.clear();
            network.timeout(12000);

            network.silent(
                url,
                function (str) {
                    ok(
                        String(
                            str ||
                            ''
                        )
                    );
                },
                function (a, c) {
                    var status =
                        a &&
                        a.status !== undefined
                            ? a.status
                            : '';

                    var message =
                        status
                            ? ('HTTP ' + status)
                            : errText(
                                a ||
                                c ||
                                'network error'
                            );

                    fail(
                        new Error(
                            message
                        )
                    );
                },
                false,
                {
                    dataType: 'text',
                    headers: headers || {}
                }
            );
        } catch (e3) {
            fail(e3);
        }
    }

    function collapsEmbedNavigationHeaders() {
        /*
         * HAR рабочего браузерного Collaps показывает, что embed загружается
         * как обычная document navigation: desktop UA + HTML Accept, без
         * Origin/Referer. На Android TV network.silent использует окружение
         * WebView и может получить другой makePlayer-конфиг, где остаётся
         * только HLS. Поэтому сначала просим embed через native bridge с
         * браузероподобными navigation headers.
         */
        return {
            'User-Agent': COLLAPS_UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'ru,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Upgrade-Insecure-Requests': '1'
        };
    }

    function collapsConfigHasDash(cfg, season, episode) {
        try {
            var item = pickCollapsItem(cfg, season, episode);
            if (!item) return false;
            return !!(
                item.dasha ||
                item.dash ||
                (item.source && (item.source.dasha || item.source.dash))
            );
        } catch (e) {}
        return false;
    }

    function collapsEmbedConfig(attempt, season, episode, ok, fail) {
        var nativeError = null;
        var nativeHtml = '';
        var nativeCfg = null;

        function trySilent() {
            silentText(
                attempt.url,
                {},
                function (silentHtml) {
                    var silentCfg = parseCollapsHtml(silentHtml);

                    /*
                     * Если desktop/native дал DASH, он всегда приоритетнее.
                     * Иначе берём silent только если именно он дал DASH или
                     * native-конфиг вообще не распарсился.
                     */
                    if (
                        nativeCfg &&
                        collapsConfigHasDash(nativeCfg, season, episode)
                    ) {
                        ok(nativeCfg, 'native-desktop');
                        return;
                    }

                    if (
                        silentCfg &&
                        collapsConfigHasDash(silentCfg, season, episode)
                    ) {
                        ok(silentCfg, 'silent-dash');
                        return;
                    }

                    if (nativeCfg) {
                        ok(nativeCfg, 'native-desktop-hls');
                        return;
                    }

                    if (silentCfg) {
                        ok(silentCfg, 'silent-hls');
                        return;
                    }

                    fail(
                        nativeError ||
                        new Error('Collaps: makePlayer не найден')
                    );
                },
                function (silentError) {
                    if (nativeCfg) {
                        ok(
                            nativeCfg,
                            collapsConfigHasDash(nativeCfg, season, episode)
                                ? 'native-desktop'
                                : 'native-desktop-hls'
                        );
                        return;
                    }

                    fail(
                        silentError ||
                        nativeError ||
                        new Error('Collaps embed недоступен')
                    );
                }
            );
        }

        nativeText(
            attempt.url,
            collapsEmbedNavigationHeaders(),
            function (html) {
                nativeHtml = String(html || '');
                nativeCfg = parseCollapsHtml(nativeHtml);

                /*
                 * Не делаем второй запрос, если уже получили нужный DASH.
                 */
                if (
                    nativeCfg &&
                    collapsConfigHasDash(nativeCfg, season, episode)
                ) {
                    ok(nativeCfg, 'native-desktop');
                    return;
                }

                trySilent();
            },
            function (err) {
                nativeError = err;
                trySilent();
            }
        );
    }

    function nativeText(url, headers, ok, fail) {
        var network = null;
        try { network = new Lampa.Reguest(); } catch (e) {
            try { network = new Lampa.Request(); } catch (e2) {}
        }

        if (!network || typeof network.native !== 'function') {
            fail(new Error('Lampa.Reguest.native недоступен'));
            return;
        }

        try {
            network.clear();
            network.timeout(12000);
            network.native(url, function (str) {
                ok(String(str || ''));
            }, function (a, c) {
                var status = a && a.status !== undefined ? a.status : '';
                var message = status ? ('HTTP ' + status) : errText(a || c || 'network error');
                fail(new Error(message));
            }, false, {
                dataType: 'text',
                headers: headers || {}
            });
        } catch (e3) {
            fail(e3);
        }
    }

    function collapsHeadersFor(url) {
        var origin = COLLAPS_HOST;

        try {
            origin = new URL(String(url || '')).origin || COLLAPS_HOST;
        } catch (e) {}

        return {
            'User-Agent': COLLAPS_UA,
            'Origin': origin,
            'Referer': origin + '/'
        };
    }

    function collapsHeaders() {
        return collapsHeadersFor(COLLAPS_HOST);
    }

    function parseCollapsHtml(html) {
        html = String(html || '');

        /*
         * Collaps загружает media не по URL из makePlayer напрямую.
         * api.ortified.ws/cdn.js добавляет bare-token fa4cdd5c и затем
         * переводит запросы .mpd/.webm в /x-en-x/<encoded>.
         * Эти два значения живут СНАРУЖИ makePlayer, поэтому сохраняем их
         * рядом с распарсенным конфигом.
         */
        var unixMatch = html.match(/unixTime\s*=\s*(\d+)/i);
        var keyMatch = null;
        // The variable name changes. Follow the source-URL append expression.
        var tokenUse = html.match(/\[[^\]\r\n]+\]\s*\+=\s*["']&["']\s*\+\s*([A-Za-z_$][\w$]*)/);
        var tokenName = tokenUse ? tokenUse[1] : 'fa4cdd5c';
        var escapedTokenName = tokenName.replace(/[$]/g, '\\$&');
        var keyRe = new RegExp('\\b' + escapedTokenName + '\\s*=\\s*["\']([0-9a-f]+)["\']', 'ig');
        var km;
        while ((km = keyRe.exec(html))) keyMatch = km[1];

        var flat = html.replace(/\n/g, '');
        var find = flat.match(/makePlayer\(({.*?})\);/);
        var json = null;

        try {
            json = find && (0, eval)('"use strict"; (' + find[1] + ');');
        } catch (e) {}

        if (json) {
            json.__mnogotvCdn = {
                unixTime: unixMatch ? parseInt(unixMatch[1], 10) : 0,
                key: keyMatch || ''
            };
        }

        return json;
    }

    function normalizeDirectUrl(url) {
        url = String(url || '').trim();
        if (url.indexOf('//') === 0) url = 'https:' + url;
        return url;
    }

    /*
     * Collaps CDN URLs are issued for the client that loaded the embed.
     * Cloudflare relay changes the network origin/IP and current interkh.com
     * answers 424. Build the same /x-en-x/ URL on the device instead.
     */
    var COLLAPS_CDN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    var COLLAPS_CDN_SUBST = 'DlChEXitLONYRkFjAsnBbymWzSHMqKPgQZpvwerofJTVdIuUcxaG';

    function appendCollapsBareToken(rawUrl, key) {
        var value = String(rawUrl || '').trim();
        key = String(key || '').trim();
        if (!value || !key) return value;
        if (value.indexOf('&' + key) !== -1 || value.slice(-(key.length + 1)) === '?' + key) return value;
        return value + (value.indexOf('?') >= 0 ? '&' : '?') + key;
    }

    function collapsClientCdnUrl(rawUrl, unixTime, key, appendSourceToken) {
        /*
         * IMPORTANT: Collaps adds fa4cdd5c only to the TOP-LEVEL source
         * (hls/dash) before VenomPlayer starts. cdn.js does NOT append this
         * bare token to child playlists or media fragments. v4.0.7-v4.0.9
         * appended it to every URI we rewrote, which made the x-en-x request
         * for the first TS fragment invalid and the CDN answered HTTP 410.
         */
        var logical = normalizeDirectUrl(rawUrl);
        if (appendSourceToken !== false) {
            logical = appendCollapsBareToken(logical, key);
        }
        if (!logical) return '';

        var u;
        try { u = new URL(logical); } catch (e) { return logical; }

        if (u.pathname.indexOf('/x-en-x/') !== -1) return u.toString();

        var unix = parseInt(unixTime || 0, 10) || 0;
        if (!unix) return u.toString();

        var hour = Math.round(unix / 3600);
        var payload = hour + '/' + u.pathname + u.search;
        var base64 = '';

        try {
            base64 = btoa(unescape(encodeURIComponent(payload)));
        } catch (e2) {
            try { base64 = btoa(payload); } catch (e3) { return u.toString(); }
        }

        var encoded = '';
        for (var i = 0; i < base64.length; i++) {
            var ch = base64.charAt(i);
            var pos = COLLAPS_CDN_ALPHABET.indexOf(ch);
            encoded += pos >= 0 ? COLLAPS_CDN_SUBST.charAt(pos) : ch;
        }

        return u.origin + '/x-en-x/' + encoded;
    }

    function collapsPlaybackHeaders(format) {
        return {
            'User-Agent': COLLAPS_UA,
            'Origin': COLLAPS_HOST,
            'Referer': COLLAPS_REF,
            'Accept': format === 'dash'
                ? 'application/dash+xml,*/*;q=0.8'
                : 'application/vnd.apple.mpegurl,application/x-mpegURL,*/*;q=0.8'
        };
    }


    /*
     * v4.0.7: Android native HLS loader for Collaps.
     *
     * v4.0.6 proved that Lampa.Reguest.native can fetch the signed Collaps
     * manifest from the device, while Lampa's stock Hls.js XHR then fails
     * with manifestLoadError. Lampa creates Hls with `new Hls()` and no
     * custom config, so we install a default loader which only intercepts
     * Collaps CDN requests. Every other URL falls back to Hls.js' original
     * loader unchanged.
     */
    var COLLAPS_NATIVE_HLS = {
        installed: false,
        originalLoader: null,
        unixTime: 0,
        key: '',
        headers: {},
        urlMap: {},
        lastRequest: null,
        lastError: null
    };

    function stripHash(url) {
        return String(url || '').split('#')[0];
    }

    function isCollapsCdnUrl(url) {
        try {
            var host = new URL(stripHash(url)).hostname.toLowerCase();
            return host === 'interkh.com' || host.slice(-12) === '.interkh.com';
        } catch (e) {
            return false;
        }
    }

    function describeNativePayload(value) {
        var root = value, raw = value, route = [], depth = 0;
        var status = root && typeof root === 'object' ? Number(root.status || root.statusCode || 0) : 0;
        while (raw && typeof raw === 'object' && depth++ < 5) {
            if (Object.prototype.toString.call(raw) === '[object ArrayBuffer]') {
                return { kind: 'arraybuffer', length: raw.byteLength, route: route.join('.'), status: status };
            }
            if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(raw)) {
                return { kind: 'typed-array', length: raw.byteLength, route: route.join('.'), status: status };
            }
            var fields = ['base64', 'data', 'body', 'response', 'result'], field = '';
            fields.some(function (name) { if (raw[name] !== undefined) { field = name; return true; } return false; });
            if (!field) return { kind: 'object-without-body', length: 0, route: route.join('.'), status: status };
            route.push(field); raw = raw[field];
        }
        var text = typeof raw === 'string' ? raw : '';
        var trimmed = text.trim(), kind = typeof raw;
        if (raw === null || raw === undefined || trimmed === '' && typeof raw === 'string') kind = 'empty';
        else if (typeof raw === 'string') {
            if (/^(?:<!doctype|<html|<head|<body|<\?xml)/i.test(trimmed)) kind = 'html-or-xml';
            else if (/^[{[]/.test(trimmed)) kind = 'json-text';
            else if (/^https?:\/\//i.test(trimmed)) kind = 'url-text';
            else if (/^data:/i.test(trimmed)) kind = 'data-url';
            else if (/^"[A-Za-z0-9+/=\s]+"$/.test(trimmed)) kind = 'quoted-base64';
            else if (/^[A-Za-z0-9+/\s]*={0,2}$/.test(trimmed)) kind = 'base64-like';
            else if (/^[A-Za-z0-9_\-\s]*={0,2}$/.test(trimmed)) kind = 'base64url-like';
            else kind = 'non-base64-text';
        }
        // Deliberately omit response text, URLs, tokens and arbitrary object values.
        return { kind: kind, length: text.length, route: route.join('.') || 'direct', status: status };
    }

    function nativeJsonDetail(value) {
        var raw = value, info = { fields: [], error: '', status: 0, parse: 'not-json', preview: '' };
        function safe(value) {
            if (typeof value !== 'string' && typeof value !== 'number') return '';
            return String(value).replace(/[\x00-\x1f\x7f]/g, ' ').replace(/https?:\/\/\S+/gi, '[url]')
                .replace(/(?:token|key|secret|authorization)[\"'\s]*[:=][\"'\s]*[^,}\s]+/gi, '[redacted]')
                .replace(/[A-Za-z0-9_\/-]{24,}/g, '[redacted]').slice(0, 140);
        }
        for (var depth = 0; depth < 8; depth++) {
            if (typeof raw === 'string' && /^[\s]*[{"[]/.test(raw)) {
                try { raw = JSON.parse(raw); info.parse = 'valid'; } catch (e) {
                    info.parse = 'invalid'; info.preview = safe(raw); break;
                }
            }
            if (Array.isArray(raw)) {
                info.parse = 'array(' + raw.length + ')';
                if (raw.length && raw[0] && typeof raw[0] === 'object') { raw = raw[0]; }
                else { info.preview = safe(raw.slice(0, 3).join(' | ')); break; }
            }
            if (!raw || typeof raw !== 'object') {
                info.preview = safe(raw); break;
            }
            info.fields = Object.keys(raw).slice(0, 8).map(function (name) { return safe(name); });
            var status = Number(raw.status || raw.statusCode || 0);
            if (status >= 100 && status <= 599) info.status = status;
            var err = raw.error;
            var details = err && typeof err === 'object' ? err : raw;
            var message = typeof err === 'string' ? err : details.message || details.detail || details.reason || details.description || details.code;
            if (message !== undefined) info.error = safe(message);
            if (err || raw.success === false || info.status >= 400) break;
            var next = raw.data !== undefined ? raw.data : raw.body !== undefined ? raw.body :
                raw.response !== undefined ? raw.response : raw.result;
            if (next === undefined) break;
            raw = next;
        }
        return info;
    }

    function nativeDecodeSummary(value, range) {
        var info = describeNativePayload(value);
        var detail = nativeJsonDetail(value);
        info.json = detail;
        info.range = range ? 'yes' : 'no';
        // Put the actionable detail first: TV notifications can clip long lines.
        info.summary = (detail.error ? 'error=' + detail.error + ' · ' : '') +
            (detail.preview ? 'text=' + detail.preview + ' · ' : '') +
            'JSON=' + detail.parse + ' · ' + info.kind + ' · len=' + info.length +
            ' · status=' + (detail.status || info.status || '?') + ' · Range=' + info.range +
            (detail.fields.length ? ' · fields=' + detail.fields.join(',') : '');
        return info;
    }

    function base64ToArrayBuffer(value) {
        var raw = value;
        for (var depth = 0; depth < 8; depth++) {
            if (typeof raw === 'string' && /^[\s]*[{"[]/.test(raw)) {
                try { raw = JSON.parse(raw); } catch (jsonError) {
                    throw new Error('Некорректный JSON-ответ native bridge');
                }
            }
            if (Object.prototype.toString.call(raw) === '[object ArrayBuffer]') return raw;
            if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(raw)) {
                return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
            }
            if (!raw || typeof raw !== 'object') break;
            if (raw.error || raw.success === false || Number(raw.status || raw.statusCode || 0) >= 400) {
                throw new Error('Native bridge вернул JSON с ошибкой вместо видеоданных');
            }
            raw = raw.base64 !== undefined ? raw.base64 :
                  raw.data !== undefined ? raw.data :
                  raw.body !== undefined ? raw.body :
                  raw.response !== undefined ? raw.response :
                  raw.result !== undefined ? raw.result : '';
        }
        raw = String(raw || '');
        var comma = raw.indexOf('base64,');
        if (comma >= 0) raw = raw.slice(comma + 7);
        raw = raw.replace(/\s+/g, '');
        if (!raw || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 === 1) {
            throw new Error('Ответ native bridge не является Base64-видеофрагментом');
        }
        var binary = atob(raw);
        var out = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i) & 255;
        return out.buffer;
    }

    function hlsNativeStats() {
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        return {
            aborted: false,
            loaded: 0,
            retry: 0,
            total: 0,
            chunkCount: 0,
            bwEstimate: 0,
            loading: { start: now, first: 0, end: 0 },
            parsing: { start: 0, end: 0 },
            buffering: { start: 0, first: 0, end: 0 }
        };
    }

    function mapCollapsPlaylistUri(raw, originalBase) {
        raw = String(raw || '').trim();
        if (!raw || raw.indexOf('data:') === 0 || raw.indexOf('blob:') === 0) return raw;
        try {
            var logical = new URL(raw, originalBase).toString();
            var client = collapsClientCdnUrl(
                logical,
                COLLAPS_NATIVE_HLS.unixTime,
                COLLAPS_NATIVE_HLS.key,
                false
            );
            client = stripHash(client);
            COLLAPS_NATIVE_HLS.urlMap[client] = logical;
            return client;
        } catch (e) {
            return raw;
        }
    }

    function rewriteCollapsNativePlaylist(body, originalBase) {
        return String(body || '').split(/\r?\n/).map(function (line) {
            if (!line) return line;
            if (line.charAt(0) !== '#') {
                return mapCollapsPlaylistUri(line.trim(), originalBase);
            }
            return line.replace(/URI="([^"]+)"/g, function (_, uri) {
                return 'URI="' + mapCollapsPlaylistUri(uri, originalBase) + '"';
            });
        }).join('\n');
    }

    function configureCollapsNativeHls(rawUrl, clientUrl, unixTime, key, headers) {
        COLLAPS_NATIVE_HLS.unixTime = parseInt(unixTime || 0, 10) || 0;
        COLLAPS_NATIVE_HLS.key = String(key || '');
        COLLAPS_NATIVE_HLS.headers = headers || {};
        COLLAPS_NATIVE_HLS.urlMap = {};
        COLLAPS_NATIVE_HLS.urlMap[stripHash(clientUrl)] = normalizeDirectUrl(rawUrl);

        if (COLLAPS_NATIVE_HLS.installed) return true;

        /*
         * Core owns the one permanent HLS router. This adapter contributes
         * only an URL predicate and a loader constructor; its urlMap, token,
         * headers and request diagnostics stay inside this adapter instance.
         */
        var OriginalLoader = core.hlsRouter.stockLoader();
        if (!OriginalLoader) return false;
        COLLAPS_NATIVE_HLS.originalLoader = OriginalLoader;

        function CollapsNativeLoader(config) {
            this.config = config;
            this.context = null;
            this.stats = hlsNativeStats();
            this.network = null;
            this.fallback = null;
        }

        CollapsNativeLoader.prototype.destroy = function () {
            this.abort();
            this.context = null;
            this.config = null;
        };

        CollapsNativeLoader.prototype.abort = function () {
            this.stats.aborted = true;
            try { if (this.network && this.network.clear) this.network.clear(); } catch (e) {}
            try { if (this.fallback && this.fallback.abort) this.fallback.abort(); } catch (e2) {}
        };

        CollapsNativeLoader.prototype.getCacheAge = function () { return null; };
        CollapsNativeLoader.prototype.getResponseHeader = function () { return null; };

        CollapsNativeLoader.prototype.load = function (context, config, callbacks) {
            this.context = context;
            var initialStats = hlsNativeStats();
            var stats = this.stats;
            Object.keys(initialStats).forEach(function (key) { stats[key] = initialStats[key]; });

            var visibleUrl = stripHash(context && context.url || '');
            if (!isCollapsCdnUrl(visibleUrl)) {
                this.fallback = new OriginalLoader(this.config);
                this.fallback.stats = this.stats;
                this.fallback.load(context, config, callbacks);
                return;
            }

            var logicalUrl = COLLAPS_NATIVE_HLS.urlMap[visibleUrl] || visibleUrl;
            var requestUrl = visibleUrl.indexOf('/x-en-x/') >= 0
                ? visibleUrl
                : stripHash(collapsClientCdnUrl(
                    logicalUrl,
                    COLLAPS_NATIVE_HLS.unixTime,
                    COLLAPS_NATIVE_HLS.key,
                    false
                ));

            COLLAPS_NATIVE_HLS.urlMap[requestUrl] = logicalUrl;

            var isBinary = String(context && context.responseType || '').toLowerCase() === 'arraybuffer';
            var headers = {};
            var baseHeaders = COLLAPS_NATIVE_HLS.headers || {};
            Object.keys(baseHeaders).forEach(function (k) { headers[k] = baseHeaders[k]; });

            /*
             * Media fragments are binary resources. A real browser requests
             * them with a generic Accept header rather than an HLS-manifest MIME. Keep
             * Origin/Referer, but do not advertise the playlist MIME for a
             * fragment request.
             */
            if (isBinary) headers.Accept = '*/*';
            /*
             * Hls.js initializes rangeStart/rangeEnd to 0/0 for ordinary
             * fragments. v4.0.7 treated the mere presence of those fields as
             * a real byte-range and sent the invalid header `Range: bytes=0--1`,
             * which makes normal fragments fail with fragLoadError.
             * Match Hls.js' stock loader: add Range only when rangeEnd is > 0
             * and the interval is actually non-empty.
             */
            if (
                context &&
                Number(context.rangeEnd) > Number(context.rangeStart) &&
                Number(context.rangeEnd) > 0
            ) {
                headers.Range =
                    'bytes=' +
                    Number(context.rangeStart || 0) +
                    '-' +
                    (Number(context.rangeEnd) - 1);
            }

            var network = null;
            try { network = new Lampa.Reguest(); } catch (e) {
                try { network = new Lampa.Request(); } catch (e2) {}
            }
            if (!network || typeof network.native !== 'function') {
                callbacks.onError({ code: 0, text: 'Lampa.Reguest.native unavailable' }, context, null, this.stats);
                return;
            }
            this.network = network;

            var timeout = (config && (config.timeout || config.maxLoadTimeMs)) || 20000;
            try { if (network.timeout) network.timeout(Math.max(5000, timeout)); } catch (e3) {}

            var self = this;
            COLLAPS_NATIVE_HLS.lastRequest = {
                type: String(context && context.type || ''),
                responseType: String(context && context.responseType || ''),
                visibleUrl: visibleUrl,
                logicalUrl: logicalUrl,
                requestUrl: requestUrl,
                rangeStart: Number(context && context.rangeStart || 0),
                rangeEnd: Number(context && context.rangeEnd || 0),
                headers: headers
            };
            log('Collaps native loader request', COLLAPS_NATIVE_HLS.lastRequest);

            try {
                network.native(
                    requestUrl,
                    function (response) {
                        if (self.stats.aborted) return;
                        var now = (window.performance && performance.now) ? performance.now() : Date.now();
                        self.stats.loading.first = self.stats.loading.first || now;
                        self.stats.loading.end = now;
                        try {
                            var data;
                            if (isBinary) {
                                data = base64ToArrayBuffer(response);
                                self.stats.loaded = self.stats.total = data.byteLength || 0;
                                COLLAPS_NATIVE_HLS.lastError = null;
                                log('Collaps native fragment success', {
                                    bytes: self.stats.loaded,
                                    responseKind: Object.prototype.toString.call(response),
                                    requestUrl: requestUrl
                                });
                            }
                            else {
                                data = typeof response === 'string' ? response : String(response || '');
                                if (/^(manifest|level|audioTrack|subtitleTrack)$/i.test(String(context && context.type || ''))) {
                                    data = rewriteCollapsNativePlaylist(data, logicalUrl);
                                }
                                self.stats.loaded = self.stats.total = data.length || 0;
                            }
                            self.stats.chunkCount = 1;
                            callbacks.onSuccess({ url: context.url, data: data }, self.stats, context, null);
                        }
                        catch (decodeError) {
                            var payloadInfo = nativeDecodeSummary(response, headers.Range || headers.range);
                            var decodeText = 'native decode: ' + payloadInfo.summary;
                            COLLAPS_NATIVE_HLS.lastError = {
                                phase: isBinary ? 'fragment-decode' : 'text-decode',
                                payload: payloadInfo,
                                code: 0,
                                text: decodeText,
                                requestUrl: requestUrl
                            };
                            log('Collaps native loader decode error', COLLAPS_NATIVE_HLS.lastError);
                            try { notify('Collaps DEBUG: ' + decodeText); } catch (eNoty1) {}
                            callbacks.onError({ code: 0, text: decodeText }, context, null, self.stats);
                        }
                    },
                    function (a, c) {
                        if (self.stats.aborted) return;
                        var status = a && a.status !== undefined ? Number(a.status) : 0;
                        var nativeTextError = errText(a || c || 'native network error');
                        COLLAPS_NATIVE_HLS.lastError = {
                            phase: isBinary ? 'fragment-network' : 'playlist-network',
                            code: status || 0,
                            text: nativeTextError,
                            requestUrl: requestUrl,
                            visibleUrl: visibleUrl,
                            responseType: String(context && context.responseType || '')
                        };
                        log('Collaps native loader network error', COLLAPS_NATIVE_HLS.lastError);
                        try {
                            notify(
                                'Collaps DEBUG: ' +
                                COLLAPS_NATIVE_HLS.lastError.phase +
                                ' HTTP ' + (status || 0) +
                                ' • ' + nativeTextError
                            );
                        } catch (eNoty2) {}
                        callbacks.onError({
                            code: status || 0,
                            text: nativeTextError
                        }, context, a || null, self.stats);
                    },
                    false,
                    {
                        dataType: isBinary ? 'base64' : 'text',
                        headers: headers
                    }
                );
            }
            catch (e4) {
                callbacks.onError({ code: 0, text: errText(e4) }, context, null, self.stats);
            }
        };

        try {
            var registered = core.hlsRouter.register('collaps', {
                owns: function (url) {
                    var clean = stripHash(url);
                    return !!COLLAPS_NATIVE_HLS.urlMap[clean] ||
                        (!!COLLAPS_NATIVE_HLS.key && isCollapsCdnUrl(clean));
                },
                loader: CollapsNativeLoader
            });
            if (!registered) return false;
            COLLAPS_NATIVE_HLS.installed = true;
            log('Collaps native HLS route installed');
            return true;
        }
        catch (e5) {
            log('Collaps native Hls loader install failed', e5);
            return false;
        }
    }

    function normalizeSubs(list) {
        if (!Array.isArray(list)) return [];
        return list.map(function (s) {
            if (!s) return null;
            var url = typeof s === 'string' ? s : (s.url || s.file || s.src || '');
            url = normalizeDirectUrl(url);
            if (!url) return null;
            return {
                label: (s && (s.name || s.label || s.lang)) || 'Субтитры',
                url: url
            };
        }).filter(Boolean);
    }

    function normalizeTracks(audio) {
        var names = audio && Array.isArray(audio.names) ? audio.names : [];
        var order = audio && Array.isArray(audio.order) ? audio.order : [];

        /*
         * Collaps audio.names contains the human-readable dubbing names.
         * audio.order maps each name to the REAL media-track number.
         *
         * Example from the real S1E1 config:
         * names: [Невафильм, LostFilm, HDRezka Studio, Eng.Original,
         *         DniproFilm (укр), delete]
         * order: [0, 1, 2, 4, 3, 5]
         *
         * Older v4 builds sorted by order and then threw the index away.
         * The UI could therefore claim one dubbing while dash.js continued
         * playing its own default audio track.
         */
        return names.map(function (name, sourceIndex) {
            var label = String(name || '').trim();
            var mapped = parseInt(order[sourceIndex], 10);

            if (!label || label === 'delete') return null;

            return {
                language: label,
                label: label,
                index: isNaN(mapped) ? sourceIndex : mapped,
                sourceIndex: sourceIndex
            };
        }).filter(Boolean);
    }

    function timeline(movie, season, episode) {
        try {
            var base = movie.original_title || movie.original_name || titleOf(movie);
            var key = season && episode ? [season, episode, base].join('') : base;
            return Lampa.Timeline.view(Lampa.Utils.hash(key));
        } catch (e) { return undefined; }
    }

    function pickCollapsItem(config, season, episode) {
        if (!config) return null;
        if (season !== null && episode !== null && config.playlist && Array.isArray(config.playlist.seasons)) {
            var seasonNode = null;
            config.playlist.seasons.some(function (s) {
                if (Number(s.season) === Number(season)) { seasonNode = s; return true; }
                return false;
            });
            if (!seasonNode) return null;
            var episodeNode = null;
            (seasonNode.episodes || []).some(function (ep) {
                if (Number(ep.episode) === Number(episode)) { episodeNode = ep; return true; }
                return false;
            });
            return episodeNode;
        }
        return config.source || null;
    }

    function getKpId(imdb, ok) {
        imdb = String(imdb || '');

        if (
            imdb &&
            cache.ids[imdb]
        ) {
            ok(
                cache.ids[imdb]
            );
            return;
        }

        requestJson(
            resolverUrl(
                '/ids',
                {
                    imdb: imdb
                }
            ),
            function (data) {
                var kp =
                    data &&
                    data.kp
                        ? String(data.kp)
                        : '';

                if (
                    imdb &&
                    kp
                ) {
                    cache.ids[imdb] =
                        kp;
                }

                ok(kp);
            },
            function () {
                ok('');
            }
        );
    }

    function tryCollapsUrls(source, imdb, kp, season, episode, ok, fail) {
        var urls = [];
        var seen = {};

        function add(url, label) {
            url = normalizeDirectUrl(url);
            if (!url || seen[url]) return;

            seen[url] = true;
            urls.push({
                url: url,
                label: label,
                headers: collapsHeadersFor(url)
            });
        }

        /*
         * v4.0.12: сначала пробуем ТОТ embed URL, который реально вернул
         * MnogoTV/Kinobox для выбранного источника. Для Collaps это обычно
         * api.ortified.ws/embed/movie/<id>. Пользователь подтвердил, что
         * такие movie/embed страницы открываются в браузере, а KP-route для
         * S1E1 у нас отдавал только HLS и упирался в 410 на фрагментах.
         *
         * Принимаем только собственные Collaps-host'ы, чтобы не вернуть
         * старую проблему с чужим iframe и неверно выбранной серией. Саму
         * серию всё равно выбирает pickCollapsItem(cfg, season, episode).
         */
        try {
            var sourceIframe = normalizeDirectUrl(source && source.iframeUrl || '');
            if (sourceIframe) {
                var sourceHost = new URL(sourceIframe).hostname.toLowerCase();
                if (
                    sourceHost === 'api.ortified.ws' ||
                    sourceHost === 'api.kinogram.best'
                ) {
                    add(sourceIframe, 'source movie embed');
                }
            }
        } catch (eSourceIframe) {}

        /* Fallbacks: KP, затем IMDb. */
        if (kp) {
            add(
                'https://api.ortified.ws/embed/kp/' + encodeURIComponent(kp),
                'ortified kp'
            );
            add(
                'https://api.kinogram.best/embed/kp/' + encodeURIComponent(kp),
                'kinogram kp'
            );
        }

        if (imdb) {
            add(
                'https://api.ortified.ws/embed/imdb/' + encodeURIComponent(imdb),
                'ortified imdb'
            );
            add(
                'https://api.kinogram.best/embed/imdb/' + encodeURIComponent(imdb),
                'kinogram imdb'
            );
        }

        /*
         * Kinobox iframe здесь НЕ используем:
         * он живёт своей внутренней выбранной серией/сезоном,
         * что и дало пользователю 9 сезон / 1 серия при выборе
         * другой серии в MnogoTV.
         */
        var index = 0;
        var errors = [];

        function next() {
            if (index >= urls.length) {
                fail(new Error(
                    errors.length
                        ? errors.join(' | ')
                        : 'Collaps недоступен'
                ));
                return;
            }

            var attempt = urls[index++];

            collapsEmbedConfig(
                attempt,
                season,
                episode,
                function (cfg, mode) {
                    if (cfg) {
                        ok({
                            config: cfg,
                            url: attempt.url,
                            label:
                                attempt.label +
                                ' • ' +
                                (mode || 'embed'),
                            headers: attempt.headers,
                            ref: attempt.headers.Referer
                        });
                    }
                    else {
                        errors.push(
                            attempt.label + ': makePlayer не найден'
                        );
                        next();
                    }
                },
                function (e) {
                    errors.push(
                        attempt.label + ': ' + errText(e)
                    );
                    next();
                }
            );
        }

        next();
    }

    function relayMediaUrl(rawUrl, ref, forceManifest) {
        var name = forceManifest ? 'master.m3u8' : 'media.bin';

        try {
            var u = new URL(String(rawUrl || ''));
            var base = (u.pathname.split('/').pop() || '').split('?')[0];

            if (base && /\.[a-z0-9]{2,5}$/i.test(base)) {
                name = base.replace(/[^a-zA-Z0-9._-]/g, '_');
            }
            else if (String(rawUrl || '').toLowerCase().indexOf('.m3u8') !== -1) {
                name = 'master.m3u8';
            }
        } catch (e) {}

        return resolverUrl('/media/' + name, {
            url: rawUrl,
            ref: ref
        });
    }

    function looksLikeManifest(text) {
        text = String(text || '').trim();
        return text.indexOf('#EXTM3U') === 0;
    }

    function preparePlayableStream(rawStream, response, ok) {
        var directHeaders =
            response.headers ||
            collapsHeadersFor(response.url);

        var ref =
            response.ref ||
            (directHeaders && directHeaders.Referer) ||
            COLLAPS_REF;

        var relay = relayMediaUrl(rawStream, ref, true);

        nativeText(relay, {}, function (manifest) {
            var ready = looksLikeManifest(manifest);

            ok({
                directUrl: rawStream,
                directHeaders: directHeaders,
                relayUrl: ready ? relay : '',
                relayReady: ready
            });
        }, function () {
            ok({
                directUrl: rawStream,
                directHeaders: directHeaders,
                relayUrl: '',
                relayReady: false
            });
        });
    }



    /*
     * v4.0.11: Collaps DASH transport inside the stock Lampa.Player.
     *
     * The real VenomPlayer does not start with HLS. Its order is:
     *   dasha (AV1) -> dash -> hls.
     * cdn.js rewrites every DASH MPD/WebM URL to /x-en-x/<encoded>.
     * We mirror only that URL transformation through dash.js RequestModifier.
     * The media remains inside Lampa.Player; no iframe/external player/CF relay.
     */
    var COLLAPS_NATIVE_DASH = {
        installed: false,
        active: false,
        generation: 0,
        qualityControl: null,
        lastDecode: null,
        unixTime: 0,
        originalMediaPlayer: null,
        xhrInstalled: false,
        originalXHR: null,
        requestCount: 0,
        successCount: 0,
        errorCount: 0,
        lastUrl: '',
        lastStatus: 0,

        /* Selected Collaps dubbing. -1 means provider/default track. */
        audioIndex: -1,
        audioLabel: '',
        audioAppliedKey: ''
    };

    function collapsAv1Supported() {
        try {
            return !!(
                window.MediaSource &&
                typeof MediaSource.isTypeSupported === 'function' &&
                MediaSource.isTypeSupported('video/webm; codecs="av01.0.08M.08"') &&
                MediaSource.isTypeSupported('audio/webm; codecs="opus"')
            );
        } catch (e) {}
        return false;
    }


    /*
     * v4.0.14: dash.js в штатном Lampa.Player делает обычные XHR.
     * У Collaps CDN CORS разрешён только для Origin https://api.ortified.ws,
     * а WebView Lampa имеет другой origin. Поэтому URL мы уже строим правильно,
     * но браузерный XHR зависает/блокируется.
     *
     * Для interkh.com перехватываем XMLHttpRequest и выполняем тот же GET через
     * Lampa.Reguest.native на самом Android-устройстве. Для всех остальных URL
     * остаётся настоящий XMLHttpRequest.
     */
    function installCollapsDashNativeXHR() {
        if (COLLAPS_NATIVE_DASH.xhrInstalled) return true;

        var OriginalXHR = window.XMLHttpRequest;
        if (typeof OriginalXHR !== 'function') return false;

        COLLAPS_NATIVE_DASH.originalXHR = OriginalXHR;

        function guessNativeContentType(url, responseType) {
            var value = String(url || '').toLowerCase();
            if (value.indexOf('.mpd') >= 0) return 'application/dash+xml';
            if (value.indexOf('.webm') >= 0) return 'video/webm';
            if (value.indexOf('.mp4') >= 0 || value.indexOf('.m4s') >= 0) return 'video/mp4';
            if (String(responseType || '').toLowerCase() === 'arraybuffer') return 'application/octet-stream';
            return 'text/plain';
        }

        function NativeDashXHR() {
            this._delegate = null;
            this._nativeRequest = null;
            this._requestSerial = 0;
            this._aborted = false;
            this._useNative = false;
            this._method = 'GET';
            this._url = '';
            this._async = true;
            this._headers = {};
            this._listeners = {};

            this.readyState = 0;
            this.status = 0;
            this.statusText = '';
            this.response = null;
            this.responseText = '';
            this.responseURL = '';
            this.responseXML = null;

            this._responseType = '';
            this._timeout = 0;
            this._withCredentials = false;

            this.onloadstart = null;
            this.onprogress = null;
            this.onreadystatechange = null;
            this.onload = null;
            this.onerror = null;
            this.onabort = null;
            this.ontimeout = null;
            this.onloadend = null;
        }

        NativeDashXHR.UNSENT = 0;
        NativeDashXHR.OPENED = 1;
        NativeDashXHR.HEADERS_RECEIVED = 2;
        NativeDashXHR.LOADING = 3;
        NativeDashXHR.DONE = 4;

        NativeDashXHR.prototype.UNSENT = 0;
        NativeDashXHR.prototype.OPENED = 1;
        NativeDashXHR.prototype.HEADERS_RECEIVED = 2;
        NativeDashXHR.prototype.LOADING = 3;
        NativeDashXHR.prototype.DONE = 4;

        NativeDashXHR.prototype._emit = function (type, extra) {
            var evt = extra || {};
            try { evt.type = evt.type || type; } catch (e) {}
            try { evt.target = evt.target || this; } catch (e2) {}
            try { evt.currentTarget = evt.currentTarget || this; } catch (e3) {}

            var prop = this['on' + type];
            if (typeof prop === 'function') {
                try { prop.call(this, evt); } catch (e4) {}
            }

            var list = this._listeners[type] || [];
            list.slice().forEach(function (fn) {
                try { fn.call(this, evt); } catch (e5) {}
            }, this);
        };

        NativeDashXHR.prototype.addEventListener = function (type, fn) {
            if (typeof fn !== 'function') return;
            if (!this._listeners[type]) this._listeners[type] = [];
            this._listeners[type].push(fn);
        };

        NativeDashXHR.prototype.removeEventListener = function (type, fn) {
            var list = this._listeners[type] || [];
            this._listeners[type] = list.filter(function (x) { return x !== fn; });
        };

        NativeDashXHR.prototype.dispatchEvent = function (evt) {
            this._emit(evt && evt.type || '', evt || {});
            return true;
        };

        NativeDashXHR.prototype._syncDelegate = function () {
            var d = this._delegate;
            if (!d) return;
            try { this.readyState = d.readyState; } catch (e) {}
            try { this.status = d.status; } catch (e2) {}
            try { this.statusText = d.statusText; } catch (e3) {}
            try { this.response = d.response; } catch (e4) {}
            try { this.responseText = d.responseText; } catch (e5) {}
            try { this.responseURL = d.responseURL || this._url; } catch (e6) {}
            try { this.responseXML = d.responseXML; } catch (e7) {}
        };

        NativeDashXHR.prototype._wireDelegate = function () {
            var self = this;
            var d = this._delegate;
            if (!d || d.__mnogotvWired) return;
            d.__mnogotvWired = true;

            [
                'loadstart',
                'progress',
                'readystatechange',
                'load',
                'error',
                'abort',
                'timeout',
                'loadend'
            ].forEach(function (type) {
                try {
                    d.addEventListener(type, function (evt) {
                        self._syncDelegate();
                        self._emit(type, evt || {});
                    });
                } catch (e) {}
            });
        };

        NativeDashXHR.prototype.open = function (method, url, async, user, password) {
            this._requestSerial++;
            this._aborted = false;
            this._method = String(method || 'GET').toUpperCase();
            this._url = stripHash(String(url || ''));
            this.responseURL = this._url;
            this._async = async !== false;

            this._useNative =
                COLLAPS_NATIVE_DASH.active &&
                isCollapsCdnUrl(this._url);

            if (this._useNative) {
                this.readyState = 1;
                this._emit('readystatechange', {});
                return;
            }

            this._delegate = new OriginalXHR();
            this._wireDelegate();

            try { this._delegate.timeout = this._timeout || 0; } catch (e0) {}
            try { this._delegate.withCredentials = this._withCredentials; } catch (e1) {}
            try {
                this._delegate.open(
                    this._method,
                    this._url,
                    this._async,
                    user,
                    password
                );
            } catch (e2) {
                throw e2;
            }
        };

        NativeDashXHR.prototype.setRequestHeader = function (name, value) {
            if (this._useNative) {
                this._headers[String(name)] = String(value);
                return;
            }
            if (this._delegate) this._delegate.setRequestHeader(name, value);
        };

        NativeDashXHR.prototype.getResponseHeader = function (name) {
            if (!this._useNative && this._delegate) {
                try { return this._delegate.getResponseHeader(name); } catch (e) {}
                return null;
            }

            var key = String(name || '').toLowerCase();
            if (key === 'content-type') {
                return guessNativeContentType(this._url, this._responseType);
            }
            if (key === 'accept-ranges') return 'bytes';
            return null;
        };

        NativeDashXHR.prototype.getAllResponseHeaders = function () {
            if (!this._useNative && this._delegate) {
                try { return this._delegate.getAllResponseHeaders(); } catch (e) {}
                return '';
            }
            return (
                'Content-Type: ' +
                guessNativeContentType(this._url, this._responseType) +
                '\\r\\nAccept-Ranges: bytes\\r\\n'
            );
        };

        NativeDashXHR.prototype.overrideMimeType = function (mime) {
            if (!this._useNative && this._delegate && this._delegate.overrideMimeType) {
                try { this._delegate.overrideMimeType(mime); } catch (e) {}
            }
        };

        NativeDashXHR.prototype.send = function (body) {
            if (!this._useNative) {
                if (!this._delegate) throw new Error('XMLHttpRequest.open() not called');
                try { this._delegate.responseType = this._responseType || ''; } catch (e0) {}
                try { this._delegate.timeout = this._timeout || 0; } catch (e1) {}
                try { this._delegate.withCredentials = this._withCredentials; } catch (e2) {}
                this._delegate.send(body);
                return;
            }

            var self = this;
            var network = null;

            try { network = new Lampa.Reguest(); } catch (e3) {
                try { network = new Lampa.Request(); } catch (e4) {}
            }

            if (!network || typeof network.native !== 'function') {
                this.status = 0;
                this.readyState = 4;
                this._emit('readystatechange', {});
                this._emit('error', {});
                this._emit('loadend', {});
                return;
            }

            this._nativeRequest = network;
            var serial = ++this._requestSerial;
            var generation = COLLAPS_NATIVE_DASH.generation;
            function stale() {
                return self._aborted || self._requestSerial !== serial ||
                    generation !== COLLAPS_NATIVE_DASH.generation || !COLLAPS_NATIVE_DASH.active;
            }
            COLLAPS_NATIVE_DASH.requestCount++;
            COLLAPS_NATIVE_DASH.lastUrl = this._url;

            var headers = {};
            Object.keys(this._headers || {}).forEach(function (k) {
                headers[k] = self._headers[k];
            });

            /*
             * Это ровно тот сетевой контекст, который виден в успешном HAR.
             * XHR в WebView сам такой Origin выставить не может, native bridge
             * может передать его как обычный HTTP header.
             */
            headers['User-Agent'] = COLLAPS_UA;
            headers['Origin'] = COLLAPS_HOST;
            headers['Referer'] = COLLAPS_REF;
            headers['Accept'] = '*/*';

            var binary =
                String(this._responseType || '').toLowerCase() === 'arraybuffer';

            try {
                if (network.clear) network.clear();
                if (network.timeout) {
                    network.timeout(
                        Math.max(
                            10000,
                            Number(this._timeout || 0) || 30000
                        )
                    );
                }
            } catch (e5) {}

            this._emit('loadstart', {});

            try {
                network.native(
                    this._url,
                    function (payload) {
                        if (stale()) return;
                        var data;
                        try {
                            data = binary
                                ? base64ToArrayBuffer(payload)
                                : String(payload || '');
                        } catch (decodeError) {
                            var payloadInfo = nativeDecodeSummary(payload, headers.Range || headers.range);
                            COLLAPS_NATIVE_DASH.lastDecode = payloadInfo;
                            COLLAPS_NATIVE_DASH.errorCount++;
                            COLLAPS_NATIVE_DASH.lastStatus = 0;
                            self.status = 0;
                            self.statusText = 'native decode error';
                            self.readyState = 4;
                            self._emit('readystatechange', {});
                            self._emit('error', { error: decodeError });
                            self._emit('loadend', {});
                            notify(
                                'Collaps 5.0.6 DASH: decode • ' +
                                payloadInfo.summary
                            );
                            return;
                        }

                        var size = binary
                            ? (data.byteLength || 0)
                            : String(data || '').length;

                        COLLAPS_NATIVE_DASH.successCount++;
                        COLLAPS_NATIVE_DASH.lastStatus = 200;

                        self.status = 200;
                        self.statusText = 'OK';
                        self.responseURL = self._url;

                        self.readyState = 2;
                        self._emit('readystatechange', {});

                        self.readyState = 3;
                        self._emit('readystatechange', {});
                        self._emit('progress', {
                            lengthComputable: size > 0,
                            loaded: size,
                            total: size
                        });

                        self.response = data;
                        if (!binary) self.responseText = String(data || '');

                        self.readyState = 4;
                        self._emit('readystatechange', {});
                        self._emit('load', {});
                        self._emit('loadend', {});
                    },
                    function (a, c) {
                        if (stale()) return;
                        var status =
                            a &&
                            a.status !== undefined
                                ? Number(a.status)
                                : 0;

                        COLLAPS_NATIVE_DASH.errorCount++;
                        COLLAPS_NATIVE_DASH.lastStatus = status || 0;

                        self.status = status || 0;
                        self.statusText = errText(a || c || 'native network error');
                        try {
                            self.responseText =
                                a && a.responseText
                                    ? String(a.responseText)
                                    : '';
                        } catch (e6) {}
                        self.readyState = 4;
                        self._emit('readystatechange', {});
                        self._emit('error', {
                            status: self.status,
                            error: a || c || null
                        });
                        self._emit('loadend', {});

                        notify(
                            'Collaps DASH DEBUG: native HTTP ' +
                            (self.status || 0) +
                            ' • ' +
                            self._url.slice(0, 95)
                        );
                    },
                    false,
                    {
                        dataType: binary ? 'base64' : 'text',
                        headers: headers
                    }
                );
            } catch (e7) {
                COLLAPS_NATIVE_DASH.errorCount++;
                COLLAPS_NATIVE_DASH.lastStatus = 0;
                self.status = 0;
                self.statusText = errText(e7);
                self.readyState = 4;
                self._emit('readystatechange', {});
                self._emit('error', { error: e7 });
                self._emit('loadend', {});
            }
        };

        NativeDashXHR.prototype.abort = function () {
            this._aborted = true;
            this._requestSerial++;
            try {
                if (this._nativeRequest && this._nativeRequest.clear) {
                    this._nativeRequest.clear();
                }
            } catch (e) {}

            if (!this._useNative && this._delegate) {
                try { this._delegate.abort(); } catch (e2) {}
                return;
            }

            this.status = 0;
            this.readyState = 4;
            this._emit('readystatechange', {});
            this._emit('abort', {});
            this._emit('loadend', {});
        };

        Object.defineProperty(
            NativeDashXHR.prototype,
            'responseType',
            {
                get: function () {
                    if (!this._useNative && this._delegate) {
                        try { return this._delegate.responseType; } catch (e) {}
                    }
                    return this._responseType || '';
                },
                set: function (value) {
                    this._responseType = String(value || '');
                    if (!this._useNative && this._delegate) {
                        try { this._delegate.responseType = value; } catch (e) {}
                    }
                }
            }
        );

        Object.defineProperty(
            NativeDashXHR.prototype,
            'timeout',
            {
                get: function () { return this._timeout || 0; },
                set: function (value) {
                    this._timeout = Number(value || 0) || 0;
                    if (!this._useNative && this._delegate) {
                        try { this._delegate.timeout = this._timeout; } catch (e) {}
                    }
                }
            }
        );

        Object.defineProperty(
            NativeDashXHR.prototype,
            'withCredentials',
            {
                get: function () { return !!this._withCredentials; },
                set: function (value) {
                    this._withCredentials = !!value;
                    if (!this._useNative && this._delegate) {
                        try { this._delegate.withCredentials = !!value; } catch (e) {}
                    }
                }
            }
        );

        try {
            window.XMLHttpRequest = NativeDashXHR;
            COLLAPS_NATIVE_DASH.xhrInstalled = true;
            log('Collaps DASH native XMLHttpRequest bridge installed');
            return true;
        } catch (e8) {
            log('Collaps DASH native XMLHttpRequest bridge failed', e8);
            return false;
        }
    }

    function setCollapsDashAudioChoice(voiceChoice) {
        var index =
            voiceChoice &&
            voiceChoice.index !== undefined
                ? parseInt(voiceChoice.index, 10)
                : -1;

        COLLAPS_NATIVE_DASH.audioIndex =
            isNaN(index)
                ? -1
                : index;

        COLLAPS_NATIVE_DASH.audioLabel =
            voiceChoice &&
            voiceChoice.label
                ? String(voiceChoice.label)
                : '';

        /*
         * Force the next dash.js instance to apply the new choice even if
         * the same MediaPlayer wrapper remains installed.
         */
        COLLAPS_NATIVE_DASH.audioAppliedKey = '';
    }

    function collapsDashTrackNumber(track, fallbackIndex) {
        track = track || {};

        var explicit = [
            track.index,
            track.id,
            track.mediaInfo && track.mediaInfo.index,
            track.mediaInfo && track.mediaInfo.id
        ];

        for (var i = 0; i < explicit.length; i++) {
            var n = parseInt(explicit[i], 10);
            if (!isNaN(n)) return n;
        }

        /*
         * Collaps MPD uses language tags rus0, rus1, ..., ukr7, eng8.
         * The trailing number is the physical audio AdaptationSet number.
         */
        var lang = String(
            track.lang ||
            track.language ||
            track.mediaInfo && track.mediaInfo.lang ||
            ''
        );

        var m = lang.match(/(\d+)$/);
        if (m) return parseInt(m[1], 10);

        return fallbackIndex;
    }

    function applyCollapsDashAudioChoice(player, reason) {
        if (
            !COLLAPS_NATIVE_DASH.active ||
            !player ||
            COLLAPS_NATIVE_DASH.audioIndex < 0
        ) {
            return false;
        }

        if (
            typeof player.getTracksFor !== 'function' ||
            typeof player.setCurrentTrack !== 'function'
        ) {
            return false;
        }

        var tracks = [];
        try {
            tracks = player.getTracksFor('audio') || [];
        } catch (e) {
            return false;
        }

        if (!tracks.length) return false;

        var wanted = COLLAPS_NATIVE_DASH.audioIndex;
        var chosen = null;
        var chosenArrayIndex = -1;

        for (var i = 0; i < tracks.length; i++) {
            if (Number(collapsDashTrackNumber(tracks[i], i)) === Number(wanted)) {
                chosen = tracks[i];
                chosenArrayIndex = i;
                break;
            }
        }

        /*
         * Last-resort fallback for MPDs without ids/lang suffixes.
         */
        if (!chosen && tracks[wanted]) {
            chosen = tracks[wanted];
            chosenArrayIndex = wanted;
        }

        if (!chosen) {
            log(
                'Collaps DASH audio track not found',
                wanted,
                tracks
            );
            return false;
        }

        var key =
            String(wanted) +
            '|' +
            String(
                chosen.id !== undefined
                    ? chosen.id
                    : chosenArrayIndex
            ) +
            '|' +
            String(chosen.lang || '');

        if (COLLAPS_NATIVE_DASH.audioAppliedKey === key) {
            return true;
        }

        try {
            player.setCurrentTrack(chosen);
            COLLAPS_NATIVE_DASH.audioAppliedKey = key;

            log(
                'Collaps DASH audio selected',
                {
                    wantedIndex: wanted,
                    label: COLLAPS_NATIVE_DASH.audioLabel,
                    chosenArrayIndex: chosenArrayIndex,
                    chosenId: chosen.id,
                    chosenLang: chosen.lang,
                    reason: reason || ''
                }
            );

            try {
                notify(
                    'Collaps: озвучка ' +
                    (
                        COLLAPS_NATIVE_DASH.audioLabel ||
                        ('дорожка ' + (wanted + 1))
                    )
                );
            } catch (eNoty) {}

            return true;
        } catch (e2) {
            log('Collaps DASH setCurrentTrack failed', e2);
            return false;
        }
    }

    function installCollapsDashQuality(player, events) {
        if (!player || !player.getBitrateInfoListFor || !player.setQualityFor ||
            !player.updateSettings || !player.getSettings) return null;
        var alive = true, automatic = true, requested = null, rendered = null;
        var subscriptions = [];
        var generation = COLLAPS_NATIVE_DASH.generation;
        var nativeLevels = player.getBitrateInfoListFor;
        // Lampa adds non-configurable enabled setters to this result.
        player.getBitrateInfoListFor = function (type) {
            return (nativeLevels.call(player, type) || []).map(function (level) {
                var copy = {};
                Object.keys(level).forEach(function (key) {
                    if (key !== 'enabled') copy[key] = level[key];
                });
                return copy;
            });
        };
        function active() {
            return alive && COLLAPS_NATIVE_DASH.active &&
                generation === COLLAPS_NATIVE_DASH.generation;
        }
        function levels() {
            try { return player.getBitrateInfoListFor('video') || []; }
            catch (e) { return []; }
        }
        function setAuto(value) {
            var settings = player.getSettings();
            var abr = settings && settings.streaming && settings.streaming.abr;
            // Lampa writes a boolean where dash.js expects a per-media object.
            if (abr && (!abr.autoSwitchBitrate || typeof abr.autoSwitchBitrate !== 'object')) {
                abr.autoSwitchBitrate = { video: value, audio: true };
            }
            player.updateSettings({ streaming: { abr: {
                autoSwitchBitrate: { video: value, audio: true }
            } } });
        }
        function labelFor(index, list) {
            var match = null;
            list.some(function (level, i) {
                if (Number(level.qualityIndex === undefined ? i : level.qualityIndex) === Number(index)) {
                    match = level; return true;
                }
                return false;
            });
            return match && Number(match.height) > 0 ? Number(match.height) + 'p' : '';
        }
        function publish() {
            if (!active() || !Lampa.PlayerPanel || !Lampa.PlayerPanel.quality ||
                !Lampa.PlayerPanel.setLevels) return;
            var list = levels();
            if (!list.length) return;
            var actual = rendered === null ? '' : labelFor(rendered, list);
            var target = requested === null ? '' : labelFor(requested, list);
            var label = automatic ? 'AUTO' + (actual ? ' · ' + actual : '') :
                (actual && rendered !== requested ? actual + ' → ' + target : target);
            var menu = [];
            function entry(title, index) {
                var row = { title: title, quality: title, selected: index === null ? automatic : !automatic && requested === index };
                Object.defineProperty(row, 'enabled', {
                    configurable: true,
                    get: function () { return row.selected; },
                    set: function (value) {
                        if (!value || !active()) return;
                        automatic = index === null;
                        requested = index;
                        setAuto(automatic);
                        if (!automatic) player.setQualityFor('video', index, false);
                        publish();
                    }
                });
                menu.push(row);
            }
            entry('AUTO', null);
            list.forEach(function (level, i) {
                var index = Number(level.qualityIndex === undefined ? i : level.qualityIndex);
                if (Number(level.height) > 0) entry(Number(level.height) + 'p', index);
            });
            // Use Lampa's panel API; array entries switch quality without reloading the URL.
            Lampa.PlayerPanel.quality({}, '__collaps_levels__');
            Lampa.PlayerPanel.setLevels(menu, label || 'AUTO');
        }
        function on(name, callback) {
            if (name && player.on) {
                player.on(name, callback);
                subscriptions.push({ name: name, callback: callback });
            }
        }
        on(events.STREAM_INITIALIZED, function () {
            if (!active()) return;
            setAuto(automatic);
            publish();
        });
        on(events.QUALITY_CHANGE_RENDERED, function (event) {
            if (!active() || !event || event.mediaType !== 'video') return;
            if (event.newQuality !== undefined) rendered = Number(event.newQuality);
            publish();
        });
        on(events.PLAYBACK_PLAYING || events.PLAYBACK_STARTED, publish);
        return {
            start: function () {
                if (!active()) return;
                automatic = true; requested = null; rendered = null;
                setAuto(true);
            },
            dispose: function () {
                alive = false;
                subscriptions.forEach(function (sub) {
                    try { if (player.off) player.off(sub.name, sub.callback); } catch (e) {}
                });
                subscriptions = [];
            },
            diagnostics: function () {
                return { automatic: automatic, requested: requested, rendered: rendered };
            }
        };
    }

    function configureCollapsNativeDash(unixTime) {
        COLLAPS_NATIVE_DASH.unixTime = parseInt(unixTime || 0, 10) || 0;
        COLLAPS_NATIVE_DASH.active = true;

        if (!installCollapsDashNativeXHR()) {
            log('Collaps DASH native XMLHttpRequest bridge unavailable');
            return false;
        }

        if (COLLAPS_NATIVE_DASH.installed) return true;
        if (
            typeof dashjs === 'undefined' ||
            !dashjs ||
            typeof dashjs.MediaPlayer !== 'function'
        ) {
            return false;
        }

        var OriginalMediaPlayer = dashjs.MediaPlayer;
        COLLAPS_NATIVE_DASH.originalMediaPlayer = OriginalMediaPlayer;

        function WrappedMediaPlayer() {
            var factory = OriginalMediaPlayer.apply(this, arguments);
            if (!factory || typeof factory.create !== 'function') return factory;

            var originalCreate = factory.create;
            factory.create = function () {
                var player = originalCreate.apply(factory, arguments);

                if (
                    COLLAPS_NATIVE_DASH.active &&
                    player &&
                    typeof player.extend === 'function'
                ) {
                    var unix = COLLAPS_NATIVE_DASH.unixTime;
                    if (COLLAPS_NATIVE_DASH.qualityControl) COLLAPS_NATIVE_DASH.qualityControl.dispose();
                    var qualityControl = installCollapsDashQuality(player, factory.events || dashjs.MediaPlayer.events || {});
                    COLLAPS_NATIVE_DASH.qualityControl = qualityControl;
                    if (typeof player.destroy === 'function') {
                        var originalDestroy = player.destroy;
                        player.destroy = function () {
                            if (qualityControl) qualityControl.dispose();
                            return originalDestroy.apply(player, arguments);
                        };
                    }

                    try {
                        player.extend(
                            'RequestModifier',
                            function () {
                                return {
                                    modifyRequestHeader: function (xhr) {
                                        return xhr;
                                    },
                                    modifyRequestURL: function (url) {
                                        var value = String(url || '');
                                        try {
                                            if (
                                                isCollapsCdnUrl(value) &&
                                                value.indexOf('/x-en-x/') === -1
                                            ) {
                                                var mapped = collapsClientCdnUrl(
                                                    value,
                                                    unix,
                                                    '',
                                                    false
                                                );
                                                mapped = stripHash(mapped);
                                                log('Collaps DASH map', value, '=>', mapped);
                                                return mapped;
                                            }
                                        } catch (e) {
                                            log('Collaps DASH map error', e);
                                        }
                                        return value;
                                    }
                                };
                            },
                            true
                        );
                    } catch (e2) {
                        log('Collaps DASH RequestModifier install error', e2);
                    }

                    /*
                     * Generic Lampa.PlayerVideo.setParams({track}) is not a
                     * reliable selector for dash.js. Select the Collaps audio
                     * AdaptationSet inside dash.js itself.
                     */
                    try {
                        var audioEvents =
                            factory.events ||
                            (
                                dashjs &&
                                dashjs.MediaPlayer &&
                                dashjs.MediaPlayer.events
                            ) ||
                            {};

                        if (typeof player.on === 'function') {
                            if (audioEvents.STREAM_INITIALIZED) {
                                player.on(
                                    audioEvents.STREAM_INITIALIZED,
                                    function () {
                                        applyCollapsDashAudioChoice(
                                            player,
                                            'STREAM_INITIALIZED'
                                        );
                                    }
                                );
                            }

                            if (audioEvents.PLAYBACK_METADATA_LOADED) {
                                player.on(
                                    audioEvents.PLAYBACK_METADATA_LOADED,
                                    function () {
                                        applyCollapsDashAudioChoice(
                                            player,
                                            'PLAYBACK_METADATA_LOADED'
                                        );
                                    }
                                );
                            }

                            if (audioEvents.PLAYBACK_STARTED) {
                                player.on(
                                    audioEvents.PLAYBACK_STARTED,
                                    function () {
                                        applyCollapsDashAudioChoice(
                                            player,
                                            'PLAYBACK_STARTED'
                                        );
                                    }
                                );
                            }
                        }

                        /*
                         * Some dash.js builds expose the tracks a little later
                         * than STREAM_INITIALIZED. Retry briefly after
                         * initialize(), without delaying playback.
                         */
                        if (typeof player.initialize === 'function') {
                            var originalInitialize = player.initialize;

                            player.initialize = function () {
                                if (qualityControl) qualityControl.start();
                                var result =
                                    originalInitialize.apply(
                                        player,
                                        arguments
                                    );

                                [250, 700, 1500, 3000].forEach(function (ms) {
                                    setTimeout(function () {
                                        applyCollapsDashAudioChoice(
                                            player,
                                            'retry-' + ms
                                        );
                                    }, ms);
                                });

                                return result;
                            };
                        }
                    } catch (eAudio) {
                        log(
                            'Collaps DASH audio selector install error',
                            eAudio
                        );
                    }

                    try {
                        var events = factory.events || {};
                        if (typeof player.on === 'function' && events.ERROR) {
                            player.on(events.ERROR, function (evt) {
                                try {
                                    var er = evt && evt.error || evt || {};
                                    var req = er && er.data && er.data.request || {};
                                    var code = er.code !== undefined ? er.code : '';
                                    var message = er.message || er.name || 'dash error';
                                    var reqUrl = req.url || '';
                                    notify(
                                        'Collaps DASH DEBUG: ' +
                                        (code !== '' ? ('code ' + code + ' • ') : '') +
                                        message +
                                        (reqUrl ? (' • ' + reqUrl.slice(0, 110)) : '')
                                    );
                                } catch (eDbg) {}
                            });
                        }
                    } catch (e3) {}
                }

                return player;
            };

            return factory;
        }

        try {
            Object.keys(OriginalMediaPlayer).forEach(function (key) {
                try { WrappedMediaPlayer[key] = OriginalMediaPlayer[key]; } catch (e) {}
            });
            try { WrappedMediaPlayer.prototype = OriginalMediaPlayer.prototype; } catch (e2) {}
            dashjs.MediaPlayer = WrappedMediaPlayer;
            COLLAPS_NATIVE_DASH.installed = true;
            log('Collaps DASH RequestModifier installed');
            return true;
        } catch (e3) {
            log('Collaps DASH wrapper install failed', e3);
            return false;
        }
    }

    function resolveCollaps(
        source,
        imdb,
        season,
        episode,
        ok,
        fail
    ) {
        getKpId(
            imdb,
            function (kp) {
                tryCollapsUrls(
                    source,
                    imdb,
                    kp,
                    season,
                    episode,
                    function (response) {
                        var cfg =
                            response.config;

                        var item =
                            pickCollapsItem(
                                cfg,
                                season,
                                episode
                            );

                        if (!item) {
                            fail(
                                new Error(
                                    season !== null
                                        ? (
                                            'Collaps: серия S' +
                                            season +
                                            'E' +
                                            episode +
                                            ' не найдена'
                                        )
                                        : 'Collaps: поток не найден'
                                )
                            );
                            return;
                        }

                        var dashaStream =
                            normalizeDirectUrl(
                                item.dasha ||
                                (
                                    item.source &&
                                    item.source.dasha
                                ) ||
                                ''
                            );

                        var dashStream =
                            normalizeDirectUrl(
                                item.dash ||
                                (
                                    item.source &&
                                    item.source.dash
                                ) ||
                                ''
                            );

                        var hlsStream =
                            normalizeDirectUrl(
                                item.hls ||
                                (
                                    item.source &&
                                    item.source.hls
                                ) ||
                                ''
                            );

                        if (
                            season === null &&
                            cfg.source
                        ) {
                            if (!dashaStream) {
                                dashaStream = normalizeDirectUrl(
                                    cfg.source.dasha || ''
                                );
                            }
                            if (!dashStream) {
                                dashStream = normalizeDirectUrl(
                                    cfg.source.dash || ''
                                );
                            }
                            if (!hlsStream) {
                                hlsStream = normalizeDirectUrl(
                                    cfg.source.hls || ''
                                );
                            }
                            item = cfg.source;
                        }

                        if (!dashaStream && !dashStream && !hlsStream) {
                            fail(new Error('Collaps: DASHA/DASH/HLS не найден'));
                            return;
                        }

                        var cdnMeta = cfg.__mnogotvCdn || {};
                        var cdnUnix = parseInt(cdnMeta.unixTime || 0, 10) || 0;
                        var cdnKey = String(cdnMeta.key || '');
                        var av1 = collapsAv1Supported();
                        var selectedDash = '';
                        var selectedDashLabel = '';

                        /*
                         * HAR mnogotv.com5-2: S1E1 uses DASHA/AV1 with
                         * 486/720/1080 renditions. Prefer the provider DASH
                         * path; HLS may expose a different rendition ladder.
                         * AUTO remains under the stock player's ABR control.
                         */
                        if (dashaStream && av1) {
                            selectedDash = dashaStream;
                            selectedDashLabel = 'DASHA/AV1';
                        }
                        else if (dashStream) {
                            selectedDash = dashStream;
                            selectedDashLabel = 'DASH';
                        }

                        if (selectedDash) {
                            var clientDashUrl = collapsClientCdnUrl(
                                selectedDash,
                                cdnUnix,
                                cdnKey,
                                true
                            );

                            if (!clientDashUrl) {
                                fail(new Error('Collaps: DASH client URL не построен'));
                                return;
                            }

                            if (!configureCollapsNativeDash(cdnUnix)) {
                                fail(new Error('Collaps: DASH native transport недоступен'));
                                return;
                            }

                            ok({
                                provider: 'Collaps',
                                directUrl: stripHash(clientDashUrl) + '#manifest.mpd',
                                directHeaders: {},
                                relayUrl: '',
                                relayReady: false,
                                externalDirect: false,
                                subtitles: normalizeSubs(item.cc || item.subtitles || []),
                                tracks: normalizeTracks(item.audio || {}),
                                quality: selectedDashLabel,
                                resolvedBy:
                                    response.label +
                                    (kp ? (' • KP ' + kp) : '') +
                                    ' • ' + selectedDashLabel + '/NATIVE-XHR'
                            });
                            return;
                        }

                        /* Real master playlist: AUTO plus all provider qualities. */
                        if (hlsStream) {
                            var hlsHeaders = collapsPlaybackHeaders('hls');
                            var clientHlsUrl = collapsClientCdnUrl(
                                hlsStream,
                                cdnUnix,
                                cdnKey,
                                true
                            );

                            if (!clientHlsUrl) {
                                fail(new Error('Collaps: HLS client URL не построен'));
                                return;
                            }

                            if (!configureCollapsNativeHls(
                                hlsStream,
                                clientHlsUrl,
                                cdnUnix,
                                cdnKey,
                                hlsHeaders
                            )) {
                                fail(new Error('Collaps: HLS native transport недоступен'));
                                return;
                            }

                            ok({
                                provider: 'Collaps',
                                directUrl: stripHash(clientHlsUrl) + '#master.m3u8',
                                directHeaders: hlsHeaders,
                                relayUrl: '',
                                relayReady: false,
                                externalDirect: false,
                                subtitles: normalizeSubs(item.cc || item.subtitles || []),
                                tracks: normalizeTracks(item.audio || {}),
                                quality: 'HLS',
                                resolvedBy:
                                    response.label +
                                    (kp ? (' • KP ' + kp) : '') +
                                    ' • HLS/CLIENT'
                            });
                            return;
                        }

                        fail(new Error('Collaps: совместимый media path не найден'));
                    },
                    fail
                );
            }
        );
    }


        /* COLLAPS_REFERENCE_BLOCK_END */

        function itemHasMedia(item) {
            if (!item) return false;
            var source = item.source || item;
            return !!(source.hls || source.dash || source.dasha);
        }

        function configHasAnyMedia(config) {
            if (!config) return false;
            if (itemHasMedia(config.source)) return true;
            var seasons = config.playlist && config.playlist.seasons || [];
            for (var i = 0; i < seasons.length; i++) {
                var episodes = seasons[i] && seasons[i].episodes || [];
                for (var j = 0; j < episodes.length; j++) if (itemHasMedia(episodes[j])) return true;
            }
            return false;
        }

        function resetSession(reason) {
            try {
                COLLAPS_NATIVE_HLS.unixTime = 0;
                COLLAPS_NATIVE_HLS.key = '';
                COLLAPS_NATIVE_HLS.headers = {};
                COLLAPS_NATIVE_HLS.urlMap = {};
                COLLAPS_NATIVE_HLS.lastRequest = null;
                COLLAPS_NATIVE_HLS.lastError = null;
            } catch (e) {}
            try {
                COLLAPS_NATIVE_DASH.active = false;
                COLLAPS_NATIVE_DASH.generation++;
                if (COLLAPS_NATIVE_DASH.qualityControl) COLLAPS_NATIVE_DASH.qualityControl.dispose();
                COLLAPS_NATIVE_DASH.qualityControl = null;
                COLLAPS_NATIVE_DASH.unixTime = 0;
                setCollapsDashAudioChoice(null);
            } catch (e2) {}
            log('Collaps cleanup', reason || 'reset');
        }

        this.availability = function (request, ok, fail) {
            getKpId(request.imdb, function (kp) {
                tryCollapsUrls(request.source, request.imdb, kp, null, null, function (response) {
                    ok(configHasAnyMedia(response.config));
                }, fail);
            });
        };

        this.resolve = function (request, ok, fail) {
            resetSession('new-playback-session');
            try { setCollapsDashAudioChoice(request.voice || null); } catch (e) {}
            resolveCollaps(request.source, request.imdb, request.season, request.episode, function (result) {
                ok({
                    provider: 'Collaps',
                    url: result.directUrl,
                    headers: result.directHeaders || {},
                    subtitles: result.subtitles || [],
                    tracks: result.tracks || [],
                    qualityMode: 'native-auto',
                    qualities: String(result.quality || '').indexOf('DASH') >= 0 ? 'dash-manifest' : 'hls-master',
                    transport: String(result.quality || '').indexOf('DASH') >= 0 ? 'DASH' : 'HLS',
                    resolvedBy: result.resolvedBy || ''
                });
            }, fail);
        };

        this.quality = function () { return { auto: true, manual: 'Lampa.Player/Hls.js', forcedStartLevel: false }; };
        this.audio = function (resolved) { return resolved && resolved.tracks || []; };
        this.subtitles = function (resolved) { return resolved && resolved.subtitles || []; };
        this.cleanup = resetSession;
        this.diagnostics = function () {
            return {
                adapter: 'CollapsAdapter',
                quality: COLLAPS_NATIVE_DASH.qualityControl ? COLLAPS_NATIVE_DASH.qualityControl.diagnostics() : null,
                hls: {
                    installed: !!COLLAPS_NATIVE_HLS.installed,
                    lastDecode: COLLAPS_NATIVE_HLS.lastError && COLLAPS_NATIVE_HLS.lastError.payload || null,
                    mappedUrls: Object.keys(COLLAPS_NATIVE_HLS.urlMap || {}).length,
                    lastRequest: COLLAPS_NATIVE_HLS.lastRequest ? String(COLLAPS_NATIVE_HLS.lastRequest.url || '') : '',
                    lastError: COLLAPS_NATIVE_HLS.lastError ? String(COLLAPS_NATIVE_HLS.lastError.phase || COLLAPS_NATIVE_HLS.lastError.message || '') : ''
                },
                dash: {
                    installed: !!COLLAPS_NATIVE_DASH.installed,
                    active: !!COLLAPS_NATIVE_DASH.active,
                    lastDecode: COLLAPS_NATIVE_DASH.lastDecode,
                    requests: Number(COLLAPS_NATIVE_DASH.requestCount || 0),
                    successes: Number(COLLAPS_NATIVE_DASH.successCount || 0),
                    errors: Number(COLLAPS_NATIVE_DASH.errorCount || 0)
                }
            };
        };
    }
    /* ADAPTER:COLLAPS:END */

    global.MnogoTVCollapsAdapter = CollapsAdapter;
})(window);

(function (global) {
    'use strict';

    var VERSION = '5.0.6-collaps';
    var PLUGIN_ID = 'mnogotv_v5_collaps';
    var COMPONENT = 'mnogotv_v5_collaps_component';
    var DEFAULT_RESOLVER = 'https://mnogotv-relay-v4-test.odi-84v.workers.dev';

    if (global[PLUGIN_ID]) return;
    global[PLUGIN_ID] = true;

    function log() {
        try { console.log.apply(console, ['[MnogoTV ' + VERSION + ']'].concat([].slice.call(arguments))); } catch (e) {}
    }

    function notify(text) {
        try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(text); } catch (e) {}
    }

    function errText(err) {
        if (!err) return 'неизвестная ошибка';
        if (typeof err === 'string') return err;
        if (err.message) return err.message;
        try { return JSON.stringify(err); } catch (e) {}
        return 'ошибка';
    }

    function config() {
        var resolver = DEFAULT_RESOLVER;
        try {
            var src = document.currentScript && document.currentScript.src || '';
            var custom = src ? new URL(src, global.location.href).searchParams.get('resolver') : '';
            if (custom) resolver = String(custom).trim();
        } catch (e) {}
        try {
            var saved = Lampa.Storage && Lampa.Storage.get('mnogotv_resolver');
            if (saved) resolver = String(saved).trim();
        } catch (e2) {}
        return { resolver: String(resolver || '').replace(/\/+$/, '') };
    }

    var CONFIG = config();

    function resolverUrl(path, params) {
        var query = [];
        Object.keys(params || {}).forEach(function (key) {
            var value = params[key];
            if (value !== undefined && value !== null && value !== '') {
                query.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
            }
        });
        return CONFIG.resolver + path + (query.length ? '?' + query.join('&') : '');
    }

    function requestJson(url, ok, fail) {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = setTimeout(function () { try { if (controller) controller.abort(); } catch (e) {} }, 15000);

        function fallback(initialError) {
            var request = null;
            try { request = new Lampa.Reguest(); } catch (e) { try { request = new Lampa.Request(); } catch (e2) {} }
            if (!request) return fail(initialError || new Error('network unavailable'));
            function done(data) {
                try { if (typeof data === 'string') data = JSON.parse(data); } catch (e3) { return fail(e3); }
                if (data && data.ok === false) return fail(new Error(data.error || 'ошибка'));
                ok(data || {});
            }
            function bad(a, c) { fail(initialError || a || c || new Error('network error')); }
            try {
                request.timeout(15000);
                if (typeof request.native === 'function') return request.native(url, done, bad, false, { dataType: 'json' });
                if (typeof request.silent === 'function') return request.silent(url, done, bad, false, { dataType: 'json' });
            } catch (e4) { return fail(e4); }
            fail(initialError || new Error('request failed'));
        }

        if (typeof fetch !== 'function') return fallback(new Error('fetch unavailable'));
        fetch(url, { method: 'GET', cache: 'no-store', credentials: 'omit', signal: controller ? controller.signal : undefined })
            .then(function (response) {
                clearTimeout(timer);
                return response.text().then(function (text) {
                    var data;
                    try { data = text ? JSON.parse(text) : {}; } catch (e) { throw new Error(response.ok ? 'invalid json' : 'HTTP ' + response.status); }
                    if (!response.ok || data.ok === false) throw new Error(data.error || data.message || ('HTTP ' + response.status));
                    return data;
                });
            }).then(ok).catch(function (e) { clearTimeout(timer); fallback(e); });
    }

    function HlsRouter() {
        var stock = null;
        var handlers = {};
        var installed = false;

        function install() {
            if (installed) return true;
            if (typeof Hls === 'undefined' || !Hls.DefaultConfig || !Hls.DefaultConfig.loader) return false;
            stock = Hls.DefaultConfig.loader;

            function RouterLoader(loaderConfig) {
                this.config = loaderConfig;
                this.delegate = null;
                // Hls.js can retain this object before load(); never replace it.
                this.stats = {
                    aborted: false, loaded: 0, retry: 0, total: 0,
                    chunkCount: 0, bwEstimate: 0,
                    loading: { start: 0, first: 0, end: 0 },
                    parsing: { start: 0, end: 0 },
                    buffering: { start: 0, first: 0, end: 0 }
                };
            }
            RouterLoader.prototype._delegate = function (context) {
                if (this.delegate) return this.delegate;
                var Ctor = stock;
                Object.keys(handlers).some(function (name) {
                    var handler = handlers[name];
                    if (handler && handler.owns(context && context.url || '')) {
                        Ctor = handler.loader;
                        return true;
                    }
                    return false;
                });
                this.delegate = new Ctor(this.config);
                var stats = this.stats;
                Object.keys(this.delegate.stats || {}).forEach(function (key) {
                    stats[key] = this.delegate.stats[key];
                }, this);
                this.delegate.stats = stats;
                return this.delegate;
            };
            RouterLoader.prototype.load = function (context, loaderConfig, callbacks) {
                var delegate = this._delegate(context);
                delegate.load(context, loaderConfig, callbacks);
                // The delegate updates the same stats object held by Hls.js.
            };
            RouterLoader.prototype.abort = function () { try { if (this.delegate && this.delegate.abort) this.delegate.abort(); } catch (e) {} };
            RouterLoader.prototype.destroy = function () { try { if (this.delegate && this.delegate.destroy) this.delegate.destroy(); } catch (e) {} this.delegate = null; };
            RouterLoader.prototype.getCacheAge = function () { try { return this.delegate && this.delegate.getCacheAge ? this.delegate.getCacheAge() : null; } catch (e) { return null; } };
            RouterLoader.prototype.getResponseHeader = function (name) { try { return this.delegate && this.delegate.getResponseHeader ? this.delegate.getResponseHeader(name) : null; } catch (e) { return null; } };
            Hls.DefaultConfig.loader = RouterLoader;
            installed = true;
            return true;
        }

        this.stockLoader = function () { install(); return stock; };
        this.register = function (name, handler) { if (!install()) return false; handlers[name] = handler; return true; };
        this.unregister = function (name) { delete handlers[name]; };
        this.diagnostics = function () { return { installed: installed, providers: Object.keys(handlers) }; };
    }

    function tmdbId(movie) {
        var source = movie && movie.source || 'tmdb';
        var id = source === 'tmdb' || source === 'cub' ? movie && movie.id : movie && (movie.tmdb_id || movie.id);
        id = String(id === undefined || id === null ? '' : id).trim();
        return /^\d+$/.test(id) ? id : '';
    }

    function isSeries(movie) {
        return !!(movie && (movie.media_type === 'tv' || movie.number_of_seasons || movie.first_air_date || movie.name || movie.original_name));
    }

    function titleOf(movie) { return movie && (movie.title || movie.name || movie.original_title || movie.original_name) || 'MnogoTV'; }

    function getImdb(movie, ok, fail) {
        var direct = movie && (movie.imdb_id || movie.external_ids && movie.external_ids.imdb_id);
        if (direct && /^tt\d+$/i.test(String(direct))) return ok(String(direct));
        var id = tmdbId(movie);
        if (!id) return fail(new Error('TMDB ID не найден'));
        try {
            Lampa.Api.sources.tmdb.get((isSeries(movie) ? 'tv/' : 'movie/') + id + '/external_ids', {}, function (data) {
                if (data && /^tt\d+$/i.test(String(data.imdb_id || ''))) ok(String(data.imdb_id));
                else fail(new Error('IMDb ID не найден'));
            }, fail);
        } catch (e) { fail(e); }
    }

    function getSeasons(movie, ok, fail) {
        var result = [];
        (movie && movie.seasons || []).forEach(function (s) { var n = parseInt(s && s.season_number, 10); if (n > 0) result.push(n); });
        if (result.length) return ok(result);
        var count = parseInt(movie && movie.number_of_seasons, 10);
        if (count > 0) { for (var i = 1; i <= count; i++) result.push(i); return ok(result); }
        try {
            Lampa.Api.sources.tmdb.get('tv/' + tmdbId(movie), {}, function (data) {
                (data && data.seasons || []).forEach(function (s) { var n = parseInt(s.season_number, 10); if (n > 0) result.push(n); });
                result.length ? ok(result) : fail(new Error('Сезоны не найдены'));
            }, fail);
        } catch (e) { fail(e); }
    }

    function getEpisodes(movie, season, ok, fail) {
        try {
            Lampa.Api.sources.tmdb.get('tv/' + tmdbId(movie) + '/season/' + season, {}, function (data) {
                var episodes = data && data.episodes || [];
                episodes.length ? ok(episodes) : fail(new Error('Серии не найдены'));
            }, fail);
        } catch (e) { fail(e); }
    }

    function timeline(movie, season, episode) {
        try {
            var base = movie.original_title || movie.original_name || titleOf(movie);
            return Lampa.Timeline.view(Lampa.Utils.hash(season && episode ? [season, episode, base].join('') : base));
        } catch (e) { return undefined; }
    }

    function freshTracks(list) {
        return (Array.isArray(list) ? list : []).map(function (track) {
            return { language: String(track.language || ''), label: String(track.label || track.language || ''), index: Number(track.index) };
        });
    }

    function freshSubtitles(list) {
        return (Array.isArray(list) ? list : []).map(function (sub) { return { label: String(sub.label || 'Субтитры'), url: String(sub.url || '') }; });
    }

    var core = {
        version: VERSION,
        resolverUrl: resolverUrl,
        requestJson: requestJson,
        errText: errText,
        log: log,
        notify: notify,
        hlsRouter: new HlsRouter()
    };

    var adapter = null;
    var currentPlayback = null;

    function findCollapsSource(imdb, ok, fail) {
        requestJson(resolverUrl('/sources', { imdb: imdb }), function (response) {
            var found = null;
            (response && response.sources || []).some(function (source) {
                if (String(source && source.type || '').toLowerCase() === 'collaps') { found = source; return true; }
                return false;
            });
            if (!found) return fail(new Error('Collaps отсутствует'));
            found.kinopoiskId = response && response.kp || '';
            ok(found);
        }, fail);
    }

    function activatePlayback() {
        if (currentPlayback && currentPlayback !== adapter) currentPlayback.cleanup('provider-switch');
        currentPlayback = adapter;
    }

    function play(movie, source, imdb, season, episode, epMeta, voice, status) {
        activatePlayback();
        adapter.resolve({ source: source, imdb: imdb, season: season, episode: episode, voice: voice }, function (resolved) {
            var title = titleOf(movie);
            if (season !== null && episode !== null) title += ' • S' + season + 'E' + episode + (epMeta && epMeta.name ? ' • ' + epMeta.name : '');
            var item = {
                url: resolved.url,
                title: title,
                subtitles: freshSubtitles(resolved.subtitles),
                translate: { tracks: freshTracks(resolved.tracks) },
                timeline: timeline(movie, season, episode),
                headers: resolved.headers || {},
                isonline: true
            };
            try { Lampa.Player.runas('lampa'); } catch (e) {}
            try {
                if (Lampa.PlayerVideo) {
                    if (Lampa.PlayerVideo.clearParamas) Lampa.PlayerVideo.clearParamas();
                    if (voice && voice.index >= 0 && Lampa.PlayerVideo.setParams) Lampa.PlayerVideo.setParams({ track: voice.index });
                    else if (Lampa.PlayerVideo.clearParamas) Lampa.PlayerVideo.clearParamas();
                }
            } catch (e2) {}
            status.text('Collaps • ' + resolved.transport + ' • AUTO');
            Lampa.Player.play(item);
            Lampa.Player.playlist([item]);
        }, function (e) { status.text('Ошибка: ' + errText(e)); notify('MnogoTV: ' + errText(e)); });
    }

    function addCss() {
        if (document.getElementById('mnogotv-v5-style')) return;
        var css = '.mnogotv-v5{padding:2em}.mnogotv-v5__bar{display:flex;gap:1em;flex-wrap:wrap;margin-bottom:1.2em}.mnogotv-v5__pill,.mnogotv-v5__item{padding:.8em 1.1em;border-radius:.35em;background:rgba(255,255,255,.12)}.mnogotv-v5__pill.focus,.mnogotv-v5__item.focus{background:#fff;color:#111}.mnogotv-v5__status{margin:.8em 0;opacity:.8}.mnogotv-v5__list{display:flex;flex-direction:column;gap:.6em}.mnogotv-v5__item{display:flex;justify-content:space-between}.mnogotv-v5__meta{opacity:.65;margin-left:1em}';
        $('body').append('<style id="mnogotv-v5-style">' + css + '</style>');
    }

    function Component(object) {
        var movie = object.movie || {};
        var source = object.source;
        var imdb = object.imdb;
        var season = 1;
        var episodes = [];
        var focus = null;
        var voice = { index: -1, label: 'Авто' };
        var initialized = false;
        var root = $('<div class="mnogotv-v5"></div>');
        var bar = $('<div class="mnogotv-v5__bar"></div>');
        var seasonButton = $('<div class="mnogotv-v5__pill selector">Сезон 1</div>');
        var voiceButton = $('<div class="mnogotv-v5__pill selector">Озвучка: Авто</div>');
        var qualityButton = $('<div class="mnogotv-v5__pill selector">Качество: AUTO</div>');
        var status = $('<div class="mnogotv-v5__status">Collaps готов</div>');
        var list = $('<div class="mnogotv-v5__list"></div>');
        var last = seasonButton[0];

        function resolveCurrent(ok, fail) {
            var ep = focus || episodes[0] || {};
            adapter.resolve({ source: source, imdb: imdb, season: isSeries(movie) ? season : null, episode: isSeries(movie) ? parseInt(ep.episode_number || 0, 10) : null }, ok, fail);
        }

        function chooseVoice() {
            status.text('Получаю реальные дорожки Collaps…');
            resolveCurrent(function (resolved) {
                status.text('Collaps готов');
                var items = [{ title: 'Авто', index: -1, label: 'Авто', selected: voice.index < 0 }];
                (resolved.tracks || []).forEach(function (track, index) {
                    var label = track.label || track.language || ('Дорожка ' + (index + 1));
                    items.push({ title: label, label: label, index: Number(track.index), selected: voice.index === Number(track.index) });
                });
                items.push({ title: '← Назад', back: true });
                Lampa.Select.show({ title: 'Collaps — озвучка', items: items, onBack: function () { Lampa.Controller.toggle('content'); }, onSelect: function (item) {
                    if (!item.back) { voice = { index: item.index, label: item.label }; voiceButton.text('Озвучка: ' + voice.label); }
                    Lampa.Controller.toggle('content');
                }});
            }, function (e) { status.text('Озвучка: ' + errText(e)); });
        }

        function chooseQuality() {
            notify('Collaps: AUTO и ручной выбор доступны в штатном меню качества Lampa.Player');
            Lampa.Controller.toggle('content');
        }

        function renderList() {
            list.empty();
            focus = null;
            if (!isSeries(movie)) {
                var film = $('<div class="mnogotv-v5__item selector"><span>▶ Смотреть фильм</span><span class="mnogotv-v5__meta">Collaps</span></div>');
                film.on('hover:focus', function (e) { last = e.target; });
                film.on('hover:enter click', function () { play(movie, source, imdb, null, null, {}, voice, status); });
                list.append(film); last = film[0]; return;
            }
            status.text('Загрузка серий…');
            getEpisodes(movie, season, function (items) {
                episodes = items; status.text('Collaps готов');
                episodes.forEach(function (ep) {
                    var n = parseInt(ep.episode_number || 0, 10);
                    var row = $('<div class="mnogotv-v5__item selector"><span></span><span class="mnogotv-v5__meta"></span></div>');
                    row.find('span').first().text(('0' + n).slice(-2) + ' • ' + (ep.name || ('Серия ' + n)));
                    row.find('.mnogotv-v5__meta').text(ep.air_date || '');
                    row.on('hover:focus', function (e) { focus = ep; last = e.target; });
                    row.on('hover:enter click', function () { play(movie, source, imdb, season, n, ep, voice, status); });
                    list.append(row);
                });
            }, function (e) { status.text('Ошибка серий: ' + errText(e)); });
        }

        function chooseSeason() {
            getSeasons(movie, function (seasons) {
                var items = seasons.map(function (n) { return { title: 'Сезон ' + n, season: n, selected: n === season }; });
                items.push({ title: '← Назад', back: true });
                Lampa.Select.show({ title: 'Collaps — сезон', items: items, onBack: function () { Lampa.Controller.toggle('content'); }, onSelect: function (item) {
                    if (!item.back) { season = item.season; seasonButton.text('Сезон ' + season); voice = { index: -1, label: 'Авто' }; voiceButton.text('Озвучка: Авто'); renderList(); }
                    Lampa.Controller.toggle('content');
                }});
            }, function (e) { status.text(errText(e)); });
        }

        seasonButton.on('hover:focus', function (e) { last = e.target; }).on('hover:enter click', chooseSeason);
        voiceButton.on('hover:focus', function (e) { last = e.target; }).on('hover:enter click', chooseVoice);
        qualityButton.on('hover:focus', function (e) { last = e.target; }).on('hover:enter click', chooseQuality);

        this.create = function () { return this.render(); };
        this.render = function () { return root; };
        this.start = function () {
            if (!initialized) {
                initialized = true; addCss();
                bar.append($('<div class="mnogotv-v5__pill">Источник: Collaps</div>'));
                if (isSeries(movie)) bar.append(seasonButton); else seasonButton.hide();
                bar.append(voiceButton).append(qualityButton);
                root.append($('<h2></h2>').text(titleOf(movie))).append(bar).append(status).append(list);
                renderList();
            }
            Lampa.Controller.add('content', { toggle: function () { Lampa.Controller.collectionSet(root); Lampa.Controller.collectionFocus(last, root); }, up: function () { Navigator.canmove('up') ? Navigator.move('up') : Lampa.Controller.toggle('head'); }, down: function () { if (Navigator.canmove('down')) Navigator.move('down'); }, left: function () { Navigator.canmove('left') ? Navigator.move('left') : Lampa.Controller.toggle('menu'); }, right: function () { if (Navigator.canmove('right')) Navigator.move('right'); }, back: function () { Lampa.Activity.backward(); } });
            Lampa.Controller.toggle('content');
        };
        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () { adapter.cleanup('component-destroy'); root.remove(); };
    }

    function register() { try { Lampa.Component.add(COMPONENT, Component); return true; } catch (e) { log(e); return false; } }

    function addButton(e) {
        if (!e || e.type !== 'complite') return;
        var page = e.object && e.object.activity && e.object.activity.render ? e.object.activity.render() : null;
        if (!page || !page.length || page.find('.mnogotv-v5-button').length || page[0].__mnogotvV5Probe) return;
        page[0].__mnogotvV5Probe = true;
        var movie = e.data && e.data.movie || e.movie || e.object.card || {};
        getImdb(movie, function (imdb) {
            findCollapsSource(imdb, function (source) {
                adapter.availability({ source: source, imdb: imdb }, function (available) {
                    if (!available) return;
                    var button = $('<div class="full-start__button selector view--online mnogotv-v5-button" data-subtitle="Collaps"><span>MnogoTV • Collaps</span></div>');
                    button.on('hover:enter click', function () { Lampa.Activity.push({ title: 'MnogoTV • Collaps', component: COMPONENT, movie: movie, imdb: imdb, source: source, page: 1, noinfo: true }); });
                    var box = page.find('.full-start-new__buttons, .full-start__buttons').first();
                    var torrent = page.find('.view--torrent').first();
                    if (torrent.length) torrent.after(button); else if (box.length) box.append(button);
                }, function (error) { log('availability', errText(error)); });
            }, function () {});
        }, function () {});
    }

    function start() {
        if (!global.Lampa || !Lampa.Listener || !Lampa.Player || !global.MnogoTVCollapsAdapter) return setTimeout(start, 500);
        adapter = new global.MnogoTVCollapsAdapter(core);
        register();
        Lampa.Listener.follow('full', addButton);
        global.__mnogotv_v5_diagnostics = function () { return { version: VERSION, core: core.hlsRouter.diagnostics(), collaps: adapter.diagnostics() }; };
        notify('MnogoTV v' + VERSION);
        log('started', { resolver: CONFIG.resolver });
    }

    start();
})(window);
