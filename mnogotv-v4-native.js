(function () {
    'use strict';

    var VERSION = '4.0.22-native';
    var PLUGIN_ID = 'mnogotv_v412_native';
    var COMPONENT = 'mnogotv_v318_component';
    var DEFAULT_RESOLVER = 'https://mnogotv-relay-v4-test.odi-84v.workers.dev';

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

    function hasProviderTranslations(source) {
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
                     * Collaps требует отдельного proxy/native пути:
                     * iframe также не подходит, а direct HLS на этой
                     * приставке ловит manifestLoadError.
                     */
                    /*
                     * Native-only ветка: все четыре известных источника
                     * обязаны резолвиться в media URL и открываться через
                     * штатный Lampa.Player. iframe/external player не являются
                     * допустимым playback fallback.
                     */
                    s.experimental = false;

                    s.supported =
                        type === 'alloha' ||
                        type === 'turbo' ||
                        type === 'collaps' ||
                        type === 'veoveo' ||
                        type === 'veo' ||
                        type.indexOf('veoveo') >= 0;

                    s.webPlayer = false;

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
        var keyRe = /fa4cdd5c\s*=\s*["']([0-9a-f]+)["']/ig;
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

    function base64ToArrayBuffer(value) {
        var raw = value;
        if (raw && typeof raw === 'object') {
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
        if (typeof Hls === 'undefined' || !Hls.DefaultConfig || !Hls.DefaultConfig.loader) return false;

        var OriginalLoader = Hls.DefaultConfig.loader;
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
            this.stats = hlsNativeStats();

            var visibleUrl = stripHash(context && context.url || '');
            if (!isCollapsCdnUrl(visibleUrl)) {
                this.fallback = new OriginalLoader(this.config);
                this.fallback.load(context, config, callbacks);
                this.stats = this.fallback.stats || this.stats;
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
            try { window.__mnogotv_collaps_debug = COLLAPS_NATIVE_HLS; } catch (eDbg0) {}
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
                            var decodeText = 'native decode: ' + errText(decodeError);
                            COLLAPS_NATIVE_HLS.lastError = {
                                phase: isBinary ? 'fragment-decode' : 'text-decode',
                                code: 0,
                                text: decodeText,
                                requestUrl: requestUrl
                            };
                            try { window.__mnogotv_collaps_debug = COLLAPS_NATIVE_HLS; } catch (eDbg1) {}
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
                        try { window.__mnogotv_collaps_debug = COLLAPS_NATIVE_HLS; } catch (eDbg2) {}
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
            Hls.DefaultConfig.loader = CollapsNativeLoader;
            COLLAPS_NATIVE_HLS.installed = true;
            log('Collaps native Hls loader installed');
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
                MediaSource.isTypeSupported('video/webm; codecs="av01.0.05M.08"')
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
                        var data;
                        try {
                            data = binary
                                ? base64ToArrayBuffer(payload)
                                : String(payload || '');
                        } catch (decodeError) {
                            COLLAPS_NATIVE_DASH.errorCount++;
                            COLLAPS_NATIVE_DASH.lastStatus = 0;
                            self.status = 0;
                            self.statusText = 'native decode error';
                            self.readyState = 4;
                            self._emit('readystatechange', {});
                            self._emit('error', { error: decodeError });
                            self._emit('loadend', {});
                            notify(
                                'Collaps DASH DEBUG: native decode • ' +
                                errText(decodeError)
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

                        /* Exact VenomPlayer order: dasha(AV1) -> dash -> hls. */
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

                        /* Only if DASH is genuinely unavailable, use HLS client path. */
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

                            configureCollapsNativeHls(
                                hlsStream,
                                clientHlsUrl,
                                cdnUnix,
                                cdnKey,
                                hlsHeaders
                            );

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


    /*
     * Alloha native adapter v4.0.21
     *
     * Real chain captured in mnogotv.com2.har (2026-09-07):
     *
     *   MnogoTV source iframe
     *     -> GET theatre.stravers.live/?token_movie=...&token=...
     *     -> fileList.active.id + meta[name="viewporti"]
     *     -> POST same-origin /bnsi/movies/<media.id>
     *     -> hlsSource[].quality
     *     -> vkvideo.cloud master.m3u8 in built-in Lampa.Player
     *
     * No API-domain discovery and no host probing. All endpoints are derived
     * from the iframe that MnogoTV actually returned.
     */

    function allohaHeaders(url) {
        return {
            'User-Agent': COLLAPS_UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ru,en;q=0.9',
            'Referer': 'https://mnogotv.com/'
        };
    }

    function nativeJson(url, headers, ok, fail, postdata) {
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
            network.timeout(15000);

            network.native(
                url,
                function (data) {
                    try {
                        if (typeof data === 'string') data = JSON.parse(data);
                    } catch (e3) {
                        fail(new Error('Alloha: JSON parse error'));
                        return;
                    }

                    ok(data || {});
                },
                function (a, c) {
                    var status =
                        a && a.status !== undefined
                            ? a.status
                            : '';

                    fail(
                        new Error(
                            status
                                ? ('HTTP ' + status)
                                : errText(a || c || 'network error')
                        )
                    );
                },
                postdata || false,
                {
                    dataType: 'json',
                    headers: headers || {}
                }
            );
        } catch (e4) {
            fail(e4);
        }
    }

    function decodeAllohaFileListString(raw) {
        raw = String(raw || '');

        try {
            return JSON.parse(raw);
        } catch (e) {}

        try {
            var s = raw
                .replace(/\\'/g, "'")
                .replace(/\\\\/g, "\\")
                .replace(/\\\//g, "/")
                .replace(/\\n/g, "")
                .replace(/\\r/g, "")
                .replace(/\\t/g, "\t");

            return JSON.parse(s);
        } catch (e2) {}

        return null;
    }

    function parseAllohaFileList(html) {
        html = String(html || '').replace(/\n/g, '');

        var patterns = [
            /fileList\s*=\s*JSON\.parse\('([\s\S]*?)'\)\s*;/i,
            /fileList\s*=\s*JSON\.parse\("([\s\S]*?)"\)\s*;/i
        ];

        for (var i = 0; i < patterns.length; i++) {
            var m = html.match(patterns[i]);

            if (m && m[1]) {
                var parsed = decodeAllohaFileListString(m[1]);

                if (parsed && (parsed.active || parsed.all)) return parsed;
            }
        }

        return null;
    }

    function firstObjectValue(obj) {
        if (!obj || typeof obj !== 'object') return null;

        var keys = Object.keys(obj);

        for (var i = 0; i < keys.length; i++) {
            var value = obj[keys[i]];
            if (value !== undefined && value !== null) return value;
        }

        return null;
    }

    function allohaPickMedia(pl, season, episode, voiceChoice) {
        if (!pl) return null;

        var translationId =
            voiceChoice &&
            voiceChoice.translationId
                ? String(voiceChoice.translationId)
                : '';

        /*
         * The translated iframe already has the exact selection activated.
         * In the captured movie flow fileList.active.id=1560037 and that exact
         * id is subsequently POSTed to /bnsi/movies/1560037. Prefer it.
         */
        if (
            pl.active &&
            pl.active.id !== undefined &&
            pl.active.id !== null
        ) {
            var activeTranslation = String(
                pl.active.id_translation ||
                pl.active.translation_id ||
                pl.active.translationId ||
                ''
            );

            if (
                !translationId ||
                !activeTranslation ||
                activeTranslation === translationId
            ) {
                return pl.active;
            }
        }

        if (!pl.all) return pl.active || null;

        if (String(pl.type || '').toLowerCase() === 'serial') {
            var seasons = pl.all || {};
            var seasonObj =
                seasons[String(season)] ||
                seasons[season] ||
                firstObjectValue(seasons);

            if (!seasonObj) return pl.active || null;

            var episodeObj =
                seasonObj[String(episode)] ||
                seasonObj[episode] ||
                firstObjectValue(seasonObj);

            if (!episodeObj) return pl.active || null;

            if (translationId && episodeObj[translationId]) {
                return episodeObj[translationId];
            }

            return firstObjectValue(episodeObj) || pl.active || null;
        }

        var queue = [pl.all];
        var fallback = pl.active || null;

        while (queue.length) {
            var node = queue.shift();

            if (!node || typeof node !== 'object') continue;

            if (node.id !== undefined && node.id !== null) {
                if (!fallback) fallback = node;

                if (
                    translationId &&
                    (
                        String(node.id_translation || '') === translationId ||
                        String(node.translation_id || '') === translationId ||
                        String(node.translationId || '') === translationId ||
                        String(node.translation || '') === translationId
                    )
                ) {
                    return node;
                }
            }

            Object.keys(node).forEach(function (key) {
                var child = node[key];

                if (child && typeof child === 'object') {
                    queue.push(child);
                }
            });
        }

        return fallback;
    }

    function allohaExtractToken(html, iframe) {
        var src = String(html || '');
        var m = src.match(/\btoken\s*:\s*['"]([^'"]+)['"]/i);

        if (m && m[1]) return m[1];

        try {
            return new URL(String(iframe || '')).searchParams.get('token') || '';
        } catch (e) {}

        return '';
    }

    function allohaExtractViewporti(html) {
        var src = String(html || '');
        var m = src.match(
            /<meta\b[^>]*\bname\s*=\s*['"]viewporti['"][^>]*\bcontent\s*=\s*['"]([^'"]+)['"][^>]*>/i
        );

        if (!m) {
            m = src.match(
                /<meta\b[^>]*\bcontent\s*=\s*['"]([^'"]+)['"][^>]*\bname\s*=\s*['"]viewporti['"][^>]*>/i
            );
        }

        return m && m[1] ? String(m[1]) : '';
    }

    function allohaExtractAppScript(html, iframe) {
        var src = String(html || '');
        var re = /<script\b[^>]*\bsrc\s*=\s*['"]([^'"]*\/build\/app\.[^'"]+\.js(?:\?[^'"]*)?)['"][^>]*>/ig;
        var m = re.exec(src);

        if (!m || !m[1]) return '';

        try {
            return new URL(m[1], iframe).href;
        } catch (e) {
            return '';
        }
    }

    function allohaExtractStreamToken(scriptText) {
        var src = String(scriptText || '');

        /*
         * Current app.js contains one long URL-safe literal returned by the
         * guard client. HAR confirms the same literal is sent as:
         *   Authorizations: Bearer <token>
         * Keep this dynamic so a future player deploy can rotate the token.
         */
        var matches = src.match(/[A-Za-z0-9_-]{180,}/g) || [];
        var best = '';

        matches.forEach(function (value) {
            if (value.length > best.length) best = value;
        });

        return best;
    }

    function allohaFilledArray(length, value) {
        var out = new Array(length);
        for (var i = 0; i < length; i++) out[i] = value;
        return out;
    }

    function allohaBitLength(value) {
        value = value >>> 0;
        if (value === 0) return 0;

        var bits = 0;
        while (value > 0) {
            bits++;
            value >>>= 1;
        }

        return bits;
    }

    function allohaTrailingZeros(value, zeroValue) {
        value = value >>> 0;
        if (value === 0) return zeroValue;

        var count = 0;
        while (!(value & 1)) {
            count++;
            value >>>= 1;
        }

        return count;
    }

    function allohaViewportStage7(value) {
        value = String(value || '');
        var len = value.length;
        if (len <= 1) return value;

        var bits = 0;
        while ((1 << bits) < len) bits++;

        var counts = allohaFilledArray(bits + 1, 0);
        var i;

        for (i = 0; i < len; i++) {
            counts[allohaBitLength(i)]++;
        }

        var groups = new Array(bits + 1);
        var pos = 0;

        for (i = bits; i >= 0; i--) {
            groups[i] = value.slice(pos, pos + counts[i]);
            pos += counts[i];
        }

        var offsets = allohaFilledArray(bits + 1, 0);
        var out = new Array(len);

        for (i = 0; i < len; i++) {
            var group = allohaBitLength(i);
            out[i] = groups[group].charAt(offsets[group]++);
        }

        return out.join('');
    }

    function allohaViewportStage6(value) {
        value = String(value || '');
        var len = value.length;
        if (len <= 1) return value;

        var bits = 0;
        while ((1 << bits) < len) bits++;

        var counts = allohaFilledArray(bits + 1, 0);
        var i;

        for (i = 0; i < len; i++) {
            counts[allohaTrailingZeros(i, bits)]++;
        }

        var groups = new Array(bits + 1);
        var pos = 0;

        for (i = 0; i <= bits; i++) {
            groups[i] = value.slice(pos, pos + counts[i]);
            pos += counts[i];
        }

        var offsets = allohaFilledArray(bits + 1, 0);
        var out = new Array(len);

        for (i = 0; i < len; i++) {
            var group = allohaTrailingZeros(i, bits);
            out[i] = groups[group].charAt(offsets[group]++);
        }

        return out.join('');
    }

    function allohaIsPrime(value) {
        value = Number(value || 0);
        if (value < 2) return false;
        if (value % 2 === 0) return value === 2;

        for (var i = 3; i * i <= value; i += 2) {
            if (value % i === 0) return false;
        }

        return true;
    }

    function allohaViewportStage5(value) {
        value = String(value || '');
        var len = value.length;
        if (len <= 1) return value;

        var prime = len + 1;
        while (!allohaIsPrime(prime)) prime++;

        var seen = allohaFilledArray(len, false);
        var order = [];
        var cursor = 0;

        while (order.length < len) {
            cursor = (cursor + 2) % prime;

            if (cursor < len && !seen[cursor]) {
                order.push(cursor);
                seen[cursor] = true;
            }
        }

        var out = new Array(len);

        for (var i = 0; i < len; i++) {
            out[order[i]] = value[i];
        }

        return out.join('');
    }

    function allohaViewportBorth(value) {
        return allohaViewportStage5(
            allohaViewportStage6(
                allohaViewportStage7(value)
            )
        );
    }

    function allohaSha256Hex(ascii) {
        /* Small synchronous SHA-256, kept ES5-compatible for TV WebViews. */
        ascii = unescape(encodeURIComponent(String(ascii || '')));

        var mathPow = Math.pow;
        var maxWord = mathPow(2, 32);
        var lengthProperty = 'length';
        var i, j;
        var result = '';
        var words = [];
        var asciiBitLength = ascii[lengthProperty] * 8;
        var hash = allohaSha256Hex.h = allohaSha256Hex.h || [];
        var k = allohaSha256Hex.k = allohaSha256Hex.k || [];
        var primeCounter = k[lengthProperty];
        var isComposite = {};

        for (var candidate = 2; primeCounter < 64; candidate++) {
            if (!isComposite[candidate]) {
                for (i = 0; i < 313; i += candidate) {
                    isComposite[i] = candidate;
                }

                hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
                k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
            }
        }

        ascii += '\x80';

        while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';

        for (i = 0; i < ascii[lengthProperty]; i++) {
            j = ascii.charCodeAt(i);
            words[i >> 2] |= j << ((3 - i) % 4) * 8;
        }

        words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
        words[words[lengthProperty]] = asciiBitLength;

        for (j = 0; j < words[lengthProperty];) {
            var w = words.slice(j, j += 16);
            var oldHash = hash.slice(0);
            hash = hash.slice(0, 8);

            for (i = 0; i < 64; i++) {
                var i2 = i + j;
                var w15 = w[i - 15];
                var w2 = w[i - 2];
                var a = hash[0];
                var e = hash[4];
                var temp1 =
                    hash[7] +
                    (
                        ((e >>> 6) | (e << 26)) ^
                        ((e >>> 11) | (e << 21)) ^
                        ((e >>> 25) | (e << 7))
                    ) +
                    ((e & hash[5]) ^ ((~e) & hash[6])) +
                    k[i] +
                    (
                        w[i] =
                            i < 16
                                ? w[i]
                                : (
                                    w[i - 16] +
                                    (
                                        ((w15 >>> 7) | (w15 << 25)) ^
                                        ((w15 >>> 18) | (w15 << 14)) ^
                                        (w15 >>> 3)
                                    ) +
                                    w[i - 7] +
                                    (
                                        ((w2 >>> 17) | (w2 << 15)) ^
                                        ((w2 >>> 19) | (w2 << 13)) ^
                                        (w2 >>> 10)
                                    )
                                ) | 0
                    );
                var temp2 =
                    (
                        ((a >>> 2) | (a << 30)) ^
                        ((a >>> 13) | (a << 19)) ^
                        ((a >>> 22) | (a << 10))
                    ) +
                    ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

                hash = [(temp1 + temp2) | 0].concat(hash);
                hash[4] = (hash[4] + temp1) | 0;
                hash.pop();
            }

            for (i = 0; i < 8; i++) {
                hash[i] = (hash[i] + oldHash[i]) | 0;
            }
        }

        for (i = 0; i < 8; i++) {
            for (j = 3; j + 1; j--) {
                var b = (hash[i] >> (j * 8)) & 255;
                result += (b < 16 ? '0' : '') + b.toString(16);
            }
        }

        return result;
    }

    function allohaGuardId(iframe, mediaId) {
        var seed = [];

        try { seed.push(navigator.userAgent || COLLAPS_UA); } catch (e0) {}
        try {
            seed.push(
                Intl.DateTimeFormat().resolvedOptions().timeZone || ''
            );
        } catch (e1) {}
        try { seed.push(screen.width + 'x' + screen.height); } catch (e2) {}
        try { seed.push(navigator.language || navigator.userLanguage || ''); } catch (e3) {}
        try { seed.push(String(navigator.hardwareConcurrency || '')); } catch (e4) {}
        try { seed.push(String(navigator.deviceMemory || '')); } catch (e5) {}

        seed.push(String(iframe || ''));
        seed.push(String(mediaId || ''));

        return allohaSha256Hex(seed.join('||'));
    }

    function allohaPickHls(json, qualityLabel) {
        var list =
            json &&
            Array.isArray(json.hlsSource)
                ? json.hlsSource
                : [];

        if (!list.length) return null;

        var source =
            list.filter(function (item) {
                return item && item['default'];
            })[0] ||
            list[0] ||
            {};

        var qualities = source.quality || {};
        var variants = [];

        Object.keys(qualities).forEach(function (q) {
            var raw = String(qualities[q] || '');
            var links = raw.split(' or ').filter(Boolean);
            var link = links[0] || '';

            if (!link) return;

            variants.push({
                label: String(q) + 'p',
                quality: parseInt(q, 10) || 0,
                url: normalizeDirectUrl(link),
                mirrors: links.map(function (item) {
                    return normalizeDirectUrl(item);
                }).filter(Boolean)
            });
        });

        variants = variants.filter(function (v) { return !!v.url; });

        variants.sort(function (a, b) {
            return b.quality - a.quality;
        });

        if (!variants.length) return null;

        var wanted = parseInt(
            String(qualityLabel || '').replace(/[^\d]/g, ''),
            10
        );

        var selected = null;

        if (wanted) {
            selected =
                variants.filter(function (v) {
                    return v.quality === wanted;
                })[0] ||
                variants.filter(function (v) {
                    return v.quality <= wanted;
                })[0];
        }

        if (!selected) {
            selected =
                variants.filter(function (v) {
                    return v.quality <= 1080;
                })[0] ||
                variants[0];
        }

        return {
            selected: selected,
            variants: variants,
            audioId: String(source.audioId || '1')
        };
    }

    function allohaSubs(tracks) {
        if (!Array.isArray(tracks)) return [];

        return tracks.filter(function (t) {
            return (
                t &&
                String(t.kind || '').toLowerCase() === 'captions' &&
                t.src
            );
        }).map(function (t) {
            var link =
                String(t.src || '')
                    .split(' or ')
                    .filter(Boolean)[0] ||
                '';

            if (!link) return null;

            return {
                label: t.label || t.lang || 'Субтитры',
                url: normalizeDirectUrl(link)
            };
        }).filter(Boolean);
    }


    /*
     * v4.0.22: Alloha HLS transport diagnostics + HAR-matched 480p probe.
     *
     * HAR proves that /bnsi success is only half of the job:
     *   1) master.m3u8 uses Accepts-Controls = Borth fingerprint (64 hex);
     *   2) the player opens pnr/pnk WebSocket and receives config_update.edge_hash;
     *   3) level playlist + init/segments use that edge_hash (32 hex);
     *   4) every HLS request also carries Authorizations + Origin + Referer.
     *
     * Stock Lampa Hls.js does not reliably apply source.headers on Android TV,
     * exactly the same class of failure we already fixed for Collaps. So this
     * loader performs vkvideo.cloud requests through Lampa.Reguest.native.
     */
    var ALLOHA_NATIVE_HLS = {
        installed: false,
        originalLoader: null,
        headers: {},
        guardId: '',
        edgeHash: '',
        baseHost: '',
        primaryBase: '',
        mirrorBases: [],
        activeBase: '',
        failedUrls: {},
        ws: null,
        wsTimer: null,
        heartbeatTimer: null,
        lastRequest: null,
        lastMirrorSwitch: null,
        lastError: null,
        edgeReceivedAt: 0,
        edgeNotified: false,
        edgeTimeoutNotified: false,
        fragmentSuccessCount: 0,
        lastSuccess: null,
        history: []
    };

    function isAllohaCdnUrl(url) {
        try {
            var host = new URL(stripHash(url)).hostname.toLowerCase();
            return host === 'vkvideo.cloud' ||
                host.slice(-14) === '.vkvideo.cloud';
        } catch (e) {
            return false;
        }
    }

    function allohaHlsBase(url) {
        try {
            var clean = stripHash(url);
            return clean.slice(0, clean.lastIndexOf('/') + 1);
        } catch (e) {
            return '';
        }
    }

    function allohaUniqueBases(urls) {
        var out = [];

        (urls || []).forEach(function (url) {
            var base = allohaHlsBase(url);
            if (base && out.indexOf(base) < 0) out.push(base);
        });

        return out;
    }

    function allohaHlsLeaf(url) {
        try {
            var pathname = new URL(stripHash(url)).pathname || '';
            return pathname.slice(pathname.lastIndexOf('/') + 1) || 'request';
        } catch (e) {
            var clean = stripHash(url);
            return clean.slice(clean.lastIndexOf('/') + 1) || 'request';
        }
    }

    function allohaActiveMirrorNumber() {
        var bases = ALLOHA_NATIVE_HLS.mirrorBases || [];
        var idx = bases.indexOf(ALLOHA_NATIVE_HLS.activeBase || '');
        return idx >= 0 ? (idx + 1) : 0;
    }

    function allohaPushHistory(item) {
        try {
            ALLOHA_NATIVE_HLS.history.push(item);
            if (ALLOHA_NATIVE_HLS.history.length > 24) {
                ALLOHA_NATIVE_HLS.history.shift();
            }
            window.__mnogotv_alloha_debug = ALLOHA_NATIVE_HLS;
        } catch (e) {}
    }

    function allohaHumanBytes(bytes) {
        bytes = Number(bytes || 0);
        if (bytes >= 1024 * 1024) {
            return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
        }
        if (bytes >= 1024) {
            return Math.round(bytes / 1024) + 'KB';
        }
        return String(bytes) + 'B';
    }

    function allohaRewriteToActiveBase(url) {
        var clean = stripHash(url);
        var bases = ALLOHA_NATIVE_HLS.mirrorBases || [];
        var active = ALLOHA_NATIVE_HLS.activeBase || '';

        if (!active || !bases.length) return clean;

        for (var i = 0; i < bases.length; i++) {
            if (clean.indexOf(bases[i]) === 0) {
                return active + clean.slice(bases[i].length);
            }
        }

        return clean;
    }

    function allohaSwitchMirror(failedUrl) {
        var clean = stripHash(failedUrl);
        var bases = ALLOHA_NATIVE_HLS.mirrorBases || [];

        if (bases.length < 2) return false;

        var current = '';
        for (var i = 0; i < bases.length; i++) {
            if (clean.indexOf(bases[i]) === 0) {
                current = bases[i];
                break;
            }
        }

        if (!current) current = ALLOHA_NATIVE_HLS.activeBase || bases[0];

        var idx = bases.indexOf(current);
        var next = bases[(idx + 1) % bases.length];

        if (!next || next === current) return false;

        ALLOHA_NATIVE_HLS.activeBase = next;
        ALLOHA_NATIVE_HLS.lastMirrorSwitch = {
            from: current,
            to: next,
            failedUrl: clean,
            ts: Date.now()
        };

        try {
            window.__mnogotv_alloha_debug = ALLOHA_NATIVE_HLS;
        } catch (eDbgMirror) {}

        log('Alloha CDN mirror switched', ALLOHA_NATIVE_HLS.lastMirrorSwitch);
        return true;
    }

    function allohaEdgePayload(type, quality, audioId) {
        return {
            type: type,
            current_time: 0,
            resolution: String(
                parseInt(String(quality || '').replace(/[^\d]/g, ''), 10) || 480
            ),
            track_id: String(audioId || '1'),
            speed: 1,
            subtitle: -1,
            ts: Date.now()
        };
    }

    function closeAllohaEdgeSocket() {
        try {
            if (ALLOHA_NATIVE_HLS.wsTimer) {
                clearTimeout(ALLOHA_NATIVE_HLS.wsTimer);
            }
        } catch (e0) {}

        try {
            if (ALLOHA_NATIVE_HLS.heartbeatTimer) {
                clearInterval(ALLOHA_NATIVE_HLS.heartbeatTimer);
            }
        } catch (e1) {}

        ALLOHA_NATIVE_HLS.wsTimer = null;
        ALLOHA_NATIVE_HLS.heartbeatTimer = null;

        try {
            if (ALLOHA_NATIVE_HLS.ws) {
                ALLOHA_NATIVE_HLS.ws.onopen = null;
                ALLOHA_NATIVE_HLS.ws.onmessage = null;
                ALLOHA_NATIVE_HLS.ws.onerror = null;
                ALLOHA_NATIVE_HLS.ws.onclose = null;
                ALLOHA_NATIVE_HLS.ws.close();
            }
        } catch (e2) {}

        ALLOHA_NATIVE_HLS.ws = null;
    }

    function startAllohaEdgeSocket(json, quality, audioId) {
        closeAllohaEdgeSocket();
        ALLOHA_NATIVE_HLS.edgeHash = '';
        ALLOHA_NATIVE_HLS.edgeReceivedAt = 0;
        ALLOHA_NATIVE_HLS.edgeNotified = false;
        ALLOHA_NATIVE_HLS.edgeTimeoutNotified = false;

        if (
            !json ||
            !json.pnr ||
            !json.pnk ||
            typeof WebSocket === 'undefined'
        ) {
            log('Alloha edge WebSocket unavailable');
            return false;
        }

        var wsUrl = String(json.pnr || '');

        try {
            wsUrl +=
                (wsUrl.indexOf('?') >= 0 ? '&' : '?') +
                'sid=' + encodeURIComponent(String(json.pnk)) +
                '&v=2.1' +
                '&t=' + Date.now();
        } catch (eUrl) {
            return false;
        }

        var ws = null;

        try {
            ws = new WebSocket(wsUrl);
            ALLOHA_NATIVE_HLS.ws = ws;
        } catch (eOpen) {
            ALLOHA_NATIVE_HLS.lastError = {
                phase: 'edge-ws-open',
                text: errText(eOpen)
            };
            log('Alloha edge WebSocket open failed', eOpen);
            return false;
        }

        function send(type) {
            try {
                if (ws.readyState !== 1) return;
                ws.send(JSON.stringify(
                    allohaEdgePayload(type, quality, audioId)
                ));
            } catch (eSend) {}
        }

        ws.onopen = function () {
            log('Alloha edge WebSocket connected', wsUrl);

            /*
             * This is the exact startup sequence captured in HAR.
             * The server then answers with config_update.edge_hash.
             */
            send('playback_start');
            send('init');

            try {
                ALLOHA_NATIVE_HLS.heartbeatTimer = setInterval(function () {
                    send('playing');
                }, 30000);
            } catch (eTimer) {}
        };

        ws.onmessage = function (event) {
            var data = null;

            try {
                data = JSON.parse(String(event && event.data || ''));
            } catch (eParse) {
                return;
            }

            if (
                data &&
                data.type === 'config_update' &&
                /^[a-f0-9]{32}$/i.test(String(data.edge_hash || ''))
            ) {
                ALLOHA_NATIVE_HLS.edgeHash =
                    String(data.edge_hash).toLowerCase();
                ALLOHA_NATIVE_HLS.edgeReceivedAt = Date.now();
                ALLOHA_NATIVE_HLS.lastError = null;

                if (!ALLOHA_NATIVE_HLS.edgeNotified) {
                    ALLOHA_NATIVE_HLS.edgeNotified = true;
                    try {
                        notify('A22 EDGE OK • 32');
                    } catch (eNotifyEdge) {}
                }

                allohaPushHistory({
                    phase: 'edge-ok',
                    edgeLength: ALLOHA_NATIVE_HLS.edgeHash.length,
                    ts: Date.now()
                });

                log('Alloha edge hash updated', {
                    edgeHash: ALLOHA_NATIVE_HLS.edgeHash,
                    ttl: data.ttl,
                    priority: data.edge_priority
                });
            }
        };

        ws.onerror = function () {
            ALLOHA_NATIVE_HLS.lastError = {
                phase: 'edge-ws-error',
                text: 'WebSocket error'
            };
            try {
                window.__mnogotv_alloha_debug = ALLOHA_NATIVE_HLS;
            } catch (eDbg1) {}
            log('Alloha edge WebSocket error');
        };

        ws.onclose = function () {
            log('Alloha edge WebSocket closed');
        };

        /*
         * Do not abort playback if the socket is slow. The master request only
         * needs guardId. Non-master loader requests below wait briefly for the
         * edge hash before falling back.
         */
        try {
            ALLOHA_NATIVE_HLS.wsTimer = setTimeout(function () {
                ALLOHA_NATIVE_HLS.wsTimer = null;

                if (!ALLOHA_NATIVE_HLS.edgeHash) {
                    ALLOHA_NATIVE_HLS.lastError = {
                        phase: 'edge-ws-timeout',
                        text: 'config_update.edge_hash not received'
                    };
                    try {
                        window.__mnogotv_alloha_debug = ALLOHA_NATIVE_HLS;
                    } catch (eDbg2) {}
                    if (!ALLOHA_NATIVE_HLS.edgeTimeoutNotified) {
                        ALLOHA_NATIVE_HLS.edgeTimeoutNotified = true;
                        try {
                            notify('A22 EDGE TIMEOUT • guard64');
                        } catch (eNotifyEdgeTimeout) {}
                    }

                    allohaPushHistory({
                        phase: 'edge-timeout',
                        edgeLength: 0,
                        ts: Date.now()
                    });

                    log('Alloha edge WebSocket timeout');
                }
            }, 3500);
        } catch (eTimeout) {}

        return true;
    }

    function configureAllohaNativeHls(url, headers, guardId, mirrors) {
        ALLOHA_NATIVE_HLS.headers = headers || {};
        ALLOHA_NATIVE_HLS.guardId = String(guardId || '');
        ALLOHA_NATIVE_HLS.edgeHash = '';
        ALLOHA_NATIVE_HLS.baseHost = '';
        ALLOHA_NATIVE_HLS.primaryBase = allohaHlsBase(url);
        ALLOHA_NATIVE_HLS.mirrorBases = allohaUniqueBases(
            (mirrors && mirrors.length ? mirrors : [url])
        );
        if (
            ALLOHA_NATIVE_HLS.primaryBase &&
            ALLOHA_NATIVE_HLS.mirrorBases.indexOf(
                ALLOHA_NATIVE_HLS.primaryBase
            ) < 0
        ) {
            ALLOHA_NATIVE_HLS.mirrorBases.unshift(
                ALLOHA_NATIVE_HLS.primaryBase
            );
        }
        ALLOHA_NATIVE_HLS.activeBase =
            ALLOHA_NATIVE_HLS.primaryBase ||
            ALLOHA_NATIVE_HLS.mirrorBases[0] ||
            '';
        ALLOHA_NATIVE_HLS.failedUrls = {};
        ALLOHA_NATIVE_HLS.lastMirrorSwitch = null;
        ALLOHA_NATIVE_HLS.fragmentSuccessCount = 0;
        ALLOHA_NATIVE_HLS.lastSuccess = null;
        ALLOHA_NATIVE_HLS.history = [];
        ALLOHA_NATIVE_HLS.lastError = null;

        try {
            ALLOHA_NATIVE_HLS.baseHost =
                new URL(stripHash(url)).hostname.toLowerCase();
        } catch (e0) {}

        if (ALLOHA_NATIVE_HLS.installed) return true;

        if (
            typeof Hls === 'undefined' ||
            !Hls.DefaultConfig ||
            !Hls.DefaultConfig.loader
        ) {
            return false;
        }

        var OriginalLoader = Hls.DefaultConfig.loader;
        ALLOHA_NATIVE_HLS.originalLoader = OriginalLoader;

        function AllohaNativeLoader(config) {
            this.config = config;
            this.context = null;
            this.stats = hlsNativeStats();
            this.network = null;
            this.fallback = null;
            this.waitTimer = null;
        }

        AllohaNativeLoader.prototype.destroy = function () {
            this.abort();
            this.context = null;
            this.config = null;
        };

        AllohaNativeLoader.prototype.abort = function () {
            this.stats.aborted = true;
            try {
                if (this.waitTimer) clearTimeout(this.waitTimer);
            } catch (e0) {}
            this.waitTimer = null;

            try {
                if (this.network && this.network.clear) {
                    this.network.clear();
                }
            } catch (e1) {}

            try {
                if (this.fallback && this.fallback.abort) {
                    this.fallback.abort();
                }
            } catch (e2) {}
        };

        AllohaNativeLoader.prototype.getCacheAge = function () {
            return null;
        };

        AllohaNativeLoader.prototype.getResponseHeader = function () {
            return null;
        };

        AllohaNativeLoader.prototype.load = function (
            context,
            config,
            callbacks
        ) {
            this.context = context;
            this.stats = hlsNativeStats();

            var originalRequestUrl =
                stripHash(context && context.url || '');
            var requestUrl =
                allohaRewriteToActiveBase(originalRequestUrl);

            if (!isAllohaCdnUrl(originalRequestUrl)) {
                this.fallback = new OriginalLoader(this.config);
                this.fallback.load(context, config, callbacks);
                this.stats = this.fallback.stats || this.stats;
                return;
            }

            var self = this;
            var contextType =
                String(context && context.type || '').toLowerCase();
            var isManifest =
                contextType === 'manifest';
            var isBinary =
                String(
                    context && context.responseType || ''
                ).toLowerCase() === 'arraybuffer';

            function doLoad() {
                if (self.stats.aborted) return;

                var headers = {};
                var baseHeaders =
                    ALLOHA_NATIVE_HLS.headers || {};

                Object.keys(baseHeaders).forEach(function (k) {
                    headers[k] = baseHeaders[k];
                });

                /*
                 * HAR:
                 * - master.m3u8 -> 64-char Borth fingerprint
                 * - level/fragment -> WS config_update.edge_hash
                 */
                headers['Accepts-Controls'] =
                    isManifest
                        ? ALLOHA_NATIVE_HLS.guardId
                        : (
                            ALLOHA_NATIVE_HLS.edgeHash ||
                            ALLOHA_NATIVE_HLS.guardId
                        );

                /*
                 * Real Alloha requests in the HAR use a wildcard Accept header for master, level,
                 * init and fragments. Keep the request shape literal.
                 */
                headers.Accept = '*/*';

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

                try {
                    network = new Lampa.Reguest();
                } catch (e3) {
                    try {
                        network = new Lampa.Request();
                    } catch (e4) {}
                }

                if (
                    !network ||
                    typeof network.native !== 'function'
                ) {
                    callbacks.onError(
                        {
                            code: 0,
                            text: 'Lampa.Reguest.native unavailable'
                        },
                        context,
                        null,
                        self.stats
                    );
                    return;
                }

                self.network = network;

                var timeout =
                    (
                        config &&
                        (
                            config.timeout ||
                            config.maxLoadTimeMs
                        )
                    ) ||
                    20000;

                try {
                    if (network.timeout) {
                        network.timeout(
                            Math.max(5000, timeout)
                        );
                    }
                } catch (e5) {}

                ALLOHA_NATIVE_HLS.lastRequest = {
                    type: contextType,
                    responseType:
                        String(
                            context &&
                            context.responseType ||
                            ''
                        ),
                    originalRequestUrl: originalRequestUrl,
                    requestUrl: requestUrl,
                    activeBase: ALLOHA_NATIVE_HLS.activeBase,
                    acceptsControls:
                        headers['Accepts-Controls'],
                    hasAuth:
                        !!headers.Authorizations
                };

                try {
                    window.__mnogotv_alloha_debug =
                        ALLOHA_NATIVE_HLS;
                } catch (eDbg3) {}

                log(
                    'Alloha native loader request',
                    ALLOHA_NATIVE_HLS.lastRequest
                );

                try {
                    network.native(
                        requestUrl,
                        function (response) {
                            if (self.stats.aborted) return;

                            var now =
                                (
                                    window.performance &&
                                    performance.now
                                )
                                    ? performance.now()
                                    : Date.now();

                            self.stats.loading.first =
                                self.stats.loading.first || now;
                            self.stats.loading.end = now;

                            try {
                                var data;

                                if (isBinary) {
                                    data =
                                        base64ToArrayBuffer(response);
                                    self.stats.loaded =
                                        self.stats.total =
                                            data.byteLength || 0;
                                }
                                else {
                                    data =
                                        typeof response === 'string'
                                            ? response
                                            : String(response || '');
                                    self.stats.loaded =
                                        self.stats.total =
                                            data.length || 0;
                                }

                                self.stats.chunkCount = 1;
                                ALLOHA_NATIVE_HLS.lastError = null;

                                var successLeaf = allohaHlsLeaf(requestUrl);
                                var successInfo = {
                                    phase: isBinary ? 'binary-ok' : contextType + '-ok',
                                    leaf: successLeaf,
                                    bytes: self.stats.loaded || 0,
                                    edgeLength: String(
                                        ALLOHA_NATIVE_HLS.edgeHash ||
                                        ALLOHA_NATIVE_HLS.guardId ||
                                        ''
                                    ).length,
                                    mirror: allohaActiveMirrorNumber(),
                                    ts: Date.now()
                                };

                                ALLOHA_NATIVE_HLS.lastSuccess = successInfo;
                                allohaPushHistory(successInfo);

                                if (/\.m4s(?:$|\?)/i.test(requestUrl)) {
                                    ALLOHA_NATIVE_HLS.fragmentSuccessCount++;

                                    if (ALLOHA_NATIVE_HLS.fragmentSuccessCount <= 2) {
                                        try {
                                            notify(
                                                'A22 OK ' + successLeaf +
                                                ' • ' + allohaHumanBytes(self.stats.loaded) +
                                                ' • edge' + successInfo.edgeLength +
                                                ' • M' + (successInfo.mirror || '?')
                                            );
                                        } catch (eNotifyOk) {}
                                    }
                                }

                                try {
                                    delete ALLOHA_NATIVE_HLS.failedUrls[
                                        originalRequestUrl
                                    ];
                                } catch (eClearFail) {}

                                callbacks.onSuccess(
                                    {
                                        url: context.url,
                                        data: data
                                    },
                                    self.stats,
                                    context,
                                    null
                                );
                            }
                            catch (decodeError) {
                                ALLOHA_NATIVE_HLS.lastError = {
                                    phase:
                                        isBinary
                                            ? 'fragment-decode'
                                            : contextType + '-decode',
                                    code: 0,
                                    text: errText(decodeError),
                                    requestUrl: requestUrl
                                };

                                try {
                                    window.__mnogotv_alloha_debug =
                                        ALLOHA_NATIVE_HLS;
                                } catch (eDbg4) {}

                                allohaPushHistory({
                                    phase: ALLOHA_NATIVE_HLS.lastError.phase,
                                    leaf: allohaHlsLeaf(requestUrl),
                                    edgeLength: String(
                                        ALLOHA_NATIVE_HLS.edgeHash ||
                                        ALLOHA_NATIVE_HLS.guardId ||
                                        ''
                                    ).length,
                                    mirror: allohaActiveMirrorNumber(),
                                    ts: Date.now()
                                });

                                try {
                                    notify(
                                        'A22 DECODE ' + allohaHlsLeaf(requestUrl) +
                                        ' • edge' +
                                        String(
                                            ALLOHA_NATIVE_HLS.edgeHash ||
                                            ALLOHA_NATIVE_HLS.guardId ||
                                            ''
                                        ).length +
                                        ' • M' + (allohaActiveMirrorNumber() || '?')
                                    );
                                } catch (eNotifyDecode) {}

                                callbacks.onError(
                                    {
                                        code: 0,
                                        text:
                                            errText(decodeError)
                                    },
                                    context,
                                    null,
                                    self.stats
                                );
                            }
                        },
                        function (a, c) {
                            if (self.stats.aborted) return;

                            var status =
                                a &&
                                a.status !== undefined
                                    ? Number(a.status)
                                    : 0;

                            var nativeError =
                                errText(
                                    a ||
                                    c ||
                                    'native network error'
                                );

                            ALLOHA_NATIVE_HLS.failedUrls[
                                originalRequestUrl
                            ] = (
                                ALLOHA_NATIVE_HLS.failedUrls[
                                    originalRequestUrl
                                ] || 0
                            ) + 1;

                            /*
                             * /bnsi gives each quality as "primary or mirror".
                             * v4.0.20 preserved the second URL but never used it.
                             * Switch the whole relative HLS tree before Hls.js
                             * performs its next fragment retry.
                             */
                            var mirrorSwitched =
                                allohaSwitchMirror(requestUrl);

                            ALLOHA_NATIVE_HLS.lastError = {
                                phase:
                                    isBinary
                                        ? 'fragment-network'
                                        : contextType + '-network',
                                code: status || 0,
                                text: nativeError,
                                requestUrl: requestUrl,
                                originalRequestUrl: originalRequestUrl,
                                mirrorSwitched: mirrorSwitched,
                                activeBase: ALLOHA_NATIVE_HLS.activeBase,
                                acceptsControls:
                                    headers['Accepts-Controls']
                            };

                            try {
                                window.__mnogotv_alloha_debug =
                                    ALLOHA_NATIVE_HLS;
                            } catch (eDbg5) {}

                            log(
                                'Alloha native loader network error',
                                ALLOHA_NATIVE_HLS.lastError
                            );

                            var failedLeaf = allohaHlsLeaf(requestUrl);
                            var edgeLen = String(
                                ALLOHA_NATIVE_HLS.edgeHash ||
                                ALLOHA_NATIVE_HLS.guardId ||
                                ''
                            ).length;
                            var previousOk = ALLOHA_NATIVE_HLS.lastSuccess;

                            allohaPushHistory({
                                phase: ALLOHA_NATIVE_HLS.lastError.phase,
                                leaf: failedLeaf,
                                status: status || 0,
                                edgeLength: edgeLen,
                                mirror: allohaActiveMirrorNumber(),
                                mirrorSwitched: mirrorSwitched,
                                previous: previousOk && previousOk.leaf || '',
                                ts: Date.now()
                            });

                            try {
                                notify(
                                    'A22 FAIL ' + failedLeaf +
                                    ' • H' + (status || 0) +
                                    ' • edge' + edgeLen +
                                    ' • M' + (allohaActiveMirrorNumber() || '?') +
                                    (
                                        previousOk && previousOk.leaf
                                            ? ' • prev ' + previousOk.leaf
                                            : ''
                                    )
                                );
                            } catch (eNoty) {}

                            callbacks.onError(
                                {
                                    code: status || 0,
                                    text: nativeError
                                },
                                context,
                                a || null,
                                self.stats
                            );
                        },
                        false,
                        {
                            dataType:
                                isBinary
                                    ? 'base64'
                                    : 'text',
                            headers: headers
                        }
                    );
                }
                catch (e6) {
                    callbacks.onError(
                        {
                            code: 0,
                            text: errText(e6)
                        },
                        context,
                        null,
                        self.stats
                    );
                }
            }

            /*
             * A level request can start almost immediately after the master.
             * Give the WS config_update a short window to deliver edge_hash.
             */
            if (
                !isManifest &&
                !ALLOHA_NATIVE_HLS.edgeHash
            ) {
                var started = Date.now();

                (function waitEdge() {
                    if (self.stats.aborted) return;

                    if (
                        ALLOHA_NATIVE_HLS.edgeHash ||
                        Date.now() - started >= 3500
                    ) {
                        self.waitTimer = null;
                        doLoad();
                        return;
                    }

                    self.waitTimer =
                        setTimeout(waitEdge, 60);
                }());

                return;
            }

            doLoad();
        };

        try {
            Hls.DefaultConfig.loader =
                AllohaNativeLoader;
            ALLOHA_NATIVE_HLS.installed = true;

            log(
                'Alloha native Hls loader installed'
            );

            return true;
        }
        catch (e7) {
            log(
                'Alloha native Hls loader install failed',
                e7
            );
            return false;
        }
    }


    function resolveAlloha(
        source,
        imdb,
        season,
        episode,
        qualityLabel,
        voiceChoice,
        ok,
        fail
    ) {
        var iframe =
            normalizeDirectUrl(
                voiceChoice &&
                voiceChoice.iframeUrl
                    ? voiceChoice.iframeUrl
                    : (
                        source &&
                        source.iframeUrl
                    )
            );

        if (!iframe) {
            fail(new Error('Alloha: iframeUrl не получен'));
            return;
        }

        nativeText(
            iframe,
            allohaHeaders(iframe),
            function (html) {
                var pl = parseAllohaFileList(html);

                if (!pl) {
                    fail(new Error(
                        'Alloha: iframe открыт, но fileList не найден'
                    ));
                    return;
                }

                var media =
                    allohaPickMedia(
                        pl,
                        season,
                        episode,
                        voiceChoice
                    );

                if (!media || !media.id) {
                    fail(new Error(
                        'Alloha: media.id для выбранной серии/озвучки не найден'
                    ));
                    return;
                }

                var token = allohaExtractToken(html, iframe);
                var viewporti = allohaExtractViewporti(html);
                var appScript = allohaExtractAppScript(html, iframe);

                if (!token) {
                    fail(new Error('Alloha: token не найден в iframe'));
                    return;
                }

                if (!viewporti) {
                    fail(new Error('Alloha: meta viewporti не найден'));
                    return;
                }

                var guardId = allohaGuardId(iframe, media.id);
                var borthTail = allohaViewportBorth(viewporti);
                var borth = guardId + '|' + borthTail;
                var origin = '';
                var apiUrl = '';

                try {
                    origin = new URL(iframe).origin;
                    apiUrl = new URL(
                        (
                            String(pl.type || '').toLowerCase() === 'trailer'
                                ? '/bnsi/trailers/'
                                : '/bnsi/movies/'
                        ) + encodeURIComponent(media.id),
                        iframe
                    ).href;
                } catch (eUrl) {
                    fail(new Error('Alloha: не удалось построить /bnsi URL'));
                    return;
                }

                var postdata =
                    'token=' + encodeURIComponent(token) +
                    '&av1=true' +
                    '&autoplay=0' +
                    '&audio=' +
                    '&subtitle=';

                function requestBnsi(streamToken) {
                    nativeJson(
                        apiUrl,
                        {
                            'User-Agent': COLLAPS_UA,
                            'Accept': 'application/json, text/javascript, */*; q=0.01',
                            'Accept-Language': 'ru,en;q=0.9',
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            'Origin': origin,
                            'Referer': iframe,
                            'X-Requested-With': 'XMLHttpRequest',
                            'Borth': borth
                        },
                        function (json) {
                            /*
                             * v4.0.22 diagnostic probe: the captured real
                             * Alloha player selected 480p. Force the same
                             * quality for one test so Android native bridge
                             * carries ~0.5-1.3 MB fragments instead of much
                             * larger 1080p fragments. This isolates transport
                             * size/bridge pressure from auth/edge logic.
                             */
                            var probeQuality = '480p';
                            var picked =
                                allohaPickHls(
                                    json,
                                    probeQuality
                                );

                            if (
                                !picked ||
                                !picked.selected ||
                                !picked.selected.url
                            ) {
                                fail(new Error(
                                    'Alloha /bnsi: hlsSource пуст'
                                ));
                                return;
                            }

                            var hlsHeaders = {
                                'User-Agent': COLLAPS_UA,
                                'Origin': origin,
                                'Referer': iframe,
                                'Accepts-Controls': guardId
                            };

                            if (streamToken) {
                                hlsHeaders.Authorizations =
                                    'Bearer ' + streamToken;
                            }

                            var hlsNativeReady =
                                configureAllohaNativeHls(
                                    picked.selected.url,
                                    hlsHeaders,
                                    guardId,
                                    picked.selected.mirrors
                                );

                            var edgeSocketStarted =
                                startAllohaEdgeSocket(
                                    json,
                                    picked.selected.label ||
                                        probeQuality,
                                    picked.audioId
                                );

                            ok({
                                provider: 'Alloha',
                                directUrl: picked.selected.url,
                                directHeaders: hlsHeaders,
                                relayUrl: '',
                                relayReady: false,
                                externalDirect: false,
                                subtitles: allohaSubs(json.tracks || []),
                                tracks: [],
                                hlsQualities: picked.variants,
                                quality:
                                    picked.selected.label ||
                                    qualityLabel ||
                                    'Авто',
                                resolvedBy:
                                    'alloha native • bnsi same-origin' +
                                    ' • media ' + media.id +
                                    ' • guard ' +
                                    (streamToken ? 'full' : 'no-auth-token') +
                                    ' • hls ' +
                                    (hlsNativeReady ? 'native' : 'stock') +
                                    ' • edge ' +
                                    (edgeSocketStarted ? 'ws' : 'no-ws') +
                                    ' • probe480' +
                                    (
                                        picked.selected.mirrors &&
                                        picked.selected.mirrors.length > 1
                                            ? ' • 2cdn'
                                            : ''
                                    ) +
                                    ' • ' +
                                    (
                                        voiceChoice &&
                                        voiceChoice.label
                                            ? voiceChoice.label
                                            : 'Авто'
                                    )
                            });
                        },
                        function (eApi) {
                            fail(new Error(
                                'Alloha /bnsi native: ' + errText(eApi)
                            ));
                        },
                        postdata
                    );
                }

                /*
                 * The HLS guard token lives in the player bundle and can
                 * rotate. Fetch only the exact app.*.js referenced by this
                 * iframe. No host/domain guessing.
                 */
                if (appScript) {
                    nativeText(
                        appScript,
                        {
                            'User-Agent': COLLAPS_UA,
                            'Accept': '*/*',
                            'Referer': iframe
                        },
                        function (scriptText) {
                            requestBnsi(
                                allohaExtractStreamToken(scriptText)
                            );
                        },
                        function () {
                            requestBnsi('');
                        }
                    );
                }
                else {
                    requestBnsi('');
                }
            },
            function (e) {
                fail(new Error(
                    'Alloha iframe native: ' + errText(e)
                ));
            }
        );
    }


    function resolveNativeProvider(
        source,
        imdb,
        season,
        episode,
        qualityLabel,
        voiceChoice,
        ok,
        fail
    ) {
        var type = sourceType(source);
        var params = {
            imdb: imdb,
            provider: type,
            season: season,
            episode: episode,
            quality: qualityLabel || 'Авто'
        };

        if (voiceChoice) {
            if (voiceChoice.translationId) {
                params.translation = voiceChoice.translationId;
            }
            if (voiceChoice.iframeUrl) {
                /*
                 * URL передаётся только как подсказка. Worker обязан сверить
                 * его с /sources и не превращать endpoint в открытый proxy.
                 */
                params.translation_iframe = voiceChoice.iframeUrl;
            }
        }

        requestJson(
            resolverUrl('/native/resolve', params),
            function (data) {
                if (!data || data.ok === false) {
                    fail(new Error(
                        (data && (data.error || data.message)) ||
                        ((source.name || source.type || 'Источник') + ': native resolve failed')
                    ));
                    return;
                }

                var stream = normalizeDirectUrl(
                    data.url || data.stream || data.hls || ''
                );

                if (!stream) {
                    fail(new Error(
                        (source.name || source.type || 'Источник') + ': Worker не вернул media URL'
                    ));
                    return;
                }

                ok({
                    provider: data.provider || source.name || source.type || type,
                    directUrl: stream,
                    directHeaders: data.headers || {},
                    relayUrl: '',
                    relayReady: false,
                    externalDirect: false,
                    subtitles: normalizeSubs(data.subtitles || []),
                    tracks: Array.isArray(data.tracks) ? data.tracks : [],
                    hlsQualities: Array.isArray(data.qualities) ? data.qualities : [],
                    quality: data.quality || qualityLabel || 'Авто',
                    resolvedBy: data.resolvedBy || ('worker-native • ' + type)
                });
            },
            fail
        );
    }


    function resolveSource(source, imdb, season, episode, qualityLabel, voiceChoice, ok, fail) {
        var type =
            String(
                source && source.type || ''
            ).toLowerCase();

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

        if (type === 'alloha') {
            resolveAlloha(
                source,
                imdb,
                season,
                episode,
                qualityLabel,
                voiceChoice,
                ok,
                fail
            );
            return;
        }

        if (type === 'turbo') {
            resolveNativeProvider(
                source,
                imdb,
                season,
                episode,
                qualityLabel,
                voiceChoice,
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
            ': native-адаптер не реализован'
        ));
    }

    function playResolved(movie, season, episode, epMeta, source, resolved, runas, voiceChoice) {
        var title = titleOf(movie);

        if (season !== null && episode !== null) {
            title += ' • S' + season + 'E' + episode;
            if (epMeta && epMeta.name) title += ' • ' + epMeta.name;
        }

        var first = {
            url: resolved.directUrl,
            title: title,
            subtitles: resolved.subtitles || [],
            translate: { tracks: resolved.tracks || [] },
            timeline: timeline(movie, season, episode),
            headers: resolved.directHeaders || {},
            isonline: true
        };

        /*
         * Native-only: независимо от Android TV / webOS всегда используем
         * встроенный Lampa.Player. Внешние Android-плееры здесь запрещены
         * архитектурой этой ветки.
         */
        try { Lampa.Player.runas('lampa'); } catch (eRunas) {}

        var isCollapsDash =
            String(source && source.type || '').toLowerCase() === 'collaps' &&
            String(resolved && resolved.directUrl || '').indexOf('#manifest.mpd') >= 0;

        if (isCollapsDash) {
            /*
             * dash.js audio is selected by our WrappedMediaPlayer above.
             * Do not also apply the generic Lampa track parameter because its
             * track numbering is not guaranteed to match DASH AdaptationSets.
             */
            setCollapsDashAudioChoice(voiceChoice);
        }
        else {
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

        log('play', {
            source: source && source.type,
            runas: 'lampa',
            transport: 'native',
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
                value += ' • native';
            }
            else if (
                source &&
                type === 'collaps'
            ) {
                value += ' • native';
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
            playerMode = 'lampa';
            setPlayerLabel();
            notify('MnogoTV: все источники закреплены за встроенным Lampa.Player');
            try { Lampa.Controller.toggle('content'); } catch (e) {}
        }

        function chooseVoice() {
            if (!source) {
                notify('MnogoTV: источник не выбран');
                return;
            }

            if (hasProviderTranslations(source)) {
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
                voiceChoice,
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
                        ' • native';
                }
                else if (
                    type === 'collaps'
                ) {
                    suffix =
                        ' • native';
                }
                else if (!s.supported) {
                    suffix =
                        ' • пока без адаптера';
                }
                else if (
                    type === 'alloha'
                ) {
                    suffix =
                        ' • native';
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

        function playerMenu(ep) {
            playEpisode(ep, 'lampa');
        }

        function playEpisode(ep, runas) {
            if (!source) { notify('MnogoTV: источник не выбран'); return; }

            var epNum = isSeries(movie) ? parseInt(ep.episode_number || 0, 10) : null;

            status.text('Получаем поток ' + (source.name || source.type || '') + '…');
            resolveSource(
                source,
                imdb,
                isSeries(movie) ? season : null,
                epNum,
                qualityLabel,
                voiceChoice,
                function (resolved) {
                var actualRunas = 'lampa';

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
