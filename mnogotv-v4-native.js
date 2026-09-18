/* MnogoTV/Lampa 5.0.27-collaps | CollapsAdapter SHA-256: 2f13866e58ce9d628b4778698cdbf0bd02d1b1aa6bed3a5f7a54b3ef0022cde9 */
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
        generation: 0,
        rangeRecovery: {paths: {}},
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

    function collapsDashRangeKey(url) {
        try {
            var u = new URL(url), path = u.pathname;
            if (path.indexOf('/x-en-x/') !== -1) {
                var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
                var subst = 'DlChEXitLONYRkFjAsnBbymWzSHMqKPgQZpvwerofJTVdIuUcxaG';
                var encoded = path.split('/x-en-x/')[1].replace(/[A-Za-z]/g, function (ch) {
                    return alphabet.charAt(subst.indexOf(ch));
                });
                var logical = atob(encoded);
                path = logical.slice(logical.indexOf('/') + 1).split('?')[0];
            }
            // Learn only numbered media segments; audio/init and other paths stay independent.
            if (!/\/\d+\.(?:webm|m4s|mp4|ts)$/.test(path)) return '';
            return u.origin + path.slice(0, path.lastIndexOf('/') + 1);
        } catch (e) { return ''; }
    }

    // Per-request recovery for the Android bridge's oversized-response marker.
    // No provider state is shared and normal successful requests are unchanged.
    function collapsDashRequest(network, url, complete, fail, post, options, stale, budget, recovery) {
        var ended = false, partBudget = Math.max(10000, Number(budget) || 30000);
        var deadline = Date.now() + partBudget, rangeMode = false;
        var telemetry = null, requestId = null, started = Date.now();
        var detail = { phase: 'direct', issued: 0, received: 0, assembled: 0,
            pending: {}, parts: [], started: started, budgetMs: deadline - started };
        if (recovery && options.dataType === 'base64') {
            telemetry = recovery.telemetry || (recovery.telemetry = {seq: 0, active: {}, completed: []});
            Object.keys(telemetry.active).forEach(function (id) { if (!telemetry.active[id].alive()) delete telemetry.active[id]; });
            requestId = ++telemetry.seq;
            telemetry.active[requestId] = {started: started, detail: detail, alive: function () { return !ended && !stale(); }};
        }
        function keepFailure(reason) {
            if (!recovery) return;
            detail.elapsedMs = Date.now() - started;
            detail.reason = reason;
            recovery.lastFailure = detail;
        }
        function record(value) {
            if (!telemetry) return;
            delete telemetry.active[requestId];
            var bytes = 0;
            var raw = value;
            for (var depth = 0; raw && typeof raw === 'object' && depth < 8; depth++) {
                if (typeof raw.byteLength === 'number') { bytes = raw.byteLength; break; }
                raw = raw.base64 !== undefined ? raw.base64 : raw.data !== undefined ? raw.data : raw.body;
            }
            // Do not decode/copy media again just to measure it.
            if (!bytes && typeof raw === 'string' && /^[A-Za-z0-9+/]/.test(raw)) {
                bytes = Math.floor(raw.length * 3 / 4) - (/==$/.test(raw) ? 2 : /=$/.test(raw) ? 1 : 0);
            }
            if (!bytes) return;
            telemetry.completed.push({bytes: bytes, ms: Date.now() - started, finished: Date.now()});
            if (telemetry.completed.length > 64) telemetry.completed.shift();
        }
        function inactive() { return ended || stale(); }
        function error(message, reason) {
            if (inactive()) return;
            keepFailure(reason || (message.indexOf('истекло') >= 0 ? 'deadline' : 'range-error'));
            ended = true;
            if (telemetry) delete telemetry.active[requestId];
            try { if (network.clear) network.clear(); } catch (e) {}
            fail({status: 0, responseText: message});
        }
        function done(value) {
            if (inactive()) return;
            detail.elapsedMs = Date.now() - started;
            if (recovery && detail.phase !== 'direct') recovery.lastRange = detail;
            ended = true; record(value); complete(value);
        }
        function request(params, ok, bad) {
            if (inactive()) return;
            var remaining = deadline - Date.now();
            if (remaining <= 0) return error('Collaps Range: истекло время загрузки фрагмента');
            // Each part has its own bounded wait; successful parts may continue
            // beyond the original fragment budget, up to the hard deadline.
            var requestBudget = rangeMode ? Math.min(partBudget, remaining) : remaining;
            var requestDeadline = Date.now() + requestBudget;
            if (network.timeout) network.timeout(requestBudget);
            function expired() {
                if (Date.now() >= deadline) {
                    error('Collaps Range: истекло общее время загрузки фрагмента', 'deadline'); return true;
                }
                if (rangeMode && Date.now() >= requestDeadline) {
                    error('Collaps Range: часть не поступила вовремя', 'part-timeout'); return true;
                }
                return false;
            }
            try {
                network.native(url, function (value) {
                    if (!inactive() && !expired()) ok(value);
                }, function (value) {
                    if (!inactive() && !expired()) bad(value);
                }, post, params);
            } catch (e) { error('Collaps Range: ' + errText(e)); }
        }
        var rangeKey = collapsDashRangeKey(url);
        function recover() {
            rangeMode = true;
            deadline = started + Math.max(120000, partBudget);
            detail.budgetMs = deadline - started;
            detail.partBudgetMs = partBudget;
            detail.phase = 'probe';
            detail.directMs = Date.now() - started;
            var headers = {}, start = 0, end = null, rawRange = '';
            Object.keys(options.headers || {}).forEach(function (key) {
                if (key.toLowerCase() === 'range') rawRange = options.headers[key];
                else headers[key] = options.headers[key];
            });
            if (rawRange) {
                var match = /^bytes=(\d+)-(\d*)$/.exec(rawRange);
                if (!match) return error('Collaps Range: неподдерживаемый диапазон');
                start = Number(match[1]); end = match[2] ? Number(match[2]) : null;
                if (end !== null && end < start) return error('Collaps Range: неверные границы');
            }
            // 256 KiB binary -> about 342 KiB Base64, below the failing multi-MB responses.
            var chunkSize = 262144, overlap = 32, maxBytes = 67108864;
            var chunks = [], total = 0, tail = null, firstByte = null;
            var stride = chunkSize - overlap, issued = 0, consumed = 0, inflight = 0, ready = {}, pumping = false;
            function finish() {
                if (inactive()) return;
                if (!total) return error('Collaps Range: пустой фрагмент');
                detail.phase = 'assemble';
                detail.cancelled = Object.keys(detail.pending).length;
                detail.pending = {};
                var out = new Uint8Array(total), offset = 0;
                chunks.forEach(function (chunk) { out.set(chunk, offset); offset += chunk.length; });
                chunks = []; ready = {};
                try { if (network.clear) network.clear(); } catch (e) {}
                done(out.buffer);
            }
            function get(a, b, ok, bad) {
                var h = {};
                Object.keys(headers).forEach(function (key) { h[key] = headers[key]; });
                h.Range = 'bytes=' + a + '-' + b;
                // Identity prevents byte offsets referring to compressed transport data.
                h['Accept-Encoding'] = 'identity';
                request({dataType: 'base64', headers: h}, function (body) {
                    var bytes;
                    try { bytes = new Uint8Array(base64ToArrayBuffer(body)); }
                    catch (e) { return bad({rangeError: 'Collaps Range: часть не получена — ' + errText(e)}); }
                    if (bytes.length > b - a + 1) return bad({rangeError: 'Collaps Range: сервер проигнорировал диапазон'});
                    ok(bytes);
                }, bad);
            }
            function drain() {
                while (!inactive() && ready[consumed]) {
                    var item = ready[consumed]; delete ready[consumed];
                    if (item.error) return error(item.error);
                    var bytes = item.bytes, keep = tail ? tail.length : 0;
                    if (bytes.length < keep) return error('Collaps Range: фрагмент изменился или обрезан');
                    for (var i = 0; i < keep; i++) {
                        if (bytes[i] !== tail[i]) return error('Collaps Range: части не совпадают');
                    }
                    if (!total && bytes[0] !== firstByte) return error('Collaps Range: начальные данные изменились');
                    var piece = bytes.subarray(keep);
                    if (total + piece.length > maxBytes) return error('Collaps Range: превышен предел сборки 64 MiB');
                    chunks.push(piece); total += piece.length; consumed++;
                    detail.assembled = total;
                    if (bytes.length < item.length || end !== null && start + total > end) return finish();
                    if (!piece.length) return error('Collaps Range: нет продвижения');
                    tail = bytes.subarray(bytes.length - Math.min(overlap, bytes.length));
                }
            }
            function launch(index, a, b) {
                inflight++;
                detail.phase = 'parts'; detail.issued++;
                var partStarted = Date.now();
                detail.pending[index] = { from: a, to: b, started: partStarted };
                function receive(item) {
                    if (inactive()) return;
                    delete detail.pending[index];
                    if (!item.error) detail.received++;
                    detail.parts.push({ index: index, from: a, to: b,
                        bytes: item.bytes ? item.bytes.length : 0,
                        ms: Date.now() - partStarted, error: !!item.error });
                    if (detail.parts.length > 8) detail.parts.shift();
                    inflight--; ready[index] = item; drain(); pump();
                }
                get(a, b, function (bytes) { receive({bytes: bytes, length: b - a + 1}); }, function (e) {
                    receive({error: e && e.rangeError || 'Collaps Range: запрос части не выполнен (status=' + (e && e.status || '?') + ')'});
                });
            }
            function pump() {
                if (inactive() || pumping) return;
                pumping = true;
                // At most four unconsumed parts, including out-of-order completed requests.
                while (!inactive() && inflight < 4 && issued - consumed < 4) {
                    var a = start + issued * stride, b = a + chunkSize - 1;
                    if (end !== null) { if (a > end) break; b = Math.min(b, end); }
                    if (a - start >= maxBytes) { error('Collaps Range: превышен предел сборки 64 MiB'); break; }
                    launch(issued++, a, b);
                }
                pumping = false;
            }
            // Verify Range behaviour on this very URL, not just Accept-Ranges advertising.
            get(start, start, function (bytes) {
                if (bytes.length !== 1) return error('Collaps Range: проверка диапазона не пройдена');
                firstByte = bytes[0];
                if (recovery && rangeKey) recovery.paths[rangeKey] = true;
                pump();
            }, function (e) { error(e && e.rangeError || 'Collaps Range: диапазоны недоступны (status=' + (e && e.status || '?') + ')'); });
        }
        if (options.dataType === 'base64' && recovery && rangeKey && recovery.paths[rangeKey]) return recover();
        request(options, function (value) {
            if (options.dataType === 'base64' && value === '[Response too large, skipped]') recover();
            else done(value);
        }, function (e) {
            if (inactive()) return;
            keepFailure('native-error');
            ended = true;
            if (telemetry) delete telemetry.active[requestId];
            fail(e);
        });
    }

    function rangeDiagnosticText(detail, now) {
        if (!detail) return '';
        var pending = Object.keys(detail.pending || {}).map(function (id) {
            var p = detail.pending[id];
            return '#' + (Number(id) + 1) + ' ' + ((now - p.started) / 1000).toFixed(1) + 'с';
        }).join(', ');
        var parts = (detail.parts || []).slice(-3).map(function (p) {
            return '#' + (p.index + 1) + ':' + (p.bytes / 1024).toFixed(0) + 'КБ/' + (p.ms / 1000).toFixed(1) + 'с' + (p.error ? '!' : '');
        }).join(' ');
        return 'Range ' + detail.phase + ': ' + detail.received + '/' + detail.issued +
            ' частей' + (detail.cancelled ? ' | отменено ' + detail.cancelled : '') + ' | собрано ' + (detail.assembled / 1048576).toFixed(2) + ' МБ' +
            ' | ' + ((detail.elapsedMs === undefined ? now - detail.started : detail.elapsedMs) / 1000).toFixed(1) + '/' + (detail.budgetMs / 1000).toFixed(0) + 'с' +
            (detail.partBudgetMs ? ' | часть ≤' + (detail.partBudgetMs / 1000).toFixed(0) + 'с' : '') +
            (detail.directMs !== undefined ? ' | до Range ' + (detail.directMs / 1000).toFixed(1) + 'с' : '') +
            (pending ? '\nОжидают: ' + pending : '') + (parts ? '\nЧасти: ' + parts : '') +
            (detail.reason ? ' | ошибка: ' + detail.reason : '');
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

    function hlsManifestLevels(text) {
        return String(text || '').split(/\r?\n/).filter(function (line) {
            return /^#EXT-X-STREAM-INF:/.test(line);
        }).map(function (line) {
            var size = /RESOLUTION=(\d+)x(\d+)/.exec(line);
            var codec = /CODECS="([^"]+)"/.exec(line);
            return { width: size ? +size[1] : 0, height: size ? +size[2] : 0, codecs: codec ? codec[1] : '' };
        });
    }

    function installCollapsHlsUI(hls) {
        var state = COLLAPS_NATIVE_HLS, generation = state.generation;
        var disposed = false, timer = null, panel = null, previous = null, signature = '';
        var subs = [], initialized = false, deferred = null, requested = null;
        function active() { return !disposed && generation === state.generation; }
        function publish(force) {
            if (!active() || !hls.media || !hls.levels || !hls.levels.length) return;
            var automatic = hls.autoLevelEnabled;
            var current = hls.currentLevel, list = hls.levels;
            var target = requested === null ? hls.loadLevel : requested;
            var label = automatic ? 'AUTO' : list[target] && list[target].height + 'p' || 'Качество';
            var key = label + ':' + list.map(function (l) { return l.height; }).join(',');
            if (!force && key === signature) return;
            signature = key;
            if (!Lampa.PlayerPanel || !Lampa.PlayerPanel.setLevels) return;
            var menu = [];
            function row(title, index) {
                var item = {title: title, quality: title, selected: index === -1 ? automatic : !automatic && target === index};
                Object.defineProperty(item, 'enabled', { configurable: true, get: function () { return item.selected; }, set: function (value) {
                    if (!value || !active()) return;
                    requested = index === -1 ? null : index;
                    // AUTO releases the lock. Locking the currently playing rendition
                    // must also preserve buffered media: nextLevel triggers a switch
                    // even when the chosen rendition is already playing.
                    if (index === -1 || index === hls.currentLevel) hls.loadLevel = index;
                    else hls.nextLevel = index;
                    publish(true);
                }});
                menu.push(item);
            }
            row('AUTO', -1);
            list.forEach(function (l, i) { row(l.height ? l.height + 'p' : 'Уровень ' + (i + 1), i); });
            if (Lampa.PlayerPanel.quality) Lampa.PlayerPanel.quality({}, '__collaps_hls_levels__');
            Lampa.PlayerPanel.setLevels(menu, label);
        }
        function sizes(list) { return list && list.length ? list.map(function (l) { return l.width && l.height ? l.width + '×' + l.height : 'н/д'; }).join(', ') : 'н/д'; }
        function mbps(value) { return typeof value === 'number' && isFinite(value) && value > 0 ? (value / 1000000).toFixed(2) + ' Мбит/с' : 'н/д'; }
        function autoLevel(index) { var l = hls.levels && hls.levels[index]; return l ? l.height + 'p (#' + index + ')' : 'н/д'; }
        function sample() {
            if (!active()) return dispose();
            var v = hls.media;
            if (!v) return;
            publish(false);
            var buffer = 0, frames = 'н/д', now = Date.now();
            try { for (var i=0; i<v.buffered.length; i++) if (v.currentTime >= v.buffered.start(i) && v.currentTime <= v.buffered.end(i)) buffer = v.buffered.end(i)-v.currentTime; } catch (e) {}
            try {
                var q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : {totalVideoFrames:v.webkitDecodedFrameCount,droppedVideoFrames:v.webkitDroppedFrameCount};
                if (typeof q.totalVideoFrames === 'number' && typeof q.droppedVideoFrames === 'number') {
                    if (previous && q.totalVideoFrames >= previous.total && q.droppedVideoFrames >= previous.drop) frames = '+' + (q.droppedVideoFrames-previous.drop) + '/' + (q.totalVideoFrames-previous.total) + ' за ' + ((now-previous.time)/1000).toFixed(1) + 'с';
                    previous = {total:q.totalVideoFrames,drop:q.droppedVideoFrames,time:now};
                }
            } catch (e2) {}
            var abr = { bandwidth: hls.bandwidthEstimate, next: hls.nextAutoLevel,
                min: hls.minAutoLevel, max: hls.maxAutoLevel, cap: hls.autoLevelCapping };
            var last = state.lastSegment;
            var abrText = 'AUTO оценка: ' + mbps(abr.bandwidth) + ' | следующий: ' + autoLevel(abr.next) +
                '\nAUTO границы: ' + autoLevel(abr.min) + ' — ' + autoLevel(abr.max) + ' | cap: ' + (abr.cap === -1 ? 'нет' : abr.cap === undefined ? 'н/д' : abr.cap) +
                '\nБитрейты: ' + (hls.levels || []).map(function (l) { return l.height + 'p: ' + mbps(l.bitrate); }).join('; ') +
                '\nСегмент: ' + (last ? (last.bytes/1048576).toFixed(2) + ' МиБ / ' + (last.ms/1000).toFixed(2) + 'с = ' + mbps(last.bps) : 'н/д') + ' | TTFB неизвестен';
            var text = 'Collaps HLS | ' + (hls.autoLevelEnabled ? 'AUTO' : 'ручной') + ' | факт ' + (v.videoWidth || '?') + '×' + (v.videoHeight || '?') + '\n' +
                'Буфер общий: ' + buffer.toFixed(1) + 'с | пропуски/кадры: ' + frames + '\n' +
                'Исходный: ' + sizes(state.originalLevels) + '\nПосле обработки: ' + sizes(state.rewrittenLevels) + '\nПлеер: ' + sizes(hls.levels) + '\n' + abrText;
            state.playbackTelemetry = {text:text,abr:abr,lastSegment:last,original:state.originalLevels,rewritten:state.rewrittenLevels,levels:hls.levels.map(function(l){return {width:l.width,height:l.height,videoCodec:l.videoCodec};})};
            if (!panel && document.body) {
                panel = document.createElement('div');
                panel.style.cssText = 'position:fixed;left:3%;top:3%;z-index:99999;padding:10px;background:rgba(0,0,0,.8);color:white;font-size:18px;white-space:pre-line;pointer-events:none';
                document.body.appendChild(panel);
            }
            if (panel) panel.textContent = text;
        }
        function dispose() {
            if (disposed) return;
            disposed = true; clearInterval(timer); clearTimeout(deferred);
            subs.forEach(function (s) { hls.off(s[0],s[1]); });
            if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
        }
        function on(name, fn) { if (name) { hls.on(name,fn); subs.push([name,fn]); } }
        on(Hls.Events.MANIFEST_PARSED, function () {
            clearTimeout(deferred);
            deferred = setTimeout(function () {
                if (!active() || !hls.media) return;
                if (!initialized) { hls.loadLevel = -1; initialized = true; }
                publish(true);
            },0);
        });
        on(Hls.Events.FRAG_CHANGED, function () {
            clearTimeout(deferred);
            deferred = setTimeout(function () { publish(true); },0);
        });
        on(Hls.Events.DESTROYING, dispose);
        timer = setInterval(sample,1000);
        return {dispose:dispose};
    }

    function hookCollapsHlsUI() {
        if (COLLAPS_NATIVE_HLS.uiInstalled || !global.Hls || !Hls.prototype.loadSource) return;
        var original = Hls.prototype.loadSource;
        Hls.prototype.loadSource = function (url) {
            if (COLLAPS_NATIVE_HLS.urlMap[stripHash(url)]) {
                if (COLLAPS_NATIVE_HLS.ui) COLLAPS_NATIVE_HLS.ui.dispose();
                COLLAPS_NATIVE_HLS.ui = installCollapsHlsUI(this);
            }
            return original.apply(this,arguments);
        };
        COLLAPS_NATIVE_HLS.uiInstalled = true;
    }

    function configureCollapsNativeHls(rawUrl, clientUrl, unixTime, key, headers) {
        COLLAPS_NATIVE_HLS.unixTime = parseInt(unixTime || 0, 10) || 0;
        COLLAPS_NATIVE_HLS.key = String(key || '');
        COLLAPS_NATIVE_HLS.headers = headers || {};
        COLLAPS_NATIVE_HLS.urlMap = {};
        COLLAPS_NATIVE_HLS.urlMap[stripHash(clientUrl)] = normalizeDirectUrl(rawUrl);

        hookCollapsHlsUI();
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
            this.serial = 0;
            this.completed = false;
            this.config = config;
            this.context = null;
            this.stats = hlsNativeStats();
            this.network = null;
            this.fallback = null;
        }

        CollapsNativeLoader.prototype.destroy = function () {
            if (this.fallback) {
                this.serial++;
                if (this.fallback.destroy) this.fallback.destroy();
                this.fallback = null;
            }
            else this.abort();
            this.context = null;
            this.config = null;
        };

        CollapsNativeLoader.prototype.abort = function () {
            this.serial++;
            // Hls.js destroys the loader inside onSuccess before ABR samples stats.
            // Cleanup of a completed request must not retroactively cancel it.
            if (!this.completed) this.stats.aborted = true;
            try { if (this.network && this.network.clear) this.network.clear(); } catch (e) {}
            try { if (this.fallback && this.fallback.abort) this.fallback.abort(); } catch (e2) {}
        };

        CollapsNativeLoader.prototype.getCacheAge = function () { return null; };
        CollapsNativeLoader.prototype.getResponseHeader = function () { return null; };

        CollapsNativeLoader.prototype.load = function (context, config, callbacks) {
            var serial = ++this.serial;
            this.completed = false;
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
            var generation = COLLAPS_NATIVE_HLS.generation;
            function stale() {
                return self.stats.aborted || self.serial !== serial ||
                    generation !== COLLAPS_NATIVE_HLS.generation;
            }
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
                collapsDashRequest(
                    network, requestUrl,
                    function (response) {
                        if (stale()) return;
                        var now = (window.performance && performance.now) ? performance.now() : Date.now();
                        // Native bridge returns the complete response, not first-byte timing.
                        // Use the full wall time as a conservative throughput sample.
                        self.stats.loading.first = self.stats.loading.start;
                        self.stats.loading.end = now;
                        try {
                            var data;
                            if (isBinary) {
                                data = base64ToArrayBuffer(response);
                                self.stats.loaded = self.stats.total = data.byteLength || 0;
                                var elapsed = Math.max(1, now - self.stats.loading.start);
                                COLLAPS_NATIVE_HLS.lastSegment = {bytes:data.byteLength,ms:elapsed,bps:data.byteLength*8000/elapsed,ttfbKnown:false};
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
                                    var originalLevels = hlsManifestLevels(data);
                                    data = rewriteCollapsNativePlaylist(data, logicalUrl);
                                    if (originalLevels.length) {
                                        COLLAPS_NATIVE_HLS.originalLevels = originalLevels;
                                        COLLAPS_NATIVE_HLS.rewrittenLevels = hlsManifestLevels(data);
                                    }
                                }
                                self.stats.loaded = self.stats.total = data.length || 0;
                            }
                            self.stats.chunkCount = 1;
                            self.completed = true;
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
                        if (stale()) return;
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
                    }, stale, timeout, COLLAPS_NATIVE_HLS.rangeRecovery
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
        rangeRecovery: {paths: {}},
        monitor: null,
        playbackTelemetry: null,
        manifestInfo: [],
        selectedPath: 'основной',
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

            var gate = COLLAPS_NATIVE_DASH.bufferProbe;
            if (gate && gate.holding) {
                var xhr = this, serial = this._requestSerial, gen = COLLAPS_NATIVE_DASH.generation;
                gate.queue.push(function () {
                    if (!xhr._aborted && serial === xhr._requestSerial && gen === COLLAPS_NATIVE_DASH.generation && COLLAPS_NATIVE_DASH.active) xhr.send(body);
                });
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
                collapsDashRequest(
                    network, this._url,
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
                                'Collaps DASH: decode • ' +
                                payloadInfo.summary
                            );
                            return;
                        }

                        if (!binary && /<MPD\b/.test(data)) COLLAPS_NATIVE_DASH.manifestInfo = collapsManifestInfo(data);

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
                            'Collaps DASH: ' +
                            (a && /^Collaps Range:/.test(a.responseText || '')
                                ? a.responseText : 'native HTTP ' + (self.status || 0))
                        );
                    },
                    false,
                    {
                        dataType: binary ? 'base64' : 'text',
                        headers: headers
                    }, stale, Math.max(10000, Number(this._timeout || 0) || 30000), COLLAPS_NATIVE_DASH.rangeRecovery
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

    function collapsManifestInfo(text) {
        var result = [];
        try {
            var doc = new DOMParser().parseFromString(text, 'application/xml');
            if (doc.getElementsByTagName('parsererror').length) return result;
            var sets = doc.getElementsByTagName('AdaptationSet');
            for (var i = 0; i < sets.length; i++) {
                var set = sets[i], reps = set.getElementsByTagName('Representation');
                for (var j = 0; j < reps.length; j++) {
                    var rep = reps[j];
                    function attr(name) { return rep.getAttribute(name) || set.getAttribute(name) || ''; }
                    var mime = attr('mimeType'), type = attr('contentType');
                    if (type !== 'video' && mime.indexOf('video/') !== 0) continue;
                    result.push({id: rep.getAttribute('id') || '', height: Number(attr('height')) || 0,
                        width: Number(attr('width')) || 0, codec: attr('codecs'), mime: mime});
                }
            }
        } catch (e) {}
        return result;
    }

    function collapsCodecLabel(codec) {
        var family = /^avc[13]/i.test(codec) ? 'H.264' : /^av01/i.test(codec) ? 'AV1' :
            /^(?:vp09|vp9)/i.test(codec) ? 'VP9' : /^(?:hvc1|hev1)/i.test(codec) ? 'HEVC' : '';
        return codec ? (family ? family + ' (' + codec + ')' : codec) : 'н/д';
    }

    function installCollapsMonitor(player) {
        var video = null, panel = null, timer = null, disposed = false, previous = null;
        var phase = 'запуск', subscriptions = [], generation = COLLAPS_NATIVE_DASH.generation;
        var history = [], expectedTick = 0, lagMs = 0;
        var summary = { samples: 0, totalFrames: 0, droppedFrames: 0, maxLagMs: 0, minBuffer: null, waits: 0 };
        var probe = {holding:false, queue:[], status:'ожидание запаса 30с', done:false};
        COLLAPS_NATIVE_DASH.bufferProbe = probe;
        var probeTimer = null;
        function finishProbe(reason, flush) {
            if (!probe.holding) return;
            probe.holding = false; probe.done = true; probe.status = reason;
            probe.elapsed = Date.now() - probe.started;
            try {
                var q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : {totalVideoFrames:video.webkitDecodedFrameCount,droppedVideoFrames:video.webkitDroppedFrameCount};
                probe.frames = Math.max(0, q.totalVideoFrames - probe.total);
                probe.drops = Math.max(0, q.droppedVideoFrames - probe.dropped);
            } catch (e) {}
            if (probeTimer !== null) clearTimeout(probeTimer);
            probeTimer = null;
            var queued = probe.queue; probe.queue = [];
            if (flush) queued.forEach(function (resume) { resume(); });
        }
        function active() { return !disposed && COLLAPS_NATIVE_DASH.active && generation === COLLAPS_NATIVE_DASH.generation; }
        function sample() {
            if (!active()) return dispose();
            if (!video) return;
            var now = Date.now(), recovery = COLLAPS_NATIVE_DASH.rangeRecovery;
            var network = recovery && recovery.telemetry, count = 0, oldest = 0, largest = null, rangeDetail = null;
            if (network) {
                Object.keys(network.active).forEach(function (id) {
                    var item = network.active[id];
                    if (!item.alive()) { delete network.active[id]; return; }
                    count++; oldest = Math.max(oldest, (now - item.started) / 1000);
                    if (item.detail && (!rangeDetail || item.started < rangeDetail.started)) rangeDetail = item.detail;
                });
                network.completed.forEach(function (item) {
                    if (now - item.finished < 15000 && (!largest || item.bytes > largest.bytes)) largest = item;
                });
            }
            function buffer(type) {
                try {
                    var value = player.getBufferLength && player.getBufferLength(type);
                    return typeof value === 'number' && isFinite(value) ? value.toFixed(1) + 'с' : 'н/д';
                } catch (e) { return 'н/д'; }
            }
            var av = 0;
            try {
                for (var i = 0; i < video.buffered.length; i++) {
                    if (video.currentTime >= video.buffered.start(i) && video.currentTime <= video.buffered.end(i)) {
                        av = video.buffered.end(i) - video.currentTime; break;
                    }
                }
            } catch (e) {}
            var frames = 'н/д', total = null, dropped = null;
            try {
                if (video.getVideoPlaybackQuality) {
                    var quality = video.getVideoPlaybackQuality(); total = quality.totalVideoFrames; dropped = quality.droppedVideoFrames;
                } else { total = video.webkitDecodedFrameCount; dropped = video.webkitDroppedFrameCount; }
                if (typeof total === 'number' && typeof dropped === 'number') {
                    if (previous && !previous.paused && !video.paused && total >= previous.total && dropped >= previous.dropped) {
                        summary.totalFrames += total - previous.total;
                        summary.droppedFrames += dropped - previous.dropped;
                    }
                    frames = previous && total >= previous.total && dropped >= previous.dropped
                        ? '+' + (dropped - previous.dropped) + '/' + (total - previous.total) + ' за ' + ((now - previous.time) / 1000).toFixed(1) + 'с' : 'сбор данных';
                    previous = {total: total, dropped: dropped, time: now, paused: video.paused};
                }
            } catch (e2) {}
            if (probe.holding) {
                probe.maxLag = Math.max(probe.maxLag, lagMs);
                if (av < 15 || video.paused || video.seeking || video.videoHeight !== probe.height)
                    finishProbe('досрочно: буфер/пауза/переключение', true);
            } else if (!probe.done && !video.paused && !video.seeking && phase === 'воспроизведение' &&
                av >= 30 && count === 0 && summary.samples >= 10 && typeof total === 'number' && typeof dropped === 'number') {
                probe.holding = true; probe.status = 'без новых DASH-запросов';
                probe.started = now; probe.total = total; probe.dropped = dropped;
                probe.height = video.videoHeight; probe.maxLag = 0;
                probe.baseline = {frames:summary.totalFrames, drops:summary.droppedFrames};
                probeTimer = setTimeout(function () { finishProbe('завершён', active()); }, 10000);
            }
            if (!video.paused) {
                summary.samples++;
                summary.minBuffer = summary.minBuffer === null ? av : Math.min(summary.minBuffer, av);
                history.push({time: now, position: video.currentTime, height: video.videoHeight,
                    buffer: av, total: total, dropped: dropped, lagMs: lagMs, phase: phase});
                if (history.length > 120) history.shift();
            }
            COLLAPS_NATIVE_DASH.playbackTelemetry = {time: now, summary: summary, history: history, panelMode: 'pause-only', bufferProbe: probe};
            // No text formatting or DOM text updates while video is running.
            if (!video.paused && phase !== 'конец') {
                if (panel && panel.style.display !== 'none') panel.style.display = 'none';
                return;
            }
            var manifest = COLLAPS_NATIVE_DASH.manifestInfo || [], codecs = [], heights = [];
            manifest.forEach(function (rep) {
                if (rep.height && heights.indexOf(rep.height) < 0) heights.push(rep.height);
                if (rep.height === Number(video.videoHeight) && codecs.indexOf(rep.codec) < 0) codecs.push(rep.codec);
            });
            var codec = codecs.length ? codecs.map(collapsCodecLabel).join(' / ') : 'н/д';
            var text = 'Collaps DASH | ' + (video.videoHeight || '?') + 'p | ' + (video.paused ? 'пауза' : phase) + '\n' +
                'Поток: ' + COLLAPS_NATIVE_DASH.selectedPath + ' | кодек: ' + codec + '\n' +
                'Разрешения MPD: ' + (heights.sort(function (a, b) { return a - b; }).join(', ') || 'н/д') + '\n' +
                'Буфер видео ' + buffer('video') + ' | звук ' + buffer('audio') + ' | общий ' + av.toFixed(1) + 'с\n' +
                'Пропуски кадров: ' + frames + ' | запросов ' + count + ' | ожидание ' + oldest.toFixed(1) + 'с\n' +
                'Крупный фрагм. за 15с: ' + (largest ? (largest.bytes / 1048576).toFixed(2) + ' МБ / ' + (largest.ms / 1000).toFixed(2) + 'с' : 'нет данных');
            var rangeText = rangeDiagnosticText(rangeDetail || recovery && recovery.lastRange, now);
            if (rangeText) text += '\n' + rangeText;
            if (recovery && recovery.lastFailure) text += '\nПоследний сбой: ' + rangeDiagnosticText(recovery.lastFailure, recovery.lastFailure.started + recovery.lastFailure.elapsedMs);
            text += '\nСводка просмотра: пропуски ' + summary.droppedFrames + '/' + summary.totalFrames +
                ' | waiting ' + summary.waits + ' | мин. буфер ' + (summary.minBuffer === null ? '?' : summary.minBuffer.toFixed(1)) + 'с' +
                '\nЗадержка таймера JS: максимум ' + summary.maxLagMs.toFixed(0) + ' мс';
            text += '\nТест буфера: ' + probe.status;
            if (probe.done) text += ' | ' + (probe.elapsed / 1000).toFixed(1) + 'с | пропуски ' + probe.drops + '/' + probe.frames +
                ' | JS ≤' + probe.maxLag.toFixed(0) + ' мс' + '\nДо теста: ' + probe.baseline.drops + '/' + probe.baseline.frames;
            COLLAPS_NATIVE_DASH.playbackTelemetry.text = text;
            if (panel) { panel.style.display = 'block'; panel.textContent = text; }
        }
        function dispose() {
            finishProbe('отмена сессии', false);
            if (COLLAPS_NATIVE_DASH.bufferProbe === probe) COLLAPS_NATIVE_DASH.bufferProbe = null;
            disposed = true;
            if (timer !== null) clearInterval(timer);
            timer = null;
            subscriptions.forEach(function (sub) { if (video && video.removeEventListener) video.removeEventListener(sub.name, sub.fn); });
            subscriptions = [];
            if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
            panel = null; video = null;
        }
        return {start: function (element) {
            if (!active() || timer !== null) return;
            video = element && element.addEventListener ? element : null;
            if (!video) { try { video = player.getVideoElement && player.getVideoElement(); } catch (e) {} }
            if (!video || !video.addEventListener) return;
            ['waiting', 'playing', 'seeking', 'seeked', 'pause', 'ended'].forEach(function (name) {
                var fn = function () {
                    if (name === 'waiting') summary.waits++;
                    if (name === 'seeking' || name === 'pause' || name === 'ended') finishProbe('досрочно: ' + name, true);
                    phase = {waiting:'загрузка',playing:'воспроизведение',seeking:'перемотка',seeked:'после перемотки',pause:'пауза',ended:'конец'}[name];
                    sample();
                };
                video.addEventListener(name, fn); subscriptions.push({name:name, fn:fn});
            });
            if (typeof document !== 'undefined' && document.createElement && document.body) {
                panel = document.createElement('div');
                panel.style.cssText = 'position:fixed;left:3%;top:3%;z-index:2147483646;background:rgba(0,0,0,.8);color:#fff;padding:10px 14px;font:18px/1.4 sans-serif;white-space:pre-line;pointer-events:none;';
                document.body.appendChild(panel);
            }
            expectedTick = Date.now() + 1000;
            timer = setInterval(function () {
                var now = Date.now(); lagMs = Math.max(0, now - expectedTick); expectedTick = now + 1000;
                if (video && !video.paused) summary.maxLagMs = Math.max(summary.maxLagMs, lagMs);
                sample();
            }, 1000); sample();
        }, dispose: dispose};
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
                    if (COLLAPS_NATIVE_DASH.monitor) COLLAPS_NATIVE_DASH.monitor.dispose();
                    var monitor = installCollapsMonitor(player);
                    COLLAPS_NATIVE_DASH.monitor = monitor;
                    var qualityControl = installCollapsDashQuality(player, factory.events || dashjs.MediaPlayer.events || {});
                    COLLAPS_NATIVE_DASH.qualityControl = qualityControl;
                    if (typeof player.destroy === 'function') {
                        var originalDestroy = player.destroy;
                        player.destroy = function () {
                            if (qualityControl) qualityControl.dispose();
                            monitor.dispose();
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

                                monitor.start(arguments[0]);
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
        fail,
        dashMode,
        format
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
                        if (format === 'hls') {
                            if (!hlsStream) {
                                fail(new Error('Collaps: HLS для этого видео отсутствует'));
                                return;
                            }
                        }
                        else if (dashMode === 'alternative') {
                            if (!dashStream || !dashaStream || !av1 || dashStream === dashaStream) {
                                fail(new Error('Collaps: отдельный альтернативный DASH для этого видео отсутствует'));
                                return;
                            }
                            selectedDash = dashStream;
                            selectedDashLabel = 'DASH / альтернативный';
                        }
                        else if (dashaStream && av1) {
                            selectedDash = dashaStream;
                            selectedDashLabel = 'DASHA/AV1';
                        }
                        else if (dashStream) {
                            selectedDash = dashStream;
                            selectedDashLabel = 'DASH';
                        }

                        if (format === 'dash' && !selectedDash) {
                            fail(new Error('Collaps: совместимый DASH отсутствует; выберите HLS, если он доступен'));
                            return;
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

                            COLLAPS_NATIVE_DASH.selectedPath = selectedDashLabel;
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
                if (COLLAPS_NATIVE_HLS.ui) COLLAPS_NATIVE_HLS.ui.dispose();
                COLLAPS_NATIVE_HLS.ui = null;
                COLLAPS_NATIVE_HLS.originalLevels = [];
                COLLAPS_NATIVE_HLS.rewrittenLevels = [];
                COLLAPS_NATIVE_HLS.playbackTelemetry = null;
                COLLAPS_NATIVE_HLS.lastSegment = null;
                COLLAPS_NATIVE_HLS.generation++;
                COLLAPS_NATIVE_HLS.rangeRecovery = {paths: {}};
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
                COLLAPS_NATIVE_DASH.rangeRecovery = {paths: {}};
                if (COLLAPS_NATIVE_DASH.monitor) COLLAPS_NATIVE_DASH.monitor.dispose();
                COLLAPS_NATIVE_DASH.monitor = null;
                COLLAPS_NATIVE_DASH.playbackTelemetry = null;
                COLLAPS_NATIVE_DASH.manifestInfo = [];
                COLLAPS_NATIVE_DASH.selectedPath = 'основной';
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
            }, fail, request.dashMode, request.format);
        };

        this.quality = function () { return { auto: true, manual: 'Lampa.Player/Hls.js', forcedStartLevel: false }; };
        this.audio = function (resolved) { return resolved && resolved.tracks || []; };
        this.subtitles = function (resolved) { return resolved && resolved.subtitles || []; };
        this.cleanup = resetSession;
        this.diagnostics = function () {
            return {
                adapter: 'CollapsAdapter',
                playback: COLLAPS_NATIVE_DASH.playbackTelemetry,
                manifest: COLLAPS_NATIVE_DASH.manifestInfo,
                selectedPath: COLLAPS_NATIVE_DASH.selectedPath,
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

    var VERSION = '5.0.27-collaps';
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
    var playbackSequence = 0;

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

    function installNextEpisodeHint() {
        if (!Lampa.Player.listener || !Lampa.Controller.listener || !Lampa.PlayerPanel ||
            typeof Lampa.PlayerPanel.render !== 'function' || typeof MutationObserver === 'undefined') return;
        var observer = null, panel = null, active = false;
        var style = document.createElement('style');
        style.textContent = 'body.mnogotv-next-context:not(.mnogotv-next-focused) .player-next{display:none!important}';
        document.head.appendChild(style);
        function clear() {
            active = false;
            if (observer) observer.disconnect();
            observer = null; panel = null;
            document.body.classList.remove('mnogotv-next-context', 'mnogotv-next-focused');
        }
        function update() {
            if (!active || !panel) return;
            var controller = Lampa.Controller.enabled();
            var next = panel.querySelector('.player-panel__next.focus');
            var visible = !!(controller && controller.name === 'player_panel' && next && !next.classList.contains('hide'));
            document.body.classList.toggle('mnogotv-next-focused', visible);
        }
        Lampa.Player.listener.follow('start', function (data) {
            clear();
            if (!data || !data.mnogotv_next_hint) return;
            var render = Lampa.PlayerPanel.render();
            panel = render && render[0];
            if (!panel) return;
            active = true;
            document.body.classList.add('mnogotv-next-context');
            observer = new MutationObserver(update);
            observer.observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
            update();
        });
        Lampa.Controller.listener.follow('toggle', update);
        Lampa.Player.listener.follow('destroy', clear);
    }

    function play(movie, source, imdb, season, episode, epMeta, voice, status, dashMode, formatMode, episodeList) {
        var sequence = ++playbackSequence;
        var busy = false;
        var playlist = [];
        var selectedVoice = voice ? { index: voice.index, label: voice.label } : { index: -1, label: 'Авто' };
        activatePlayback();

        function active() { return sequence === playbackSequence; }
        function prepareVoice() {
            try {
                if (Lampa.PlayerVideo) {
                    if (Lampa.PlayerVideo.clearParamas) Lampa.PlayerVideo.clearParamas();
                    if (selectedVoice.index >= 0 && Lampa.PlayerVideo.setParams) Lampa.PlayerVideo.setParams({ track: selectedVoice.index });
                }
            } catch (e) {}
        }
        function makeItem(number, meta) {
            var title = titleOf(movie);
            if (season !== null && number !== null) title += ' • S' + season + 'E' + number + (meta && meta.name ? ' • ' + meta.name : '');
            return { title: title, season: season, episode: number,
                timeline: timeline(movie, season, number), isonline: true, launch_player: 'lampa',
                mnogotv_next_hint: season !== null && number !== null };
        }
        function applyResolved(item, resolved) {
            item.url = resolved.url;
            item.subtitles = freshSubtitles(resolved.subtitles);
            item.translate = { tracks: freshTracks(resolved.tracks) };
            item.headers = resolved.headers || {};
            prepareVoice();
            status.text('Collaps • ' + resolved.transport + ' • AUTO');
        }
        function resolveItem(item, done) {
            if (!active() || busy) return;
            busy = true;
            status.text('Получаю Collaps • S' + season + 'E' + item.episode + '…');
            adapter.resolve({ source: source, imdb: imdb, season: season, episode: item.episode,
                voice: selectedVoice, dashMode: dashMode, format: formatMode }, function (resolved) {
                busy = false;
                if (!active()) return;
                applyResolved(item, resolved);
                // Other episodes must be resolved again on return: signed URLs and
                // provider transport state belong to the newly selected episode.
                playlist.forEach(function (other) { if (other !== item) arm(other); });
                done();
            }, function (e) {
                busy = false;
                if (!active()) return;
                item.url = '';
                status.text('Ошибка: ' + errText(e));
                notify('MnogoTV: ' + errText(e));
                done();
            });
        }
        function arm(item) {
            item.url = function (done) { resolveItem(item, done); };
        }
        var first = makeItem(episode, epMeta);
        adapter.resolve({ source: source, imdb: imdb, season: season, episode: episode,
            voice: selectedVoice, dashMode: dashMode, format: formatMode }, function (resolved) {
            if (!active()) return;
            applyResolved(first, resolved);
            var seen = {};
            if (season !== null && episode !== null) {
                (episodeList || []).slice().sort(function (a, b) { return Number(a.episode_number) - Number(b.episode_number); }).forEach(function (ep) {
                    var n = Number(ep.episode_number);
                    if (!(n > 0) || n % 1 || seen[n]) return;
                    seen[n] = true;
                    var item = n === Number(episode) ? first : makeItem(n, ep);
                    if (item !== first) arm(item);
                    playlist.push(item);
                });
            }
            if (playlist.indexOf(first) < 0) {
                playlist.push(first);
                playlist.sort(function (a, b) { return Number(a.episode) - Number(b.episode); });
            }
            if (playlist.length > 1) first.playlist = playlist;
            try { Lampa.Player.runas('lampa'); } catch (e) {}
            Lampa.Player.play(first);
            Lampa.Player.playlist(playlist);
        }, function (e) {
            if (!active()) return;
            status.text('Ошибка: ' + errText(e)); notify('MnogoTV: ' + errText(e));
        });
    }

    function viewingProgress(value) {
        value = value || {};
        var time = Math.max(0, Number(value.time) || 0);
        var duration = Math.max(0, Number(value.duration) || 0);
        var percent = duration ? time / duration * 100 : Number(value.percent) || 0;
        return { percent: Math.max(0, Math.min(100, percent)), time: time, duration: duration };
    }

    // Explicit remote navigation: no geometry-dependent jump through the header.
    function episodeFocusTarget(zone, index, direction, buttons, rows, remembered) {
        if (zone === 'rows') {
            if (direction === 'left' || direction === 'up' && index === 0)
                return { zone: 'bar', index: Math.max(0, Math.min(buttons - 1, remembered || 0)) };
            return { zone: 'rows', index: Math.max(0, Math.min(rows - 1, index + (direction === 'down' ? 1 : direction === 'up' ? -1 : 0))) };
        }
        if (direction === 'up') return { zone: 'head', index: 0 };
        if (direction === 'left' && index === 0) return { zone: 'menu', index: 0 };
        if (rows && (direction === 'down' || direction === 'right' && index === buttons - 1))
            return { zone: 'rows', index: Math.max(0, Math.min(rows - 1, remembered || 0)) };
        return { zone: 'bar', index: Math.max(0, Math.min(buttons - 1, index + (direction === 'right' ? 1 : direction === 'left' ? -1 : 0))) };
    }

    function addCss() {
        if (document.getElementById('mnogotv-v5-style')) return;
        var css = `
body.mnogotv-v5-page{background:#111720!important}

body.mnogotv-v5-page .head{background:transparent!important}
.mnogotv-v5{box-sizing:border-box;display:flex;height:calc(100vh - 7em);min-height:24em;padding:1.2em 2em 1.5em;color:#f4f7f8;background:transparent;overflow:hidden}
.mnogotv-v5 *{box-sizing:border-box}
.mnogotv-v5__sidebar{width:29%;flex-shrink:0;padding-right:2em;overflow:hidden}
.mnogotv-v5__identity{display:flex;align-items:center;margin-bottom:1.4em}
.mnogotv-v5__poster{width:42%;border-radius:.45em;background:#203543;object-fit:cover;max-height:15em}
.mnogotv-v5__facts{padding-left:1em;font-size:1em;line-height:1.7;color:#d2e3e7}
.mnogotv-v5__rating{font-size:1.5em;color:#fff;margin:.6em 0}
.mnogotv-v5__title{font-size:1.8em;line-height:1.15;margin:0 0 .5em;font-weight:700}
.mnogotv-v5__genres{font-size:.95em;color:#a6c9cc;margin-bottom:1.5em}
.mnogotv-v5__overview{font-size:1.05em;line-height:1.5;color:#cfdbdf;display:-webkit-box;-webkit-line-clamp:10;-webkit-box-orient:vertical;overflow:hidden}
.mnogotv-v5__main{flex:1;min-width:0;display:flex;flex-direction:column}
.mnogotv-v5__bar{display:flex;flex-wrap:wrap;align-items:center;flex-shrink:0;margin:0 -.25em}
.mnogotv-v5__pill{padding:.6em .8em;margin:.25em;border-radius:.4em;background:rgba(0,0,0,.22);font-size:1em;max-width:20em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:2px solid transparent}
.mnogotv-v5__pill.focus{background:#eefafa;color:#12323b;border-color:#fff}
.mnogotv-v5__status{font-size:.9em;color:#a7c7ca;margin:.6em .3em 1em;min-height:1.2em;flex-shrink:0}
.mnogotv-v5__list{flex:1;min-height:0;overflow-y:auto;padding:.3em .5em .8em .25em;scrollbar-width:none}
.mnogotv-v5__list::-webkit-scrollbar{display:none}
.mnogotv-v5__item{display:flex;align-items:stretch;margin-bottom:.7em;padding:.35em;border:3px solid transparent;border-radius:.6em;background:rgba(0,0,0,.24);min-height:7.6em}
.mnogotv-v5__item.focus{border-color:#ecffff;background:rgba(12,115,121,.65);box-shadow:0 0 0 1px rgba(255,255,255,.3)}
.mnogotv-v5__thumb{width:12em;flex-shrink:0;position:relative;overflow:hidden;border-radius:.3em;background:linear-gradient(135deg,#274354,#0e626c)}
.mnogotv-v5__thumb img{position:absolute;width:100%;height:100%;object-fit:cover}
.mnogotv-v5__number{position:absolute;bottom:.3em;left:.5em;font-size:1.4em;font-weight:bold;text-shadow:0 2px 5px #000}
.mnogotv-v5__details{flex:1;min-width:0;padding:.6em 1em;display:flex;flex-direction:column;justify-content:center}
.mnogotv-v5__rowhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:.7em}
.mnogotv-v5__name{font-size:1.3em;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:1em}
.mnogotv-v5__runtime{font-size:.9em;white-space:nowrap;color:#d5e5e6}
.mnogotv-v5__progress{height:.22em;border-radius:1em;background:rgba(220,240,240,.25);overflow:hidden;width:100%;margin-bottom:.7em}
.mnogotv-v5__fill{height:100%;width:0;background:#9ff8e5;border-radius:1em}
.mnogotv-v5__meta{font-size:.9em;color:#c4dfe0;display:flex;justify-content:space-between;flex-wrap:wrap}
.mnogotv-v5__watched{margin-left:.6em;color:#a7efde}
@media(max-width:900px){.mnogotv-v5{padding:1em;height:calc(100vh - 6em)}.mnogotv-v5__sidebar{width:27%;padding-right:1em}.mnogotv-v5__thumb{width:9em}.mnogotv-v5__title{font-size:1.4em}.mnogotv-v5__facts{font-size:.85em}}
`;
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
        var dashMode = 'default';
        var formatMode = 'dash';
        var initialized = false;
        var destroyed = false, listGeneration = 0;
        var progressRows = [], rowNodes = [], buttonNodes = [];
        var zone = 'bar', rowIndex = 0, buttonIndex = 0;
        var root = $('<div class="mnogotv-v5"></div>');
        var bar = $('<div class="mnogotv-v5__bar"></div>');
        var sourceButton = $('<div class="mnogotv-v5__pill selector">Источник: Collaps</div>');
        var seasonButton = $('<div class="mnogotv-v5__pill selector">Сезон 1</div>');
        var formatButton = $('<div class="mnogotv-v5__pill selector">Формат: DASH</div>');
        var streamButton = $('<div class="mnogotv-v5__pill selector">Поток: основной</div>');
        var status = $('<div class="mnogotv-v5__status">Collaps готов</div>');
        var list = $('<div class="mnogotv-v5__list"></div>');
        var last = seasonButton[0];

        function imageUrl(path, size) {
            if (!path) return '';
            try { return Lampa.Api.img(path, size); } catch (e) { return ''; }
        }
        function addImage(parent, path, size, className) {
            var url = imageUrl(path, size);
            if (!url) return;
            var img = $('<img alt="">').attr('src', url);
            if (className) img.addClass(className);
            img.on('error', function () { $(this).remove(); });
            parent.append(img);
        }
        function sidebar() {
            var side = $('<div class="mnogotv-v5__sidebar"></div>');
            var identity = $('<div class="mnogotv-v5__identity"></div>');
            addImage(identity, movie.poster_path, 'w300', 'mnogotv-v5__poster');
            var facts = $('<div class="mnogotv-v5__facts"></div>');
            var year = String(movie.release_date || movie.first_air_date || '').slice(0, 4);
            facts.append($('<div></div>').text([year, (movie.origin_country || []).join(', ')].filter(Boolean).join(' • ')));
            if (Number(movie.vote_average) > 0) facts.append($('<div class="mnogotv-v5__rating"></div>').text('★ ' + Number(movie.vote_average).toFixed(1)));
            facts.append($('<div></div>').text('MnogoTV • Collaps'));
            identity.append(facts); side.append(identity);
            side.append($('<h2 class="mnogotv-v5__title"></h2>').text(titleOf(movie)));
            side.append($('<div class="mnogotv-v5__genres"></div>').text((movie.genres || []).map(function (g) { return g.name; }).filter(Boolean).join(', ')));
            side.append($('<div class="mnogotv-v5__overview"></div>').text(movie.overview || 'Описание пока недоступно.'));
            return side;
        }
        function refreshProgress() {
            progressRows.forEach(function (entry) {
                var progress = viewingProgress(timeline(movie, entry.season, entry.episode));
                entry.fill.css('width', progress.percent + '%');
                entry.track.attr('aria-valuenow', Math.round(progress.percent));
                entry.label.text(progress.percent ? 'Просмотрено ' + Math.round(progress.percent) + '%' : 'Не просмотрено');
            });
        }
        function revealRow(node) {
            var box = list[0];
            if (!node || !box) return;
            var rect = node.getBoundingClientRect(), bounds = box.getBoundingClientRect();
            if (rect.bottom > bounds.bottom) box.scrollTop += rect.bottom - bounds.bottom + 8;
            else if (rect.top < bounds.top) box.scrollTop -= bounds.top - rect.top + 8;
        }
        function focusNode(node) {
            if (!node || destroyed) return;
            last = node;
            Lampa.Controller.collectionSet(root);
            Lampa.Controller.collectionFocus(node, root);
            if (zone === 'rows') revealRow(node);
        }
        function navigate(direction) {
            var target = episodeFocusTarget(zone, zone === 'rows' ? rowIndex : buttonIndex,
                direction, buttonNodes.length, rowNodes.length, zone === 'rows' ? buttonIndex : rowIndex);
            if (target.zone === 'head' || target.zone === 'menu') {
                Lampa.Controller.toggle(target.zone);
                return;
            }
            zone = target.zone;
            if (zone === 'rows') { rowIndex = target.index; focusNode(rowNodes[rowIndex]); }
            else { buttonIndex = target.index; focusNode(buttonNodes[buttonIndex]); }
        }
        function makeRow(ep, number, rowSeason) {
            var row = $('<div class="mnogotv-v5__item selector"></div>');
            var thumb = $('<div class="mnogotv-v5__thumb"></div>');
            addImage(thumb, ep.still_path || movie.backdrop_path, 'w300');
            thumb.append($('<span class="mnogotv-v5__number"></span>').text(number === null ? '▶' : ('0' + number).slice(-2)));
            var details = $('<div class="mnogotv-v5__details"></div>');
            var head = $('<div class="mnogotv-v5__rowhead"></div>');
            head.append($('<div class="mnogotv-v5__name"></div>').text(number === null ? 'Смотреть фильм' : ep.name || 'Серия ' + number));
            var runtime = Number(ep.runtime || movie.runtime || (movie.episode_run_time || [])[0]) || 0;
            head.append($('<div class="mnogotv-v5__runtime"></div>').text(runtime ? runtime + ' мин' : ''));
            var track = $('<div class="mnogotv-v5__progress" role="progressbar" aria-label="Прогресс просмотра" aria-valuemin="0" aria-valuemax="100"></div>');
            var fill = $('<div class="mnogotv-v5__fill"></div>');track.append(fill);
            var meta = $('<div class="mnogotv-v5__meta"></div>');
            var rating = Number(ep.vote_average) > 0 ? '★ ' + Number(ep.vote_average).toFixed(1) : '';
            meta.append($('<span></span>').text([rating, ep.air_date || '', number === null ? 'Collaps' : 'S' + rowSeason + ' • E' + number].filter(Boolean).join('  •  ')));
            var watched = $('<span class="mnogotv-v5__watched"></span>');meta.append(watched);
            details.append(head).append(track).append(meta);row.append(thumb).append(details);
            var index = rowNodes.length; rowNodes.push(row[0]);
            progressRows.push({ season: rowSeason, episode: number, fill: fill, track: track, label: watched });
            row.on('hover:focus', function () { zone = 'rows'; rowIndex = index; focus = ep; last = row[0]; revealRow(last); refreshProgress(); });
            row.on('hover:enter click', function () { focus = ep; last = row[0]; play(movie, source, imdb, rowSeason, number, ep, voice, status, dashMode, formatMode, episodes); });
            list.append(row);
        }
        function renderList() {
            var generation = ++listGeneration;
            list.empty(); list[0].scrollTop = 0;
            focus = null; rowNodes = []; progressRows = []; rowIndex = 0;
            zone = 'bar'; last = buttonNodes[buttonIndex] || seasonButton[0];
            if (!isSeries(movie)) {
                makeRow({}, null, null); refreshProgress();
                zone = 'rows';last = rowNodes[0];return;
            }
            status.text('Загрузка серий…');
            var requestedSeason = season;
            getEpisodes(movie, requestedSeason, function (items) {
                if (destroyed || generation !== listGeneration) return;
                episodes = items.slice().sort(function (a, b) { return Number(a.episode_number) - Number(b.episode_number); });
                status.text('Collaps • ↓ Серии • ↑ Фильтры • Назад — выход');
                episodes.forEach(function (ep) { makeRow(ep, parseInt(ep.episode_number || 0, 10), requestedSeason); });
                refreshProgress();
                // Refresh the controller collection after asynchronous rendering.
                // Preserve a menu/dialog focus if it is currently open.
                var enabled = Lampa.Controller.enabled && Lampa.Controller.enabled();
                if (enabled && enabled.name === 'content') {
                    zone = 'rows';rowIndex = 0;focusNode(rowNodes[0]);
                }
            }, function (e) {
                if (!destroyed && generation === listGeneration) status.text('Ошибка серий: ' + errText(e));
            });
        }

        function chooseSeason() {
            getSeasons(movie, function (seasons) {
                var items = seasons.map(function (n) { return { title: 'Сезон ' + n, season: n, selected: n === season }; });
                items.push({ title: '← Назад', back: true });
                Lampa.Select.show({ title: 'Collaps — сезон', items: items, onBack: function () { Lampa.Controller.toggle('content'); }, onSelect: function (item) {
                    if (!item.back) { season = item.season; seasonButton.text('Сезон ' + season); voice = { index: -1, label: 'Авто' }; renderList(); }
                    Lampa.Controller.toggle('content');
                }});
            }, function (e) { status.text(errText(e)); });
        }

        streamButton.on('hover:focus', function (e) { last = e.target; }).on('hover:enter click', function () {
            if (formatMode === 'hls') { notify('Выбор основного или альтернативного потока доступен в формате DASH'); return; }
            Lampa.Select.show({title: 'Collaps — поток для следующего запуска', items: [
                {title: 'Основной', mode: 'default', selected: dashMode === 'default'},
                {title: 'Альтернативный DASH — проверить кодек и качества', mode: 'alternative', selected: dashMode === 'alternative'}
            ], onBack: function () { Lampa.Controller.toggle('content'); }, onSelect: function (item) {
                dashMode = item.mode;
                streamButton.text('Поток: ' + (dashMode === 'alternative' ? 'альтернативный' : 'основной'));
                status.text('Запустите фильм или серию. Кодек и качества появятся на панели плеера.');
                Lampa.Controller.toggle('content');
            }});
        });
        formatButton.on('hover:focus', function (e) { last = e.target; }).on('hover:enter click', function () {
            Lampa.Select.show({ title: 'Collaps — формат для следующего запуска', items: [
                { title: 'DASH', mode: 'dash', selected: formatMode === 'dash' },
                { title: 'HLS', mode: 'hls', selected: formatMode === 'hls' }
            ], onBack: function () { Lampa.Controller.toggle('content'); }, onSelect: function (item) {
                formatMode = item.mode === 'hls' ? 'hls' : 'dash';
                formatButton.text('Формат: ' + formatMode.toUpperCase());
                status.text('Запустите фильм или серию.');
                Lampa.Controller.toggle('content');
            }});
        });
        sourceButton.on('hover:enter click', function () {
            Lampa.Select.show({ title: 'Источник', items: [
                { title: 'Collaps', selected: true },
                { title: 'Другие источники — вернуться к карточке', card: true }
            ], onBack: function () { Lampa.Controller.toggle('content'); }, onSelect: function (item) {
                if (Lampa.Select.close) Lampa.Select.close();
                if (item.card) Lampa.Activity.backward();
                else Lampa.Controller.toggle('content');
            }});
        });
        seasonButton.on('hover:focus', function (e) { last = e.target; }).on('hover:enter click', chooseSeason);

        this.create = function () { return this.render(); };
        this.render = function () { return root; };
        this.start = function () {
            document.body.classList.add('mnogotv-v5-page');
            var art = imageUrl(movie.backdrop_path || movie.poster_path, 'w300');
            if (art && Lampa.Background && Lampa.Background.change) Lampa.Background.change(art);
            if (!initialized) {
                initialized = true; addCss();
                bar.append(sourceButton);
                if (isSeries(movie)) bar.append(seasonButton); else seasonButton.hide();
                bar.append(streamButton).append(formatButton);
                var main = $('<div class="mnogotv-v5__main"></div>');
                main.append(bar).append(status).append(list);
                root.append(sidebar()).append(main);
                bar.find('.selector').each(function (index) {
                    var node = this; buttonNodes.push(node);
                    $(node).on('hover:focus', function () { zone = 'bar'; buttonIndex = index; last = node; });
                });
                renderList();
            }
            refreshProgress();
            Lampa.Controller.add('content', {
                toggle: function () { refreshProgress(); focusNode(last || rowNodes[0] || buttonNodes[0]); },
                up: function () { navigate('up'); }, down: function () { navigate('down'); },
                left: function () { navigate('left'); }, right: function () { navigate('right'); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };
        this.pause = function () {};
        this.stop = function () { document.body.classList.remove('mnogotv-v5-page'); };
        this.destroy = function () { document.body.classList.remove('mnogotv-v5-page'); destroyed = true; listGeneration++; playbackSequence++; adapter.cleanup('component-destroy'); root.remove(); };
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
        installNextEpisodeHint();
        Lampa.Listener.follow('full', addButton);
        global.__mnogotv_v5_diagnostics = function () { return { version: VERSION, core: core.hlsRouter.diagnostics(), collaps: adapter.diagnostics() }; };
        notify('MnogoTV v' + VERSION);
        log('started', { resolver: CONFIG.resolver });
    }

    start();
})(window);
