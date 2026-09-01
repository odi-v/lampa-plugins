(function () {
    'use strict';

    var PLUGIN_ID = 'mnogotv_ui_v05';
    var COMPONENT = 'mnogotv_ui';

    if (window[PLUGIN_ID]) return;
    window[PLUGIN_ID] = true;

    function log() {
        try {
            console.log.apply(console, ['[MnogoTV]'].concat([].slice.call(arguments)));
        } catch (e) {}
    }

    function tmdbId(movie) {
        if (!movie) return null;

        var source = movie.source || 'tmdb';
        var id = (source === 'cub' || source === 'tmdb') ? movie.id : (movie.tmdb_id || movie.id);

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

    function addCss() {
        if (document.getElementById('mnogotv-v05-style')) return;

        var css = `
        .mnogotv-v05{
            padding: 1.2em 1.5em 2em;
            box-sizing: border-box;
            width: 100%;
        }
        .mnogotv-v05__layout{
            display: flex;
            gap: 1.6em;
            align-items: flex-start;
        }
        .mnogotv-v05__aside{
            width: 18em;
            flex: 0 0 18em;
            padding-top: .2em;
        }
        .mnogotv-v05__poster{
            width: 10em;
            height: 15em;
            border-radius: .45em;
            overflow: hidden;
            background: rgba(255,255,255,.08);
            margin-bottom: 1em;
        }
        .mnogotv-v05__poster img{
            width:100%;
            height:100%;
            object-fit:cover;
        }
        .mnogotv-v05__title{
            font-size: 1.6em;
            font-weight: 600;
            line-height: 1.15;
            margin-bottom: .45em;
        }
        .mnogotv-v05__meta{
            opacity:.72;
            line-height:1.45;
            font-size:.95em;
        }
        .mnogotv-v05__main{
            flex:1;
            min-width:0;
        }
        .mnogotv-v05__toolbar{
            display:flex;
            gap:.7em;
            align-items:center;
            margin-bottom:1em;
            flex-wrap:wrap;
        }
        .mnogotv-v05__filter{
            padding:.65em 1em;
            border-radius:.45em;
            background:rgba(255,255,255,.12);
            min-width:8em;
            box-sizing:border-box;
        }
        .mnogotv-v05__filter-title{
            opacity:.7;
            font-size:.78em;
            display:block;
            margin-bottom:.15em;
        }
        .mnogotv-v05__filter-value{
            font-size:1em;
            font-weight:500;
        }
        .mnogotv-v05__filter.focus,
        .mnogotv-v05__episode.focus{
            box-shadow:0 0 0 .18em #fff;
            background:rgba(255,255,255,.2);
        }
        .mnogotv-v05__scroll{
            padding:.2em .3em 2em;
        }
        .mnogotv-v05__episode{
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
        .mnogotv-v05__thumb{
            position:relative;
            width:12.5em;
            height:7em;
            flex:0 0 12.5em;
            border-radius:.38em;
            overflow:hidden;
            background:rgba(255,255,255,.08);
        }
        .mnogotv-v05__thumb img{
            width:100%;
            height:100%;
            object-fit:cover;
        }
        .mnogotv-v05__num{
            position:absolute;
            left:.45em;
            bottom:.35em;
            font-size:1.65em;
            font-weight:700;
            text-shadow:0 2px 4px #000;
        }
        .mnogotv-v05__episode-body{
            flex:1;
            min-width:0;
        }
        .mnogotv-v05__episode-title{
            font-size:1.25em;
            font-weight:500;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            margin-bottom:.5em;
        }
        .mnogotv-v05__episode-info{
            opacity:.78;
            display:flex;
            gap:.55em;
            flex-wrap:wrap;
            align-items:center;
        }
        .mnogotv-v05__duration{
            position:absolute;
            right:.7em;
            top:.65em;
            opacity:.9;
            font-size:.85em;
        }
        .mnogotv-v05__empty{
            padding:2em 0;
            opacity:.75;
            font-size:1.1em;
        }
        @media(max-width:700px){
            .mnogotv-v05__aside{display:none}
            .mnogotv-v05__layout{display:block}
            .mnogotv-v05{padding:1em}
            .mnogotv-v05__thumb{width:9em;height:5.2em;flex-basis:9em}
        }`;

        var style = document.createElement('style');
        style.id = 'mnogotv-v05-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function playViaHook(movie, season, episode, episodeMeta) {
        var resolver = window.MnogoTVResolveStream;

        if (typeof resolver !== 'function') {
            try {
                Lampa.Noty.show('MnogoTV: playback backend пока не подключён');
            } catch (e) {}
            return;
        }

        var payload = {
            tmdb: tmdbId(movie),
            movie: movie,
            season: season,
            episode: episode,
            episode_meta: episodeMeta
        };

        try {
            Promise.resolve(resolver(payload)).then(function (result) {
                if (!result) {
                    Lampa.Noty.show('MnogoTV: источник не вернул ссылку');
                    return;
                }

                var url = typeof result === 'string' ? result : result.url;
                if (!url) {
                    Lampa.Noty.show('MnogoTV: ссылка воспроизведения отсутствует');
                    return;
                }

                var play = {
                    title: (episodeMeta && episodeMeta.name) || titleOf(movie),
                    url: url,
                    season: season,
                    episode: episode,
                    thumbnail: episodeMeta && episodeMeta.still_path
                        ? Lampa.TMDB.image('t/p/w300' + episodeMeta.still_path)
                        : '',
                    quality: (typeof result === 'object' && result.quality) ? result.quality : undefined,
                    subtitles: (typeof result === 'object' && result.subtitles) ? result.subtitles : undefined
                };

                Lampa.Player.play(play);
                try { Lampa.Player.playlist([play]); } catch (e) {}
            }).catch(function (err) {
                log('resolver error', err);
                try { Lampa.Noty.show('MnogoTV: ошибка playback backend'); } catch (e) {}
            });
        } catch (err) {
            log('resolver call error', err);
        }
    }

    function MnogoComponent(object) {
        var movie = object.movie || {};
        var id = tmdbId(movie);
        var serial = isSeries(movie);
        var season = 1;
        var seasons = [];
        var initialized = false;
        var last = null;

        var scroll = new Lampa.Scroll({
            mask: true,
            over: true
        });

        var root = $('<div class="mnogotv-v05"></div>');
        var layout = $('<div class="mnogotv-v05__layout"></div>');
        var aside = $('<div class="mnogotv-v05__aside"></div>');
        var main = $('<div class="mnogotv-v05__main"></div>');
        var toolbar = $('<div class="mnogotv-v05__toolbar"></div>');
        var sourceButton = $(
            '<div class="mnogotv-v05__filter selector">' +
                '<span class="mnogotv-v05__filter-title">Источник</span>' +
                '<span class="mnogotv-v05__filter-value">MnogoTV</span>' +
            '</div>'
        );
        var seasonButton = $(
            '<div class="mnogotv-v05__filter selector">' +
                '<span class="mnogotv-v05__filter-title">Фильтр</span>' +
                '<span class="mnogotv-v05__filter-value">Сезон 1</span>' +
            '</div>'
        );

        function buildAside() {
            aside.empty();

            var poster = posterUrl(movie);
            if (poster) {
                aside.append(
                    '<div class="mnogotv-v05__poster"><img src="' + poster + '"></div>'
                );
            }

            aside.append('<div class="mnogotv-v05__title"></div>');
            aside.find('.mnogotv-v05__title').text(titleOf(movie));

            var meta = [];
            var year = ((movie.first_air_date || movie.release_date || '') + '').slice(0, 4);
            if (year) meta.push(year);
            if (movie.origin_country && movie.origin_country.length) meta.push(movie.origin_country.join(', '));
            else if (movie.production_countries && movie.production_countries.length) {
                meta.push(movie.production_countries.map(function (x) { return x.iso_3166_1 || x.name; }).join(', '));
            }
            if (movie.vote_average) meta.push('★ ' + parseFloat(movie.vote_average).toFixed(1));

            aside.append('<div class="mnogotv-v05__meta"></div>');
            aside.find('.mnogotv-v05__meta').text(meta.join('  •  '));
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
                for (var i = 1; i <= count; i++) seasons.push(i);
            }

            season = seasons[0] || 1;
            seasonButton.find('.mnogotv-v05__filter-value').text('Сезон ' + season);
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
                    seasonButton.find('.mnogotv-v05__filter-value').text('Сезон ' + season);
                    Lampa.Select.close();
                    renderEpisodes();
                    setTimeout(function () {
                        Lampa.Controller.toggle('mnogotv');
                    }, 10);
                }
            });
        }

        function makeEpisode(ep) {
            var num = parseInt(ep.episode_number || 0, 10);
            var title = ep.name || ('Серия ' + num);
            var runtime = formatRuntime(ep.runtime);

            var item = $(
                '<div class="mnogotv-v05__episode selector">' +
                    '<div class="mnogotv-v05__thumb">' +
                        '<img>' +
                        '<div class="mnogotv-v05__num"></div>' +
                    '</div>' +
                    '<div class="mnogotv-v05__episode-body">' +
                        '<div class="mnogotv-v05__episode-title"></div>' +
                        '<div class="mnogotv-v05__episode-info"></div>' +
                    '</div>' +
                    '<div class="mnogotv-v05__duration"></div>' +
                '</div>'
            );

            item.find('.mnogotv-v05__num').text(('0' + num).slice(-2));
            item.find('.mnogotv-v05__episode-title').text(title);
            item.find('.mnogotv-v05__duration').text(runtime);

            var info = [];
            if (ep.vote_average) info.push('★ ' + parseFloat(ep.vote_average).toFixed(1));
            if (ep.air_date) info.push(formatDate(ep.air_date));
            item.find('.mnogotv-v05__episode-info').text(info.join('  •  '));

            var img = item.find('img');
            if (ep.still_path) {
                try {
                    img.attr('src', Lampa.TMDB.image('t/p/w300' + ep.still_path));
                } catch (e) {}
            } else {
                img.hide();
            }

            item.on('hover:focus', function (e) {
                last = e.target;
                try { scroll.update($(e.target), true); } catch (err) {}
            });

            item.on('hover:enter', function () {
                playViaHook(movie, season, num, ep);
            });

            item.on('click', function () {
                playViaHook(movie, season, num, ep);
            });

            return item;
        }

        function renderEpisodes() {
            scroll.clear();
            last = null;

            if (!serial) {
                scroll.append(
                    $('<div class="mnogotv-v05__empty">Для фильма экран серий не требуется. Playback backend подключается через window.MnogoTVResolveStream.</div>')
                );
                return;
            }

            if (!id) {
                scroll.append(
                    $('<div class="mnogotv-v05__empty">Не удалось определить TMDB ID текущей карточки.</div>')
                );
                return;
            }

            scroll.append(
                $('<div class="mnogotv-v05__empty mnogotv-v05__loading">Загрузка серий…</div>')
            );

            Lampa.Api.sources.tmdb.get(
                'tv/' + id + '/season/' + season,
                {},
                function (data) {
                    scroll.clear();

                    var episodes = (data && data.episodes) || [];

                    if (!episodes.length) {
                        scroll.append(
                            $('<div class="mnogotv-v05__empty">Для этого сезона серии не найдены.</div>')
                        );
                        return;
                    }

                    episodes.forEach(function (ep) {
                        scroll.append(makeEpisode(ep));
                    });

                    try {
                        Lampa.Controller.toggle('mnogotv');
                    } catch (e) {}
                },
                function () {
                    scroll.clear();
                    scroll.append(
                        $('<div class="mnogotv-v05__empty">Не удалось загрузить данные серий TMDB.</div>')
                    );
                }
            );
        }

        sourceButton.on('hover:focus', function (e) { last = e.target; });
        seasonButton.on('hover:focus', function (e) { last = e.target; });

        sourceButton.on('hover:enter click', showSourceSelect);
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

                if (serial) toolbar.append(seasonButton);

                main.append(toolbar);
                scroll.render().addClass('mnogotv-v05__scroll');
                main.append(scroll.render());

                layout.append(aside);
                layout.append(main);
                root.append(layout);

                try {
                    Lampa.Background.immediately(backdropUrl(movie));
                } catch (e) {}

                renderEpisodes();
            }

            Lampa.Controller.add('mnogotv', {
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

            Lampa.Controller.toggle('mnogotv');
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

    function openComponent(movie) {
        if (!Lampa.Component.exist(COMPONENT)) {
            Lampa.Component.add(COMPONENT, MnogoComponent);
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
            var root = e.object.activity.render();
            if (!root || !root.length) return;
            if (root.find('.mnogotv-v05-button').length) return;

            var movie = (e.data && e.data.movie) || e.movie || e.object.card || {};

            var button = $(
                '<div class="full-start__button selector view--online mnogotv-v05-button" data-subtitle="MnogoTV">' +
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

            var container = root.find('.full-start-new__buttons').first();
            if (!container.length) container = root.find('.full-start__buttons').first();

            if (container.length) {
                container.append(button);
                log('Source button added', titleOf(movie));
            }
        } catch (err) {
            log('addButton error', err);
        }
    }

    function startPlugin() {
        addCss();

        if (!Lampa.Component.exist(COMPONENT)) {
            Lampa.Component.add(COMPONENT, MnogoComponent);
        }

        Lampa.Listener.follow('full', addButton);

        try {
            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show('MnogoTV UI v0.5 загружен');
            }
        } catch (e) {}

        log('Plugin started');
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e && e.type === 'ready') startPlugin();
        });
    }
})();
