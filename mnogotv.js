(function () {
    'use strict';

    var VERSION = '3.6.0';
    var PLUGIN_ID = 'mnogotv_v360';
    var COMPONENT = 'mnogotv_v360_component';
    var DEFAULT_RESOLVER = 'https://mnogotv-relay.odi-84v.workers.dev';

    if (window[PLUGIN_ID]) return;
    window[PLUGIN_ID] = true;

    var cache = { collaps: {} };

    function log() {
        try { console.log.apply(console, ['[MnogoTV ' + VERSION + ']'].concat([].slice.call(arguments))); } catch (e) {}
    }

    function notify(text) {
        try {
            if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(text);
        } catch (e) {}
    }

    function errText(err) {
        if (!err) return 'неизвестная ошибка';
        if (typeof err === 'string') return err;
        if (err.message) return err.message;
        try { return JSON.stringify(err); } catch (e) {}
        return 'ошибка';
    }

    function getConfig() {
        var cfg = { resolver: DEFAULT_RESOLVER };

        try {
            var script = document.currentScript;
            var src = script && script.src ? script.src : '';
            if (src) {
                var u = new URL(src, window.location.href);
                var custom = String(u.searchParams.get('resolver') || '').trim();
                if (custom) cfg.resolver = custom;
            }
        } catch (e) {}

        try {
            if (Lampa.Storage) {
                var saved = String(Lampa.Storage.get('mnogotv_resolver') || '').trim();
                if (saved) cfg.resolver = saved;
            }
        } catch (e2) {}

        cfg.resolver = String(cfg.resolver || '').replace(/\/+$/, '');
        return cfg;
    }

    var CONFIG = getConfig();

    function resolverUrl(path, params) {
        var url = CONFIG.resolver + path;
        var q = [];
        Object.keys(params || {}).forEach(function (k) {
            var v = params[k];
            if (v !== undefined && v !== null && v !== '') q.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
        });
        return url + (q.length ? '?' + q.join('&') : '');
    }

    function requestJson(url, ok, fail) {
        function parseResponse(r) {
            return r.text().then(function (text) {
                var data = null;
                try { data = text ? JSON.parse(text) : {}; } catch (e) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    throw new Error('invalid json');
                }

                if (!r.ok) throw new Error((data && (data.error || data.message)) || ('HTTP ' + r.status));
                if (data && data.ok === false) throw new Error(data.error || 'ошибка');
                return data;
            });
        }

        if (typeof fetch === 'function') {
            var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            var timer = setTimeout(function () {
                try { if (controller) controller.abort(); } catch (e) {}
            }, 15000);

            fetch(url, {
                method: 'GET',
                cache: 'no-store',
                credentials: 'omit',
                signal: controller ? controller.signal : undefined
            }).then(function (r) {
                clearTimeout(timer);
                return parseResponse(r);
            }).then(ok).catch(function (e) {
                clearTimeout(timer);
                fallback(e);
            });
            return;
        }

        fallback(new Error('fetch unavailable'));

        function fallback(initialErr) {
            var network = null;
            try { network = new Lampa.Reguest(); } catch (e) {
                try { network = new Lampa.Request(); } catch (e2) {}
            }

            if (!network) {
                fail(initialErr || new Error('network unavailable'));
                return;
            }

            function done(data) {
                try {
                    if (typeof data === 'string') data = JSON.parse(data);
                } catch (e) {
                    fail(e);
                    return;
                }

                if (data && data.ok === false) {
                    fail(new Error(data.error || 'ошибка'));
                    return;
                }
                ok(data);
            }

            function bad(a, c) {
                var msg = initialErr || a || c || 'network error';
                fail(typeof msg === 'string' ? new Error(msg) : msg);
            }

            try {
                if (typeof network.native === 'function') {
                    network.timeout(15000);
                    network.native(url, done, bad, false, { dataType: 'json' });
                    return;
                }
            } catch (e3) {}

            try {
                if (typeof network.silent === 'function') {
                    network.timeout(15000);
                    network.silent(url, done, bad, false, { dataType: 'json' });
                    return;
                }
            } catch (e4) {}

            fail(initialErr || new Error('request failed'));
        }
    }

    function tmdbId(movie) {
        if (!movie) return '';
        var source = movie.source || 'tmdb';
        var id = (source === 'tmdb' || source === 'cub') ? movie.id : (movie.tmdb_id || movie.id);
        id = String(id === undefined || id === null ? '' : id).trim();
        return /^\d+$/.test(id) ? id : '';
    }

    function isSeries(movie) {
        return !!(movie && (movie.media_type === 'tv' || movie.number_of_seasons || movie.first_air_date || movie.name || movie.original_name));
    }

    function titleOf(movie) {
        return (movie && (movie.title || movie.name || movie.original_title || movie.original_name)) || 'MnogoTV';
    }

    function episodeDate(raw) {
        if (!raw) return 'Неизвестно';
        try {
            var p = String(raw).split('-');
            if (p.length === 3) {
                var months = ['Января','Февраля','Марта','Апреля','Мая','Июня','Июля','Августа','Сентября','Октября','Ноября','Декабря'];
                return parseInt(p[2], 10) + ' ' + (months[parseInt(p[1], 10) - 1] || p[1]);
            }
        } catch (e) {}
        return String(raw);
    }

    function episodeImage(ep) {
        try {
            if (ep && ep.still_path && Lampa.TMDB && Lampa.TMDB.image) {
                return Lampa.TMDB.image('t/p/w300' + ep.still_path);
            }
        } catch (e) {}
        return '';
    }

    function getImdb(movie, ok, fail) {
        var direct = movie && (movie.imdb_id || (movie.external_ids && movie.external_ids.imdb_id));
        if (direct && /^tt\d+$/i.test(String(direct))) {
            ok(String(direct));
            return;
        }

        var id = tmdbId(movie);
        if (!id) {
            fail(new Error('TMDB ID не найден'));
            return;
        }

        try {
            Lampa.Api.sources.tmdb.get(
                (isSeries(movie) ? 'tv/' : 'movie/') + id + '/external_ids',
                {},
                function (data) {
                    var imdb = data && data.imdb_id;
                    if (imdb && /^tt\d+$/i.test(String(imdb))) ok(String(imdb));
                    else fail(new Error('IMDb ID не найден'));
                },
                function (e) { fail(e || new Error('TMDB external_ids недоступен')); }
            );
        } catch (e2) { fail(e2); }
    }

    function getSeasons(movie, ok, fail) {
        var arr = [];
        if (movie && Array.isArray(movie.seasons)) {
            movie.seasons.forEach(function (s) {
                var n = parseInt(s && s.season_number, 10);
                if (n > 0) arr.push(n);
            });
        }
        if (arr.length) { ok(arr); return; }

        var count = parseInt(movie && movie.number_of_seasons, 10);
        if (count > 0) {
            for (var i = 1; i <= count; i++) arr.push(i);
            ok(arr);
            return;
        }

        try {
            Lampa.Api.sources.tmdb.get('tv/' + tmdbId(movie), {}, function (data) {
                var seasons = [];
                (data && data.seasons || []).forEach(function (s) {
                    var n = parseInt(s.season_number, 10);
                    if (n > 0) seasons.push(n);
                });
                if (seasons.length) ok(seasons);
                else fail(new Error('Сезоны не найдены'));
            }, fail);
        } catch (e) { fail(e); }
    }

    function getEpisodes(movie, season, ok, fail) {
        var id = tmdbId(movie);
        if (!id) { fail(new Error('TMDB ID не найден')); return; }

        try {
            Lampa.Api.sources.tmdb.get('tv/' + id + '/season/' + season, {}, function (data) {
                var episodes = data && data.episodes || [];
                if (episodes.length) ok(episodes);
                else fail(new Error('Серии не найдены'));
            }, fail);
        } catch (e) { fail(e); }
    }

    function getSources(imdb, ok, fail) {
        requestJson(resolverUrl('/sources', { imdb: imdb }), function (response) {
            var sources = response && response.sources || [];
            if (!Array.isArray(sources)) sources = [];

            var hasCollaps = false;

            sources.forEach(function (s) {
                var type = String(s && s.type || '').toLowerCase();

                s.supported =
                    type === 'collaps' ||
                    type === 'veoveo' ||
                    type === 'veo' ||
                    type.indexOf('veoveo') >= 0;

                s.preferred =
                    type === 'veoveo' ||
                    type === 'veo' ||
                    type.indexOf('veoveo') >= 0;

                if (type === 'collaps') hasCollaps = true;
            });

            if (!hasCollaps) {
                sources.push({
                    type: 'Collaps',
                    name: 'Collaps',
                    supported: true,
                    fallback: true,
                    iframeUrl: ''
                });
            }

            ok(sources);
        }, fail);
    }

    var VEO_UA =
        'Mozilla/5.0 (Linux; Android 10; SmartTV) ' +
        'AppleWebKit/537.36 Chrome/120 Safari/537.36';

    function nativeJson(url, headers, ok, fail) {
        var network = null;

        try {
            network = new Lampa.Reguest();
        } catch (e) {
            try { network = new Lampa.Request(); } catch (e2) {}
        }

        if (!network || typeof network.native !== 'function') {
            fail(new Error('Lampa.Reguest.native недоступен'));
            return;
        }

        try {
            network.clear();
            network.timeout(12000);

            network.native(
                url,
                function (data) {
                    try {
                        if (typeof data === 'string') data = JSON.parse(data);
                        ok(data);
                    } catch (e) {
                        fail(new Error('VeoVeo: invalid JSON'));
                    }
                },
                function (a, c) {
                    var status =
                        a && a.status !== undefined
                            ? a.status
                            : '';

                    fail(new Error(
                        status
                            ? ('HTTP ' + status)
                            : errText(a || c || 'network error')
                    ));
                },
                false,
                {
                    dataType: 'json',
                    headers: headers || {}
                }
            );
        } catch (e3) {
            fail(e3);
        }
    }

    function veoHeaders(url) {
        var origin = '';

        try {
            origin = new URL(String(url || '')).origin;
        } catch (e) {}

        var headers = {
            'User-Agent': VEO_UA
        };

        if (origin) {
            headers.Origin = origin;
            headers.Referer = origin + '/';
        }

        return headers;
    }

    function veoMovieIdFromHtml(html, iframeUrl) {
        html = String(html || '');

        var m =
            html.match(/window\.MOVIE_ID\s*=\s*["']?(\d+)/i) ||
            html.match(/\bMOVIE_ID\s*[:=]\s*["']?(\d+)/i);

        if (m && m[1]) return m[1];

        try {
            var u = new URL(String(iframeUrl || ''));

            return (
                u.searchParams.get('movieid') ||
                u.searchParams.get('content-id') ||
                u.searchParams.get('content_id') ||
                ''
            );
        } catch (e) {}

        return '';
    }

    function chooseVeoCatalogItem(catalog, season, episode) {
        if (!Array.isArray(catalog)) return null;

        if (season === null || episode === null) {
            for (var i = 0; i < catalog.length; i++) {
                var item = catalog[i];
                var s =
                    item &&
                    item.season &&
                    parseInt(item.season.order, 10);

                if (!s) return item;
            }

            return catalog[0] || null;
        }

        for (var j = 0; j < catalog.length; j++) {
            var ep = catalog[j];

            var epSeason =
                ep &&
                ep.season &&
                parseInt(ep.season.order, 10);

            var epNumber =
                parseInt(
                    ep && (
                        ep.order ||
                        ep.episode ||
                        ep.episodeNumber
                    ),
                    10
                );

            if (
                Number(epSeason) === Number(season) &&
                Number(epNumber) === Number(episode)
            ) {
                return ep;
            }
        }

        return null;
    }

    function chooseVeoVariant(item) {
        if (!item) return null;

        var variants =
            item.episodeVariants ||
            item.variants ||
            [];

        if (!Array.isArray(variants)) variants = [];

        if (!variants.length && item.filepath) {
            return {
                filepath: item.filepath,
                title: item.title || ''
            };
        }

        var preferred = null;

        variants.forEach(function (v) {
            if (!v || !v.filepath) return;

            if (!preferred) preferred = v;

            if (
                String(v.filepath).toLowerCase()
                    .indexOf('.m3u8') >= 0
            ) {
                preferred = v;
            }
        });

        return preferred;
    }

    function veoResolveJsonFile(file, headers, ok, fail) {
        nativeJson(
            file,
            headers,
            function (data) {
                var sources =
                    data &&
                    data.sources;

                if (
                    !Array.isArray(sources) ||
                    !sources.length
                ) {
                    fail(new Error(
                        'VeoVeo: sources в JSON не найдены'
                    ));
                    return;
                }

                var link =
                    sources[0] &&
                    (
                        sources[0].link ||
                        sources[0].file ||
                        sources[0].url
                    );

                if (!link) {
                    fail(new Error(
                        'VeoVeo: ссылка в JSON не найдена'
                    ));
                    return;
                }

                ok(normalizeDirectUrl(link));
            },
            fail
        );
    }

    function probePlainHls(url, ok) {
        nativeText(
            url,
            {},
            function (manifest) {
                ok(
                    String(manifest || '')
                        .trim()
                        .indexOf('#EXTM3U') === 0
                );
            },
            function () {
                ok(false);
            }
        );
    }

    function resolveVeoVeo(
        source,
        season,
        episode,
        ok,
        fail
    ) {
        var iframe =
            normalizeDirectUrl(
                source && source.iframeUrl
            );

        if (!iframe) {
            fail(new Error(
                'VeoVeo: iframeUrl не получен'
            ));
            return;
        }

        var headers = veoHeaders(iframe);

        nativeText(
            iframe,
            headers,
            function (html) {
                var movieId =
                    veoMovieIdFromHtml(
                        html,
                        iframe
                    );

                if (!movieId) {
                    fail(new Error(
                        'VeoVeo: MOVIE_ID не найден'
                    ));
                    return;
                }

                var origin = '';

                try {
                    origin =
                        new URL(iframe).origin;
                } catch (e) {}

                if (!origin) {
                    fail(new Error(
                        'VeoVeo: host не определён'
                    ));
                    return;
                }

                var catalogUrl =
                    origin +
                    '/balancer-api/proxy/' +
                    'playlists/catalog-api/' +
                    'episodes?content-id=' +
                    encodeURIComponent(movieId);

                nativeJson(
                    catalogUrl,
                    veoHeaders(catalogUrl),
                    function (catalog) {
                        var item =
                            chooseVeoCatalogItem(
                                catalog,
                                season,
                                episode
                            );

                        if (!item) {
                            fail(new Error(
                                'VeoVeo: серия не найдена'
                            ));
                            return;
                        }

                        var variant =
                            chooseVeoVariant(item);

                        if (
                            !variant ||
                            !variant.filepath
                        ) {
                            fail(new Error(
                                'VeoVeo: filepath не найден'
                            ));
                            return;
                        }

                        var file =
                            normalizeDirectUrl(
                                variant.filepath
                            );

                        function finish(stream) {
                            stream =
                                normalizeDirectUrl(
                                    stream
                                );

                            if (!stream) {
                                fail(new Error(
                                    'VeoVeo: поток пустой'
                                ));
                                return;
                            }

                            /*
                             * Проверяем, нужен ли потоку
                             * специальный заголовок.
                             * Если m3u8 читается без headers,
                             * его можно безопаснее отдавать
                             * внешнему Android-плееру.
                             */
                            probePlainHls(
                                stream,
                                function (plainOk) {
                                    ok({
                                        provider: 'VeoVeo',
                                        directUrl: stream,
                                        directHeaders:
                                            plainOk
                                                ? {}
                                                : veoHeaders(stream),
                                        relayUrl: '',
                                        relayReady: false,
                                        externalDirect:
                                            plainOk,
                                        subtitles: [],
                                        tracks: [],
                                        resolvedBy:
                                            'VeoVeo catalog'
                                    });
                                }
                            );
                        }

                        if (
                            file.toLowerCase()
                                .indexOf('.json') >= 0
                        ) {
                            veoResolveJsonFile(
                                file,
                                veoHeaders(file),
                                finish,
                                fail
                            );
                        }
                        else {
                            finish(file);
                        }
                    },
                    function (e) {
                        fail(new Error(
                            'VeoVeo catalog: ' +
                            errText(e)
                        ));
                    }
                );
            },
            function (e) {
                fail(new Error(
                    'VeoVeo iframe: ' +
                    errText(e)
                ));
            }
        );
    }

    var COLLAPS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
    var COLLAPS_HOST = 'https://api.ortified.ws';
    var COLLAPS_REF = COLLAPS_HOST + '/';

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
        html = String(html || '').replace(/\n/g, '');
        var find = html.match(/makePlayer\(({.*?})\);/);
        var json = null;

        try {
            json = find && (0, eval)('"use strict"; (' + find[1] + ');');
        } catch (e) {}

        return json;
    }

    function normalizeDirectUrl(url) {
        url = String(url || '').trim();
        if (url.indexOf('//') === 0) url = 'https:' + url;
        return url;
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
        var tracks = names.map(function (name, index) {
            return { language: name, order: order[index] !== undefined ? order[index] : 1000 };
        }).filter(function (item) { return item.language && item.language !== 'delete'; });
        tracks.sort(function (a, b) { return a.order - b.order; });
        return tracks.map(function (item) { return { language: item.language }; });
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
        requestJson(resolverUrl('/ids', { imdb: imdb }), function (data) {
            ok(data && data.kp ? String(data.kp) : '');
        }, function () {
            ok('');
        });
    }

    function tryCollapsUrls(source, imdb, kp, ok, fail) {
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
         * Повторяем порядок online_mod:
         * 1) официальный Collaps по KP
         * 2) fallback по IMDb
         * 3) iframe от MnogoTV только как последний резерв
         */
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

        if (source && source.iframeUrl) {
            add(source.iframeUrl, 'MnogoTV iframe');
        }

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

            nativeText(
                attempt.url,
                attempt.headers,
                function (html) {
                    var cfg = parseCollapsHtml(html);

                    if (cfg) {
                        ok({
                            config: cfg,
                            url: attempt.url,
                            label: attempt.label,
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


    function resolveCollaps(source, imdb, season, episode, ok, fail) {
        getKpId(imdb, function (kp) {
            tryCollapsUrls(source, imdb, kp, function (response) {
                var cfg = response.config;
                var item = pickCollapsItem(cfg, season, episode);

                if (!item) {
                    fail(new Error(season !== null ? 'Collaps: серия не найдена' : 'Collaps: поток не найден'));
                    return;
                }

                var stream = item.hls || (item.source && item.source.hls) || '';
                if (!stream && season === null && cfg.source) {
                    stream = cfg.source.hls || '';
                    item = cfg.source;
                }

                stream = normalizeDirectUrl(stream);
                if (!stream) {
                    fail(new Error('Collaps: HLS не найден'));
                    return;
                }

                // Точно как online_mod: добавляется буквально &vp.
                if (stream.indexOf('&vp') === -1) stream += '&vp';

                preparePlayableStream(stream, response, function (prepared) {
                    ok({
                        provider: 'Collaps',
                        directUrl: prepared.directUrl,
                        directHeaders: prepared.directHeaders || {},
                        relayUrl: prepared.relayUrl || '',
                        relayReady: prepared.relayReady === true,
                        subtitles: normalizeSubs(item.cc || item.subtitles || []),
                        tracks: normalizeTracks(item.audio || {}),
                        resolvedBy: response.label
                    });
                });
            }, fail);
        });
    }

    function resolveSource(source, imdb, season, episode, ok, fail) {
        var type =
            String(
                source && source.type || ''
            ).toLowerCase();

        if (type === 'collaps') {
            resolveCollaps(
                source,
                imdb,
                season,
                episode,
                ok,
                fail
            );
            return;
        }

        if (
            type === 'veoveo' ||
            type === 'veo' ||
            type.indexOf('veoveo') >= 0
        ) {
            resolveVeoVeo(
                source,
                season,
                episode,
                ok,
                fail
            );
            return;
        }

        fail(new Error(
            (
                source &&
                (
                    source.name ||
                    source.type
                ) ||
                'Источник'
            ) +
            ': адаптер ещё не реализован'
        ));
    }

    function playResolved(movie, season, episode, epMeta, source, resolved, runas) {
        var title = titleOf(movie);

        if (season !== null && episode !== null) {
            title += ' • S' + season + 'E' + episode;
            if (epMeta && epMeta.name) title += ' • ' + epMeta.name;
        }

        var actualRunas = runas || '';
        var useExternal = actualRunas === 'android';
        var externalUrl = '';

        if (useExternal) {
            if (resolved.relayReady) {
                externalUrl = resolved.relayUrl;
            }
            else if (resolved.externalDirect) {
                externalUrl = resolved.directUrl;
            }
            else {
                notify(
                    'MnogoTV: поток требует headers, запускаю Lampa'
                );
                actualRunas = 'lampa';
                useExternal = false;
            }
        }

        var first = {
            url: useExternal
                ? externalUrl
                : resolved.directUrl,
            title: title,
            subtitles: resolved.subtitles || [],
            translate: { tracks: resolved.tracks || [] },
            timeline: timeline(movie, season, episode),
            headers: useExternal ? {} : (resolved.directHeaders || {}),
            isonline: true
        };

        if (actualRunas) {
            try { Lampa.Player.runas(actualRunas); } catch (e) {}
        }

        log('play', {
            source: source && source.type,
            runas: actualRunas || 'default',
            transport: useExternal ? 'relay' : 'direct',
            url: first.url
        });

        Lampa.Player.play(first);
        Lampa.Player.playlist([first]);
    }


    function addCss() {
        if (document.getElementById('mnogotv-v360-style')) return;
        var css = `
        .mnogotv-v360{width:100%;box-sizing:border-box;padding:.6em 1.4em 2em}
        .mnogotv-v360__toolbar{display:flex;gap:.9em;align-items:center;flex-wrap:wrap;margin:.2em 0 1em}
        .mnogotv-v360__pill{min-width:12em;padding:.75em 1em;border-radius:.7em;background:rgba(0,0,0,.18);box-sizing:border-box}
        .mnogotv-v360__pill-title{display:block;font-size:.84em;font-weight:600;margin-bottom:.12em}
        .mnogotv-v360__pill-value{display:block;font-size:1em;opacity:.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .mnogotv-v360__pill.focus,.mnogotv-v360__episode.focus{box-shadow:0 0 0 .18em #fff;background:rgba(255,255,255,.08)}
        .mnogotv-v360__headline{display:flex;align-items:center;gap:.55em;padding:.1em .15em .85em;opacity:.95;font-size:1.05em}
        .mnogotv-v360__headline .icon-play{width:1.3em;height:1.3em;border-radius:50%;border:.12em solid #fff;display:inline-flex;align-items:center;justify-content:center;font-size:.72em;line-height:1}
        .mnogotv-v360__status{opacity:.82;margin:.1em 0 .7em;min-height:1.3em}
        .mnogotv-v360__episode{display:flex;align-items:center;gap:1.15em;width:100%;box-sizing:border-box;padding:.75em .2em .82em;border-top:.13em solid rgba(255,255,255,.72);position:relative}
        .mnogotv-v360__episode:last-child{border-bottom:.13em solid rgba(255,255,255,.72)}
        .mnogotv-v360__thumb{position:relative;width:11.6em;height:6.5em;flex:0 0 11.6em;border-radius:.38em;overflow:hidden;background:rgba(255,255,255,.08)}
        .mnogotv-v360__thumb img{width:100%;height:100%;object-fit:cover;display:block}
        .mnogotv-v360__num{position:absolute;left:.42em;bottom:.25em;font-size:1.85em;font-weight:700;line-height:1;color:#fff;text-shadow:0 .08em .18em #000}
        .mnogotv-v360__body{flex:1;min-width:0;padding-right:.2em}
        .mnogotv-v360__title{font-size:1.55em;line-height:1.15;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .mnogotv-v360__line{height:.14em;width:100%;background:rgba(255,255,255,.9);margin:.38em 0 .48em;border-radius:1em;opacity:.92}
        .mnogotv-v360__meta{opacity:.95;font-size:1.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .mnogotv-v360__empty{padding:1.7em 0;opacity:.8}
        @media(max-width:900px){
            .mnogotv-v360{padding:.5em .9em 1.6em}
            .mnogotv-v360__pill{min-width:9.3em;padding:.55em .75em;border-radius:.5em}
            .mnogotv-v360__pill-title{font-size:.76em}
            .mnogotv-v360__pill-value{font-size:.92em}
            .mnogotv-v360__headline{font-size:.9em;padding-bottom:.55em}
            .mnogotv-v360__episode{gap:.75em;padding:.55em 0 .62em}
            .mnogotv-v360__thumb{width:8.8em;height:4.95em;flex-basis:8.8em}
            .mnogotv-v360__num{font-size:1.48em}
            .mnogotv-v360__title{font-size:1.12em}
            .mnogotv-v360__meta{font-size:.82em}
        }`;
        var style = document.createElement('style');
        style.id = 'mnogotv-v360-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function MnogoComponent(object) {
        var movie = object.movie || {};
        var imdb = '';
        var sources = [];
        var source = null;
        var season = 1;
        var seasons = [];
        var episodes = [];
        var initialized = false;
        var last = null;
        var currentFocus = null;

        var root = $('<div class="mnogotv-v360"></div>');
        var toolbar = $('<div class="mnogotv-v360__toolbar"></div>');
        var headline = $('<div class="mnogotv-v360__headline"><span class="icon-play">▶</span><span class="mnogotv-v360__headline-text"></span></div>');
        var status = $('<div class="mnogotv-v360__status"></div>');
        var sourceButton = $('<div class="mnogotv-v360__pill selector"><span class="mnogotv-v360__pill-title">Источник</span><span class="mnogotv-v360__pill-value">Загрузка…</span></div>');
        var seasonButton = $('<div class="mnogotv-v360__pill selector"><span class="mnogotv-v360__pill-title">Фильтр</span><span class="mnogotv-v360__pill-value">Сезон 1</span></div>');
        var scroll = new Lampa.Scroll({ mask: true, over: true });

        function updateHeadline(ep) {
            var parts = [];
            parts.push(source ? (source.name || source.type || 'Источник') : 'MnogoTV');
            if (isSeries(movie)) parts.push('Сезон ' + season);
            if (ep && ep.episode_number) parts.push('Серия ' + ep.episode_number);
            if (ep && ep.name) parts.push(ep.name);
            headline.find('.mnogotv-v360__headline-text').text(parts.join('  •  '));
        }

        function setSourceLabel() {
            sourceButton.find('.mnogotv-v360__pill-value').text(source ? (source.name || source.type || 'Источник') : 'Нет');
            updateHeadline(currentFocus || episodes[0] || null);
        }

        function setSeasonLabel() {
            seasonButton.find('.mnogotv-v360__pill-value').text('Сезон: ' + season + ' сезон');
            updateHeadline(currentFocus || episodes[0] || null);
        }

        function chooseSource() {
            var items = [];
            sources.forEach(function (s) {
                var type =
                    String(
                        s && s.type || ''
                    ).toLowerCase();

                var suffix = '';

                if (!s.supported) {
                    suffix =
                        ' • пока без адаптера';
                }
                else if (type === 'collaps') {
                    suffix =
                        ' • проблемный на Android';
                }
                else if (
                    type === 'veoveo' ||
                    type === 'veo' ||
                    type.indexOf('veoveo') >= 0
                ) {
                    suffix =
                        ' • рекомендуется';
                }

                items.push({
                    title:
                        (s.name || s.type || 'Источник') +
                        suffix,
                    source: s,
                    selected: source === s
                });
            });
            items.push({ title: '← Назад', goBack: true });

            Lampa.Select.show({
                title: 'MnogoTV — источник',
                items: items,
                onBack: function () { Lampa.Controller.toggle('mnogotv_v360'); },
                onSelect: function (item) {
                    if (item.goBack) { Lampa.Controller.toggle('mnogotv_v360'); return; }
                    if (!item.source.supported) {
                        notify('MnogoTV: ' + (item.source.name || item.source.type) + ' пока без отдельного адаптера');
                        Lampa.Controller.toggle('mnogotv_v360');
                        return;
                    }
                    source = item.source;
                    status.text('');
                    setSourceLabel();
                    Lampa.Controller.toggle('mnogotv_v360');
                    renderEpisodes();
                }
            });
        }

        function chooseSeason() {
            var items = seasons.map(function (n) { return { title: 'Сезон ' + n, season: n, selected: Number(n) === Number(season) }; });
            items.push({ title: '← Назад', goBack: true });
            Lampa.Select.show({
                title: 'MnogoTV — сезон',
                items: items,
                onBack: function () { Lampa.Controller.toggle('mnogotv_v360'); },
                onSelect: function (item) {
                    if (item.goBack) { Lampa.Controller.toggle('mnogotv_v360'); return; }
                    season = item.season;
                    setSeasonLabel();
                    Lampa.Controller.toggle('mnogotv_v360');
                    renderEpisodes();
                }
            });
        }

        function playerMenu(ep) {
            if (!Lampa.Platform || !Lampa.Platform.is || !Lampa.Platform.is('android')) {
                playEpisode(ep, '');
                return;
            }
            Lampa.Select.show({
                title: 'Играть',
                items: [
                    { title: 'По умолчанию', runas: '' },
                    { title: 'Android / внешний плеер', runas: 'android' },
                    { title: 'Lampa', runas: 'lampa' }
                ],
                onBack: function () { Lampa.Controller.toggle('mnogotv_v360'); },
                onSelect: function (item) {
                    Lampa.Controller.toggle('mnogotv_v360');
                    playEpisode(ep, item.runas || '');
                }
            });
        }

        function playEpisode(ep, runas) {
            if (!source) { notify('MnogoTV: источник не выбран'); return; }
            var epNum = isSeries(movie) ? parseInt(ep.episode_number || 0, 10) : null;
            status.text('Получаем поток ' + (source.name || source.type || '') + '…');
            resolveSource(source, imdb, isSeries(movie) ? season : null, epNum, function (resolved) {
                var actualRunas = runas;

                if (!actualRunas) {
                    try {
                        if (
                            Lampa.Platform &&
                            Lampa.Platform.is &&
                            Lampa.Platform.is('android') &&
                            (
                                resolved.relayReady ||
                                resolved.externalDirect
                            )
                        ) {
                            actualRunas = 'android';
                        }
                        else if (
                            Lampa.Platform &&
                            Lampa.Platform.is &&
                            Lampa.Platform.is('android')
                        ) {
                            actualRunas = 'lampa';
                        }
                    } catch (e) {}
                }

                status.text(
                    (resolved.provider || 'Источник') +
                    ' • ' +
                    (resolved.resolvedBy || 'resolver') +
                    ' • ' +
                    (
                        resolved.relayReady
                            ? 'relay.m3u8'
                            : (
                                resolved.externalDirect
                                    ? 'direct'
                                    : 'headers'
                            )
                    )
                );

                playResolved(
                    movie,
                    isSeries(movie) ? season : null,
                    epNum,
                    ep,
                    source,
                    resolved,
                    actualRunas
                );
            }, function (e) {
                status.text('Ошибка: ' + errText(e));
                notify('MnogoTV: ' + errText(e));
            });
        }

        function makeEpisode(ep) {
            var num = parseInt(ep.episode_number || 0, 10);
            var title = ep.name || ('Серия ' + num);
            var item = $('<div class="mnogotv-v360__episode selector"><div class="mnogotv-v360__thumb"><img><div class="mnogotv-v360__num"></div></div><div class="mnogotv-v360__body"><div class="mnogotv-v360__title"></div><div class="mnogotv-v360__line"></div><div class="mnogotv-v360__meta"></div></div></div>');
            item.find('.mnogotv-v360__num').text(('0' + num).slice(-2));
            item.find('.mnogotv-v360__title').text(title);
            var meta = [];
            meta.push('★ ' + (ep.vote_average ? parseFloat(ep.vote_average).toFixed(1) : 'Неизвестно'));
            meta.push(episodeDate(ep.air_date));
            meta.push('Неизвестно');
            item.find('.mnogotv-v360__meta').text(meta.join('  •  '));
            var image = episodeImage(ep);
            if (image) item.find('img').attr('src', image); else item.find('img').hide();

            item.on('hover:focus', function (e) {
                last = e.target;
                currentFocus = ep;
                updateHeadline(ep);
                try { scroll.update($(e.target), true); } catch (err) {}
            });

            item.on('hover:enter click', function () { playEpisode(ep, ''); });
            item.on('hover:long', function () { playerMenu(ep); });
            return item;
        }

        function renderMovie() {
            scroll.clear();
            var item = $('<div class="mnogotv-v360__episode selector"><div class="mnogotv-v360__body"><div class="mnogotv-v360__title">Смотреть фильм</div><div class="mnogotv-v360__line"></div><div class="mnogotv-v360__meta"></div></div></div>');
            item.find('.mnogotv-v360__meta').text(source ? (source.name || source.type || '') : 'MnogoTV');
            item.on('hover:focus', function (e) { last = e.target; currentFocus = null; updateHeadline(null); });
            item.on('hover:enter click', function () { playEpisode({}, ''); });
            item.on('hover:long', function () { playerMenu({}); });
            scroll.append(item);
            updateHeadline(null);
        }

        function renderEpisodes() {
            scroll.clear();
            currentFocus = null;
            last = sourceButton[0];
            if (!isSeries(movie)) { renderMovie(); return; }
            status.text('Загрузка серий…');
            getEpisodes(movie, season, function (list) {
                episodes = list;
                scroll.clear();
                status.text('');
                if (!episodes.length) {
                    scroll.append($('<div class="mnogotv-v360__empty">Серии не найдены</div>'));
                    updateHeadline(null);
                    return;
                }
                currentFocus = episodes[0];
                updateHeadline(currentFocus);
                episodes.forEach(function (ep) { scroll.append(makeEpisode(ep)); });
                try { Lampa.Controller.toggle('mnogotv_v360'); } catch (e) {}
            }, function (e) {
                status.text('Ошибка: ' + errText(e));
            });
        }

        function initData() {
            status.text('Подключение к MnogoTV…');
            getImdb(movie, function (id) {
                imdb = id;
                getSources(imdb, function (list) {
                    sources = list;
                    source = null;

                    for (
                        var i = 0;
                        i < sources.length;
                        i++
                    ) {
                        if (
                            sources[i] &&
                            sources[i].supported &&
                            sources[i].preferred
                        ) {
                            source = sources[i];
                            break;
                        }
                    }

                    if (!source) {
                        for (
                            var j = 0;
                            j < sources.length;
                            j++
                        ) {
                            if (
                                sources[j] &&
                                sources[j].supported
                            ) {
                                source = sources[j];
                                break;
                            }
                        }
                    }
                    setSourceLabel();
                    if (!source) { status.text('Нет поддерживаемых источников'); return; }
                    if (isSeries(movie)) {
                        getSeasons(movie, function (listSeasons) {
                            seasons = listSeasons;
                            season = seasons[0] || 1;
                            setSeasonLabel();
                            status.text('');
                            renderEpisodes();
                        }, function (e) { status.text('Ошибка сезонов: ' + errText(e)); });
                    } else {
                        seasonButton.hide();
                        status.text('');
                        renderMovie();
                    }
                }, function (e) {
                    status.text('Resolver: ' + errText(e));
                });
            }, function (e) { status.text('IMDb: ' + errText(e)); });
        }

        sourceButton.on('hover:focus', function (e) { last = e.target; });
        seasonButton.on('hover:focus', function (e) { last = e.target; });
        sourceButton.on('hover:enter click', chooseSource);
        seasonButton.on('hover:enter click', chooseSeason);

        this.create = function () { return this.render(); };
        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;
            if (!initialized) {
                initialized = true;
                addCss();
                toolbar.append(sourceButton);
                toolbar.append(seasonButton);
                root.append(toolbar);
                root.append(headline);
                root.append(status);
                root.append(scroll.render());
                try {
                    var bg = Lampa.Utils.cardImgBackgroundBlur(movie);
                    if (bg) Lampa.Background.immediately(bg);
                } catch (e) {}
                initData();
            }
            Lampa.Controller.add('mnogotv_v360', {
                toggle: function () {
                    Lampa.Controller.collectionSet(root);
                    Lampa.Controller.collectionFocus(last || sourceButton[0], root);
                },
                up: function () { if (Navigator.canmove('up')) Navigator.move('up'); else Lampa.Controller.toggle('head'); },
                down: function () { Navigator.move('down'); },
                left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); },
                right: function () { Navigator.move('right'); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('mnogotv_v360');
        };
        this.render = function () { return root; };
        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () {
            try { scroll.destroy(); } catch (e) {}
            root.remove();
        };
    }

    function registerComponent() {
        try {
            if (!Lampa.Component || typeof Lampa.Component.add !== 'function') return false;
            try { Lampa.Component.add(COMPONENT, MnogoComponent); } catch (e) {}
            return true;
        } catch (e2) { return false; }
    }

    function openComponent(movie) {
        if (!registerComponent()) { notify('MnogoTV: Lampa.Component недоступен'); return; }
        Lampa.Activity.push({ title: 'MnogoTV', component: COMPONENT, movie: movie, page: 1, noinfo: true });
    }

    function addButton(e) {
        if (!e || e.type !== 'complite') return;
        try {
            var root = e.object && e.object.activity && e.object.activity.render ? e.object.activity.render() : null;
            if (!root || !root.length) return;
            if (root.find('.mnogotv-v360-button').length) return;
            var movie = (e.data && e.data.movie) || e.movie || e.object.card || {};
            var button = $('<div class="full-start__button selector view--online mnogotv-v360-button" data-subtitle="MnogoTV"><svg class="button__icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M10 9l5 3-5 3V9z" fill="currentColor"/></svg><span>MnogoTV</span></div>');
            button.on('hover:enter click', function () { openComponent(movie); });
            var torrent = root.find('.view--torrent').first();
            var online = root.find('.view--online').last();
            var box = root.find('.full-start-new__buttons, .full-start__buttons').first();
            if (torrent.length) torrent.after(button);
            else if (online.length) online.after(button);
            else if (box.length) box.append(button);
        } catch (err) { log('addButton error', err); }
    }

    function start() {
        if (!window.Lampa || !Lampa.Listener || !Lampa.Player) { setTimeout(start, 500); return; }
        registerComponent();
        Lampa.Listener.follow('full', function (e) { if (e && e.type === 'complite') addButton(e); });
        notify('MnogoTV v' + VERSION + ' • VeoVeo');
        log('started', { resolver: CONFIG.resolver });
    }

    start();
})();
