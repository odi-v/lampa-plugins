(function () {
    'use strict';

    var PLUGIN = 'mnogotv_source_v03';
    if (window[PLUGIN]) return;
    window[PLUGIN] = true;

    var URLS = {
        movie: 'https://mnogotv.com/movies/',
        tv: 'https://mnogotv.com/tv-shows/'
    };

    var ICON =
        '<svg class="button__icon" width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="3" y="5" width="18" height="13" rx="2" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M10 9l5 3-5 3V9z" fill="currentColor"/>' +
        '<path d="M8 21h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '</svg>';

    function log() {
        try {
            console.log.apply(console, ['[MnogoTV]'].concat([].slice.call(arguments)));
        } catch (e) {}
    }

    function isSeries(movie) {
        return !!(
            movie &&
            (
                movie.name ||
                movie.original_name ||
                movie.number_of_seasons ||
                movie.first_air_date ||
                movie.media_type === 'tv'
            )
        );
    }

    function openExternal(movie) {
        var url = isSeries(movie) ? URLS.tv : URLS.movie;

        try {
            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show(
                    'MnogoTV: ' +
                    ((movie && (movie.title || movie.name)) || 'открытие источника')
                );
            }
        } catch (e) {}

        try {
            var w = window.open(url, '_blank');
            if (w) {
                try { w.focus(); } catch (e) {}
                return;
            }
        } catch (e) {}

        try {
            window.location.href = url;
        } catch (e) {
            log('Cannot open MnogoTV', e);
        }
    }

    function makeButton(movie) {
        var $jq = window.jQuery || window.$;
        if (!$jq) return null;

        var html =
            '<div class="full-start__button selector view--online mnogotv--button" data-subtitle="MnogoTV">' +
                ICON +
                '<span>MnogoTV</span>' +
            '</div>';

        var button = $jq(html);

        button.on('hover:enter', function () {
            openExternal(movie);
        });

        button.on('click', function () {
            openExternal(movie);
        });

        return button;
    }

    function addToFull(e) {
        try {
            var $jq = window.jQuery || window.$;
            if (!$jq || !e || !e.object || !e.object.activity) return;

            var root = e.object.activity.render();
            if (!root || !root.length) return;

            if (root.find('.mnogotv--button').length) return;

            var movie = (e.data && e.data.movie) || e.movie || {};

            /*
             * Самый совместимый способ для Lampa:
             * вставляем MnogoTV рядом с системной кнопкой "Торренты".
             * На узком экране/TV Lampa сама переносит такие источники
             * в панель "Источник", которая открывается через "...".
             */
            var torrent = root.find('.view--torrent').first();
            var online = root.find('.view--online').last();
            var buttons = root.find('.full-start-new__buttons, .full-start__buttons').first();

            var button = makeButton(movie);
            if (!button) return;

            if (torrent.length) {
                torrent.after(button);
            }
            else if (online.length) {
                online.after(button);
            }
            else if (buttons.length) {
                buttons.append(button);
            }
            else {
                log('Full buttons container not found');
                return;
            }

            log('MnogoTV source button added', movie.title || movie.name || '');
        } catch (err) {
            log('addToFull error', err);
        }
    }

    function start() {
        if (!window.Lampa || !Lampa.Listener) {
            setTimeout(start, 500);
            return;
        }

        Lampa.Listener.follow('full', function (e) {
            if (e && e.type === 'complite') {
                addToFull(e);
            }
        });

        /*
         * Если карточка уже открыта к моменту загрузки плагина,
         * пробуем добавить кнопку сразу.
         */
        try {
            var active = Lampa.Activity && Lampa.Activity.active
                ? Lampa.Activity.active()
                : null;

            if (active && active.component === 'full' && active.activity) {
                addToFull({
                    object: active,
                    data: { movie: active.card || active.movie || {} }
                });
            }
        } catch (e) {}

        try {
            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show('MnogoTV Source v0.3 загружен');
            }
        } catch (e) {}
    }

    if (window.appready) {
        start();
    }
    else if (window.Lampa && Lampa.Listener && Lampa.Listener.follow) {
        Lampa.Listener.follow('app', function (e) {
            if (e && e.type === 'ready') start();
        });
        setTimeout(function () {
            try {
                if (window.appready) start();
            } catch (e) {}
        }, 1500);
    }
    else {
        setTimeout(start, 1000);
    }
})();
