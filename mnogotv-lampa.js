(function () {
    'use strict';

    var PLUGIN = 'mnogotv_source_v04';
    if (window[PLUGIN]) return;
    window[PLUGIN] = true;

    var BASE = 'https://mnogotv.com/watch-tv/?tmdb=';

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

    function getTmdb(movie) {
        if (!movie) return null;

        var candidates = [
            movie.tmdb_id,
            movie.tmdb,
            movie.id,
            movie.movie_id
        ];

        for (var i = 0; i < candidates.length; i++) {
            var value = candidates[i];

            if (value !== undefined && value !== null && value !== '') {
                value = String(value).trim();

                if (/^\d+$/.test(value)) {
                    return value;
                }
            }
        }

        return null;
    }

    function titleOf(movie) {
        return movie && (
            movie.title ||
            movie.name ||
            movie.original_title ||
            movie.original_name
        ) || 'контент';
    }

    function openExact(movie) {
        var tmdb = getTmdb(movie);

        if (!tmdb) {
            try {
                Lampa.Noty.show('MnogoTV: не удалось определить TMDB ID');
            } catch (e) {}
            log('TMDB ID not found', movie);
            return;
        }

        var url = BASE + encodeURIComponent(tmdb);

        log('Opening', titleOf(movie), 'TMDB:', tmdb, url);

        try {
            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show('MnogoTV: ' + titleOf(movie));
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
            log('Cannot open MnogoTV URL', e);
        }
    }

    function makeButton(movie) {
        var $jq = window.jQuery || window.$;
        if (!$jq) return null;

        var button = $jq(
            '<div class="full-start__button selector view--online mnogotv--button" data-subtitle="MnogoTV">' +
                ICON +
                '<span>MnogoTV</span>' +
            '</div>'
        );

        button.on('hover:enter', function () {
            openExact(movie);
        });

        button.on('click', function () {
            openExact(movie);
        });

        return button;
    }

    function extractMovie(e) {
        var candidates = [
            e && e.data && e.data.movie,
            e && e.movie,
            e && e.object && e.object.card,
            e && e.object && e.object.movie,
            e && e.object && e.object.activity && e.object.activity.card
        ];

        for (var i = 0; i < candidates.length; i++) {
            if (candidates[i] && typeof candidates[i] === 'object') {
                return candidates[i];
            }
        }

        return {};
    }

    function addToFull(e) {
        try {
            var $jq = window.jQuery || window.$;
            if (!$jq || !e || !e.object || !e.object.activity) return;

            var root = e.object.activity.render();
            if (!root || !root.length) return;

            if (root.find('.mnogotv--button').length) return;

            var movie = extractMovie(e);
            var button = makeButton(movie);
            if (!button) return;

            var torrent = root.find('.view--torrent').first();
            var online = root.find('.view--online').last();
            var buttons = root.find('.full-start-new__buttons, .full-start__buttons').first();

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
                log('Buttons container not found');
                return;
            }

            log('Button added:', titleOf(movie), 'tmdb=', getTmdb(movie));
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

        try {
            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show('MnogoTV Source v0.4 загружен');
            }
        } catch (e) {}

        log('Plugin started');
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
