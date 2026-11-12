// Панель «Размеры фото»: интерфейс. Работает в старых CEP (ES5, без стрелочных функций).
(function () {
  'use strict';

  var STORE_KEY = 'photoSizeLabels.settings.v1';
  var DEFAULTS = { text: 1.5, offset: 1.3, line: 0.15, side: 'right', width: 'all' };
  var busy = false;

  function $(id) { return document.getElementById(id); }

  // ---- связь со скриптом Photoshop ----
  function callJSX(code, cb) {
    try {
      if (!window.__adobe_cep__) { cb('ERR|NOCEP'); return; }
      window.__adobe_cep__.evalScript(code, function (res) { cb(String(res)); });
    } catch (e) {
      cb('ERR|' + e);
    }
  }

  // ---- цвет панели как в Photoshop ----
  function applySkin() {
    var dark = true;
    var bg = '#323232';
    try {
      var env = JSON.parse(window.__adobe_cep__.getHostEnvironment());
      var c = env.appSkinInfo.panelBackgroundColor.color;
      var r = Math.round(c.red), g = Math.round(c.green), b = Math.round(c.blue);
      bg = 'rgb(' + r + ',' + g + ',' + b + ')';
      dark = (0.299 * r + 0.587 * g + 0.114 * b) < 128;
    } catch (e) {}
    document.body.style.backgroundColor = bg;
    document.body.className = dark ? 'dark' : 'light';
  }

  // ---- настройки ----
  function fmt(v) { return String(v).replace('.', ','); }

  function clampNum(v, def, min, max) {
    v = parseFloat(String(v).replace(',', '.'));
    if (!isFinite(v)) { v = def; }
    if (v < min) { v = min; }
    if (v > max) { v = max; }
    return v;
  }

  function readSettings() {
    return {
      text: clampNum($('optText').value, DEFAULTS.text, 0.5, 10),
      offset: clampNum($('optOffset').value, DEFAULTS.offset, 0, 20),
      line: clampNum($('optLine').value, DEFAULTS.line, 0.03, 2),
      side: $('optSide').value === 'left' ? 'left' : 'right',
      width: $('optWidth').value === 'bottom' ? 'bottom' : 'all'
    };
  }

  function writeSettings(s) {
    $('optText').value = fmt(s.text);
    $('optOffset').value = fmt(s.offset);
    $('optLine').value = fmt(s.line);
    $('optSide').value = s.side;
    $('optWidth').value = s.width;
  }

  function saveSettings() {
    var s = readSettings();
    writeSettings(s);
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function loadSettings() {
    var s = DEFAULTS;
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        s = {
          text: clampNum(o.text, DEFAULTS.text, 0.5, 10),
          offset: clampNum(o.offset, DEFAULTS.offset, 0, 20),
          line: clampNum(o.line, DEFAULTS.line, 0.03, 2),
          side: o.side === 'left' ? 'left' : 'right',
          width: o.width === 'bottom' ? 'bottom' : 'all'
        };
      }
    } catch (e) {}
    writeSettings(s);
  }

  function resetSettings() {
    writeSettings(DEFAULTS);
    saveSettings();
  }

  // ---- вывод ----
  function setStatus(text, cls) {
    var el = $('status');
    el.textContent = text;
    el.className = 'status' + (cls ? ' ' + cls : '');
  }

  function setBusy(b) {
    busy = b;
    $('btnRefresh').disabled = b;
    $('btnRun').disabled = b;
    $('btnRemove').disabled = b;
  }

  function errorText(res) {
    var s = String(res);
    var p = s.split('|');
    if (p[0] === 'NODOC') { return 'Нет открытого документа'; }
    if (p[0] === 'ERR' && p[1] === 'NOCEP') { return 'Нет связи с Photoshop'; }
    if (p[0] === 'ERR') { return 'Ошибка: ' + p.slice(1).join('|'); }
    if (s.indexOf('EvalScript error') === 0) {
      return 'Скрипт панели не загрузился. Закройте панель и откройте её снова.';
    }
    return 'Неожиданный ответ: ' + s;
  }

  function showCount(res) {
    var p = String(res).split('|');
    var sizes = $('sizes');
    while (sizes.firstChild) { sizes.removeChild(sizes.firstChild); }

    if (p[0] !== 'OK') {
      $('count').textContent = '—';
      sizes.textContent = errorText(res);
      return;
    }

    $('count').textContent = p[1];
    if (Number(p[1]) === 0) {
      sizes.textContent = 'Нет слоёв для подписи. Фото должны лежать поверх нижнего (фонового) слоя.';
      return;
    }

    var groups = (p[2] || '').split(';');
    for (var i = 0; i < groups.length; i++) {
      if (!groups[i]) { continue; }
      var kv = groups[i].split(':');
      var div = document.createElement('div');
      div.textContent = kv[0].replace('x', '×') + ' мм — ' + kv[1] + ' шт.';
      sizes.appendChild(div);
    }
  }

  function refresh(done) {
    callJSX('psl_count()', function (res) {
      showCount(res);
      if (done) { done(); }
    });
  }

  // ---- кнопки ----
  function onRefresh() {
    if (busy) { return; }
    setBusy(true);
    setStatus('', '');
    refresh(function () { setBusy(false); });
  }

  function onRun() {
    if (busy) { return; }
    var s = readSettings();
    var code = 'psl_run(' + s.text + ',' + s.offset + ',' + s.line + ',"' + s.side + '","' + s.width + '")';
    setBusy(true);
    setStatus('Рисую подписи…', '');
    callJSX(code, function (res) {
      var p = String(res).split('|');
      if (p[0] === 'OK') {
        setStatus('Готово: подписи добавлены для фото: ' + p[1], 'ok');
      } else if (p[0] === 'NOITEMS') {
        setStatus('Не нашёл слоёв для подписи. Фото должны лежать поверх нижнего слоя.', 'warn');
      } else {
        setStatus(errorText(res), 'err');
      }
      refresh(function () { setBusy(false); });
    });
  }

  function onRemove() {
    if (busy) { return; }
    setBusy(true);
    callJSX('psl_remove()', function (res) {
      var p = String(res).split('|');
      if (p[0] === 'OK') {
        var had = Number(p[1]) > 0;
        setStatus(had ? 'Подписи убраны' : 'Подписей на листе нет', had ? 'ok' : 'warn');
      } else {
        setStatus(errorText(res), 'err');
      }
      refresh(function () { setBusy(false); });
    });
  }

  // ---- поддержка ----
  function onSupport() {
    var box = $('supportBox');
    box.style.display = (box.style.display === 'block') ? 'none' : 'block';
  }

  function onMail() {
    var mail = $('mail').value;
    var url = 'mailto:' + mail + '?subject=' + encodeURIComponent('Размеры фото: вопрос');
    try {
      window.cep.util.openURLInDefaultBrowser(url);
    } catch (e) {
      setStatus('Почта не открылась. Напишите на ' + mail, 'warn');
    }
  }

  function onCopy() {
    var el = $('mail');
    var ok = false;
    try {
      el.focus();
      el.select();
      ok = document.execCommand('copy');
    } catch (e) {}
    setStatus(ok ? 'Адрес скопирован' : 'Выделите адрес и нажмите Ctrl+C', ok ? 'ok' : 'warn');
  }

  // ---- запуск ----
  function init() {
    applySkin();
    try {
      window.__adobe_cep__.addEventListener('com.adobe.csxs.events.ThemeColorChanged', applySkin);
    } catch (e) {}

    loadSettings();

    $('btnRefresh').addEventListener('click', onRefresh);
    $('btnRun').addEventListener('click', onRun);
    $('btnRemove').addEventListener('click', onRemove);
    $('btnReset').addEventListener('click', resetSettings);
    $('optText').addEventListener('change', saveSettings);
    $('optOffset').addEventListener('change', saveSettings);
    $('optLine').addEventListener('change', saveSettings);
    $('optSide').addEventListener('change', saveSettings);
    $('optWidth').addEventListener('change', saveSettings);
    $('btnSupport').addEventListener('click', onSupport);
    $('btnMail').addEventListener('click', onMail);
    $('btnCopy').addEventListener('click', onCopy);

    setTimeout(function () { refresh(); }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
