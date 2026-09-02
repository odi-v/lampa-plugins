(function () {
    'use strict';

    /*
     * MnogoTV Simple for Lampa
     *
     * Цель: минимум собственного UI и максимум штатных механизмов Lampa.
     * Карточка -> источник MnogoTV -> плеер/озвучка -> сезон/серия -> прямой поток -> Lampa.Player.
     *
     * На Android перед запуском используется Lampa.Player.runas('android'),
     * чтобы поток ушёл во внешний плеер устройства.
     */

    var VERSION = '2.0.0';
    var ID = 'mnogotv_simple_v200';
    var COMPONENT = 'mnogotv_simple';
    var PLAYERS_API = 'https://fbphdplay.top/api/players?imdb=';
    var COLLAPS_FALLBACK = 'https://api.ortified.ws/embed/imdb/';
    var USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; SmartTV) AppleWebKit/537.36 Chrome/120 Safari/537.36';

    if (window[ID]) return;
    window[ID] = true;

    function log() {
        try {
            console.log.apply(console, ['[MnogoTV Simple ' + VERSION + ']'].concat([].slice.call(arguments)));
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

        var parts = [];
        if (err.status !== undefined) parts.push('HTTP ' + err.status);
        if (err.statusText) parts.push(err.statusText);
        if (err.responseText && typeof err.responseText === 'string') {
            parts.push(err.responseText.slice(0, 160));
        }

        if (parts.length) return parts.join(' • ');

        try {
            return JSON.stringify(err);
        } catch (e) {
            return 'ошибка сети';
        }
    }

    function newRequest() {
        try {
            if (Lampa.Reguest) return new Lampa.Reguest();
        } catch (e) {}
        try {
            if (Lampa.Request) return new Lampa.Request();
        } catch (e) {}
        return null;
    }

    /*
     * У online-плагинов Lampa для источников применяется Reguest.native,
     * потому что WebView часто ограничен CORS. silent оставлен как fallback.
     */
    function request(url, dataType, headers, ok, fail) {
        var network = newRequest();
        var finished = false;
        var methods = [];

        if (network) {
            if (typeof network.native === 'function') methods.push('native');
            if (typeof network.silent === 'function') methods.push('silent');
            else if (typeof network.quiet === 'function') methods.push('quiet');
        }

        function success(data) {
            if (finished) return;
            finished = true;

            if (dataType === 'json' && typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    fail(e);
                    return;
                }
            }

            ok(data);
        }

        function next(index, previous) {
            if (finished) return;

            if (!network || index >= methods.length) {
                fetchFallback(previous);
                return;
            }

            try {
                if (typeof network.clear === 'function') network.clear();
                if (typeof network.timeout === 'function') network.timeout(12000);

                network[methods[index]](
                    url,
                    success,
                    function (a, c) {
                        next(index + 1, a || c || previous);
                    },
                    false,
                    {
                        dataType: dataType,
                        headers: headers || {}
                    }
                );
            } catch (e) {
                next(index + 1, e);
            }
        }

        function fetchFallback(previous) {
            if (finished) return;

            if (typeof fetch !== 'function') {
                finished = true;
                fail(previous || new Error('Сетевой слой Lampa недоступен'));
                return;
            }

            var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            var timer = setTimeout(function () {
                try { if (controller) controller.abort(); } catch (e) {}
            }, 12000);

            /*
             * В обычном fetch нельзя программно установить User-Agent.
             * Оставляем только безопасные заголовки.
             */
            var safeHeaders = {};
            if (headers && headers.Accept) safeHeaders.Accept = headers.Accept;

            fetch(url, {
                method: 'GET',
                cache: 'no-store',
                credentials: 'omit',
                headers: safeHeaders,
                signal: controller ? controller.signal : undefined
            }).then(function (r) {
                clearTimeout(timer);
                if (!r.ok) throw new Error('HTTP ' + r.status);

                return dataType === 'json' ? r.json() : r.text();
            }).then(success).catch(function (e) {
                clearTimeout(timer);
                if (finished) return;
                finished = true;
                fail(e || previous || new Error('Ошибка запроса'));
            });
        }

        next(0, null);
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

        var type = isSeries(movie) ? 'tv/' : 'movie/';
        var path = type + id + '/external_ids';

        try {
            if (Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb &&
                typeof Lampa.Api.sources.tmdb.get === 'function') {

                Lampa.Api.sources.tmdb.get(
                    path,
                    {},
                    function (data) {
                        var imdb = data && (data.imdb_id || (data.external_ids && data.external_ids.imdb_id));
                        if (imdb && /^tt\d+$/i.test(String(imdb))) ok(String(imdb));
                        else fail(new Error('IMDb ID не найден'));
                    },
                    function (e) {
                        fail(e || new Error('Не удалось получить IMDb ID'));
                    }
                );
                return;
            }
        } catch (e) {}

        /*
         * Fallback через Lampa.TMDB.api.
         */
        try {
            if (Lampa.TMDB && typeof Lampa.TMDB.api === 'function') {
                var url = Lampa.TMDB.api(path);
                request(url, 'json', { Accept: 'application/json' }, function (data) {
                    var imdb = data && data.imdb_id;
                    if (imdb && /^tt\d+$/i.test(String(imdb))) ok(String(imdb));
                    else fail(new Error('IMDb ID не найден'));
                }, fail);
                return;
            }
        } catch (e2) {}

        fail(new Error('TMDB API недоступен'));
    }

    function normalizeUrl(url) {
        url = String(url || '').trim();
        if (!url) return '';
        if (url.indexOf('//') === 0) return 'https:' + url;
        return url;
    }

    function sourceName(player) {
        if (!player) return 'Источник';
        return String(player.name || player.title || player.type || 'Источник');
    }

    function normalizePlayers(response) {
        var list = response && response.data !== undefined ? response.data : response;
        if (!Array.isArray(list)) return [];

        var out = [];
        var seen = {};

        list.forEach(function (p) {
            if (!p || !p.type || !p.iframeUrl) return;

            var iframe = normalizeUrl(p.iframeUrl);
            if (!iframe) return;

            var key = String(p.type).toLowerCase() + '|' + iframe;
            if (seen[key]) return;
            seen[key] = true;

            out.push({
                type: String(p.type),
                name: p.name || p.title || p.type,
                iframeUrl: iframe,
                translations: Array.isArray(p.translations) ? p.translations : []
            });
        });

        return out;
    }

    function getPlayers(imdb, ok, fail) {
        var url = PLAYERS_API + encodeURIComponent(imdb);
        var headers = {
            Accept: 'application/json',
            Origin: 'https://mnogotv.com',
            Referer: 'https://mnogotv.com/',
            'User-Agent': USER_AGENT
        };

        request(url, 'json', headers, function (response) {
            var players = normalizePlayers(response);

            if (!players.length) {
                /*
                 * Резерв, чтобы плагин оставался полезным даже если список
                 * MnogoTV временно не отдался в ожидаемом формате.
                 */
                players = [{
                    type: 'Collaps',
                    name: 'Collaps (резерв)',
                    iframeUrl: COLLAPS_FALLBACK + encodeURIComponent(imdb),
                    translations: [],
                    fallback: true
                }];
            }

            ok(players);
        }, function (e) {
            log('players API failed, using Collaps fallback', errorText(e));

            ok([{
                type: 'Collaps',
                name: 'Collaps (резерв)',
                iframeUrl: COLLAPS_FALLBACK + encodeURIComponent(imdb),
                translations: [],
                fallback: true
            }]);
        });
    }

    function selectBox(title, items, onSelect, onBack) {
        var previous = '';

        try {
            previous = Lampa.Controller.enabled().name;
        } catch (e) {}

        Lampa.Select.show({
            title: title,
            items: items,
            onSelect: function (item) {
                try { Lampa.Select.close(); } catch (e) {}

                // Даём Lampa закончить закрытие предыдущего Select перед
                // открытием следующего (источник -> сезон -> серия).
                setTimeout(function () {
                    onSelect(item);
                }, 30);
            },
            onBack: function () {
                try {
                    if (previous) Lampa.Controller.toggle(previous);
                } catch (e) {}
                if (onBack) onBack();
            }
        });
    }

    function chooseSource(movie, imdb, players) {
        var ordered = players.slice().sort(function (a, b) {
            var aa = String(a.type || '').toLowerCase().indexOf('collaps') >= 0 ? 0 : 1;
            var bb = String(b.type || '').toLowerCase().indexOf('collaps') >= 0 ? 0 : 1;
            return aa - bb;
        });

        var items = [{
            title: 'Авто — первый рабочий',
            auto: true,
            selected: true
        }];

        players.forEach(function (p) {
            items.push({
                title: sourceName(p),
                player: p
            });
        });

        selectBox('MnogoTV — источник', items, function (selected) {
            var player = selected.auto ? null : selected.player;
            chooseTranslation(movie, imdb, ordered, player);
        });
    }

    function chooseTranslation(movie, imdb, allPlayers, player) {
        if (!player || !player.translations || !player.translations.length) {
            chooseMedia(movie, imdb, allPlayers, player);
            return;
        }

        var variants = [{
            title: 'По умолчанию',
            selected: true,
            iframeUrl: player.iframeUrl
        }];

        player.translations.forEach(function (t) {
            if (!t || !t.iframeUrl) return;

            variants.push({
                title: t.name || t.title || ('Озвучка ' + (t.id || '')),
                iframeUrl: normalizeUrl(t.iframeUrl),
                translation: t
            });
        });

        if (variants.length <= 1) {
            chooseMedia(movie, imdb, allPlayers, player);
            return;
        }

        selectBox(sourceName(player) + ' — озвучка', variants, function (variant) {
            var copy = {
                type: player.type,
                name: player.name,
                iframeUrl: variant.iframeUrl || player.iframeUrl,
                translations: []
            };

            chooseMedia(movie, imdb, allPlayers, copy);
        });
    }

    function chooseMedia(movie, imdb, allPlayers, player) {
        if (!isSeries(movie)) {
            resolveAndPlay(movie, imdb, allPlayers, player, null, null, null);
            return;
        }

        getSeasons(movie, function (seasons) {
            var items = seasons.map(function (n, index) {
                return {
                    title: 'Сезон ' + n,
                    season: n,
                    selected: index === 0
                };
            });

            selectBox('MnogoTV — сезон', items, function (selected) {
                getEpisodes(movie, selected.season, function (episodes) {
                    var epItems = episodes.map(function (ep, index) {
                        var n = parseInt(ep.episode_number || (index + 1), 10);
                        return {
                            title: ('0' + n).slice(-2) + '. ' + (ep.name || ('Серия ' + n)),
                            episode: n,
                            meta: ep
                        };
                    });

                    selectBox('MnogoTV — серия', epItems, function (selectedEpisode) {
                        resolveAndPlay(
                            movie,
                            imdb,
                            allPlayers,
                            player,
                            selected.season,
                            selectedEpisode.episode,
                            selectedEpisode.meta
                        );
                    });
                }, function (e) {
                    notify('MnogoTV: серии не получены — ' + errorText(e));
                });
            });
        }, function (e) {
            notify('MnogoTV: сезоны не получены — ' + errorText(e));
        });
    }

    function getSeasons(movie, ok, fail) {
        var result = [];

        if (movie && Array.isArray(movie.seasons)) {
            movie.seasons.forEach(function (s) {
                var n = parseInt(s && s.season_number, 10);
                if (n > 0) result.push(n);
            });
        }

        if (result.length) {
            ok(result);
            return;
        }

        var count = parseInt(movie && movie.number_of_seasons, 10);
        if (count > 0) {
            for (var i = 1; i <= count; i++) result.push(i);
            ok(result);
            return;
        }

        var id = tmdbId(movie);
        if (!id) {
            fail(new Error('TMDB ID не найден'));
            return;
        }

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

                    if (!seasons.length) {
                        var c = parseInt(data && data.number_of_seasons, 10);
                        for (var j = 1; j <= c; j++) seasons.push(j);
                    }

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

    function iframeHeaders(url) {
        var origin = '';

        try {
            origin = new URL(url).origin;
        } catch (e) {
            var m = String(url || '').match(/^(https?:\/\/[^\/]+)/i);
            origin = m ? m[1] : '';
        }

        return {
            Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
            Origin: origin,
            Referer: origin ? origin + '/' : '',
            'User-Agent': USER_AGENT
        };
    }

    function extractBalancedArgument(source, callName) {
        source = String(source || '');
        var pos = source.indexOf(callName + '(');
        if (pos < 0) return '';

        var start = source.indexOf('(', pos) + 1;
        var depth = 1;
        var quote = '';
        var escape = false;

        for (var i = start; i < source.length; i++) {
            var ch = source[i];

            if (escape) {
                escape = false;
                continue;
            }

            if (quote) {
                if (ch === '\\') {
                    escape = true;
                    continue;
                }

                if (ch === quote) quote = '';
                continue;
            }

            if (ch === '"' || ch === "'" || ch === '`') {
                quote = ch;
                continue;
            }

            if (ch === '(' || ch === '{' || ch === '[') depth++;
            else if (ch === ')' || ch === '}' || ch === ']') depth--;

            if (depth === 0) return source.slice(start, i).trim();
        }

        return '';
    }

    function parseMakePlayer(html) {
        var arg = extractBalancedArgument(html, 'makePlayer');
        if (!arg) return null;

        try {
            return (new Function('"use strict"; return (' + arg + ');'))();
        } catch (e) {
            try {
                return (0, eval)('(' + arg + ')');
            } catch (e2) {
                return null;
            }
        }
    }

    function normalizeSubtitles(list) {
        if (!Array.isArray(list)) return [];

        return list.map(function (s) {
            if (!s) return null;
            if (typeof s === 'string') return { label: 'Субтитры', url: s };

            var url = s.url || s.file || s.src || '';
            if (!url) return null;

            return {
                label: s.name || s.label || s.lang || 'Субтитры',
                url: url
            };
        }).filter(Boolean);
    }

    function withVp(url) {
        url = normalizeUrl(url);
        if (!url) return '';

        /*
         * Collaps online_mod добавляет vp к HLS URL.
         */
        if (/[?&]vp(?:[=&]|$)/i.test(url)) return url;
        return url + (url.indexOf('?') >= 0 ? '&vp' : '?vp');
    }

    function resolveCollaps(player, season, episode, ok, fail) {
        var iframe = normalizeUrl(player.iframeUrl);
        if (!iframe) {
            fail(new Error('У Collaps нет iframe URL'));
            return;
        }

        request(iframe, 'text', iframeHeaders(iframe), function (html) {
            var data = parseMakePlayer(html);

            if (!data) {
                fail(new Error('Collaps: makePlayer не найден'));
                return;
            }

            var stream = null;
            var subtitles = [];
            var tracks = [];

            if (season !== null && episode !== null && data.playlist && Array.isArray(data.playlist.seasons)) {
                var seasonNode = null;

                data.playlist.seasons.some(function (s) {
                    if (Number(s.season) === Number(season)) {
                        seasonNode = s;
                        return true;
                    }
                    return false;
                });

                if (!seasonNode) {
                    fail(new Error('Collaps: сезон ' + season + ' не найден'));
                    return;
                }

                var episodeNode = null;

                (seasonNode.episodes || []).some(function (ep) {
                    if (Number(ep.episode) === Number(episode)) {
                        episodeNode = ep;
                        return true;
                    }
                    return false;
                });

                if (!episodeNode) {
                    fail(new Error('Collaps: серия ' + episode + ' не найдена'));
                    return;
                }

                stream = episodeNode.hls || '';
                subtitles = normalizeSubtitles(episodeNode.cc);

                if (episodeNode.audio && Array.isArray(episodeNode.audio.names)) {
                    tracks = episodeNode.audio.names.filter(function (name) {
                        return name && name !== 'delete';
                    }).map(function (name) {
                        return { language: name };
                    });
                }
            }
            else if (data.source) {
                stream = data.source.hls || '';
                subtitles = normalizeSubtitles(data.source.cc);

                if (data.source.audio && Array.isArray(data.source.audio.names)) {
                    tracks = data.source.audio.names.filter(function (name) {
                        return name && name !== 'delete';
                    }).map(function (name) {
                        return { language: name };
                    });
                }
            }

            stream = withVp(stream);

            if (!stream) {
                fail(new Error('Collaps: HLS не найден'));
                return;
            }

            ok({
                url: stream,
                subtitles: subtitles,
                tracks: tracks,
                headers: iframeHeaders(iframe),
                provider: sourceName(player)
            });
        }, function (e) {
            fail(new Error('Collaps: ' + errorText(e)));
        });
    }

    function decodeEscapedUrl(value) {
        value = String(value || '');
        value = value.replace(/\\u0026/gi, '&');
        value = value.replace(/\\u003d/gi, '=');
        value = value.replace(/\\u002f/gi, '/');
        value = value.replace(/\\\//g, '/');
        value = value.replace(/&amp;/g, '&');
        value = value.replace(/\\x26/gi, '&');
        return value;
    }

    function genericFindM3u8(html) {
        html = decodeEscapedUrl(html);

        var matches = html.match(/https?:\/\/[^\s"'<>]+?\.m3u8[^\s"'<>]*/ig) || [];
        if (!matches.length) return '';

        return decodeEscapedUrl(matches[0]);
    }

    function collectM3u8(node, ctx, out, seen) {
        if (node === null || node === undefined) return;

        if (typeof node === 'string') {
            var value = decodeEscapedUrl(node);
            if (/^https?:\/\//i.test(value) && value.indexOf('.m3u8') >= 0) {
                out.push({
                    url: value,
                    season: ctx.season,
                    episode: ctx.episode
                });
            }
            return;
        }

        if (typeof node !== 'object') return;

        for (var si = 0; si < seen.length; si++) {
            if (seen[si] === node) return;
        }
        seen.push(node);

        var next = {
            season: ctx.season,
            episode: ctx.episode
        };

        if (node.season !== undefined) next.season = parseInt(node.season, 10);
        if (node.season_number !== undefined) next.season = parseInt(node.season_number, 10);
        if (node.episode !== undefined) next.episode = parseInt(node.episode, 10);
        if (node.episode_number !== undefined) next.episode = parseInt(node.episode_number, 10);

        Object.keys(node).forEach(function (key) {
            var child = node[key];

            if (Array.isArray(child)) {
                child.forEach(function (entry, index) {
                    var arrCtx = {
                        season: next.season,
                        episode: next.episode
                    };

                    var k = key.toLowerCase();
                    if (k.indexOf('season') >= 0 && !arrCtx.season) arrCtx.season = index + 1;
                    if ((k.indexOf('episode') >= 0 || k.indexOf('playlist') >= 0) && !arrCtx.episode) {
                        arrCtx.episode = index + 1;
                    }

                    collectM3u8(entry, arrCtx, out, seen);
                });
            }
            else {
                collectM3u8(child, next, out, seen);
            }
        });
    }

    function chooseGenericStream(streams, season, episode) {
        if (!streams.length) return '';

        if (season !== null && episode !== null) {
            for (var i = 0; i < streams.length; i++) {
                if (Number(streams[i].season) === Number(season) &&
                    Number(streams[i].episode) === Number(episode)) {
                    return streams[i].url;
                }
            }

            var byEpisode = streams.filter(function (s) {
                return Number(s.episode) === Number(episode);
            });

            if (byEpisode.length === 1) return byEpisode[0].url;
        }

        return streams[0].url;
    }

    /*
     * Generic adapter intentionally does only one safe thing:
     * looks for an openly exposed direct HLS URL in the provider iframe.
     * No tokens, cookies, DRM or protected auth are synthesized.
     */
    function resolveGeneric(player, season, episode, ok, fail) {
        var iframe = normalizeUrl(player.iframeUrl);
        if (!iframe) {
            fail(new Error(sourceName(player) + ': iframe URL отсутствует'));
            return;
        }

        request(iframe, 'text', iframeHeaders(iframe), function (html) {
            var config = parseMakePlayer(html);
            var streams = [];

            if (config) {
                collectM3u8(
                    config,
                    { season: null, episode: null },
                    streams,
                    []
                );
            }

            var url = chooseGenericStream(streams, season, episode);

            if (!url) url = genericFindM3u8(html);

            if (!url) {
                fail(new Error(sourceName(player) + ': прямой HLS не найден'));
                return;
            }

            ok({
                url: normalizeUrl(url),
                subtitles: [],
                tracks: [],
                headers: iframeHeaders(iframe),
                provider: sourceName(player)
            });
        }, function (e) {
            fail(new Error(sourceName(player) + ': ' + errorText(e)));
        });
    }

    function resolvePlayer(player, season, episode, ok, fail) {
        var type = String(player && player.type || '').toLowerCase();
        var iframe = String(player && player.iframeUrl || '').toLowerCase();

        if (type.indexOf('collaps') >= 0 ||
            iframe.indexOf('ortified.ws') >= 0 ||
            iframe.indexOf('kinogram.best') >= 0) {

            resolveCollaps(player, season, episode, ok, fail);
        }
        else {
            resolveGeneric(player, season, episode, ok, fail);
        }
    }

    function resolveAuto(players, season, episode, ok, fail) {
        var index = 0;
        var errors = [];

        function next() {
            if (index >= players.length) {
                fail(new Error(errors.length ? errors.join(' | ') : 'Рабочий источник не найден'));
                return;
            }

            var p = players[index++];

            resolvePlayer(p, season, episode, ok, function (e) {
                errors.push(sourceName(p) + ': ' + errorText(e));
                next();
            });
        }

        next();
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

    function playResolved(movie, season, episode, meta, resolved) {
        var title = titleOf(movie);

        if (season !== null && episode !== null) {
            title += ' • S' + season + 'E' + episode;
            if (meta && meta.name) title += ' • ' + meta.name;
        }

        var entry = {
            url: resolved.url,
            title: title,
            isonline: true,
            timeline: timeline(movie, season, episode),
            headers: resolved.headers || {}
        };

        if (resolved.subtitles && resolved.subtitles.length) {
            entry.subtitles = resolved.subtitles;
        }

        if (resolved.tracks && resolved.tracks.length) {
            entry.translate = { tracks: resolved.tracks };
        }

        /*
         * Android: штатный механизм Lampa для передачи URL внешнему плееру.
         * Другие платформы используют выбранный в настройках Lampa способ.
         */
        try {
            if (Lampa.Platform && Lampa.Platform.is && Lampa.Platform.is('android')) {
                Lampa.Player.runas('android');
            }
        } catch (e) {}

        log('play', {
            provider: resolved.provider,
            season: season,
            episode: episode,
            url: resolved.url
        });

        notify('MnogoTV → ' + (resolved.provider || 'внешний плеер'));

        Lampa.Player.play(entry);
        Lampa.Player.playlist([entry]);
    }

    function resolveAndPlay(movie, imdb, players, player, season, episode, meta) {
        notify('MnogoTV: получаю прямой поток…');

        var done = function (resolved) {
            if (!resolved || !resolved.url) {
                notify('MnogoTV: источник не вернул поток');
                return;
            }

            playResolved(movie, season, episode, meta, resolved);
        };

        var bad = function (e) {
            log('resolve failed', e);
            notify('MnogoTV: ' + errorText(e));
        };

        if (player) resolvePlayer(player, season, episode, done, bad);
        else resolveAuto(players, season, episode, done, bad);
    }

    function openMnogo(movie) {
        if (!movie) {
            notify('MnogoTV: карточка фильма не определена');
            return;
        }

        notify('MnogoTV: ищу источники…');

        getImdb(movie, function (imdb) {
            getPlayers(imdb, function (players) {
                log('sources', imdb, players.map(sourceName));
                chooseSource(movie, imdb, players);
            }, function (e) {
                notify('MnogoTV: источники не получены — ' + errorText(e));
            });
        }, function (e) {
            notify('MnogoTV: ' + errorText(e));
        });
    }

    function addButton(e) {
        if (!e || e.type !== 'complite') return;

        try {
            var root = e.object && e.object.activity && e.object.activity.render
                ? e.object.activity.render()
                : null;

            if (!root || !root.length) return;
            if (root.find('.mnogotv-simple-button').length) return;

            var movie = (e.data && e.data.movie) || e.movie || e.object.card || {};

            var button = $(
                '<div class="full-start__button selector view--online mnogotv-simple-button" data-subtitle="MnogoTV">' +
                    '<svg class="button__icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                        '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/>' +
                        '<path d="M10 9l5 3-5 3V9z" fill="currentColor"/>' +
                    '</svg>' +
                    '<span>MnogoTV</span>' +
                '</div>'
            );

            button.on('hover:enter click', function () {
                openMnogo(movie);
            });

            var torrent = root.find('.view--torrent').first();
            var online = root.find('.view--online').last();
            var box = root.find('.full-start-new__buttons, .full-start__buttons').first();

            if (torrent.length) torrent.after(button);
            else if (online.length) online.after(button);
            else if (box.length) box.append(button);
            else return;

            log('button added', titleOf(movie));
        } catch (e2) {
            log('button error', e2);
        }
    }

    function registerManifest() {
        var manifest = {
            type: 'video',
            version: VERSION,
            name: 'MnogoTV Simple',
            description: 'MnogoTV: выбор источника и запуск прямого потока во внешнем плеере',
            component: COMPONENT,
            onContextMenu: function () {
                return {
                    name: 'MnogoTV',
                    description: 'Выбрать источник'
                };
            },
            onContextLauch: function (movie) {
                openMnogo(movie);
            }
        };

        try {
            if (!Lampa.Manifest) Lampa.Manifest = {};

            if (Array.isArray(Lampa.Manifest.plugins)) {
                var exists = Lampa.Manifest.plugins.some(function (p) {
                    return p && p.component === COMPONENT;
                });

                if (!exists) Lampa.Manifest.plugins.push(manifest);
            }
            else if (Lampa.Manifest.plugins && typeof Lampa.Manifest.plugins === 'object' &&
                     !Lampa.Manifest.plugins.type) {
                Lampa.Manifest.plugins[COMPONENT] = manifest;
            }
            else {
                Lampa.Manifest.plugins = manifest;
            }
        } catch (e) {
            log('manifest error', e);
        }
    }

    function start() {
        if (!window.Lampa || !Lampa.Listener || !Lampa.Player) {
            setTimeout(start, 500);
            return;
        }

        registerManifest();

        Lampa.Listener.follow('full', function (e) {
            if (e && e.type === 'complite') addButton(e);
        });

        /*
         * Карточка могла быть открыта до загрузки плагина.
         */
        try {
            var active = Lampa.Activity && Lampa.Activity.active
                ? Lampa.Activity.active()
                : null;

            if (active && active.component === 'full' && active.activity) {
                setTimeout(function () {
                    try {
                        addButton({
                            type: 'complite',
                            object: {
                                activity: active.activity,
                                card: active.card
                            },
                            movie: active.card
                        });
                    } catch (e) {}
                }, 300);
            }
        } catch (e) {}

        notify('MnogoTV Simple v' + VERSION + ' загружен');
        log('started');
    }

    start();
})();
