// =====================================================================
//  Подписи размеров для всех слоёв на листе (Photoshop)
//
//  Что делает: берёт ВСЕ видимые слои, кроме нижнего (фонового), сам
//  считает их реальный размер в мм и рисует рядом размерные стрелки:
//    - высота сбоку у каждого слоя (например "40 мм")
//    - ширина снизу у каждого слоя (например "30 мм")
//  Размер может быть любым: 3x4, 3.5x4.5, 10x15 и т.д.
//  Всё рисуется в отдельной группе слоёв "Размеры" поверх шаблона.
//  При сохранении в JPG/PNG подписи становятся частью картинки.
//  Повторный запуск удаляет старую группу "Размеры" и рисует заново.
//
//  Что НЕ подписывается:
//    - нижний слой (фон), слои на весь лист
//    - текстовые слои и корректирующие слои
//    - слои, имя которых начинается с "_" (так можно исключить любой слой)
//    - слои меньше 5 мм
// =====================================================================
#target photoshop

// ------------------------- НАСТРОЙКИ ---------------------------------
var CFG = {
  textHeightMM: 1.5,     // высота цифр подписи, мм (меньше число = мельче текст)

  heightSide: 'right',   // подпись высоты: 'right' (справа) или 'left' (слева)
                         // если у края листа не помещается, перенесётся на другую сторону
  widthOn: 'all',        // подпись ширины: 'all' (у каждого слоя), 'bottom' (не писать,
                         // если ниже стоит слой такой же ширины), 'none' (без ширины)

  offsetMM: 1.3,         // расстояние от края слоя до размерной линии, мм
  lineMM: 0.15,          // толщина размерной линии, мм
  headLenMM: 1.5,        // длина наконечника стрелки, мм
  headWMM: 0.8,          // ширина наконечника стрелки, мм
  padMM: 0.8,            // отступ от текста до стрелок, мм

  extLines: true,        // тонкие выносные линии от краёв слоя к стрелкам
  extLineMM: 0.08,       // толщина выносных линий, мм
  extGapMM: 0.3,         // зазор между слоем и выносной линией, мм
  extOverMM: 0.7,        // насколько выносная линия выходит за размерную, мм

  minSizeMM: 5,          // слои меньше этого размера игнорируются
  fullCanvas: 0.95,      // слои, занимающие >=95% листа по обеим сторонам, игнорируются
  skipPrefix: '_',       // слои с именем, начинающимся с этого знака, игнорируются

  fontName: 'ArialMT',   // шрифт подписи
  arrowRGB: [0, 0, 0],      // цвет стрелок и линий (чёрный)
  textRGB: [0, 0, 0],       // цвет текста

  showDoneMessage: false, // true = показывать окно "Готово" после запуска

  // Названия записаны через \u-коды, чтобы не ломались кодировкой
  groupName: '\u0420\u0430\u0437\u043c\u0435\u0440\u044b',   // "Размеры"
  arrowsName: '\u0421\u0442\u0440\u0435\u043b\u043a\u0438',  // "Стрелки"
  unitText: '\u043c\u043c'                                   // "мм"
};
// ---------------------------------------------------------------------

function fmtMM(v) {
  var r = Math.round(v * 10) / 10;
  return String(r).replace('.', ',');
}

function colorOf(rgb) {
  var c = new SolidColor();
  c.rgb.red = rgb[0];
  c.rgb.green = rgb[1];
  c.rgb.blue = rgb[2];
  return c;
}

// Рекурсивно собирает все видимые слои. В корне нижний слой пропускается.
function collectLayers(container, list, skipLastArt) {
  var i;
  for (i = 0; i < container.artLayers.length; i++) {
    if (skipLastArt && i === container.artLayers.length - 1) { continue; }
    var l = container.artLayers[i];
    if (l.visible) { list.push(l); }
  }
  for (i = 0; i < container.layerSets.length; i++) {
    var g = container.layerSets[i];
    if (g.visible && g.name !== CFG.groupName) { collectLayers(g, list, false); }
  }
}

function isAllowedKind(layer) {
  try {
    var kd = layer.kind;
    return kd === LayerKind.NORMAL || kd === LayerKind.SMARTOBJECT || kd === LayerKind.SOLIDFILL;
  } catch (e) {
    return true;
  }
}

function getBox(layer) {
  try {
    var b = layer.bounds;
    return { l: b[0].as('px'), t: b[1].as('px'), r: b[2].as('px'), b: b[3].as('px'), name: layer.name };
  } catch (e) {
    return null;
  }
}

function fillPoly(doc, pts, color) {
  doc.selection.select(pts, SelectionType.REPLACE, 0, true);
  doc.selection.fill(color);
}

function rectPts(x1, y1, x2, y2) {
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
}

// Вертикальный отрезок со стрелкой на конце tipY, второй конец endY
function vArrow(doc, layer, color, cx, tipY, endY, hl, hw, lw) {
  var dir = endY > tipY ? 1 : -1;
  if (Math.abs(endY - tipY) < hl) { return; }
  doc.activeLayer = layer;
  fillPoly(doc, [[cx, tipY], [cx - hw / 2, tipY + dir * hl], [cx + hw / 2, tipY + dir * hl]], color);
  var y1 = tipY + dir * hl * 0.8;
  fillPoly(doc, rectPts(cx - lw / 2, Math.min(y1, endY), cx + lw / 2, Math.max(y1, endY)), color);
}

// Горизонтальный отрезок со стрелкой на конце tipX, второй конец endX
function hArrow(doc, layer, color, cy, tipX, endX, hl, hw, lw) {
  var dir = endX > tipX ? 1 : -1;
  if (Math.abs(endX - tipX) < hl) { return; }
  doc.activeLayer = layer;
  fillPoly(doc, [[tipX, cy], [tipX + dir * hl, cy - hw / 2], [tipX + dir * hl, cy + hw / 2]], color);
  var x1 = tipX + dir * hl * 0.8;
  fillPoly(doc, rectPts(Math.min(x1, endX), cy - lw / 2, Math.max(x1, endX), cy + lw / 2), color);
}

function addText(group, str, size, rgb) {
  var l = group.artLayers.add();
  l.kind = LayerKind.TEXT;
  var ti = l.textItem;
  try { ti.font = CFG.fontName; } catch (e) {}
  ti.contents = str;
  ti.size = size;
  ti.color = colorOf(rgb);
  ti.justification = Justification.CENTER;
  l.name = str;
  return l;
}

function centerOn(layer, cx, cy) {
  var b = layer.bounds;
  var l = b[0].as('px'), t = b[1].as('px'), r = b[2].as('px'), bt = b[3].as('px');
  layer.translate(cx - (l + r) / 2, cy - (t + bt) / 2);
}

// Подбирает размер шрифта так, чтобы цифры были нужной высоты в пикселях.
// Меряет реальный результат, поэтому не зависит от единиц шрифта в Photoshop.
function calibrateFontSize(group, targetPx) {
  var s0 = 100;
  var l = addText(group, '0', s0, CFG.textRGB);
  var b = l.bounds;
  var h0 = b[3].as('px') - b[1].as('px');
  l.remove();
  if (!(h0 > 0)) { return null; }
  return s0 * targetPx / h0;
}

// Подпись высоты: сбоку, текст повёрнут вдоль линии
function drawHeightLabel(c, p) {
  var side = CFG.heightSide;
  var need = c.off + c.over;
  if (side === 'right' && p.r + need > c.docW) { side = 'left'; }
  else if (side === 'left' && p.l - need < 0) { side = 'right'; }
  var dir = (side === 'left') ? -1 : 1;
  var edgeX = (dir === 1) ? p.r : p.l;
  var cx = edgeX + dir * c.off;
  var cy = (p.t + p.b) / 2;

  var t = addText(c.group, fmtMM((p.b - p.t) / c.k) + ' ' + CFG.unitText, c.fontSize, CFG.textRGB);
  t.rotate(-90, AnchorPosition.MIDDLECENTER);
  centerOn(t, cx, cy);
  var tb = t.bounds;
  var gap = (tb[3].as('px') - tb[1].as('px')) + 2 * c.pad;

  vArrow(c.doc, c.arrowLayer, c.color, cx, p.t, cy - gap / 2, c.hl, c.hw, c.lw);
  vArrow(c.doc, c.arrowLayer, c.color, cx, p.b, cy + gap / 2, c.hl, c.hw, c.lw);

  if (CFG.extLines) {
    var x1 = edgeX + dir * c.eg;
    var x2 = cx + dir * c.over;
    c.doc.activeLayer = c.arrowLayer;
    fillPoly(c.doc, rectPts(Math.min(x1, x2), p.t - c.elw / 2, Math.max(x1, x2), p.t + c.elw / 2), c.color);
    fillPoly(c.doc, rectPts(Math.min(x1, x2), p.b - c.elw / 2, Math.max(x1, x2), p.b + c.elw / 2), c.color);
  }
}

// Подпись ширины: снизу (если не помещается, то сверху)
function drawWidthLabel(c, p) {
  var below = !(p.b + c.off + c.over > c.docH);
  var dir = below ? 1 : -1;
  var edgeY = below ? p.b : p.t;
  var cy = edgeY + dir * c.off;
  var cx = (p.l + p.r) / 2;

  var t = addText(c.group, fmtMM((p.r - p.l) / c.k) + ' ' + CFG.unitText, c.fontSize, CFG.textRGB);
  centerOn(t, cx, cy);
  var tb = t.bounds;
  var gap = (tb[2].as('px') - tb[0].as('px')) + 2 * c.pad;

  hArrow(c.doc, c.arrowLayer, c.color, cy, p.l, cx - gap / 2, c.hl, c.hw, c.lw);
  hArrow(c.doc, c.arrowLayer, c.color, cy, p.r, cx + gap / 2, c.hl, c.hw, c.lw);

  if (CFG.extLines) {
    var y1 = edgeY + dir * c.eg;
    var y2 = cy + dir * c.over;
    c.doc.activeLayer = c.arrowLayer;
    fillPoly(c.doc, rectPts(p.l - c.elw / 2, Math.min(y1, y2), p.l + c.elw / 2, Math.max(y1, y2)), c.color);
    fillPoly(c.doc, rectPts(p.r - c.elw / 2, Math.min(y1, y2), p.r + c.elw / 2, Math.max(y1, y2)), c.color);
  }
}

// Есть ли прямо под слоем другой слой такой же ширины
function hasSameWidthBelow(p, items, k) {
  var j;
  for (j = 0; j < items.length; j++) {
    var q = items[j];
    if (q === p) { continue; }
    var overlap = Math.min(p.r, q.r) - Math.max(p.l, q.l);
    var minW = Math.min(p.r - p.l, q.r - q.l);
    if (overlap > 0.5 * minW && q.t >= p.b - k && Math.abs((q.r - q.l) - (p.r - p.l)) < 0.5 * k) {
      return true;
    }
  }
  return false;
}

function labelsMain() {
  var doc = app.activeDocument;
  var k = doc.resolution / 25.4;   // пикселей в одном миллиметре
  var i, j;

  // Убираем старую группу с подписями (повторный запуск)
  for (i = doc.layerSets.length - 1; i >= 0; i--) {
    if (doc.layerSets[i].name === CFG.groupName) { doc.layerSets[i].remove(); }
  }

  // Все видимые слои, кроме самого нижнего (фона)
  var n = doc.layers.length;
  var bottomIsArt = (n > 0 && doc.layers[n - 1].typename === 'ArtLayer');
  var all = [];
  collectLayers(doc, all, bottomIsArt);

  var docW = doc.width.as('px');
  var docH = doc.height.as('px');
  var items = [];

  for (i = 0; i < all.length; i++) {
    var lay = all[i];
    if (!isAllowedKind(lay)) { continue; }
    if (CFG.skipPrefix && lay.name.charAt(0) === CFG.skipPrefix) { continue; }
    var bx = getBox(lay);
    if (!bx) { continue; }
    var w = bx.r - bx.l;
    var h = bx.b - bx.t;
    if (w < CFG.minSizeMM * k || h < CFG.minSizeMM * k) { continue; }
    if (w >= docW * CFG.fullCanvas && h >= docH * CFG.fullCanvas) { continue; }
    var dup = false;   // рамка и фото на одном месте считаются за одно
    for (j = 0; j < items.length; j++) {
      var q = items[j];
      if (Math.abs(q.l - bx.l) < k && Math.abs(q.t - bx.t) < k &&
          Math.abs(q.r - bx.r) < k && Math.abs(q.b - bx.b) < k) { dup = true; break; }
    }
    if (!dup) { items.push(bx); }
  }

  if (items.length === 0) {
    alert('Не нашёл слоёв для подписи. Нужны видимые слои поверх нижнего (фонового) слоя. ' +
          'Текстовые слои, слои на весь лист и слои с именем на "' + CFG.skipPrefix + '" пропускаются.');
    return;
  }

  items.sort(function (a, b) {
    if (Math.abs(a.t - b.t) > 2 * k) { return a.t - b.t; }
    return a.l - b.l;
  });

  // Группа и слой для стрелок
  var group = doc.layerSets.add();
  group.name = CFG.groupName;
  try {
    if (doc.layers[0].name !== CFG.groupName) { group.move(doc.layers[0], ElementPlacement.PLACEBEFORE); }
  } catch (e) {}
  var arrowLayer = group.artLayers.add();
  arrowLayer.name = CFG.arrowsName;

  var fontSize = calibrateFontSize(group, CFG.textHeightMM * k);
  if (fontSize === null) { fontSize = CFG.textHeightMM / 0.72 * 72 / 25.4; }

  var ctx = {
    doc: doc, group: group, arrowLayer: arrowLayer, color: colorOf(CFG.arrowRGB), k: k,
    off: CFG.offsetMM * k, hl: CFG.headLenMM * k, hw: CFG.headWMM * k,
    lw: Math.max(1, CFG.lineMM * k), pad: CFG.padMM * k,
    elw: Math.max(1, CFG.extLineMM * k), eg: CFG.extGapMM * k, over: CFG.extOverMM * k,
    fontSize: fontSize, docW: docW, docH: docH
  };

  for (i = 0; i < items.length; i++) {
    var p = items[i];
    drawHeightLabel(ctx, p);
    var wantWidth = false;
    if (CFG.widthOn === 'all') { wantWidth = true; }
    else if (CFG.widthOn === 'bottom') { wantWidth = !hasSameWidthBelow(p, items, k); }
    if (wantWidth) { drawWidthLabel(ctx, p); }
  }

  doc.selection.deselect();
  if (CFG.showDoneMessage) { alert('Готово: подписи добавлены для слоёв: ' + items.length); }
}

function labelsRun() {
  if (app.documents.length === 0) {
    alert('Откройте шаблон с фото и запустите скрипт ещё раз.');
    return;
  }
  var doc = app.activeDocument;
  var oldRuler = app.preferences.rulerUnits;
  app.preferences.rulerUnits = Units.PIXELS;
  try {
    doc.suspendHistory('Подписи размеров', 'labelsMain()');
  } catch (e) {
    alert('Ошибка: ' + e + (e.line ? ' (строка ' + e.line + ')' : ''));
  } finally {
    app.preferences.rulerUnits = oldRuler;
  }
}

labelsRun();
