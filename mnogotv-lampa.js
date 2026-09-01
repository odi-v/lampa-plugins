(function () {
    'use strict';

    if (window.__mnogotv_lampa_loaded) return;
    window.__mnogotv_lampa_loaded = true;

    var URLS = {
        movies: 'https://mnogotv.com/movies/',
        series: 'https://mnogotv.com/tv-shows/'
    };

    function openUrl(url) {
        try {
            var w = window.open(url, '_blank');
            if (w) return;
        } catch (e) {}
        try { window.location.href = url; } catch (e) {}
    }

    function showMenu() {
        var items = [
            {title: 'Фильмы', url: URLS.movies},
            {title: 'Сериалы', url: URLS.series}
        ];

        if (window.Lampa && Lampa.Select && Lampa.Select.show) {
            Lampa.Select.show({
                title: 'MnogoTV',
                items: items,
                onSelect: function (item) { openUrl(item.url); }
            });
        } else {
            openUrl(URLS.movies);
        }
    }

    function addButton() {
        if (!window.Lampa || !Lampa.Menu || !Lampa.Menu.addButton) {
            setTimeout(addButton, 1000);
            return;
        }

        try {
            Lampa.Menu.addButton(
                '<svg viewBox="0 0 64 64" width="44" height="44" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="11" width="50" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><path d="M27 22l14 7-14 7z" fill="currentColor"/></svg>',
                'MnogoTV',
                showMenu
            );
            console.log('[MnogoTV] loaded');
        } catch (e) {
            console.error('[MnogoTV] load error', e);
        }
    }

    addButton();
})();