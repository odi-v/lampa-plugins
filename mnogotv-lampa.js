(function () {
    'use strict';

    var VERSION = '0.6.0';
    var PLUGIN_ID = 'mnogotv_ui_v060';
    var COMPONENT = 'mnogotv_ui_v06';
    var PLAYER_COMPONENT = 'mnogotv_player_v06';

    if (window[PLUGIN_ID]) return;
    window[PLUGIN_ID] = true;

    var API_META = 'https://cdn.mnogotv.com/c/';
    var API_PLAYERS = 'https://fbphdplay.top/api/players?imdb=';

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

    function makeNetwork() {
        try {
            if (Lampa.Network) return new Lampa.Network();
        } catch (e) {}
        try {
            if (Lampa.Request) return new Lampa.Request();
        } catch (e) {}
        try {
            if (Lampa.Reguest) return new Lampa.Reguest();
        } catch (e) {}
        return null;
    }

    function requestJson(network, url, ok, fail, cacheLife) {
        if (!network) {
            fail(new Error('Lampa network API unavailable'));
            return;
        }

        function success(data) {
            try {
                if (typeof data === 'string') data = JSON.parse(data);
            } catch (e) {
                fail(e);
                return;
            }
            ok(data);
        }

        var params = {
            dataType: 'json'
        };

        if (cacheLife) {
            params.cache = { life: cacheLife };
        }

        try {
            if (typeof network.silent === 'function') {
                network.silent(url, success, fail, false, params);
            }
            else if (typeof network.quiet === 'function') {
                network.quiet(url, success, fail, false, params);
            }
            else {
                fail(new Error('No supported Lampa request method'));
            }
        } catch (e) {
            fail(e);
        }
    }

    function tmdbId(movie) {
        if (!movie) return null;

        var source = movie.source || 'tmdb';
        var id = (source === 'cub' || source === 'tmdb')
            ? movie.id
            : (movie.tmdb_id || movie.id);

        if (id === undefined || id === null || id === '') return null;

        id = String(id).trim();
        return /^\d+$/.test(id) ? id : null;
    }

    function titleOf(movie) {
        return (movie && (
            movie.title ||
            movie.name ||
            movie.original_title ||
            movie.original_name
        )) || 'MnogoTV';
    }

    function isSeries(movie) {
        return !!(movie && (
            movie.name ||
            movie.original_name ||
            movie.number_of_seasons ||
            movie.first_air_date ||
            movie.media_type === 'tv'
        ));
    }

    function posterUrl(movie) {
        try {
            if (movie && movie.poster_path && Lampa.TMDB && Lampa.TMDB.image) {
                return Lampa.TMDB.image('t/p/w300' + movie.poster_path);
            }
        } catch (e) {}
        return '';
    }

    function backdropUrl(movie) {
        try {
            if (movie && Lampa.Utils && Lampa.Utils.cardImgBackgroundBlur) {
                return Lampa.Utils.cardImgBackgroundBlur(movie);
            }
        } catch (e) {}
        return '';
    }

    function formatRuntime(minutes) {
        if (!minutes) return '';
        try {
            return Lampa.Utils.secondsToTime(parseInt(minutes, 10) * 60, true);
        } catch (e) {
            return minutes + ' мин';
        }
    }

    function formatDate(date) {
        if (!date) return '';
        try {
            return Lampa.Utils.parseTime(date).full;
        } catch (e) {
            return date;
        }
    }

    function appendQuery(url, params) {
        try {
            var u = new URL(url, window.location.href);

            Object.keys(params).forEach(function (key) {
                var value = params[key];
                if (value !== undefined && value !== null && value !== '') {
                    u.searchParams.set(key, String(value));
                }
            });

            return u.toString();
        } catch (e) {
            var out = url;
            Object.keys(params).forEach(function (key) {
                var value = params[key];
                if (value === undefined || value === null || value === '') return;

                var rx = new RegExp('([?&])' + key + '=[^&]*', 'i');
                var pair = encodeURIComponent(key) + '=' + encodeURIComponent(String(value));

                if (rx.test(out)) {
                    out = out.replace(rx, '$1' + pair);
                }
                else {
                    out += (out.indexOf('?') === -1 ? '?' : '&') + pair;
                }
            });
            return out;
        }
    }

    function normalizeTranslations(player) {
        var items = (player && player.translations) || [];

        if (!items.length && player && player.iframeUrl) {
            return [{
                id: null,
                name: 'По умолчанию',
                quality: '',
                iframeUrl: player.iframeUrl
            }];
        }

        return items.filter(function (item) {
            return item && item.iframeUrl;
        }).map(function (item) {
            return {
                id: item.id,
                name: item.name || ('Озвучка ' + (item.id || '')),
                quality: item.quality || '',
                iframeUrl: item.iframeUrl
            };
        });
    }

    function preferredTranslationIndex(items) {
        if (!items || !items.length) return 0;

        // В HAR MnogoTV для русской дорожки по умолчанию использовал id 66.
        for (var i = 0; i < items.length; i++) {
            if (String(items[i].id) === '66') return i;
        }

        var preferred = [
            'дублирован',
            'lostfilm',
            'hdrezka',
            'tvshows',
            'рус'
        ];

        for (var p = 0; p < preferred.length; p++) {
            for (var j = 0; j < items.length; j++) {
                if ((items[j].name || '').toLowerCase().indexOf(preferred[p]) >= 0) {
                    return j;
                }
            }
        }

        return 0;
    }

    function resolveMnogoSource(movie, network, done, fail) {
        var id = tmdbId(movie);
        var serial = isSeries(movie);

        if (!id) {
            fail(new Error('TMDB ID not found'));
            return;
        }

        var type = serial ? 'tv/' : 'movie/';
        var metaUrl = API_META + type + id + '?language=ru-RU&append_to_response=external_ids';

        requestJson(network, metaUrl, function (meta) {
            var imdb = meta && meta.external_ids && meta.external_ids.imdb_id;

            if (!imdb && movie && movie.imdb_id) imdb = movie.imdb_id;

            if (!imdb) {
                fail(new Error('IMDb ID not found'));
                return;
            }

            requestJson(network, API_PLAYERS + encodeURIComponent(imdb), function (response) {
                var players = response && response.data ? response.data : [];

                if (!Array.isArray(players) || !players.length) {
                    fail(new Error('MnogoTV players not found'));
                    return;
                }

                var player = null;

                for (var i = 0; i < players.length; i++) {
                    if ((players[i].type || '').toLowerCase() === 'alloha' && players[i].iframeUrl) {
                        player = players[i];
                        break;
                    }
                }

                if (!player) {
                    for (var j = 0; j < players.length; j++) {
                        if (players[j].iframeUrl) {
                            player = players[j];
                            break;
                        }
                    }
                }

                if (!player || !player.iframeUrl) {
                    fail(new Error('Compatible MnogoTV player not found'));
                    return;
                }

                done({
                    imdb: imdb,
                    metadata: meta,
                    player: player,
                    translations: normalizeTranslations(player)
                });
            }, fail, 3);
        }, fail, 30);
    }

    function buildPlayerUrl(source, season, episode, translation, serial) {
        var base = translation && translation.iframeUrl
            ? translation.iframeUrl
            : source.player.iframeUrl;

        var params = {
            autoplay: 1
        };

        if (serial) {
            params.season = season;
            params.episode = episode;
        }

        if (translation && translation.id !== null && translation.id !== undefined) {
            params.translation = translation.id;
        }

        return appendQuery(base, params);
    }

    function addCss() {
        if (document.getElementById('mnogotv-v06-style')) return;

        var css = `
        .mnogotv-v06{
            padding:1.2em 1.5em 2em;
            box-sizing:border-box;
            width:100%;
        }
        .mnogotv-v06__layout{
            display:flex;
            gap:1.6em;
            align-items:flex-start;
        }
        .mnogotv-v06__aside{
            width:18em;
            flex:0 0 18em;
            padding-top:.2em;
        }
        .mnogotv-v06__poster{
            width:10em;
            height:15em;
            border-radius:.45em;
            overflow:hidden;
            background:rgba(255,255,255,.08);
            margin-bottom:1em;
        }
        .mnogotv-v06__poster img{
            width:100%;
            height:100%;
            object-fit:cover;
        }
        .mnogotv-v06__title{
            font-size:1.6em;
            font-weight:600;
            line-height:1.15;
            margin-bottom:.45em;
        }
        .mnogotv-v06__meta{
            opacity:.72;
            line-height:1.45;
            font-size:.95em;
        }
        .mnogotv-v06__main{
            flex:1;
            min-width:0;
        }
        .mnogotv-v06__toolbar{
            display:flex;
            gap:.7em;
            align-items:center;
            margin-bottom:1em;
            flex-wrap:wrap;
        }
        .mnogotv-v06__filter{
            padding:.65em 1em;
            border-radius:.45em;
            background:rgba(255,255,255,.12);
            min-width:8em;
            box-sizing:border-box;
        }
        .mnogotv-v06__filter-title{
            opacity:.7;
            font-size:.78em;
            display:block;
            margin-bottom:.15em;
        }
        .mnogotv-v06__filter-value{
            font-size:1em;
            font-weight:500;
            max-width:17em;
            display:block;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
        }
        .mnogotv-v06__filter.focus,
        .mnogotv-v06__episode.focus{
            box-shadow:0 0 0 .18em #fff;
            background:rgba(255,255,255,.2);
        }
        .mnogotv-v06__scroll{
            padding:.2em .3em 2em;
        }
        .mnogotv-v06__episode{
            position:relative;
            display:flex;
            align-items:center;
            gap:1em;
            padding:.65em;
            margin-bottom:.55em;
            border-radius:.5em;
            background:rgba(255,255,255,.035);
            min-height:6.5em;
            box-sizing:border-box;
        }
        .mnogotv-v06__thumb{
            position:relative;
            width:12.5em;
            height:7em;
            flex:0 0 12.5em;
            border-radius:.38em;
            overflow:hidden;
            background:rgba(255,255,255,.08);
        }
        .mnogotv-v06__thumb img{
            width:100%;
            height:100%;
            object-fit:cover;
        }
        .mnogotv-v06__num{
            position:absolute;
            left:.45em;
            bottom:.35em;
            font-size:1.65em;
            font-weight:700;
            text-shadow:0 2px 4px #000;
        }
        .mnogotv-v06__episode-body{
            flex:1;
            min-width:0;
        }
        .mnogotv-v06__episode-title{
            font-size:1.25em;
            font-weight:500;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            margin-bottom:.5em;
        }
        .mnogotv-v06__episode-info{
            opacity:.78;
            display:flex;
            gap:.55em;
            flex-wrap:wrap;
            align-items:center;
        }
        .mnogotv-v06__duration{
            position:absolute;
            right:.7em;
            top:.65em;
            opacity:.9;
            font-size:.85em;
        }
        .mnogotv-v06__empty{
            padding:2em 0;
            opacity:.75;
            font-size:1.1em;
        }
        .mnogotv-v06__status{
            margin-bottom:.8em;
            opacity:.72;
            font-size:.9em;
        }

        .mnogotv-player-v06{
            position:fixed;
            inset:0;
            z-index:10;
            background:#000;
            overflow:hidden;
        }
        .mnogotv-player-v06 iframe{
            width:100%;
            height:100%;
            border:0;
            background:#000;
        }
        .mnogotv-player-v06__back{
            position:absolute;
            top:1.2em;
            left:1.2em;
            z-index:5;
            padding:.65em 1em;
            border-radius:.45em;
            background:rgba(0,0,0,.72);
            opacity:.15;
            transition:opacity .2s;
        }
        .mnogotv-player-v06__back.focus{
            opacity:1;
            box-shadow:0 0 0 .16em #fff;
        }

        @media(max-width:700px){
            .mnogotv-v06__aside{display:none}
            .mnogotv-v06__layout{display:block}
            .mnogotv-v06{padding:1em}
            .mnogotv-v06__thumb{width:9em;height:5.2em;flex-basis:9em}
        }`;

        var style = document.createElement('style');
        style.id = 'mnogotv-v06-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function MnogoPlayerComponent(object) {
        var root = $('<div class="mnogotv-player-v06"></div>');
        var iframe = $('<iframe allow="autoplay *; encrypted-media *; fullscreen *; picture-in-picture *" allowfullscreen></iframe>');
        var back = $('<div class="mnogotv-player-v06__back selector">← Назад</div>');
        var last = back[0];

        iframe.attr('src', object.url || 'about:blank');

        back.on('hover:focus', function (e) {
            last = e.target;
        });

        back.on('hover:enter click', function () {
            Lampa.Activity.backward();
        });

        root.append(iframe);
        root.append(back);

        this.create = function () {
            return this.render();
        };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;

            Lampa.Controller.add('mnogotv_player_v06', {
                toggle: function () {
                    Lampa.Controller.collectionSet(root);
                    Lampa.Controller.collectionFocus(last, root);
                },
                up: function () {},
                down: function () {},
                left: function () {},
                right: function () {},
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('mnogotv_player_v06');

            // После загрузки отдаём фокус iframe, чтобы работали клавиши плеера.
            setTimeout(function () {
                try {
                    iframe[0].focus();
                } catch (e) {}
            }, 700);
        };

        this.render = function () {
            return root;
        };

        this.pause = function () {};
        this.stop = function () {};

        this.destroy = function () {
            try {
                iframe.attr('src', 'about:blank');
            } catch (e) {}
            root.remove();
        };
    }

    function MnogoComponent(object) {
        var movie = object.movie || {};
        var id = tmdbId(movie);
        var serial = isSeries(movie);
        var season = 1;
        var seasons = [];
        var initialized = false;
        var last = null;
        var network = makeNetwork();

        var sourceState = {
            loading: true,
            error: '',
            data: null,
            translations: [],
            translationIndex: 0
        };

        var scroll = new Lampa.Scroll({
            mask: true,
            over: true
        });

        var root = $('<div class="mnogotv-v06"></div>');
        var layout = $('<div class="mnogotv-v06__layout"></div>');
        var aside = $('<div class="mnogotv-v06__aside"></div>');
        var main = $('<div class="mnogotv-v06__main"></div>');
        var toolbar = $('<div class="mnogotv-v06__toolbar"></div>');
        var status = $('<div class="mnogotv-v06__status">Подключение к MnogoTV…</div>');

        var sourceButton = $(
            '<div class="mnogotv-v06__filter selector">' +
                '<span class="mnogotv-v06__filter-title">Источник</span>' +
                '<span class="mnogotv-v06__filter-value">MnogoTV</span>' +
            '</div>'
        );

        var voiceButton = $(
            '<div class="mnogotv-v06__filter selector">' +
                '<span class="mnogotv-v06__filter-title">Озвучка</span>' +
                '<span class="mnogotv-v06__filter-value">Загрузка…</span>' +
            '</div>'
        );

        var seasonButton = $(
            '<div class="mnogotv-v06__filter selector">' +
                '<span class="mnogotv-v06__filter-title">Фильтр</span>' +
                '<span class="mnogotv-v06__filter-value">Сезон 1</span>' +
            '</div>'
        );

        function currentTranslation() {
            return sourceState.translations[sourceState.translationIndex] || null;
        }

        function refreshVoiceLabel() {
            var tr = currentTranslation();

            if (sourceState.loading) {
                voiceButton.find('.mnogotv-v06__filter-value').text('Загрузка…');
                return;
            }

            if (sourceState.error) {
                voiceButton.find('.mnogotv-v06__filter-value').text('Недоступно');
                return;
            }

            voiceButton.find('.mnogotv-v06__filter-value').text(
                tr ? tr.name : 'По умолчанию'
            );
        }

        function buildAside() {
            aside.empty();

            var poster = posterUrl(movie);

            if (poster) {
                aside.append(
                    '<div class="mnogotv-v06__poster"><img src="' + poster + '"></div>'
                );
            }

            aside.append('<div class="mnogotv-v06__title"></div>');
            aside.find('.mnogotv-v06__title').text(titleOf(movie));

            var meta = [];
            var year = ((movie.first_air_date || movie.release_date || '') + '').slice(0, 4);

            if (year) meta.push(year);

            if (movie.origin_country && movie.origin_country.length) {
                meta.push(movie.origin_country.join(', '));
            }
            else if (movie.production_countries && movie.production_countries.length) {
                meta.push(
                    movie.production_countries.map(function (x) {
                        return x.iso_3166_1 || x.name;
                    }).join(', ')
                );
            }

            if (movie.vote_average) {
                meta.push('★ ' + parseFloat(movie.vote_average).toFixed(1));
            }

            aside.append('<div class="mnogotv-v06__meta"></div>');
            aside.find('.mnogotv-v06__meta').text(meta.join('  •  '));
        }

        function buildSeasons() {
            seasons = [];

            if (movie.seasons && movie.seasons.length) {
                movie.seasons.forEach(function (s) {
                    var n = parseInt(s.season_number, 10);
                    if (n > 0) seasons.push(n);
                });
            }

            if (!seasons.length) {
                var count = parseInt(movie.number_of_seasons || 1, 10);
                if (!count || count < 1) count = 1;

                for (var i = 1; i <= count; i++) {
                    seasons.push(i);
                }
            }

            season = seasons[0] || 1;
            seasonButton.find('.mnogotv-v06__filter-value').text('Сезон ' + season);
        }

        function loadSource() {
            sourceState.loading = true;
            sourceState.error = '';
            status.text('Подключение к MnogoTV…');
            refreshVoiceLabel();

            resolveMnogoSource(movie, network, function (data) {
                sourceState.loading = false;
                sourceState.data = data;
                sourceState.translations = data.translations || [];
                sourceState.translationIndex = preferredTranslationIndex(sourceState.translations);

                var tr = currentTranslation();
                var playerName = (data.player && data.player.type) || 'плеер';

                status.text(
                    'MnogoTV • ' + playerName +
                    (tr ? ' • ' + tr.name : '')
                );

                refreshVoiceLabel();
                log('Source resolved', {
                    tmdb: id,
                    imdb: data.imdb,
                    player: playerName,
                    translations: sourceState.translations.length
                });
            }, function (err) {
                sourceState.loading = false;
                sourceState.error = err && err.message ? err.message : String(err || 'unknown error');
                status.text('MnogoTV: ' + sourceState.error);
                refreshVoiceLabel();
                log('Source resolve error', err);
            });
        }

        function showSourceSelect() {
            var enabled = Lampa.Controller.enabled().name;

            Lampa.Select.show({
                title: 'Источник',
                items: [
                    { title: 'MnogoTV', selected: true }
                ],
                onBack: function () {
                    Lampa.Controller.toggle(enabled);
                },
                onSelect: function () {
                    Lampa.Select.close();
                    Lampa.Controller.toggle(enabled);
                }
            });
        }

        function showVoiceSelect() {
            if (sourceState.loading) {
                notify('MnogoTV: источник ещё загружается');
                return;
            }

            if (sourceState.error) {
                notify('MnogoTV: ' + sourceState.error);
                return;
            }

            var enabled = Lampa.Controller.enabled().name;
            var items = sourceState.translations.map(function (tr, index) {
                return {
                    title: tr.name,
                    subtitle: tr.quality || '',
                    index: index,
                    selected: index === sourceState.translationIndex
                };
            });

            if (!items.length) {
                notify('MnogoTV: озвучки не найдены');
                return;
            }

            Lampa.Select.show({
                title: 'Озвучка',
                items: items,
                onBack: function () {
                    Lampa.Controller.toggle(enabled);
                },
                onSelect: function (item) {
                    sourceState.translationIndex = item.index;
                    refreshVoiceLabel();

                    Lampa.Select.close();

                    setTimeout(function () {
                        Lampa.Controller.toggle('mnogotv_v06');
                    }, 10);
                }
            });
        }

        function showSeasonSelect() {
            var enabled = Lampa.Controller.enabled().name;

            var items = seasons.map(function (n) {
                return {
                    title: 'Сезон ' + n,
                    season: n,
                    selected: n === season
                };
            });

            Lampa.Select.show({
                title: 'Сезон',
                items: items,
                onBack: function () {
                    Lampa.Controller.toggle(enabled);
                },
                onSelect: function (item) {
                    season = item.season;
                    seasonButton.find('.mnogotv-v06__filter-value').text('Сезон ' + season);

                    Lampa.Select.close();
                    renderEpisodes();

                    setTimeout(function () {
                        Lampa.Controller.toggle('mnogotv_v06');
                    }, 10);
                }
            });
        }

        function openPlayback(episode, episodeMeta) {
            if (sourceState.loading) {
                notify('MnogoTV: источник ещё загружается');
                return;
            }

            if (sourceState.error || !sourceState.data) {
                notify('MnogoTV: источник недоступен');
                return;
            }

            var translation = currentTranslation();
            var url = buildPlayerUrl(
                sourceState.data,
                season,
                episode,
                translation,
                serial
            );

            log('Open playback', {
                title: titleOf(movie),
                season: season,
                episode: episode,
                translation: translation && translation.name,
                url: url
            });

            notify(
                'MnogoTV: ' +
                (translation ? translation.name + ' • ' : '') +
                (serial ? ('S' + season + 'E' + episode) : titleOf(movie))
            );

            Lampa.Activity.push({
                title: 'MnogoTV',
                component: PLAYER_COMPONENT,
                movie: movie,
                url: url,
                season: season,
                episode: episode,
                noinfo: true
            });
        }

        function makeEpisode(ep) {
            var num = parseInt(ep.episode_number || 0, 10);
            var title = ep.name || ('Серия ' + num);
            var runtime = formatRuntime(ep.runtime);

            var item = $(
                '<div class="mnogotv-v06__episode selector">' +
                    '<div class="mnogotv-v06__thumb">' +
                        '<img>' +
                        '<div class="mnogotv-v06__num"></div>' +
                    '</div>' +
                    '<div class="mnogotv-v06__episode-body">' +
                        '<div class="mnogotv-v06__episode-title"></div>' +
                        '<div class="mnogotv-v06__episode-info"></div>' +
                    '</div>' +
                    '<div class="mnogotv-v06__duration"></div>' +
                '</div>'
            );

            item.find('.mnogotv-v06__num').text(('0' + num).slice(-2));
            item.find('.mnogotv-v06__episode-title').text(title);
            item.find('.mnogotv-v06__duration').text(runtime);

            var info = [];

            if (ep.vote_average) {
                info.push('★ ' + parseFloat(ep.vote_average).toFixed(1));
            }

            if (ep.air_date) {
                info.push(formatDate(ep.air_date));
            }

            item.find('.mnogotv-v06__episode-info').text(info.join('  •  '));

            var img = item.find('img');

            if (ep.still_path) {
                try {
                    img.attr('src', Lampa.TMDB.image('t/p/w300' + ep.still_path));
                } catch (e) {}
            }
            else {
                img.hide();
            }

            item.on('hover:focus', function (e) {
                last = e.target;
                try { scroll.update($(e.target), true); } catch (err) {}
            });

            item.on('hover:enter', function () {
                openPlayback(num, ep);
            });

            item.on('click', function () {
                openPlayback(num, ep);
            });

            return item;
        }

        function renderMovie() {
            scroll.clear();

            var item = $(
                '<div class="mnogotv-v06__episode selector">' +
                    '<div class="mnogotv-v06__episode-body">' +
                        '<div class="mnogotv-v06__episode-title">Смотреть фильм</div>' +
                        '<div class="mnogotv-v06__episode-info">MnogoTV</div>' +
                    '</div>' +
                '</div>'
            );

            item.on('hover:focus', function (e) {
                last = e.target;
            });

            item.on('hover:enter click', function () {
                openPlayback(null, null);
            });

            scroll.append(item);
        }

        function renderEpisodes() {
            scroll.clear();
            last = null;

            if (!serial) {
                renderMovie();
                return;
            }

            if (!id) {
                scroll.append(
                    $('<div class="mnogotv-v06__empty">Не удалось определить TMDB ID текущей карточки.</div>')
                );
                return;
            }

            scroll.append(
                $('<div class="mnogotv-v06__empty mnogotv-v06__loading">Загрузка серий…</div>')
            );

            Lampa.Api.sources.tmdb.get(
                'tv/' + id + '/season/' + season,
                {},
                function (data) {
                    scroll.clear();

                    var episodes = (data && data.episodes) || [];

                    if (!episodes.length) {
                        scroll.append(
                            $('<div class="mnogotv-v06__empty">Для этого сезона серии не найдены.</div>')
                        );
                        return;
                    }

                    episodes.forEach(function (ep) {
                        scroll.append(makeEpisode(ep));
                    });

                    try {
                        Lampa.Controller.toggle('mnogotv_v06');
                    } catch (e) {}
                },
                function () {
                    scroll.clear();
                    scroll.append(
                        $('<div class="mnogotv-v06__empty">Не удалось загрузить данные серий TMDB.</div>')
                    );
                }
            );
        }

        sourceButton.on('hover:focus', function (e) {
            last = e.target;
        });

        voiceButton.on('hover:focus', function (e) {
            last = e.target;
        });

        seasonButton.on('hover:focus', function (e) {
            last = e.target;
        });

        sourceButton.on('hover:enter click', showSourceSelect);
        voiceButton.on('hover:enter click', showVoiceSelect);
        seasonButton.on('hover:enter click', showSeasonSelect);

        this.create = function () {
            return this.render();
        };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;

            if (!initialized) {
                initialized = true;

                buildAside();
                buildSeasons();

                toolbar.append(sourceButton);
                toolbar.append(voiceButton);

                if (serial) {
                    toolbar.append(seasonButton);
                }

                main.append(toolbar);
                main.append(status);

                scroll.render().addClass('mnogotv-v06__scroll');
                main.append(scroll.render());

                layout.append(aside);
                layout.append(main);
                root.append(layout);

                try {
                    Lampa.Background.immediately(backdropUrl(movie));
                } catch (e) {}

                renderEpisodes();
                loadSource();
            }

            Lampa.Controller.add('mnogotv_v06', {
                toggle: function () {
                    Lampa.Controller.collectionSet(root);
                    Lampa.Controller.collectionFocus(last || root.find('.selector')[0], root);
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    Navigator.move('down');
                },
                right: function () {
                    Navigator.move('right');
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('mnogotv_v06');
        };

        this.render = function () {
            return root;
        };

        this.pause = function () {};
        this.stop = function () {};

        this.destroy = function () {
            try { network && network.clear && network.clear(); } catch (e) {}
            try { scroll.destroy(); } catch (e) {}
            root.remove();
        };
    }

    var registered = {};

    function registerComponent(name, constructor) {
        if (registered[name]) return true;

        if (!window.Lampa || !Lampa.Component || typeof Lampa.Component.add !== 'function') {
            log('Lampa.Component.add is unavailable for', name);
            return false;
        }

        try {
            Lampa.Component.add(name, constructor);
            registered[name] = true;
            return true;
        } catch (e) {
            log('Component registration warning', name, e);
            registered[name] = true;
            return true;
        }
    }

    function openComponent(movie) {
        if (!registerComponent(COMPONENT, MnogoComponent)) {
            notify('MnogoTV: компонент Lampa недоступен');
            return;
        }

        registerComponent(PLAYER_COMPONENT, MnogoPlayerComponent);

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
            var root = e.object.activity.render();

            if (!root || !root.length) return;
            if (root.find('.mnogotv-v06-button').length) return;

            var movie = (e.data && e.data.movie) || e.movie || e.object.card || {};

            var button = $(
                '<div class="full-start__button selector view--online mnogotv-v06-button" data-subtitle="MnogoTV">' +
                    '<svg class="button__icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                        '<rect x="3" y="5" width="18" height="13" rx="2" stroke="currentColor" stroke-width="2"/>' +
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

            var container = root.find('.full-start-new__buttons').first();
            if (!container.length) {
                container = root.find('.full-start__buttons').first();
            }

            if (torrent.length) {
                torrent.after(button);
            }
            else if (online.length) {
                online.after(button);
            }
            else if (container.length) {
                container.append(button);
            }
            else {
                log('Source button container not found', titleOf(movie));
            }
        } catch (err) {
            log('addButton error', err);
        }
    }

    var started = false;

    function startPlugin() {
        if (started) return;
        started = true;

        try {
            addCss();

            registerComponent(COMPONENT, MnogoComponent);
            registerComponent(PLAYER_COMPONENT, MnogoPlayerComponent);

            if (!Lampa.Listener || typeof Lampa.Listener.follow !== 'function') {
                throw new Error('Lampa.Listener.follow is unavailable');
            }

            Lampa.Listener.follow('full', addButton);

            Lampa.Listener.follow('activity', function (e) {
                if (!e || e.type !== 'start') return;
                if (e.component !== 'full' && e.component !== 'showy') return;

                setTimeout(function () {
                    try {
                        var obj = e.object;
                        if (!obj || !obj.activity || typeof obj.activity.render !== 'function') return;

                        var movie = obj.card || obj.movie || {};

                        addButton({
                            type: 'complite',
                            object: obj,
                            data: { movie: movie },
                            movie: movie
                        });
                    } catch (err) {
                        log('activity fallback error', err);
                    }
                }, 350);
            });

            notify('MnogoTV v' + VERSION + ' загружен');
            log('Plugin started');
        } catch (err) {
            started = false;
            log('startPlugin error', err);
            notify('MnogoTV: ошибка запуска — ' + (err.message || err));
        }
    }

    function bootstrap() {
        if (typeof window.Lampa === 'undefined') {
            setTimeout(bootstrap, 300);
            return;
        }

        if (window.appready) {
            startPlugin();
            return;
        }

        if (Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
            Lampa.Listener.follow('app', function (e) {
                if (e && e.type === 'ready') startPlugin();
            });

            setTimeout(function () {
                if (window.appready) startPlugin();
            }, 1200);
        }
        else {
            setTimeout(bootstrap, 300);
        }
    }

    bootstrap();
})();
