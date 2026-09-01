(function () {
    'use strict';

    var ID = 'mnogotv_launcher_v02';
    if (window[ID]) return;
    window[ID] = true;

    var URLS = {
        movies: 'https://mnogotv.com/movies/',
        series: 'https://mnogotv.com/tv-shows/'
    };

    var ICON =
        '<svg viewBox="0 0 64 64" width="44" height="44" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="7" y="11" width="50" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="4"/>' +
        '<path d="M27 22l14 7-14 7z" fill="currentColor"/>' +
        '</svg>';

    function log() {
        try { console.log.apply(console, ['[MnogoTV]'].concat([].slice.call(arguments))); } catch (e) {}
    }

    function openUrl(url) {
        try {
            var w = window.open(url, '_blank');
            if (w) return;
        } catch (e) {}
        try { window.location.href = url; } catch (e) {}
    }

    function showMenu() {
        var items = [
            { title: 'Фильмы', subtitle: 'MnogoTV', url: URLS.movies },
            { title: 'Сериалы', subtitle: 'MnogoTV', url: URLS.series }
        ];

        try {
            Lampa.Select.show({
                title: 'MnogoTV',
                items: items,
                onSelect: function (item) {
                    openUrl(item.url);
                },
                onBack: function () {
                    try { Lampa.Controller.toggle('menu'); } catch (e) {}
                }
            });
        } catch (e) {
            log('Select failed', e);
            openUrl(URLS.movies);
        }
    }

    function exists() {
        try {
            return !!document.querySelector('.mnogotv-menu-button');
        } catch (e) {
            return false;
        }
    }

    function addModern() {
        if (!window.Lampa || !Lampa.Menu || typeof Lampa.Menu.addButton !== 'function') return false;

        try {
            var button = Lampa.Menu.addButton(ICON, 'MnogoTV', showMenu);
            if (button && button.addClass) button.addClass('mnogotv-menu-button');
            else if (button && button.classList) button.classList.add('mnogotv-menu-button');

            log('Added with Lampa.Menu.addButton');
            return true;
        } catch (e) {
            log('Modern menu method failed', e);
            return false;
        }
    }

    function addLegacy() {
        if (!window.jQuery && !window.$) return false;

        try {
            var $jq = window.jQuery || window.$;
            var list = $jq('.menu .menu__list').eq(0);

            if (!list.length) return false;
            if (list.find('.mnogotv-menu-button').length) return true;

            var button = $jq(
                '<li class="menu__item selector mnogotv-menu-button" data-action="mnogotv">' +
                    '<div class="menu__ico">' + ICON + '</div>' +
                    '<div class="menu__text">MnogoTV</div>' +
                '</li>'
            );

            button.on('hover:enter', showMenu);
            list.append(button);

            log('Added with legacy DOM method');
            return true;
        } catch (e) {
            log('Legacy menu method failed', e);
            return false;
        }
    }

    function add() {
        if (exists()) return true;
        if (addModern()) return true;
        if (addLegacy()) return true;
        return false;
    }

    function boot() {
        var tries = 0;
        var timer = setInterval(function () {
            tries++;
            var ok = add();

            if (ok || tries >= 40) {
                clearInterval(timer);

                if (ok) {
                    try {
                        if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('MnogoTV: плагин загружен');
                    } catch (e) {}
                } else {
                    log('Could not add menu button');
                }
            }
        }, 500);
    }

    if (window.appready) {
        boot();
    } else if (window.Lampa && Lampa.Listener && Lampa.Listener.follow) {
        Lampa.Listener.follow('app', function (e) {
            if (e && e.type === 'ready') boot();
        });
        setTimeout(boot, 3000);
    } else {
        setTimeout(boot, 1500);
    }
})();
