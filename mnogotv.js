(function () {
    'use strict';

    var VERSION = '3.19.2';
    var PLUGIN_ID = 'mnogotv_v318';
    var COMPONENT = 'mnogotv_v318_component';
    var DEFAULT_RESOLVER = 'https://mnogotv-relay.odi-84v.workers.dev';

    if (window[PLUGIN_ID]) return;
    window[PLUGIN_ID] = true;

    var cache = {
        collaps: {},
        veoCatalog: {},
        veoMovieId: {},
        hlsMeta: {},
        ids: {},
        sources: {}
    };

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


    function episodeRuntime(ep, movie) {
        var minutes = parseInt(ep && ep.runtime, 10);

        if (!minutes && movie && Array.isArray(movie.episode_run_time)) {
            minutes = parseInt(movie.episode_run_time[0], 10);
        }

        if (!minutes || minutes < 1) return '—';

        var h = Math.floor(minutes / 60);
        var m = minutes % 60;

        if (h > 0) {
            return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2);
        }

        return '00:' + ('0' + m).slice(-2);
    }


    function movieImage(movie) {
        try {
            if (movie && movie.backdrop_path && Lampa.TMDB && Lampa.TMDB.image) {
                return Lampa.TMDB.image('t/p/w500' + movie.backdrop_path);
            }
            if (movie && movie.poster_path && Lampa.TMDB && Lampa.TMDB.image) {
                return Lampa.TMDB.image('t/p/w300' + movie.poster_path);
            }
        } catch (e) {}
        return '';
    }

    function extractOverviewFromFull(root) {
        var best = '';

        try {
            if (!root || !root.length) return '';

            root.find(
                '[class*="description"],' +
                '[class*="overview"],' +
                '[class*="descr"]'
            ).each(function () {
                var node = $(this);
                var text = String(node.text() || '')
                    .replace(/\s+/g, ' ')
                    .trim();

                /*
                 * Берём именно абзац описания, а не половину страницы.
                 */
                if (
                    text.length >= 60 &&
                    text.length <= 5000 &&
                    text.length > best.length
                ) {
                    best = text;
                }
            });
        } catch (e) {}

        return best;
    }

    function sourceType(source) {
        return String(
            source && source.type || ''
        ).toLowerCase();
    }

    function isWebProviderSource(source) {
        var type = sourceType(source);

        return (
            type === 'alloha' ||
            type === 'turbo'
        );
    }

    function appendUrlParams(url, params) {
        url = String(url || '').trim();

        if (!url) return '';

        try {
            var u = new URL(url, window.location.href);

            Object.keys(params || {}).forEach(function (key) {
                var value = params[key];

                if (
                    value !== undefined &&
                    value !== null &&
                    value !== ''
                ) {
                    u.searchParams.set(
                        key,
                        String(value)
                    );
                }
            });

            return u.toString();
        } catch (e) {
            return url;
        }
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
        imdb = String(imdb || '');

        if (
            imdb &&
            cache.sources[imdb]
        ) {
            ok(
                cache.sources[imdb]
            );
            return;
        }

        requestJson(
            resolverUrl(
                '/sources',
                {
                    imdb: imdb
                }
            ),
            function (response) {
                var sources =
                    response &&
                    response.sources ||
                    [];

                if (!Array.isArray(sources)) {
                    sources = [];
                }

                sources.forEach(function (s) {
                    var type =
                        String(
                            s &&
                            s.type ||
                            ''
                        ).toLowerCase();

                    /*
                     * Стабильные на этой приставке:
                     * - VeoVeo: direct HLS
                     * - Alloha: web-player
                     *
                     * Turbo iframe открывается, но не управляется пультом
                     * и самостоятельно выбирает сезон/эпизод.
                     *
                     * Collaps теперь идёт через media relay:
                     * Worker подставляет playback headers и переписывает
                     * вложенные HLS playlist/key/segment URL.
                     */
                    s.experimental =
                        type === 'turbo';

                    s.supported =
                        type === 'alloha' ||
                        type === 'collaps' ||
                        type === 'veoveo' ||
                        type === 'veo' ||
                        type.indexOf('veoveo') >= 0;

                    s.webPlayer =
                        type === 'alloha';

                    s.preferred =
                        type === 'veoveo' ||
                        type === 'veo' ||
                        type.indexOf('veoveo') >= 0;

                    s.lookupBackend =
                        response &&
                        response.backend ||
                        '';

                    s.kinopoiskId =
                        response &&
                        response.kp ||
                        '';

                    if (
                        s.kinopoiskId
                    ) {
                        cache.ids[imdb] =
                            String(
                                s.kinopoiskId
                            );
                    }
                });

                if (imdb) {
                    cache.sources[imdb] =
                        sources;
                }

                ok(sources);
            },
            fail
        );
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

    function veoVariantLabel(variant) {
        if (!variant) return 'Авто';

        var title = String(
            variant.title ||
            variant.name ||
            variant.quality ||
            ''
        ).trim();

        if (title) return title;

        var file = String(
            variant.filepath ||
            ''
        );

        var q =
            file.match(
                /(?:^|[_\/.-])(2160|1440|1080|720|480|360)p?(?:[_\/.-]|$)/i
            );

        if (q && q[1]) return q[1] + 'p';

        return 'Вариант';
    }

    function normalizeVeoVariants(item) {
        if (!item) return [];

        var variants =
            item.episodeVariants ||
            item.variants ||
            [];

        if (!Array.isArray(variants)) variants = [];

        if (!variants.length && item.filepath) {
            variants = [{
                filepath: item.filepath,
                title: item.title || ''
            }];
        }

        return variants.filter(function (v) {
            return v && v.filepath;
        });
    }

    function chooseVeoVariant(item, qualityLabel) {
        var variants =
            normalizeVeoVariants(item);

        if (!variants.length) return null;

        qualityLabel =
            String(
                qualityLabel ||
                'Авто'
            ).trim();

        if (
            qualityLabel &&
            qualityLabel !== 'Авто'
        ) {
            var wanted =
                qualityLabel.toLowerCase();

            for (var i = 0; i < variants.length; i++) {
                if (
                    veoVariantLabel(
                        variants[i]
                    ).toLowerCase() === wanted
                ) {
                    return variants[i];
                }
            }

            /*
             * На другой серии названия качества могут чуть отличаться.
             * Пробуем совпадение по 1080/720/etc.
             */
            var wantedQ =
                wanted.match(
                    /(2160|1440|1080|720|480|360)/
                );

            if (wantedQ) {
                for (
                    var q = 0;
                    q < variants.length;
                    q++
                ) {
                    if (
                        veoVariantLabel(
                            variants[q]
                        ).indexOf(
                            wantedQ[1]
                        ) >= 0
                    ) {
                        return variants[q];
                    }
                }
            }
        }

        /*
         * Авто: сохраняем поведение рабочей 3.7.0.
         * Сначала m3u8, затем первый доступный вариант.
         */
        var preferred = variants[0];

        variants.forEach(function (v) {
            if (
                String(v.filepath)
                    .toLowerCase()
                    .indexOf('.m3u8') >= 0
            ) {
                preferred = v;
            }
        });

        return preferred;
    }


    function numericQuality(label) {
        var m = String(label || '').match(/(2160|1440|1080|720|480|360)/);
        return m ? parseInt(m[1], 10) : 0;
    }

    function veoQualitySummary(item) {
        var variants = normalizeVeoVariants(item);
        var best = 0;
        var hasHls = false;

        variants.forEach(function (variant) {
            var q = numericQuality(veoVariantLabel(variant));
            if (q > best) best = q;

            if (String(variant.filepath || '').toLowerCase().indexOf('.m3u8') >= 0) {
                hasHls = true;
            }
        });

        return best ? (best + 'p') : (hasHls ? 'HLS' : '—');
    }

    function hlsAttributes(line) {
        var out = {};
        var raw = String(line || '');
        var re = /([A-Z0-9-]+)=(\"[^\"]*\"|[^,]*)/ig;
        var m;

        while ((m = re.exec(raw))) {
            var value = String(m[2] || '').trim();
            if (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
                value = value.slice(1, -1);
            }
            out[String(m[1] || '').toUpperCase()] = value;
        }

        return out;
    }

    function parseHlsMeta(manifest, manifestUrl) {
        var lines = String(manifest || '').split(/\r?\n/);
        var tracks = [];
        var qualities = [];
        var seenQ = {};

        lines.forEach(function (line) {
            line = String(line || '').trim();

            if (line.indexOf('#EXT-X-MEDIA:') === 0) {
                var a = hlsAttributes(line.slice('#EXT-X-MEDIA:'.length));
                if (String(a.TYPE || '').toUpperCase() === 'AUDIO') {
                    var language = String(a.LANGUAGE || '').trim();
                    var name = String(a.NAME || '').trim();
                    var label = name && name !== language ? name : '';

                    tracks.push({
                        index: tracks.length,
                        language: language || name || ('Дорожка ' + (tracks.length + 1)),
                        name: name || language || ('Дорожка ' + (tracks.length + 1)),
                        label: label,
                        default: String(a.DEFAULT || '').toUpperCase() === 'YES'
                    });
                }
            }

            if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
                var qattr = hlsAttributes(line.slice('#EXT-X-STREAM-INF:'.length));
                var res = String(qattr.RESOLUTION || '').match(/\d+x(\d+)/i);
                var height = res ? parseInt(res[1], 10) : 0;
                if (height && !seenQ[height]) {
                    seenQ[height] = true;
                    qualities.push(height);
                }
            }
        });

        qualities.sort(function (a, b) { return b - a; });

        return {
            tracks: tracks,
            qualities: qualities,
            bestQuality: qualities.length ? (qualities[0] + 'p') : ''
        };
    }

    function inspectHls(url, headers, ok) {
        var cacheKey = String(url || '');
        if (cache.hlsMeta[cacheKey]) {
            ok(cache.hlsMeta[cacheKey]);
            return;
        }

        function finish(manifest, plainOk) {
            var valid = String(manifest || '').trim().indexOf('#EXTM3U') === 0;
            var meta = valid ? parseHlsMeta(manifest, url) : { tracks: [], qualities: [], bestQuality: '' };
            meta.plainOk = !!plainOk && valid;
            meta.valid = valid;
            cache.hlsMeta[cacheKey] = meta;
            ok(meta);
        }

        nativeText(
            url,
            {},
            function (manifest) {
                finish(manifest, true);
            },
            function () {
                nativeText(
                    url,
                    headers || {},
                    function (manifest) { finish(manifest, false); },
                    function () { finish('', false); }
                );
            }
        );
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

    function veoContext(iframe) {
        var result = {
            origin: '',
            token: ''
        };

        try {
            var u = new URL(String(iframe || ''));
            result.origin = u.origin;

            result.token =
                u.searchParams.get('token') ||
                u.searchParams.get('access_token') ||
                '';
        } catch (e) {}

        /*
         * Некоторые iframe URL кодируют параметры внутри вложенного URL.
         * Декодируем несколько раз и ищем token вручную.
         */
        if (!result.token) {
            var raw = String(iframe || '');

            for (var i = 0; i < 3; i++) {
                var m = raw.match(
                    /[?&](?:token|access_token)=([^&#]+)/i
                );

                if (m && m[1]) {
                    try {
                        result.token =
                            decodeURIComponent(m[1]);
                    } catch (e2) {
                        result.token = m[1];
                    }

                    break;
                }

                try {
                    var decoded =
                        decodeURIComponent(raw);

                    if (decoded === raw) break;
                    raw = decoded;
                } catch (e3) {
                    break;
                }
            }
        }

        return result;
    }

    function veoMovieIdEndpoint(
        origin,
        key,
        value,
        token
    ) {
        var url =
            origin +
            '/balancer-api/iframe?' +
            encodeURIComponent(key) +
            '=' +
            encodeURIComponent(value);

        if (token) {
            url +=
                '&token=' +
                encodeURIComponent(token);
        }

        return url;
    }

    function fetchVeoMovieId(url, ok, fail) {
        nativeText(
            url,
            veoHeaders(url),
            function (html) {
                /*
                 * Lampac: window.MOVIE_ID=([0-9]+);
                 * Оставляем более терпимый regexp на случай пробелов.
                 */
                var movieId =
                    veoMovieIdFromHtml(
                        html,
                        url
                    );

                if (!movieId) {
                    fail(new Error(
                        'MOVIE_ID не найден'
                    ));
                    return;
                }

                ok(movieId);
            },
            fail
        );
    }

    function resolveVeoMovieId(
        source,
        imdb,
        ok,
        fail
    ) {
        var iframe =
            normalizeDirectUrl(
                source &&
                source.iframeUrl
            );

        if (!iframe) {
            fail(
                new Error(
                    'VeoVeo: iframeUrl не получен'
                )
            );
            return;
        }

        var ctx =
            veoContext(iframe);

        if (!ctx.origin) {
            fail(
                new Error(
                    'VeoVeo: host не определён'
                )
            );
            return;
        }

        var cacheKey =
            String(imdb || '') +
            '|' +
            ctx.origin +
            '|' +
            String(ctx.token || '');

        if (
            cache.veoMovieId[cacheKey]
        ) {
            ok(
                cache.veoMovieId[cacheKey]
            );
            return;
        }

        var attempts = [];

        function done(result) {
            cache.veoMovieId[cacheKey] =
                result;

            if (
                result &&
                result.kp &&
                imdb
            ) {
                cache.ids[String(imdb)] =
                    String(result.kp);
            }

            ok(result);
        }

        function tryOriginal() {
            nativeText(
                iframe,
                veoHeaders(iframe),
                function (html) {
                    var id =
                        veoMovieIdFromHtml(
                            html,
                            iframe
                        );

                    if (id) {
                        done({
                            movieId: id,
                            origin: ctx.origin,
                            token: ctx.token,
                            method: 'MnogoTV iframe'
                        });
                    }
                    else {
                        attempts.push(
                            'original: MOVIE_ID не найден'
                        );

                        fail(
                            new Error(
                                'VeoVeo: ' +
                                attempts.join(' | ')
                            )
                        );
                    }
                },
                function (e) {
                    attempts.push(
                        'original: ' +
                        errText(e)
                    );

                    fail(
                        new Error(
                            'VeoVeo: ' +
                            attempts.join(' | ')
                        )
                    );
                }
            );
        }

        function tryImdb() {
            if (!imdb) {
                tryOriginal();
                return;
            }

            var url =
                veoMovieIdEndpoint(
                    ctx.origin,
                    'imdb',
                    imdb,
                    ctx.token
                );

            fetchVeoMovieId(
                url,
                function (id) {
                    done({
                        movieId: id,
                        origin: ctx.origin,
                        token: ctx.token,
                        method: 'imdb'
                    });
                },
                function (e) {
                    attempts.push(
                        'imdb: ' +
                        errText(e)
                    );

                    tryOriginal();
                }
            );
        }

        function tryKp(kp) {
            kp =
                String(
                    kp ||
                    ''
                );

            if (!kp) {
                attempts.push(
                    'kp: ID не найден'
                );

                tryImdb();
                return;
            }

            var url =
                veoMovieIdEndpoint(
                    ctx.origin,
                    'kp',
                    kp,
                    ctx.token
                );

            fetchVeoMovieId(
                url,
                function (id) {
                    done({
                        movieId: id,
                        origin: ctx.origin,
                        token: ctx.token,
                        kp: kp,
                        method: 'kp'
                    });
                },
                function (e) {
                    attempts.push(
                        'kp: ' +
                        errText(e)
                    );

                    tryImdb();
                }
            );
        }

        /*
         * v3.17 уже получил KP внутри /sources.
         * Не спрашиваем /ids повторно при каждом первом запуске VeoVeo.
         */
        var knownKp =
            String(
                source &&
                source.kinopoiskId ||
                (
                    imdb &&
                    cache.ids[String(imdb)]
                ) ||
                ''
            );

        if (knownKp) {
            tryKp(knownKp);
            return;
        }

        getKpId(
            imdb,
            tryKp
        );
    }


    function veoCatalogKey(source, imdb) {
        return String(imdb || '') + '|' + String(source && source.iframeUrl || '');
    }

    function getVeoCatalog(source, imdb, ok, fail) {
        var key = veoCatalogKey(source, imdb);

        if (cache.veoCatalog[key]) {
            ok(cache.veoCatalog[key]);
            return;
        }

        resolveVeoMovieId(
            source,
            imdb,
            function (resolvedId) {
                var movieId = resolvedId.movieId;
                var origin = resolvedId.origin;
                var token = resolvedId.token;

                var catalogUrl =
                    origin +
                    '/balancer-api/proxy/' +
                    'playlists/catalog-api/' +
                    'episodes?content-id=' +
                    encodeURIComponent(movieId);

                if (token) {
                    catalogUrl += '&token=' + encodeURIComponent(token);
                }

                nativeJson(
                    catalogUrl,
                    veoHeaders(catalogUrl),
                    function (catalog) {
                        var result = {
                            catalog: Array.isArray(catalog) ? catalog : [],
                            resolvedId: resolvedId
                        };
                        cache.veoCatalog[key] = result;
                        ok(result);
                    },
                    function (e) {
                        fail(new Error('VeoVeo catalog: ' + errText(e)));
                    }
                );
            },
            fail
        );
    }

    function fetchVeoEpisodeItem(
        source,
        imdb,
        season,
        episode,
        ok,
        fail
    ) {
        getVeoCatalog(
            source,
            imdb,
            function (result) {
                var item = chooseVeoCatalogItem(
                    result.catalog,
                    season,
                    episode
                );

                if (!item) {
                    fail(new Error('VeoVeo: серия не найдена'));
                    return;
                }

                ok({
                    item: item,
                    resolvedId: result.resolvedId,
                    catalog: result.catalog
                });
            },
            fail
        );
    }

    function getVeoQualityOptions(
        source,
        imdb,
        season,
        episode,
        ok,
        fail
    ) {
        fetchVeoEpisodeItem(
            source,
            imdb,
            season,
            episode,
            function (result) {
                var variants =
                    normalizeVeoVariants(
                        result.item
                    );

                var seen = {};
                var options = [];

                variants.forEach(function (variant) {
                    var label =
                        veoVariantLabel(
                            variant
                        );

                    if (!label || seen[label]) return;

                    seen[label] = true;
                    options.push({
                        label: label,
                        variant: variant
                    });
                });

                ok(options);
            },
            fail
        );
    }

    function resolveVeoVeo(
        source,
        imdb,
        season,
        episode,
        qualityLabel,
        ok,
        fail
    ) {
        fetchVeoEpisodeItem(
            source,
            imdb,
            season,
            episode,
            function (result) {
                var item =
                    result.item;

                var resolvedId =
                    result.resolvedId;

                var variant =
                    chooseVeoVariant(
                        item,
                        qualityLabel
                    );

                if (
                    !variant ||
                    !variant.filepath
                ) {
                    fail(new Error(
                        'VeoVeo: filepath не найден'
                    ));
                    return;
                }

                var selectedQuality =
                    veoVariantLabel(
                        variant
                    );

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

                    var streamHeaders = veoHeaders(stream);

                    inspectHls(
                        stream,
                        streamHeaders,
                        function (probe) {
                            ok({
                                provider: 'VeoVeo',
                                directUrl: stream,
                                directHeaders:
                                    probe.plainOk
                                        ? {}
                                        : streamHeaders,
                                relayUrl: '',
                                relayReady: false,
                                externalDirect: probe.plainOk,
                                subtitles: [],
                                tracks: probe.tracks || [],
                                hlsQualities: probe.qualities || [],
                                quality:
                                    numericQuality(selectedQuality)
                                        ? selectedQuality
                                        : (probe.bestQuality || selectedQuality),
                                resolvedBy:
                                    'VeoVeo ' +
                                    resolvedId.method +
                                    ' → ' +
                                    resolvedId.movieId
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
            fail
        );
    }


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

    function collapsEmbedText(attempt, ok, fail) {
        /*
         * Актуальный online_mod в режиме встроенного Lampa
         * использует network.silent и пустые playback headers.
         *
         * Если конкретная сборка Lampa не даёт silent для этого
         * домена, оставляем native fallback только для получения
         * makePlayer-конфига.
         */
        silentText(
            attempt.url,
            {},
            ok,
            function (silentError) {
                nativeText(
                    attempt.url,
                    attempt.headers || {},
                    ok,
                    function (nativeError) {
                        fail(
                            nativeError ||
                            silentError
                        );
                    }
                );
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
         * Android: сначала повторяем ТЕКУЩИЙ штатный Collaps-провайдер
         * Lampa, который использует api.delivembd.ws/embed/kp/<id>.
         * На остальных платформах не меняем уже рабочий порядок.
         */
        var androidPlatform = false;
        try {
            androidPlatform = Boolean(
                Lampa.Platform &&
                Lampa.Platform.is &&
                Lampa.Platform.is('android')
            );
        } catch (e) {}

        if (androidPlatform && kp) {
            add(
                'https://api.delivembd.ws/embed/kp/' + encodeURIComponent(kp),
                'delivembd kp'
            );
        }

        /*
         * Наши проверенные fallback:
         * 1) ortified по KP
         * 2) kinogram по KP
         * 3) fallback по IMDb
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

            collapsEmbedText(
                attempt,
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

        function shortRelayText(value) {
            value = String(value || '')
                .replace(/\s+/g, ' ')
                .trim();
            if (value.length > 90) value = value.slice(0, 90) + '…';
            return value;
        }

        nativeText(relay, {}, function (manifest) {
            var ready = looksLikeManifest(manifest);
            var relayError = '';

            if (!ready) {
                relayError = 'not-m3u8: ' + (shortRelayText(manifest) || 'empty response');
            }

            log('Collaps relay probe', {
                ready: ready,
                relay: relay,
                response: ready ? '#EXTM3U' : shortRelayText(manifest)
            });

            ok({
                directUrl: rawStream,
                directHeaders: directHeaders,
                relayUrl: ready ? relay : '',
                relayReady: ready,
                relayError: relayError
            });
        }, function (relayFailure) {
            var relayError = errText(relayFailure);

            log('Collaps relay probe failed', {
                relay: relay,
                error: relayError
            });

            ok({
                directUrl: rawStream,
                directHeaders: directHeaders,
                relayUrl: '',
                relayReady: false,
                relayError: relayError
            });
        });
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

                        var stream =
                            item.hls ||
                            (
                                item.source &&
                                item.source.hls
                            ) ||
                            '';

                        if (
                            !stream &&
                            season === null &&
                            cfg.source
                        ) {
                            stream =
                                cfg.source.hls ||
                                '';

                            item =
                                cfg.source;
                        }

                        stream =
                            normalizeDirectUrl(
                                stream
                            );

                        if (!stream) {
                            fail(
                                new Error(
                                    'Collaps: HLS не найден'
                                )
                            );
                            return;
                        }

                        /*
                         * Android v3.19.2: точечно повторяем поведение
                         * текущего штатного Collaps-провайдера Lampa:
                         *   - прямой HLS из makePlayer
                         *   - НЕ добавляем &vp
                         *   - НЕ добавляем playback headers
                         *   - НЕ гоняем media через Cloudflare
                         *
                         * Диагностика v3.19.1 показала HTTP 424 именно на
                         * Cloudflare -> media CDN, поэтому этот тест должен
                         * отделить проблему CDN/relay от Android HLS-плеера.
                         */
                        var androidPlatform = false;
                        try {
                            androidPlatform = Boolean(
                                Lampa.Platform &&
                                Lampa.Platform.is &&
                                Lampa.Platform.is('android')
                            );
                        } catch (eAndroid) {}

                        if (androidPlatform) {
                            ok({
                                provider: 'Collaps',
                                directUrl: stream,
                                directHeaders: {},
                                relayUrl: '',
                                relayReady: false,
                                externalDirect: false,
                                subtitles:
                                    normalizeSubs(
                                        item.cc ||
                                        item.subtitles ||
                                        []
                                    ),
                                tracks:
                                    normalizeTracks(
                                        item.audio ||
                                        {}
                                    ),
                                quality: '360p–720p',
                                resolvedBy:
                                    response.label +
                                    (
                                        kp
                                            ? (' • KP ' + kp)
                                            : ''
                                    ) +
                                    ' • android upstream-direct'
                            });
                            return;
                        }

                        /*
                         * Не-Android оставляем как было, чтобы не сломать
                         * подтверждённо рабочий Collaps на LG webOS.
                         */
                        if (
                            stream.indexOf('&vp') === -1
                        ) {
                            stream += '&vp';
                        }

                        /*
                         * Collaps direct HLS на части Android TV / Lampa
                         * падает с manifestLoadError: CDN ждёт корректные
                         * Origin/Referer/User-Agent, а вложенные playlist,
                         * key и segment URL тоже должны идти с ними.
                         *
                         * Поэтому сначала проверяем media relay. Если Worker
                         * вернул валидный #EXTM3U, встроенный и внешний плеер
                         * получают уже relay URL. Если relay недоступен,
                         * оставляем direct fallback с headers.
                         */
                        preparePlayableStream(
                            stream,
                            response,
                            function (playable) {
                                var viaRelay =
                                    playable &&
                                    playable.relayReady &&
                                    playable.relayUrl;

                                ok({
                                    provider: 'Collaps',
                                    directUrl:
                                        viaRelay
                                            ? playable.relayUrl
                                            : stream,
                                    directHeaders:
                                        viaRelay
                                            ? {}
                                            : (
                                                playable.directHeaders ||
                                                response.headers ||
                                                collapsHeadersFor(response.url)
                                            ),
                                    relayUrl:
                                        viaRelay
                                            ? playable.relayUrl
                                            : '',
                                    relayReady:
                                        Boolean(viaRelay),
                                    externalDirect: false,
                                    subtitles:
                                        normalizeSubs(
                                            item.cc ||
                                            item.subtitles ||
                                            []
                                        ),
                                    tracks:
                                        normalizeTracks(
                                            item.audio ||
                                            {}
                                        ),
                                    quality:
                                        '360p–720p',
                                    resolvedBy:
                                        response.label +
                                        (
                                            kp
                                                ? (' • KP ' + kp)
                                                : ''
                                        ) +
                                        (
                                            viaRelay
                                                ? ' • relay'
                                                : (
                                                    ' • direct fallback' +
                                                    (
                                                        playable && playable.relayError
                                                            ? (' [' + playable.relayError + ']')
                                                            : ''
                                                    )
                                                )
                                        )
                                });
                            }
                        );
                    },
                    fail
                );
            }
        );
    }


    function resolveSource(source, imdb, season, episode, qualityLabel, ok, fail) {
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
                imdb,
                season,
                episode,
                qualityLabel,
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

    function playResolved(movie, season, episode, epMeta, source, resolved, runas, voiceChoice) {
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

        /*
         * Во встроенном Lampa-плеере пробуем заранее выбрать HLS-аудиотрек.
         * На сборках, где PlayerVideo не экспортирован глобально, это просто
         * безопасно пропускается — сам плеер всё равно покажет выбор дорожек.
         */
        if (!useExternal) {
            try {
                if (Lampa.PlayerVideo) {
                    if (
                        voiceChoice &&
                        voiceChoice.index >= 0 &&
                        typeof Lampa.PlayerVideo.setParams === 'function'
                    ) {
                        Lampa.PlayerVideo.setParams({ track: voiceChoice.index });
                    }
                    else if (
                        typeof Lampa.PlayerVideo.clearParamas === 'function'
                    ) {
                        Lampa.PlayerVideo.clearParamas();
                    }
                }
            } catch (e0) {}
        }

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
        if (document.getElementById('mnogotv-v318-style')) return;
        var css = `
        .mnogotv-v318{
            width:100%;
            height:100%;
            box-sizing:border-box;
            padding:.28em 1.05em .62em .7em;
            overflow:hidden;
            font-size:1.08em;
        }

        .mnogotv-v318__layout{
            display:grid;
            grid-template-columns:18.8em minmax(0,1fr);
            grid-template-areas:"info content";
            align-items:stretch;
            width:100%;
            height:100%;
            min-height:0;
            gap:1.35em;
            padding-right:4.7em;
            box-sizing:border-box;
        }

        .mnogotv-v318__info{
            grid-area:info;
            min-width:0;
            box-sizing:border-box;
            padding:.55em .35em .45em .08em;
            overflow:hidden;
            display:flex;
            flex-direction:column;
        }


        .mnogotv-v318__info-inner{
            min-width:0;
            min-height:0;
            height:100%;
            display:flex;
            flex-direction:column;
            overflow:hidden;
        }

        .mnogotv-v318__content{
            grid-area:content;
            min-width:0;
            min-height:0;
            height:100%;
            display:flex;
            flex-direction:column;
            overflow:hidden;
            max-width:62em;
        }

        .mnogotv-v318__info-top{
            display:flex;
            gap:.9em;
            align-items:flex-start;
            margin-bottom:.68em;
        }

        .mnogotv-v318__poster{
            width:7.15em;
            height:10.72em;
            flex:0 0 7.15em;
            border-radius:.34em;
            overflow:hidden;
            background:rgba(255,255,255,.08);
        }

        .mnogotv-v318__poster img{
            display:block;
            width:100%;
            height:100%;
            object-fit:cover;
        }

        .mnogotv-v318__info-mini{
            min-width:0;
            padding-top:.12em;
            font-size:.98em;
            line-height:1.45;
            opacity:.98;
        }

        .mnogotv-v318__info-rate{
            font-size:1.6em;
            line-height:1;
            font-weight:760;
            margin:.5em 0 .55em;
        }

        .mnogotv-v318__info-age{
            display:inline-block;
            padding:.12em .38em;
            border:.1em solid rgba(255,255,255,.88);
            border-radius:.14em;
            font-size:.8em;
            font-weight:700;
        }

        .mnogotv-v318__info-title{
            font-size:1.82em;
            line-height:1.08;
            font-weight:760;
            margin:.3em 0 .34em;
        }

        .mnogotv-v318__info-genres{
            font-size:.94em;
            line-height:1.4;
            opacity:.96;
            margin-bottom:.8em;
        }

        .mnogotv-v318__info-overview{
            display:-webkit-box;
            -webkit-box-orient:vertical;
            -webkit-line-clamp:17;
            overflow:hidden;
            font-size:.99em;
            line-height:1.42;
            opacity:.98;
            padding-right:.2em;
        }

        .mnogotv-v318__info-overview--empty{
            opacity:.62;
            font-style:italic;
        }


        .mnogotv-v318__provider-layer{
            position:fixed;
            inset:0;
            z-index:999999;
            background:#000;
            display:flex;
            flex-direction:column;
        }

        .mnogotv-v318__provider-frame{
            width:100%;
            height:100%;
            flex:1 1 auto;
            border:0;
            background:#000;
        }

        .mnogotv-v318__provider-hint{
            position:absolute;
            left:1.1em;
            top:.75em;
            z-index:2;
            padding:.32em .58em;
            border-radius:.32em;
            background:rgba(0,0,0,.62);
            font-size:.82em;
            opacity:.72;
            pointer-events:none;
        }

        .mnogotv-v318__top{
            flex:0 0 auto;
            padding:.08em .12em .32em;
        }

        .mnogotv-v318__toolbar{
            display:flex;
            gap:.58em;
            align-items:center;
            flex-wrap:nowrap;
            margin:.04em 0 .48em;
        }

        .mnogotv-v318__pill,
        .mnogotv-v318__title-chip{
            min-width:7.8em;
            max-width:11.5em;
            padding:.48em .68em;
            border-radius:.52em;
            background:rgba(0,0,0,.25);
            box-sizing:border-box;
        }

        .mnogotv-v318__title-chip{
            display:none;
        }

        .mnogotv-v318__pill-title{
            display:block;
            font-size:.76em;
            font-weight:700;
            opacity:.96;
            margin-bottom:.03em;
        }

        .mnogotv-v318__pill-value{
            display:block;
            font-size:.94em;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
        }

        .mnogotv-v318__pill.focus{
            box-shadow:0 0 0 .13em #fff;
            background:rgba(255,255,255,.13);
        }

        /* В референсе отдельной служебной полосы над сериями нет. */
        .mnogotv-v318__headline{
            display:none;
        }

        .mnogotv-v318__status{
            opacity:.92;
            margin:.14em 0 .08em .08em;
            font-size:.84em;
        }

        .mnogotv-v318__status:empty{ display:none; }

        .mnogotv-v318__scroll{
            flex:1 1 auto;
            min-height:0;
            height:100%;
            overflow:hidden;
        }

        .mnogotv-v318__list{
            padding:.08em .08em .6em 0;
            box-sizing:border-box;
        }

        .mnogotv-v318__episode{
            display:flex;
            align-items:center;
            gap:.95em;
            width:100%;
            box-sizing:border-box;
            min-height:7em;
            padding:.42em .72em .46em .34em;
            margin:.13em 0;
            border:.13em solid transparent;
            border-radius:.38em;
            position:relative;
            background:rgba(0,0,0,.035);
        }

        .mnogotv-v318__episode.focus{
            border-color:#fff;
            background:rgba(255,255,255,.095);
            box-shadow:0 0 .05em rgba(255,255,255,.65);
        }

        .mnogotv-v318__thumb{
            position:relative;
            width:11.25em;
            height:6.32em;
            flex:0 0 11.25em;
            border-radius:.31em;
            overflow:hidden;
            background:rgba(255,255,255,.08);
        }

        .mnogotv-v318__thumb img{
            width:100%;
            height:100%;
            object-fit:cover;
            display:block;
        }

        .mnogotv-v318__num{
            position:absolute;
            left:.38em;
            bottom:.23em;
            font-size:1.58em;
            font-weight:780;
            line-height:1;
            color:#fff;
            text-shadow:0 .07em .15em #000,0 0 .22em #000;
        }

        .mnogotv-v318__body{
            flex:1;
            min-width:0;
            padding-right:.12em;
        }

        .mnogotv-v318__title-row{
            display:flex;
            align-items:center;
            gap:.8em;
            min-width:0;
        }

        .mnogotv-v318__title{
            flex:1 1 auto;
            min-width:0;
            font-size:1.48em;
            line-height:1.13;
            font-weight:590;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
        }

        .mnogotv-v318__duration{
            flex:0 0 auto;
            font-size:.83em;
            opacity:.98;
            font-weight:670;
            padding-left:.35em;
        }

        .mnogotv-v318__line{
            height:.075em;
            width:100%;
            background:rgba(255,255,255,.86);
            margin:.28em 0 .36em;
            border-radius:1em;
        }

        .mnogotv-v318__meta{
            opacity:.98;
            font-size:.94em;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
        }

        .mnogotv-v318__quality{
            font-weight:720;
            opacity:1;
        }

        .mnogotv-v318__empty{
            padding:1.6em 0;
            opacity:.82;
            font-size:1.05em;
        }

        @media(max-width:1200px){
            .mnogotv-v318__layout{
                grid-template-columns:17em minmax(0,1fr);
                gap:1em;
                padding-right:2.7em;
            }
            .mnogotv-v318__content{ max-width:none; }
            .mnogotv-v318__poster{
                width:6.5em;
                height:9.75em;
                flex-basis:6.5em;
            }
            .mnogotv-v318__info-title{ font-size:1.62em; }
            .mnogotv-v318__info-overview{ font-size:.9em; }
            .mnogotv-v318__thumb{
                width:10em;
                height:5.63em;
                flex-basis:10em;
            }
            .mnogotv-v318__title{ font-size:1.32em; }
            .mnogotv-v318__meta{ font-size:.86em; }
        }

        @media(max-width:900px){
            .mnogotv-v318{
                padding:.2em .42em .45em;
                font-size:1em;
            }
            .mnogotv-v318__layout{
                grid-template-columns:14.6em minmax(0,1fr);
                gap:.72em;
                padding-right:.8em;
            }
            .mnogotv-v318__poster{
                width:5.4em;
                height:8.1em;
                flex-basis:5.4em;
            }
            .mnogotv-v318__info-mini{ font-size:.82em; }
            .mnogotv-v318__info-title{ font-size:1.38em; }
            .mnogotv-v318__info-genres{ font-size:.78em; }
            .mnogotv-v318__info-overview{
                font-size:.76em;
                -webkit-line-clamp:15;
            }
            .mnogotv-v318__toolbar{ gap:.36em; }
            .mnogotv-v318__pill{
                min-width:6.3em;
                max-width:8.3em;
                padding:.35em .45em;
            }
            .mnogotv-v318__pill-title{ font-size:.62em; }
            .mnogotv-v318__pill-value{ font-size:.75em; }
            .mnogotv-v318__episode{
                min-height:5.4em;
                gap:.6em;
                padding:.31em .46em .34em .28em;
            }
            .mnogotv-v318__thumb{
                width:8.25em;
                height:4.64em;
                flex-basis:8.25em;
            }
            .mnogotv-v318__num{ font-size:1.24em; }
            .mnogotv-v318__title{ font-size:1.08em; }
            .mnogotv-v318__duration{ font-size:.65em; }
            .mnogotv-v318__meta{ font-size:.7em; }
        }
`;
        var style = document.createElement('style');
        style.id = 'mnogotv-v318-style';
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

        // "Авто" сохраняет рабочее поведение VeoVeo.
        var qualityLabel = 'Авто';
        var voiceChoice = { index: -1, label: 'Авто', translationId: '', iframeUrl: '', quality: '' };
        var playerMode = 'lampa';

        try {
            var storedPlayer = String(Lampa.Storage.get('mnogotv_player_mode') || '').trim();
            if (storedPlayer === 'auto' || storedPlayer === 'android' || storedPlayer === 'lampa') {
                playerMode = storedPlayer;
            }
        } catch (ePlayer) {}

        var root = $('<div class="mnogotv-v318"></div>');
        var layout = $('<div class="mnogotv-v318__layout"></div>');
        var infoPanel = $('<aside class="mnogotv-v318__info"></aside>');
        var contentPanel = $('<section class="mnogotv-v318__content"></section>');
        var topPanel = $('<div class="mnogotv-v318__top"></div>');
        var toolbar = $('<div class="mnogotv-v318__toolbar"></div>');
        var headline = $('<div class="mnogotv-v318__headline"><span class="icon-play">▶</span><span class="mnogotv-v318__headline-text"></span></div>');
        var status = $('<div class="mnogotv-v318__status"></div>');
        var sourceButton = $('<div class="mnogotv-v318__pill selector"><span class="mnogotv-v318__pill-title">Источник</span><span class="mnogotv-v318__pill-value">Загрузка…</span></div>');
        var seasonButton = $('<div class="mnogotv-v318__pill selector"><span class="mnogotv-v318__pill-title">Фильтр</span><span class="mnogotv-v318__pill-value">Сезон 1</span></div>');
        var titleChip = $('<div class="mnogotv-v318__title-chip"><span class="mnogotv-v318__title-chip-icon">⌕</span><span class="mnogotv-v318__title-chip-text"></span></div>');
        var voiceButton = $('<div class="mnogotv-v318__pill selector"><span class="mnogotv-v318__pill-title">Озвучка</span><span class="mnogotv-v318__pill-value">Авто</span></div>');
        var playerButton = $('<div class="mnogotv-v318__pill selector"><span class="mnogotv-v318__pill-title">Плеер</span><span class="mnogotv-v318__pill-value">Lampa</span></div>');
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var resizeHandler = null;
        var providerLayer = null;
        var providerFrame = null;

        function genreText() {
            var names = [];
            var genres = movie && movie.genres;

            if (Array.isArray(genres)) {
                genres.forEach(function (g) {
                    if (g && g.name) names.push(g.name);
                });
            }

            return names.join(', ');
        }

        function enrichMovieDetails(done) {
            var id = tmdbId(movie);

            if (!id) {
                if (done) done();
                return;
            }

            var path =
                (isSeries(movie) ? 'tv/' : 'movie/') +
                id;

            function finish() {
                renderInfoPanel();
                if (done) done();
            }

            function translationsFallback() {
                var current =
                    String(
                        movie &&
                        (
                            movie.overview ||
                            movie.__mnogotv_overview
                        ) ||
                        ''
                    ).trim();

                if (current) {
                    finish();
                    return;
                }

                try {
                    Lampa.Api.sources.tmdb.get(
                        path + '/translations',
                        {},
                        function (data) {
                            var list =
                                data &&
                                data.translations ||
                                [];

                            var picked = null;

                            if (Array.isArray(list)) {
                                /*
                                 * Сначала русский, затем английский,
                                 * затем любое непустое описание.
                                 */
                                ['ru', 'en'].some(function (lang) {
                                    return list.some(function (tr) {
                                        var overview =
                                            tr &&
                                            tr.data &&
                                            String(
                                                tr.data.overview ||
                                                ''
                                            ).trim();

                                        if (
                                            tr &&
                                            tr.iso_639_1 === lang &&
                                            overview
                                        ) {
                                            picked = overview;
                                            return true;
                                        }

                                        return false;
                                    });
                                });

                                if (!picked) {
                                    list.some(function (tr) {
                                        var overview =
                                            tr &&
                                            tr.data &&
                                            String(
                                                tr.data.overview ||
                                                ''
                                            ).trim();

                                        if (overview) {
                                            picked = overview;
                                            return true;
                                        }

                                        return false;
                                    });
                                }
                            }

                            if (picked) {
                                movie.overview = picked;
                            }

                            finish();
                        },
                        finish
                    );
                } catch (e) {
                    finish();
                }
            }

            try {
                Lampa.Api.sources.tmdb.get(
                    path,
                    {},
                    function (details) {
                        details = details || {};

                        [
                            'overview',
                            'genres',
                            'production_countries',
                            'origin_country',
                            'vote_average',
                            'poster_path',
                            'backdrop_path',
                            'runtime',
                            'episode_run_time',
                            'release_date',
                            'first_air_date',
                            'adult',
                            'title',
                            'name',
                            'original_title',
                            'original_name'
                        ].forEach(function (key) {
                            if (
                                details[key] !== undefined &&
                                details[key] !== null &&
                                details[key] !== ''
                            ) {
                                movie[key] = details[key];
                            }
                        });

                        translationsFallback();
                    },
                    translationsFallback
                );
            } catch (e) {
                translationsFallback();
            }
        }


        function renderInfoPanel() {
            var year = String(
                movie &&
                (movie.release_date || movie.first_air_date) ||
                ''
            ).slice(0, 4);

            var country = '';
            try {
                if (
                    Array.isArray(movie.origin_country) &&
                    movie.origin_country.length
                ) {
                    country = movie.origin_country[0];
                }
                else if (
                    Array.isArray(movie.production_countries) &&
                    movie.production_countries.length
                ) {
                    country =
                        movie.production_countries[0].name ||
                        movie.production_countries[0].iso_3166_1 ||
                        '';
                }
            } catch (e) {}

            var poster = '';
            try {
                if (
                    movie.poster_path &&
                    Lampa.TMDB &&
                    Lampa.TMDB.image
                ) {
                    poster =
                        Lampa.TMDB.image(
                            't/p/w300' +
                            movie.poster_path
                        );
                }
            } catch (e2) {}

            /*
             * В 3.14/3.15 было несколько top-level элементов:
             * $( '<div>...</div><div class="title">...</div>...' )
             * После этого html.find('.title') НЕ находил сам top-level
             * .title. Постер жил, а title/genres/overview оставались пустыми.
             *
             * Один root-wrapper закрывает этот замечательный JS-капкан.
             */
            var html = $(
                '<div class="mnogotv-v318__info-inner">' +
                    '<div class="mnogotv-v318__info-top">' +
                        '<div class="mnogotv-v318__poster"><img></div>' +
                        '<div class="mnogotv-v318__info-mini">' +
                            '<div class="mnogotv-v318__info-year"></div>' +
                            '<div class="mnogotv-v318__info-rate"></div>' +
                            '<div class="mnogotv-v318__info-age"></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="mnogotv-v318__info-title"></div>' +
                    '<div class="mnogotv-v318__info-genres"></div>' +
                    '<div class="mnogotv-v318__info-overview"></div>' +
                '</div>'
            );

            if (poster) {
                html.find(
                    '.mnogotv-v318__poster img'
                ).attr(
                    'src',
                    poster
                );
            }
            else {
                html.find(
                    '.mnogotv-v318__poster'
                ).hide();
            }

            html.find(
                '.mnogotv-v318__info-year'
            ).text(
                [year, country]
                    .filter(Boolean)
                    .join(' • ')
            );

            html.find(
                '.mnogotv-v318__info-rate'
            ).text(
                '★ ' +
                (
                    movie &&
                    movie.vote_average
                        ? parseFloat(
                            movie.vote_average
                        ).toFixed(1)
                        : '—'
                )
            );

            var ageText =
                movie &&
                movie.adult
                    ? '18+'
                    : '';

            var ageNode =
                html.find(
                    '.mnogotv-v318__info-age'
                );

            if (ageText) {
                ageNode.text(ageText);
            }
            else {
                ageNode.hide();
            }

            html.find(
                '.mnogotv-v318__info-title'
            ).text(
                titleOf(movie)
            );

            var genres =
                genreText();

            html.find(
                '.mnogotv-v318__info-genres'
            ).text(
                genres
            );

            var overview = String(
                movie &&
                (
                    movie.overview ||
                    movie.__mnogotv_overview
                ) ||
                ''
            )
                .replace(/\s+/g, ' ')
                .trim();

            var overviewNode =
                html.find(
                    '.mnogotv-v318__info-overview'
                );

            if (overview) {
                overviewNode
                    .removeClass(
                        'mnogotv-v318__info-overview--empty'
                    )
                    .text(overview);
            }
            else {
                overviewNode
                    .addClass(
                        'mnogotv-v318__info-overview--empty'
                    )
                    .text(
                        'Описание отсутствует'
                    );
            }

            infoPanel
                .empty()
                .append(html);

            titleChip
                .find(
                    '.mnogotv-v318__title-chip-text'
                )
                .text(
                    titleOf(movie)
                );
        }


        function updateScrollSpace() {
            try {
                scroll.minus(topPanel);
            } catch (e) {}
        }

        function focusInside(target) {
            try {
                if (target) {
                    last = target;
                    Lampa.Controller.collectionSet(root);
                    Lampa.Controller.collectionFocus(target, root);
                }
            } catch (e) {}
        }

        function updateHeadline(ep) {
            var parts = [];
            parts.push(source ? (source.name || source.type || 'Источник') : 'MnogoTV');
            if (isSeries(movie)) parts.push('Сезон ' + season);
            if (ep && ep.episode_number) parts.push('Серия ' + ep.episode_number);
            if (ep && ep.name) parts.push(ep.name);
            headline.find('.mnogotv-v318__headline-text').text(parts.join('  •  '));
        }

        function setSourceLabel() {
            var value =
                source
                    ? (source.name || source.type || 'Источник')
                    : 'Нет';

            var type =
                String(
                    source && source.type || ''
                ).toLowerCase();

            if (
                source &&
                (
                    type === 'veoveo' ||
                    type === 'veo' ||
                    type.indexOf('veoveo') >= 0
                )
            ) {
                value += ' • ' + qualityLabel;
            }
            else if (
                source &&
                (
                    type === 'alloha' ||
                    type === 'turbo'
                )
            ) {
                value += ' • web';
            }
            else if (
                source &&
                type === 'collaps'
            ) {
                value += ' • Lampa';
            }

            sourceButton
                .find('.mnogotv-v318__pill-value')
                .text(value);

            updateHeadline(
                currentFocus ||
                episodes[0] ||
                null
            );
        }

        function setSeasonLabel() {
            seasonButton.find('.mnogotv-v318__pill-value').text('Сезон ' + season);
            updateHeadline(currentFocus || episodes[0] || null);
        }


        function setVoiceLabel() {
            voiceButton.find('.mnogotv-v318__pill-value').text(
                voiceChoice && voiceChoice.label ? voiceChoice.label : 'Авто'
            );
        }

        function setPlayerLabel() {
            var names = {
                lampa: 'Lampa',
                android: 'Android',
                auto: 'Авто'
            };
            playerButton.find('.mnogotv-v318__pill-value').text(names[playerMode] || 'Lampa');
        }

        function resetVoice() {
            voiceChoice = {
                index: -1,
                label: 'Авто',
                translationId: '',
                iframeUrl: '',
                quality: ''
            };
            setVoiceLabel();
        }

        function trackTitle(track, index) {
            track = track || {};
            var parts = [];
            var language = String(track.language || track.name || '').trim();
            var label = String(track.label || '').trim();

            if (language) parts.push(language);
            if (label && label !== language) parts.push(label);
            if (!parts.length) parts.push('Дорожка ' + (index + 1));

            return parts.join(' / ');
        }

        function choosePlayer() {
            var items = [
                { title: 'Встроенный Lampa', mode: 'lampa', selected: playerMode === 'lampa' },
                { title: 'Android / внешний', mode: 'android', selected: playerMode === 'android' },
                { title: 'Авто', mode: 'auto', selected: playerMode === 'auto' },
                { title: '← Назад', goBack: true }
            ];

            Lampa.Select.show({
                title: 'MnogoTV — плеер',
                items: items,
                onBack: function () { Lampa.Controller.toggle('content'); },
                onSelect: function (item) {
                    if (item.goBack) {
                        Lampa.Controller.toggle('content');
                        return;
                    }

                    playerMode = item.mode || 'lampa';
                    try { Lampa.Storage.set('mnogotv_player_mode', playerMode); } catch (e) {}
                    setPlayerLabel();
                    Lampa.Controller.toggle('content');
                }
            });
        }

        function chooseVoice() {
            if (!source) {
                notify('MnogoTV: источник не выбран');
                return;
            }

            if (isWebProviderSource(source)) {
                var translations =
                    Array.isArray(source.translations)
                        ? source.translations
                        : [];

                var items = [{
                    title: 'Авто',
                    translationId: '',
                    iframeUrl: '',
                    quality: '',
                    label: 'Авто',
                    selected:
                        !voiceChoice.translationId &&
                        voiceChoice.label === 'Авто'
                }];

                translations.forEach(function (tr) {
                    if (!tr) return;

                    var name =
                        String(
                            tr.name ||
                            tr.title ||
                            ('Озвучка ' + tr.id)
                        ).trim();

                    var quality =
                        String(
                            tr.quality ||
                            ''
                        ).trim();

                    var title =
                        name +
                        (
                            quality
                                ? (' • ' + quality)
                                : ''
                        );

                    items.push({
                        title: title,
                        translationId:
                            tr.id !== undefined
                                ? String(tr.id)
                                : '',
                        iframeUrl:
                            tr.iframeUrl || '',
                        quality: quality,
                        label: name,
                        selected:
                            String(
                                voiceChoice.translationId ||
                                ''
                            ) ===
                            String(
                                tr.id !== undefined
                                    ? tr.id
                                    : ''
                            )
                    });
                });

                if (!translations.length) {
                    items.push({
                        title:
                            'Источник не вернул список озвучек',
                        disabled: true
                    });
                }

                items.push({
                    title: '← Назад',
                    goBack: true
                });

                Lampa.Select.show({
                    title:
                        'MnogoTV — озвучка ' +
                        (
                            source.name ||
                            source.type ||
                            ''
                        ),
                    items: items,
                    onBack: function () {
                        Lampa.Controller.toggle('content');
                    },
                    onSelect: function (item) {
                        if (item.goBack) {
                            Lampa.Controller.toggle('content');
                            return;
                        }

                        if (item.disabled) return;

                        voiceChoice = {
                            index: -1,
                            label:
                                item.label ||
                                item.title ||
                                'Авто',
                            translationId:
                                item.translationId || '',
                            iframeUrl:
                                item.iframeUrl || '',
                            quality:
                                item.quality || ''
                        };

                        setVoiceLabel();
                        Lampa.Controller.toggle('content');
                    }
                });

                return;
            }

            var ep = currentFocus || episodes[0] || {};
            var epNum = isSeries(movie) ? parseInt(ep.episode_number || 0, 10) : null;

            status.text('Получаем аудиодорожки…');

            resolveSource(
                source,
                imdb,
                isSeries(movie) ? season : null,
                epNum,
                qualityLabel,
                function (resolved) {
                    status.text('');

                    var tracks = Array.isArray(resolved.tracks) ? resolved.tracks : [];
                    var items = [{
                        title: 'Авто',
                        index: -1,
                        label: 'Авто',
                        selected: voiceChoice.index < 0
                    }];

                    tracks.forEach(function (track, index) {
                        var actualIndex = track.index !== undefined ? parseInt(track.index, 10) : index;
                        var label = trackTitle(track, index);
                        items.push({
                            title: label,
                            index: isNaN(actualIndex) ? index : actualIndex,
                            label: label,
                            selected: voiceChoice.index === (isNaN(actualIndex) ? index : actualIndex)
                        });
                    });

                    if (!tracks.length) {
                        items.push({
                            title: 'В HLS нет подписанных аудиодорожек',
                            disabled: true
                        });
                    }

                    items.push({ title: '← Назад', goBack: true });

                    Lampa.Select.show({
                        title: 'MnogoTV — озвучка',
                        items: items,
                        onBack: function () { Lampa.Controller.toggle('content'); },
                        onSelect: function (item) {
                            if (item.goBack) {
                                Lampa.Controller.toggle('content');
                                return;
                            }
                            if (item.disabled) return;

                            voiceChoice = {
                                index: item.index,
                                label: item.label || item.title || 'Авто',
                                translationId: '',
                                iframeUrl: '',
                                quality: ''
                            };
                            setVoiceLabel();
                            Lampa.Controller.toggle('content');
                        }
                    });
                },
                function (e) {
                    status.text('Озвучка: ' + errText(e));
                    notify('MnogoTV: ' + errText(e));
                }
            );
        }


        function updateVeoEpisodeBadges() {
            var type = String(source && source.type || '').toLowerCase();
            if (!(type === 'veoveo' || type === 'veo' || type.indexOf('veoveo') >= 0)) return;

            getVeoCatalog(
                source,
                imdb,
                function (result) {
                    (result.catalog || []).forEach(function (catalogItem) {
                        var sNum = catalogItem && catalogItem.season ? parseInt(catalogItem.season.order, 10) : 0;
                        var eNum = parseInt(catalogItem && (catalogItem.order || catalogItem.episode || catalogItem.episodeNumber), 10);
                        if (Number(sNum) !== Number(season) || !eNum) return;

                        var q = veoQualitySummary(catalogItem);
                        var row = scroll.render().find('.mnogotv-v318__episode[data-episode="' + eNum + '"]');
                        if (row.length) row.find('.mnogotv-v318__quality').text(q);
                    });
                },
                function () {}
            );
        }

        function chooseSource() {
            var items = [];
            sources.forEach(function (s) {
                var type =
                    String(
                        s && s.type || ''
                    ).toLowerCase();

                var suffix = '';

                if (
                    type === 'turbo'
                ) {
                    suffix =
                        ' • экспериментальный, пульт не работает';
                }
                else if (
                    type === 'collaps'
                ) {
                    suffix =
                        ' • HLS через relay';
                }
                else if (!s.supported) {
                    suffix =
                        ' • пока без адаптера';
                }
                else if (
                    type === 'alloha'
                ) {
                    suffix =
                        ' • работает';
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
                onBack: function () { Lampa.Controller.toggle('content'); },
                onSelect: function (item) {
                    if (item.goBack) { Lampa.Controller.toggle('content'); return; }
                    if (!item.source.supported) {
                        var disabledType =
                            sourceType(
                                item.source
                            );

                        var reason =
                            disabledType === 'turbo'
                                ? 'Turbo открывается, но его iframe не управляется пультом и не принимает выбранную серию.'
                                : (
                                    disabledType === 'collaps'
                                        ? 'Collaps на этой приставке даёт manifestLoadError. Нужен отдельный proxy/native адаптер.'
                                        : (
                                            (
                                                item.source.name ||
                                                item.source.type ||
                                                'Источник'
                                            ) +
                                            ' пока без отдельного адаптера'
                                        )
                                );

                        notify(
                            'MnogoTV: ' +
                            reason
                        );

                        Lampa.Controller.toggle(
                            'content'
                        );

                        return;
                    }
                    source = item.source;
                    qualityLabel = 'Авто';
                    resetVoice();
                    status.text('');
                    setSourceLabel();
                    Lampa.Controller.toggle('content');
                    renderEpisodes();
                }
            });
        }

        function chooseQuality() {
            var type =
                String(
                    source &&
                    source.type ||
                    ''
                ).toLowerCase();

            if (
                !source ||
                !(
                    type === 'veoveo' ||
                    type === 'veo' ||
                    type.indexOf('veoveo') >= 0
                )
            ) {
                notify(
                    'MnogoTV: выбор качества доступен для VeoVeo'
                );
                return;
            }

            var ep =
                currentFocus ||
                episodes[0];

            if (!ep) {
                notify(
                    'MnogoTV: сначала выбери серию'
                );
                return;
            }

            status.text(
                'VeoVeo: получаю варианты качества…'
            );

            getVeoQualityOptions(
                source,
                imdb,
                season,
                parseInt(
                    ep.episode_number ||
                    0,
                    10
                ),
                function (options) {
                    status.text('');

                    var items = [{
                        title: 'Авто',
                        quality: 'Авто',
                        selected:
                            qualityLabel === 'Авто'
                    }];

                    options.forEach(function (opt) {
                        items.push({
                            title: opt.label,
                            quality: opt.label,
                            selected:
                                qualityLabel ===
                                opt.label
                        });
                    });

                    items.push({
                        title: '← Назад',
                        goBack: true
                    });

                    Lampa.Select.show({
                        title: 'VeoVeo — качество',
                        items: items,

                        onBack: function () {
                            Lampa.Controller.toggle('content');
                        },

                        onSelect: function (item) {
                            if (item.goBack) {
                                Lampa.Controller.toggle('content');
                                return;
                            }

                            qualityLabel =
                                item.quality ||
                                'Авто';
                            resetVoice();

                            setSourceLabel();

                            Lampa.Controller.toggle('content');
                        }
                    });
                },
                function (e) {
                    status.text(
                        'Качество: ' +
                        errText(e)
                    );

                    notify(
                        'MnogoTV: ' +
                        errText(e)
                    );
                }
            );
        }

        function chooseSeason() {
            var items = seasons.map(function (n) { return { title: 'Сезон ' + n, season: n, selected: Number(n) === Number(season) }; });
            items.push({ title: '← Назад', goBack: true });
            Lampa.Select.show({
                title: 'MnogoTV — сезон',
                items: items,
                onBack: function () { Lampa.Controller.toggle('content'); },
                onSelect: function (item) {
                    if (item.goBack) { Lampa.Controller.toggle('content'); return; }
                    season = item.season;
                    resetVoice();
                    setSeasonLabel();
                    Lampa.Controller.toggle('content');
                    renderEpisodes();
                }
            });
        }

        function closeProviderPlayer() {
            try {
                if (providerLayer) {
                    providerLayer.remove();
                }
            } catch (e) {}

            providerLayer = null;
            providerFrame = null;

            try {
                Lampa.Controller.toggle('content');
            } catch (e2) {}
        }

        function providerPlayerUrl(ep) {
            var base =
                voiceChoice &&
                voiceChoice.iframeUrl
                    ? voiceChoice.iframeUrl
                    : (
                        source &&
                        source.iframeUrl ||
                        ''
                    );

            if (!base) return '';

            var type =
                sourceType(source);

            /*
             * Turbo:
             * iframeUrl из Kinobox уже готовый opaque URL.
             * Ничего к нему не дописываем.
             *
             * У Turbo параметры season/episode Kinobox не документирует,
             * и именно наша дописка превращала URL в 404.
             *
             * Collaps direct HLS на этой приставке стабильно ловил
             * manifestLoadError, поэтому используем родной iframe.
             */
            if (
                type === 'turbo'
            ) {
                return base;
            }

            if (type === 'alloha') {
                var epNum =
                    isSeries(movie)
                        ? parseInt(
                            ep &&
                            ep.episode_number ||
                            0,
                            10
                        )
                        : 0;

                var params = {
                    autoplay: 1
                };

                /*
                 * Официальные iframe params Alloha:
                 * episode, translation, autoplay.
                 * Параметр season отсутствует — больше его не передаём.
                 */
                if (epNum > 0) {
                    params.episode =
                        epNum;
                }

                /*
                 * Если выбран translation iframe, он уже относится
                 * к этой озвучке. Для base iframe можно передать ID.
                 */
                if (
                    voiceChoice &&
                    voiceChoice.translationId &&
                    !voiceChoice.iframeUrl
                ) {
                    params.translation =
                        voiceChoice.translationId;
                }

                return appendUrlParams(
                    base,
                    params
                );
            }

            return base;
        }


        function openProviderPlayer(ep) {
            var url =
                providerPlayerUrl(ep);

            if (!url) {
                notify(
                    'MnogoTV: iframe источника не найден'
                );
                return;
            }

            closeProviderPlayer();

            providerLayer = $(
                '<div class="mnogotv-v318__provider-layer">' +
                    '<div class="mnogotv-v318__provider-hint">' +
                        (
                            source &&
                            (
                                source.name ||
                                source.type
                            ) ||
                            'Источник'
                        ) +
                        ' • Back — назад' +
                    '</div>' +
                    '<iframe class="mnogotv-v318__provider-frame" ' +
                        'allow="autoplay; fullscreen; picture-in-picture" ' +
                        'allowfullscreen ' +
                        'referrerpolicy="origin" ' +
                        'frameborder="0" tabindex="0"></iframe>' +
                '</div>'
            );

            providerFrame =
                providerLayer.find(
                    '.mnogotv-v318__provider-frame'
                );

            providerFrame.attr(
                'src',
                url
            );

            $('body').append(
                providerLayer
            );

            Lampa.Controller.add(
                'mnogotv_provider_web',
                {
                    toggle: function () {},
                    up: function () {},
                    down: function () {},
                    left: function () {},
                    right: function () {},
                    back: closeProviderPlayer,
                    menu: closeProviderPlayer,
                    escape: closeProviderPlayer
                }
            );

            Lampa.Controller.toggle(
                'mnogotv_provider_web'
            );

            setTimeout(function () {
                try {
                    providerFrame[0].focus();
                } catch (e) {}
            }, 150);
        }

        function playerMenu(ep) {
            if (
                source &&
                sourceType(source) === 'collaps'
            ) {
                playEpisode(
                    ep,
                    'lampa'
                );
                return;
            }

            if (
                source &&
                isWebProviderSource(source)
            ) {
                playEpisode(ep, '');
                return;
            }

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
                onBack: function () { Lampa.Controller.toggle('content'); },
                onSelect: function (item) {
                    Lampa.Controller.toggle('content');
                    playEpisode(ep, item.runas || '');
                }
            });
        }

        function playEpisode(ep, runas) {
            if (!source) { notify('MnogoTV: источник не выбран'); return; }

            if (isWebProviderSource(source)) {
                status.text(
                    'Открываем ' +
                    (source.name || source.type || 'источник') +
                    '…'
                );

                openProviderPlayer(ep);

                setTimeout(function () {
                    status.text('');
                }, 400);

                return;
            }

            var epNum = isSeries(movie) ? parseInt(ep.episode_number || 0, 10) : null;

            var forceCollapsLampa =
                sourceType(source) === 'collaps';

            status.text('Получаем поток ' + (source.name || source.type || '') + '…');
            resolveSource(
                source,
                imdb,
                isSeries(movie) ? season : null,
                epNum,
                qualityLabel,
                function (resolved) {
                var actualRunas = runas;

                if (!actualRunas) {
                    if (forceCollapsLampa) {
                        actualRunas = 'lampa';
                    }
                    else if (playerMode === 'lampa') {
                        actualRunas = 'lampa';
                    }
                    else if (playerMode === 'android') {
                        actualRunas = 'android';
                    }
                    else {
                        try {
                            if (
                                Lampa.Platform &&
                                Lampa.Platform.is &&
                                Lampa.Platform.is('android') &&
                                (resolved.relayReady || resolved.externalDirect)
                            ) {
                                actualRunas = 'android';
                            }
                            else {
                                actualRunas = 'lampa';
                            }
                        } catch (e) {
                            actualRunas = 'lampa';
                        }
                    }
                }

                if (
                    resolved.quality &&
                    resolved.quality !== 'Вариант'
                ) {
                    qualityLabel =
                        resolved.quality;

                    setSourceLabel();
                }

                status.text(
                    (resolved.provider || 'Источник') +
                    ' • ' +
                    (
                        resolved.quality ||
                        qualityLabel ||
                        'Авто'
                    ) +
                    ' • ' +
                    (resolved.resolvedBy || 'resolver')
                );

                playResolved(
                    movie,
                    isSeries(movie) ? season : null,
                    epNum,
                    ep,
                    source,
                    resolved,
                    actualRunas,
                    voiceChoice
                );
            }, function (e) {
                status.text('Ошибка: ' + errText(e));
                notify('MnogoTV: ' + errText(e));
            });
        }

        function makeEpisode(ep) {
            var num = parseInt(ep.episode_number || 0, 10);
            var title = ep.name || ('Серия ' + num);
            var item = $('<div class="mnogotv-v318__episode selector" data-episode="' + num + '"><div class="mnogotv-v318__thumb"><img><div class="mnogotv-v318__num"></div></div><div class="mnogotv-v318__body"><div class="mnogotv-v318__title-row"><div class="mnogotv-v318__title"></div><div class="mnogotv-v318__duration"></div></div><div class="mnogotv-v318__line"></div><div class="mnogotv-v318__meta"><span class="mnogotv-v318__rating"></span><span>  •  </span><span class="mnogotv-v318__date"></span><span>  •  </span><span class="mnogotv-v318__quality">HLS</span></div></div></div>');

            item.find('.mnogotv-v318__num').text(('0' + num).slice(-2));
            item.find('.mnogotv-v318__title').text(title);
            item.find('.mnogotv-v318__duration').text(episodeRuntime(ep, movie));
            item.find('.mnogotv-v318__rating').text('★ ' + (ep.vote_average ? parseFloat(ep.vote_average).toFixed(1) : '—'));
            item.find('.mnogotv-v318__date').text(episodeDate(ep.air_date));

            var image = episodeImage(ep);
            if (image) item.find('img').attr('src', image);
            else item.find('img').hide();

            item.on('hover:focus', function (e) {
                last = e.target;
                currentFocus = ep;
                updateHeadline(ep);
                try { scroll.update(item, true); } catch (err) {}
            });

            item.on('hover:enter click', function () { playEpisode(ep, ''); });
            item.on('hover:long', function () { playerMenu(ep); });
            return item;
        }

        function makeMovieItem() {
            var item = $('<div class="mnogotv-v318__episode selector mnogotv-v318__movie"><div class="mnogotv-v318__thumb"><img><div class="mnogotv-v318__num">▶</div></div><div class="mnogotv-v318__body"><div class="mnogotv-v318__title">Смотреть фильм</div><div class="mnogotv-v318__line"></div><div class="mnogotv-v318__meta"></div></div></div>');
            var meta = [];
            var year = (movie && (movie.release_date || movie.first_air_date) || '').slice(0, 4);
            meta.push(source ? (source.name || source.type || 'MnogoTV') : 'MnogoTV');
            if (movie && movie.vote_average) meta.push('★ ' + parseFloat(movie.vote_average).toFixed(1));
            if (year) meta.push(year);
            item.find('.mnogotv-v318__meta').text(meta.join('  •  '));
            var image = movieImage(movie);
            if (image) item.find('img').attr('src', image); else item.find('img').hide();

            item.on('hover:focus', function (e) {
                last = e.target;
                currentFocus = null;
                updateHeadline(null);
                try { scroll.update(item, true); } catch (err) {}
            });

            item.on('hover:enter click', function () { playEpisode({}, ''); });
            item.on('hover:long', function () { playerMenu({}); });
            return item;
        }

        function renderMovie() {
            scroll.clear();
            var item = makeMovieItem();
            scroll.append(item);
            last = item[0];
            updateHeadline(null);
            setTimeout(function () {
                try {
                    Lampa.Controller.toggle('content');
                    Lampa.Controller.collectionFocus(item[0], root);
                } catch (e) {}
            }, 0);
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
                    scroll.append($('<div class="mnogotv-v318__empty">Серии не найдены</div>'));
                    updateHeadline(null);
                    return;
                }
                currentFocus = episodes[0];
                updateHeadline(currentFocus);
                episodes.forEach(function (ep) { scroll.append(makeEpisode(ep)); });
                updateVeoEpisodeBadges();
                try { Lampa.Controller.toggle('content'); } catch (e) {}
            }, function (e) {
                status.text('Ошибка: ' + errText(e));
            });
        }

        function initData() {
            status.text('Подключение к MnogoTV…');
            getImdb(movie, function (id) {
                imdb = id;
                enrichMovieDetails();
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
                        updateScrollSpace();
                        status.text('');
                        renderMovie();
                    }
                }, function (e) {
                    status.text('Resolver: ' + errText(e));
                });
            }, function (e) { status.text('IMDb: ' + errText(e)); });
        }

        sourceButton.on('hover:focus', function (e) {
            last = e.target;
        });

        seasonButton.on('hover:focus', function (e) {
            last = e.target;
        });

        sourceButton.on(
            'hover:enter click',
            chooseSource
        );

        sourceButton.on(
            'hover:long',
            chooseQuality
        );

        seasonButton.on(
            'hover:enter click',
            chooseSeason
        );


        voiceButton.on('hover:focus', function (e) { last = e.target; });
        playerButton.on('hover:focus', function (e) { last = e.target; });
        voiceButton.on('hover:enter click', chooseVoice);
        playerButton.on('hover:enter click', choosePlayer);

        this.create = function () { return this.render(); };
        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;
            if (!initialized) {
                initialized = true;
                addCss();
                renderInfoPanel();
                enrichMovieDetails(function () {
                    try {
                        var bg2 = Lampa.Utils.cardImgBackgroundBlur(movie);
                        if (bg2) Lampa.Background.immediately(bg2);
                    } catch (eBg) {}
                });
                setVoiceLabel();
                setPlayerLabel();

                toolbar.append(sourceButton);
                toolbar.append(seasonButton);
                toolbar.append(voiceButton);
                toolbar.append(playerButton);

                topPanel.append(toolbar);
                topPanel.append(headline);
                topPanel.append(status);

                scroll.render().addClass('mnogotv-v318__scroll');
                try { scroll.body().addClass('mnogotv-v318__list'); } catch (e0) {}

                contentPanel.append(topPanel);
                contentPanel.append(scroll.render());
                layout.append(infoPanel);
                layout.append(contentPanel);
                root.append(layout);

                updateScrollSpace();
                resizeHandler = function () { updateScrollSpace(); };
                window.addEventListener('resize', resizeHandler, false);

                try {
                    var bg = Lampa.Utils.cardImgBackgroundBlur(movie);
                    if (bg) Lampa.Background.immediately(bg);
                } catch (e) {}
                initData();
            }
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(root);
                    Lampa.Controller.collectionFocus(last || sourceButton[0], root);
                },
                up: function () {
                    if (Navigator.canmove('up')) {
                        Navigator.move('up');
                    }
                    else {
                        /*
                         * Штатный переход в верхнюю панель Lampa.
                         * Обратно head возвращается именно в controller 'content'.
                         */
                        Lampa.Controller.toggle('head');
                    }
                },
                down: function () {
                    if (Navigator.canmove('down')) Navigator.move('down');
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                },
                back: function () {
                    try { Lampa.Activity.backward(); } catch (e) {}
                },
                menu: function () {
                    try { Lampa.Activity.backward(); } catch (e) {}
                },
                escape: function () {
                    try { Lampa.Activity.backward(); } catch (e) {}
                }
            });
            Lampa.Controller.toggle('content');
        };
        this.render = function () { return root; };
        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () {
            try {
                if (resizeHandler) window.removeEventListener('resize', resizeHandler, false);
            } catch (e) {}

            try {
                if (providerLayer) providerLayer.remove();
            } catch (eProvider) {}

            providerLayer = null;
            providerFrame = null;

            try { scroll.destroy(); } catch (e2) {}
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
            if (root.find('.mnogotv-v318-button').length) return;
            var movie = (e.data && e.data.movie) || e.movie || e.object.card || {};

            try {
                var cardOverview =
                    extractOverviewFromFull(
                        root
                    );

                if (cardOverview) {
                    movie.__mnogotv_overview =
                        cardOverview;

                    if (
                        !String(
                            movie.overview ||
                            ''
                        ).trim()
                    ) {
                        movie.overview =
                            cardOverview;
                    }
                }
            } catch (eOverview) {}

            var button = $('<div class="full-start__button selector view--online mnogotv-v318-button" data-subtitle="MnogoTV"><svg class="button__icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M10 9l5 3-5 3V9z" fill="currentColor"/></svg><span>MnogoTV</span></div>');
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
        notify('MnogoTV v' + VERSION + ' • stable sources');
        log('started', { resolver: CONFIG.resolver });
    }

    start();
})();
