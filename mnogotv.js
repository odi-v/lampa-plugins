(function () {
    'use strict';

    var VERSION = '3.0.0';
    var PLUGIN_ID = 'mnogotv_v300';
    var COMPONENT = 'mnogotv_v300_component';

    // Текущий Worker пользователя. Можно переопределить:
    // ?resolver=https%3A%2F%2Fexample.workers.dev
    var DEFAULT_RESOLVER = 'https://mnogotv-relay.odi-84v.workers.dev';

    if (window[PLUGIN_ID]) return;
    window[PLUGIN_ID] = true;

    var stateCache = {
        collaps: {}
    };

    function log() {
        try {
            console.log.apply(console, ['[MnogoTV ' + VERSION + ']'].concat([].slice.call(arguments)));
        } catch (e) {}
    }

    function notify(text) {
        try {
            if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(text);
        } catch (e) {}
    }

    function errorText(err) {
        if (!err) return 'неизвестная ошибка';
        if (typeof err === 'string') return err;
        if (err.message) return err.message;
        try { return JSON.stringify(err); } catch (e) {}
        return 'ошибка';
    }

    function scriptConfig() {
        var cfg = {
            resolver: DEFAULT_RESOLVER
        };

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

    var CONFIG = scriptConfig();

    function resolverUrl(path, params) {
        var base = CONFIG.resolver + path;
        var query = [];

        Object.keys(params || {}).forEach(function (key) {
            var value = params[key];

            if (value !== undefined && value !== null && value !== '') {
                query.push(
                    encodeURIComponent(key) + '=' + encodeURIComponent(String(value))
                );
            }
        });

        return base + (query.length ? '?' + query.join('&') : '');
    }

    function requestJson(url, ok, fail) {
        var network = null;

        try {
            network = new Lampa.Reguest();
        } catch (e) {
            try { network = new Lampa.Request(); } catch (e2) {}
        }

        var finished = false;

        function done(data) {
            if (finished) return;

            try {
                if (typeof data === 'string') data = JSON.parse(data);
            } catch (e) {
                bad(e);
                return;
            }

            finished = true;
            ok(data);
        }

        function bad(err) {
            if (finished) return;

            if (typeof fetch === 'function') {
                finished = true;

                var controller = typeof AbortController !== 'undefined'
                    ? new AbortController()
                    : null;

                var timer = setTimeout(function () {
                    try { if (controller) controller.abort(); } catch (e) {}
                }, 12000);

                fetch(url, {
                    method: 'GET',
                    cache: 'no-store',
                    credentials: 'omit',
                    signal: controller ? controller.signal : undefined
                }).then(function (r) {
                    clearTimeout(timer);
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                }).then(ok).catch(function (e) {
                    clearTimeout(timer);
                    fail(e || err || new Error('network error'));
                });

                return;
            }

            finished = true;
            fail(err || new Error('network error'));
        }

        if (network) {
            try {
                if (typeof network.native === 'function') {
                    network.timeout(12000);
                    network.native(url, done, bad, false, {
                        dataType: 'json'
                    });
                    return;
                }
            } catch (e3) {}

            try {
                if (typeof network.silent === 'function') {
                    network.timeout(12000);
                    network.silent(url, done, bad, false, {
                        dataType: 'json'
                    });
                    return;
                }
            } catch (e4) {}
        }

        bad(new Error('Lampa network unavailable'));
    }

    function tmdbId(movie) {
        if (!movie) return '';

        var source = movie.source || 'tmdb';
        var id = (source === 'tmdb' || source === 'cub')
            ? movie.id
            : (movie.tmdb_id || movie.id);

        id = String(id === undefined || id === null ? '' : id).trim();
        return /^\d+$/.test(id) ? id : '';
    }

    function isSeries(movie) {
        return !!(movie && (
            movie.media_type === 'tv' ||
            movie.number_of_seasons ||
            movie.first_air_date ||
            movie.name ||
            movie.original_name
        ));
    }

    function titleOf(movie) {
        return (movie && (
            movie.title ||
            movie.name ||
            movie.original_title ||
            movie.original_name
        )) || 'MnogoTV';
    }

    function posterUrl(movie) {
        try {
            if (movie && movie.poster_path && Lampa.TMDB && Lampa.TMDB.image) {
                return Lampa.TMDB.image('t/p/w300' + movie.poster_path);
            }
        } catch (e) {}

        return '';
    }

    function episodeImage(ep) {
        try {
            if (ep && ep.still_path && Lampa.TMDB && Lampa.TMDB.image) {
                return Lampa.TMDB.image('t/p/w300' + ep.still_path);
            }
        } catch (e) {}

        return '';
    }

    function episodeDate(raw) {
        if (!raw) return '';

        try {
            var p = String(raw).split('-');

            if (p.length === 3) {
                var months = [
                    'Января', 'Февраля', 'Марта', 'Апреля',
                    'Мая', 'Июня', 'Июля', 'Августа',
                    'Сентября', 'Октября', 'Ноября', 'Декабря'
                ];

                return parseInt(p[2], 10) + ' ' +
                    (months[parseInt(p[1], 10) - 1] || p[1]) +
                    ' ' + p[0];
            }
        } catch (e) {}

        return String(raw);
    }

    function getImdb(movie, ok, fail) {
        var direct = movie && (
            movie.imdb_id ||
            (movie.external_ids && movie.external_ids.imdb_id)
        );

        if (direct && /^tt\d+$/i.test(String(direct))) {
            ok(String(direct));
            return;
        }

        var id = tmdbId(movie);

        if (!id) {
            fail(new Error('TMDB ID не найден'));
            return;
        }

        var path = (isSeries(movie) ? 'tv/' : 'movie/') + id + '/external_ids';

        try {
            Lampa.Api.sources.tmdb.get(
                path,
                {},
                function (data) {
                    var imdb = data && data.imdb_id;

                    if (imdb && /^tt\d+$/i.test(String(imdb))) {
                        ok(String(imdb));
                    }
                    else {
                        fail(new Error('IMDb ID не найден'));
                    }
                },
                function (e) {
                    fail(e || new Error('TMDB external_ids недоступен'));
                }
            );
        } catch (e2) {
            fail(e2);
        }
    }

    function getSeasons(movie, ok, fail) {
        var arr = [];

        if (movie && Array.isArray(movie.seasons)) {
            movie.seasons.forEach(function (s) {
                var n = parseInt(s && s.season_number, 10);
                if (n > 0) arr.push(n);
            });
        }

        if (arr.length) {
            ok(arr);
            return;
        }

        var count = parseInt(movie && movie.number_of_seasons, 10);

        if (count > 0) {
            for (var i = 1; i <= count; i++) arr.push(i);
            ok(arr);
            return;
        }

        var id = tmdbId(movie);

        try {
            Lampa.Api.sources.tmdb.get(
                'tv/' + id,
                {},
                function (data) {
                    var seasons = [];

                    (data && data.seasons || []).forEach(function (s) {
                        var n = parseInt(s.season_number, 10);
                        if (n > 0) seasons.push(n);
                    });

                    if (seasons.length) ok(seasons);
                    else fail(new Error('Сезоны не найдены'));
                },
                fail
            );
        } catch (e) {
            fail(e);
        }
    }

    function getEpisodes(movie, season, ok, fail) {
        var id = tmdbId(movie);

        if (!id) {
            fail(new Error('TMDB ID не найден'));
            return;
        }

        try {
            Lampa.Api.sources.tmdb.get(
                'tv/' + id + '/season/' + season,
                {},
                function (data) {
                    var episodes = data && data.episodes || [];

                    if (episodes.length) ok(episodes);
                    else fail(new Error('Серии не найдены'));
                },
                fail
            );
        } catch (e) {
            fail(e);
        }
    }

    function getSources(imdb, ok, fail) {
        requestJson(
            resolverUrl('/sources', { imdb: imdb }),
            function (response) {
                var sources = response && response.sources || [];

                if (!Array.isArray(sources)) sources = [];

                var hasCollaps = sources.some(function (s) {
                    return String(s && s.type || '').toLowerCase() === 'collaps';
                });

                // Надёжный резерв из online_mod: Collaps по IMDb напрямую.
                if (!hasCollaps) {
                    sources.unshift({
                        type: 'Collaps',
                        name: 'Collaps',
                        supported: true,
                        fallback: true
                    });
                }

                sources.forEach(function (source) {
                    var type = String(source && source.type || '').toLowerCase();
                    source.supported = type === 'collaps';
                });

                ok(sources);
            },
            fail
        );
    }

    function getCollapsConfig(imdb, ok, fail) {
        if (stateCache.collaps[imdb]) {
            ok(stateCache.collaps[imdb]);
            return;
        }

        requestJson(
            resolverUrl('/collaps/config', { imdb: imdb }),
            function (response) {
                if (!response || !response.ok || !response.config) {
                    fail(new Error(
                        response && response.error
                            ? response.error
                            : 'Collaps config не получен'
                    ));
                    return;
                }

                stateCache.collaps[imdb] = response;
                ok(response);
            },
            fail
        );
    }

    function parseCollapsConfig(raw) {
        raw = String(raw || '');

        if (!raw) return null;

        try {
            return (new Function('"use strict"; return (' + raw + ');'))();
        } catch (e) {
            try {
                return (0, eval)('(' + raw + ')');
            } catch (e2) {
                return null;
            }
        }
    }

    function chooseCollapsEpisode(config, season, episode) {
        if (!config) return null;

        if (season !== null && episode !== null &&
            config.playlist && Array.isArray(config.playlist.seasons)) {

            var seasonNode = null;

            config.playlist.seasons.some(function (s) {
                if (Number(s.season) === Number(season)) {
                    seasonNode = s;
                    return true;
                }

                return false;
            });

            if (!seasonNode) return null;

            var episodeNode = null;

            (seasonNode.episodes || []).some(function (ep) {
                if (Number(ep.episode) === Number(episode)) {
                    episodeNode = ep;
                    return true;
                }

                return false;
            });

            return episodeNode;
        }

        return config.source || null;
    }

    function normalizeSubs(list, ref) {
        if (!Array.isArray(list)) return [];

        return list.map(function (s) {
            if (!s) return null;

            var url = typeof s === 'string'
                ? s
                : (s.url || s.file || s.src || '');

            if (!url) return null;

            return {
                label: (s && (s.name || s.label || s.lang)) || 'Субтитры',
                url: resolverUrl('/media', {
                    url: url,
                    ref: ref
                })
            };
        }).filter(Boolean);
    }

    function normalizeTracks(audio) {
        var names = audio && Array.isArray(audio.names)
            ? audio.names
            : [];

        var order = audio && Array.isArray(audio.order)
            ? audio.order
            : [];

        var tracks = names.map(function (name, index) {
            return {
                language: name,
                order: order[index] !== undefined
                    ? order[index]
                    : 1000
            };
        }).filter(function (item) {
            return item.language && item.language !== 'delete';
        });

        tracks.sort(function (a, b) {
            return a.order - b.order;
        });

        return tracks.map(function (item) {
            return { language: item.language };
        });
    }

    function timeline(movie, season, episode) {
        try {
            var base = movie.original_title || movie.original_name || titleOf(movie);
            var key = season && episode
                ? [season, episode, base].join('')
                : base;

            return Lampa.Timeline.view(Lampa.Utils.hash(key));
        } catch (e) {
            return undefined;
        }
    }

    function resolveCollaps(imdb, season, episode, ok, fail) {
        getCollapsConfig(imdb, function (response) {
            var cfg = parseCollapsConfig(response.config);

            if (!cfg) {
                fail(new Error('Collaps makePlayer не разобран'));
                return;
            }

            var item = chooseCollapsEpisode(cfg, season, episode);

            if (!item) {
                fail(new Error(
                    season !== null
                        ? 'Collaps: серия не найдена'
                        : 'Collaps: поток не найден'
                ));
                return;
            }

            var stream = item.hls ||
                (item.source && item.source.hls) ||
                '';

            if (!stream && season === null && cfg.source) {
                stream = cfg.source.hls || '';
                item = cfg.source;
            }

            if (!stream) {
                fail(new Error('Collaps: HLS не найден'));
                return;
            }

            // online_mod добавляет буквально "&vp".
            if (stream.indexOf('&vp') === -1) stream += '&vp';

            ok({
                provider: 'Collaps',
                url: resolverUrl('/media', {
                    url: stream,
                    ref: response.ref
                }),
                subtitles: normalizeSubs(item.cc || item.subtitles || [], response.ref),
                tracks: normalizeTracks(item.audio || {}),
                ref: response.ref
            });
        }, fail);
    }

    function resolveSource(source, imdb, season, episode, ok, fail) {
        var type = String(source && source.type || '').toLowerCase();

        if (type === 'collaps') {
            resolveCollaps(imdb, season, episode, ok, fail);
            return;
        }

        fail(new Error(
            (source && (source.name || source.type) || 'Источник') +
            ': адаптер ещё не реализован'
        ));
    }

    function playResolved(movie, season, episode, epMeta, source, resolved, runas) {
        var title = titleOf(movie);

        if (season !== null && episode !== null) {
            title += ' • S' + season + 'E' + episode;

            if (epMeta && epMeta.name) {
                title += ' • ' + epMeta.name;
            }
        }

        var first = {
            url: resolved.url,
            title: title,
            subtitles: resolved.subtitles || [],
            translate: {
                tracks: resolved.tracks || []
            },
            timeline: timeline(movie, season, episode),
            isonline: true
        };

        if (runas) {
            try {
                Lampa.Player.runas(runas);
            } catch (e) {}
        }

        log('play', {
            source: source && source.type,
            runas: runas || 'default',
            url: resolved.url
        });

        Lampa.Player.play(first);
        Lampa.Player.playlist([first]);
    }

    function addCss() {
        if (document.getElementById('mnogotv-v300-style')) return;

        var css = `
        .mnogotv-v300{
            width:100%;
            box-sizing:border-box;
            padding:.6em 1.3em 2em;
        }

        .mnogotv-v300__toolbar{
            display:flex;
            gap:.8em;
            align-items:center;
            flex-wrap:wrap;
            margin-bottom:.7em;
        }

        .mnogotv-v300__filter{
            min-width:10em;
            padding:.65em 1em;
            border-radius:.45em;
            background:rgba(255,255,255,.12);
            box-sizing:border-box;
        }

        .mnogotv-v300__filter-title{
            opacity:.7;
            font-size:.76em;
            display:block;
            margin-bottom:.15em;
        }

        .mnogotv-v300__filter-value{
            font-size:1em;
            font-weight:500;
            display:block;
            max-width:18em;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
        }

        .mnogotv-v300__filter.focus,
        .mnogotv-v300__episode.focus{
            background:rgba(255,255,255,.08);
            box-shadow:0 0 0 .16em #fff;
        }

        .mnogotv-v300__status{
            opacity:.72;
            margin:.3em 0 .7em;
            min-height:1.2em;
        }

        .mnogotv-v300__episode{
            display:flex;
            align-items:center;
            gap:1.5em;
            width:100%;
            min-height:9.2em;
            box-sizing:border-box;
            padding:1em .5em;
            border-top:.13em solid rgba(255,255,255,.58);
            position:relative;
        }

        .mnogotv-v300__episode:last-child{
            border-bottom:.13em solid rgba(255,255,255,.58);
        }

        .mnogotv-v300__thumb{
            position:relative;
            width:18em;
            height:10.1em;
            flex:0 0 18em;
            border-radius:.45em;
            overflow:hidden;
            background:rgba(255,255,255,.08);
        }

        .mnogotv-v300__thumb img{
            width:100%;
            height:100%;
            object-fit:cover;
            display:block;
        }

        .mnogotv-v300__num{
            position:absolute;
            left:.5em;
            bottom:.32em;
            font-size:2.2em;
            font-weight:700;
            line-height:1;
            text-shadow:0 .08em .18em #000;
        }

        .mnogotv-v300__episode-body{
            flex:1;
            min-width:0;
        }

        .mnogotv-v300__episode-title{
            font-size:1.65em;
            line-height:1.15;
            font-weight:500;
            margin-bottom:.45em;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
        }

        .mnogotv-v300__episode-meta{
            opacity:.88;
            font-size:1.05em;
        }

        .mnogotv-v300__empty{
            padding:2em 0;
            opacity:.8;
        }

        @media(max-width:700px){
            .mnogotv-v300{
                padding:.5em .8em 1.5em;
            }

            .mnogotv-v300__episode{
                gap:.9em;
                min-height:6.4em;
                padding:.7em .2em;
            }

            .mnogotv-v300__thumb{
                width:10.5em;
                height:5.9em;
                flex-basis:10.5em;
            }

            .mnogotv-v300__num{
                font-size:1.5em;
            }

            .mnogotv-v300__episode-title{
                font-size:1.15em;
            }

            .mnogotv-v300__episode-meta{
                font-size:.85em;
            }
        }`;

        var style = document.createElement('style');
        style.id = 'mnogotv-v300-style';
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

        var root = $('<div class="mnogotv-v300"></div>');
        var toolbar = $('<div class="mnogotv-v300__toolbar"></div>');
        var status = $('<div class="mnogotv-v300__status"></div>');
        var sourceButton = $(
            '<div class="mnogotv-v300__filter selector">' +
                '<span class="mnogotv-v300__filter-title">Источник</span>' +
                '<span class="mnogotv-v300__filter-value">Загрузка…</span>' +
            '</div>'
        );
        var seasonButton = $(
            '<div class="mnogotv-v300__filter selector">' +
                '<span class="mnogotv-v300__filter-title">Фильтр</span>' +
                '<span class="mnogotv-v300__filter-value">Сезон 1</span>' +
            '</div>'
        );

        var scroll = new Lampa.Scroll({
            mask: true,
            over: true
        });

        function setSourceLabel() {
            sourceButton.find('.mnogotv-v300__filter-value').text(
                source
                    ? (source.name || source.type || 'Источник')
                    : 'Нет'
            );
        }

        function setSeasonLabel() {
            seasonButton.find('.mnogotv-v300__filter-value').text(
                'Сезон ' + season
            );
        }

        function supportedSources() {
            return sources.filter(function (s) {
                return s && s.supported;
            });
        }

        function chooseSource() {
            var enabled = 'mnogotv_v300';
            var items = [];

            sources.forEach(function (s) {
                items.push({
                    title: (s.name || s.type || 'Источник') +
                        (s.supported ? '' : ' • пока без адаптера'),
                    source: s,
                    selected: source === s
                });
            });

            items.push({
                title: '← Назад',
                goBack: true
            });

            Lampa.Select.show({
                title: 'MnogoTV — источник',
                items: items,

                onBack: function () {
                    Lampa.Controller.toggle(enabled);
                },

                onSelect: function (item) {
                    if (item.goBack) {
                        Lampa.Controller.toggle(enabled);
                        return;
                    }

                    if (!item.source.supported) {
                        notify(
                            'MnogoTV: ' +
                            (item.source.name || item.source.type) +
                            ' пока без отдельного адаптера'
                        );
                        Lampa.Controller.toggle(enabled);
                        return;
                    }

                    source = item.source;
                    setSourceLabel();
                    Lampa.Controller.toggle(enabled);
                }
            });
        }

        function chooseSeason() {
            var enabled = 'mnogotv_v300';

            var items = seasons.map(function (n) {
                return {
                    title: 'Сезон ' + n,
                    season: n,
                    selected: Number(n) === Number(season)
                };
            });

            items.push({
                title: '← Назад',
                goBack: true
            });

            Lampa.Select.show({
                title: 'MnogoTV — сезон',
                items: items,

                onBack: function () {
                    Lampa.Controller.toggle(enabled);
                },

                onSelect: function (item) {
                    if (item.goBack) {
                        Lampa.Controller.toggle(enabled);
                        return;
                    }

                    season = item.season;
                    setSeasonLabel();
                    Lampa.Controller.toggle(enabled);
                    renderEpisodes();
                }
            });
        }

        function playerMenu(ep) {
            if (!Lampa.Platform || !Lampa.Platform.is ||
                !Lampa.Platform.is('android')) {

                playEpisode(ep, '');
                return;
            }

            var enabled = 'mnogotv_v300';

            Lampa.Select.show({
                title: 'Играть',
                items: [
                    {
                        title: 'По умолчанию',
                        runas: ''
                    },
                    {
                        title: 'Android / внешний плеер',
                        runas: 'android'
                    },
                    {
                        title: 'Lampa',
                        runas: 'lampa'
                    }
                ],
                onBack: function () {
                    Lampa.Controller.toggle(enabled);
                },
                onSelect: function (item) {
                    Lampa.Controller.toggle(enabled);
                    playEpisode(ep, item.runas || '');
                }
            });
        }

        function playEpisode(ep, runas) {
            if (!source) {
                notify('MnogoTV: источник не выбран');
                return;
            }

            var episode = isSeries(movie)
                ? parseInt(ep.episode_number || 0, 10)
                : null;

            status.text(
                'Получаем поток ' +
                (source.name || source.type || '') +
                '…'
            );

            resolveSource(
                source,
                imdb,
                isSeries(movie) ? season : null,
                episode,
                function (resolved) {
                    status.text(
                        (source.name || source.type || 'Источник') +
                        ' • готово'
                    );

                    playResolved(
                        movie,
                        isSeries(movie) ? season : null,
                        episode,
                        ep,
                        source,
                        resolved,
                        runas
                    );
                },
                function (e) {
                    status.text('Ошибка: ' + errorText(e));
                    notify('MnogoTV: ' + errorText(e));
                }
            );
        }

        function makeEpisode(ep) {
            var num = parseInt(ep.episode_number || 0, 10);
            var title = ep.name || ('Серия ' + num);

            var item = $(
                '<div class="mnogotv-v300__episode selector">' +
                    '<div class="mnogotv-v300__thumb">' +
                        '<img>' +
                        '<div class="mnogotv-v300__num"></div>' +
                    '</div>' +
                    '<div class="mnogotv-v300__episode-body">' +
                        '<div class="mnogotv-v300__episode-title"></div>' +
                        '<div class="mnogotv-v300__episode-meta"></div>' +
                    '</div>' +
                '</div>'
            );

            item.find('.mnogotv-v300__num').text(
                ('0' + num).slice(-2)
            );

            item.find('.mnogotv-v300__episode-title').text(title);

            var meta = [];

            if (ep.vote_average) {
                meta.push('★ ' + parseFloat(ep.vote_average).toFixed(1));
            }

            if (ep.air_date) {
                meta.push(episodeDate(ep.air_date));
            }

            item.find('.mnogotv-v300__episode-meta').text(
                meta.join('  •  ')
            );

            var image = episodeImage(ep);

            if (image) item.find('img').attr('src', image);
            else item.find('img').hide();

            item.on('hover:focus', function (e) {
                last = e.target;

                try {
                    scroll.update($(e.target), true);
                } catch (err) {}
            });

            item.on('hover:enter click', function () {
                playEpisode(ep, '');
            });

            item.on('hover:long', function () {
                playerMenu(ep);
            });

            return item;
        }

        function renderMovie() {
            scroll.clear();

            var item = $(
                '<div class="mnogotv-v300__episode selector">' +
                    '<div class="mnogotv-v300__episode-body">' +
                        '<div class="mnogotv-v300__episode-title">Смотреть фильм</div>' +
                        '<div class="mnogotv-v300__episode-meta"></div>' +
                    '</div>' +
                '</div>'
            );

            item.find('.mnogotv-v300__episode-meta').text(
                source
                    ? (source.name || source.type || '')
                    : 'MnogoTV'
            );

            item.on('hover:focus', function (e) {
                last = e.target;
            });

            item.on('hover:enter click', function () {
                playEpisode({}, '');
            });

            item.on('hover:long', function () {
                playerMenu({});
            });

            scroll.append(item);
        }

        function renderEpisodes() {
            scroll.clear();
            last = sourceButton[0];

            if (!isSeries(movie)) {
                renderMovie();
                return;
            }

            status.text('Загрузка серий…');

            getEpisodes(movie, season, function (list) {
                episodes = list;
                scroll.clear();

                status.text(
                    (source ? (source.name || source.type) : 'MnogoTV') +
                    ' • ' + episodes.length + ' серий'
                );

                episodes.forEach(function (ep) {
                    scroll.append(makeEpisode(ep));
                });

                try {
                    Lampa.Controller.toggle('mnogotv_v300');
                } catch (e) {}
            }, function (e) {
                status.text('Ошибка: ' + errorText(e));
            });
        }

        function initData() {
            status.text('Подключение к MnogoTV resolver…');

            getImdb(movie, function (id) {
                imdb = id;

                getSources(imdb, function (list) {
                    sources = list;

                    var supported = supportedSources();
                    source = supported[0] || null;
                    setSourceLabel();

                    if (!source) {
                        status.text('Нет поддерживаемых источников');
                        return;
                    }

                    if (isSeries(movie)) {
                        getSeasons(movie, function (listSeasons) {
                            seasons = listSeasons;
                            season = seasons[0] || 1;
                            setSeasonLabel();
                            renderEpisodes();
                        }, function (e) {
                            status.text('Ошибка сезонов: ' + errorText(e));
                        });
                    }
                    else {
                        seasonButton.hide();
                        status.text(
                            (source.name || source.type) + ' • готово'
                        );
                        renderMovie();
                    }
                }, function (e) {
                    status.text('Resolver: ' + errorText(e));
                });
            }, function (e) {
                status.text('IMDb: ' + errorText(e));
            });
        }

        sourceButton.on('hover:focus', function (e) {
            last = e.target;
        });

        seasonButton.on('hover:focus', function (e) {
            last = e.target;
        });

        sourceButton.on('hover:enter click', chooseSource);
        seasonButton.on('hover:enter click', chooseSeason);

        this.create = function () {
            return this.render();
        };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;

            if (!initialized) {
                initialized = true;

                addCss();

                toolbar.append(sourceButton);
                toolbar.append(seasonButton);

                root.append(toolbar);
                root.append(status);

                scroll.render().addClass('mnogotv-v300__scroll');
                root.append(scroll.render());

                try {
                    var bg = Lampa.Utils.cardImgBackgroundBlur(movie);

                    if (bg) Lampa.Background.immediately(bg);
                } catch (e) {}

                initData();
            }

            Lampa.Controller.add('mnogotv_v300', {
                toggle: function () {
                    Lampa.Controller.collectionSet(root);
                    Lampa.Controller.collectionFocus(
                        last || sourceButton[0],
                        root
                    );
                },

                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },

                down: function () {
                    Navigator.move('down');
                },

                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },

                right: function () {
                    Navigator.move('right');
                },

                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('mnogotv_v300');
        };

        this.render = function () {
            return root;
        };

        this.pause = function () {};

        this.stop = function () {};

        this.destroy = function () {
            try { scroll.destroy(); } catch (e) {}
            root.remove();
        };
    }

    function registerComponent() {
        try {
            if (!Lampa.Component || typeof Lampa.Component.add !== 'function') {
                return false;
            }

            try {
                Lampa.Component.add(COMPONENT, MnogoComponent);
            } catch (e) {}

            return true;
        } catch (e2) {
            return false;
        }
    }

    function openComponent(movie) {
        if (!registerComponent()) {
            notify('MnogoTV: Lampa.Component недоступен');
            return;
        }

        Lampa.Activity.push({
            title: 'MnogoTV',
            component: COMPONENT,
            movie: movie,
            page: 1,
            noinfo: true
        });
    }

    function addButton(e) {
        if (!e || e.type !== 'complite') return;

        try {
            var root = e.object && e.object.activity &&
                e.object.activity.render
                ? e.object.activity.render()
                : null;

            if (!root || !root.length) return;
            if (root.find('.mnogotv-v300-button').length) return;

            var movie = (e.data && e.data.movie) ||
                e.movie ||
                e.object.card ||
                {};

            var button = $(
                '<div class="full-start__button selector view--online mnogotv-v300-button" data-subtitle="MnogoTV">' +
                    '<svg class="button__icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                        '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/>' +
                        '<path d="M10 9l5 3-5 3V9z" fill="currentColor"/>' +
                    '</svg>' +
                    '<span>MnogoTV</span>' +
                '</div>'
            );

            button.on('hover:enter click', function () {
                openComponent(movie);
            });

            var torrent = root.find('.view--torrent').first();
            var online = root.find('.view--online').last();
            var box = root.find(
                '.full-start-new__buttons, .full-start__buttons'
            ).first();

            if (torrent.length) torrent.after(button);
            else if (online.length) online.after(button);
            else if (box.length) box.append(button);

        } catch (err) {
            log('addButton error', err);
        }
    }

    function start() {
        if (!window.Lampa || !Lampa.Listener || !Lampa.Player) {
            setTimeout(start, 500);
            return;
        }

        registerComponent();

        Lampa.Listener.follow('full', function (e) {
            if (e && e.type === 'complite') addButton(e);
        });

        notify(
            'MnogoTV v' + VERSION +
            ' • resolver'
        );

        log('started', {
            resolver: CONFIG.resolver
        });
    }

    start();
})();
