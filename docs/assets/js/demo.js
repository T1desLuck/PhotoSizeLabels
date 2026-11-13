/* Интерактивное демо панели на главной. Без библиотек. */
(function () {
  'use strict';
  var root = document.getElementById('demo');
  if (!root) { return; }
  var sheet = document.getElementById('sheet');
  var layers = document.getElementById('layers');
  var st = document.getElementById('st');
  var bRefresh = document.getElementById('bRefresh');
  var bRun = document.getElementById('bRun');
  var bRemove = document.getElementById('bRemove');
  var cnt = document.getElementById('cnt');
  var on = false, busy = false, touched = false, timer = 0;

  function say(text, warn) {
    st.textContent = text;
    st.className = 'st' + (warn ? ' w' : '');
  }
  function setOn(v) {
    on = v;
    if (v) { sheet.classList.add('show'); layers.classList.add('on'); }
    else { sheet.classList.remove('show'); layers.classList.remove('on'); }
  }
  function lock(v) {
    busy = v;
    bRefresh.disabled = v; bRun.disabled = v; bRemove.disabled = v;
  }
  function run() {
    if (busy) { return; }
    lock(true);
    say(root.getAttribute('data-busy'));
    timer = setTimeout(function () {
      setOn(true);
      say(root.getAttribute('data-ok'));
      lock(false);
    }, 450);
  }
  function remove() {
    if (busy) { return; }
    if (!on) { say(root.getAttribute('data-none'), true); return; }
    setOn(false);
    say(root.getAttribute('data-removed'));
  }
  function refresh() {
    if (busy) { return; }
    say('');
    cnt.style.opacity = '.3';
    setTimeout(function () { cnt.style.opacity = ''; }, 220);
  }
  function mine(fn) { return function () { touched = true; clearTimeout(timer); lock(false); fn(); }; }

  bRun.addEventListener('click', mine(run));
  bRemove.addEventListener('click', mine(remove));
  bRefresh.addEventListener('click', mine(refresh));

  // Автозапуск: через секунду "нажимаем" кнопку за посетителя.
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.documentElement.className.indexOf('js') > -1) {
    setOn(false);
    if (reduce) { setOn(true); say(root.getAttribute('data-ok')); return; }
    setTimeout(function () { if (!touched) { run(); } }, 1100);
  }
}());
