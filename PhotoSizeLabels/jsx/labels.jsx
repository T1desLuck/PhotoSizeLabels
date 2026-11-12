// Photo Size Labels - host script (ExtendScript, ES3) for the Photoshop panel.
// Keep this file ASCII-only: Cyrillic is stored as \uXXXX escapes.
//
// Functions called by the panel:
//   psl_count()                      -> "OK|<number>|<size>:<count>;..." or "NODOC" or "ERR|..."
//   psl_run(text, offset, line, side, widthOn) -> "OK|<number>" or "NOITEMS" or "NODOC" or "ERR|..."
//   psl_remove()                     -> "OK|<removed groups>" or "NODOC" or "ERR|..."

var PSL = {
  textHeightMM: 1.5,     // digit height, mm
  side: 'right',         // 'right' or 'left' for the height label
  widthOn: 'all',        // 'all' (every layer), 'bottom' (skip if a same-width layer is directly below), 'none'

  offsetMM: 1.3,         // distance from the layer edge to the dimension line, mm
  lineMM: 0.15,          // dimension line thickness, mm
  headLenMM: 1.5,        // arrow head length, mm
  headWMM: 0.8,          // arrow head width, mm
  padMM: 0.8,            // gap between text and arrows, mm

  extLines: true,        // thin extension lines from the layer corners
  extLineMM: 0.08,       // extension line thickness, mm
  extGapMM: 0.3,         // gap between the layer and the extension line, mm
  extOverMM: 0.7,        // how far the extension line passes the dimension line, mm

  minSizeMM: 5,          // smaller layers are ignored
  fullCanvas: 0.95,      // layers covering >= 95% of the sheet are ignored
  skipPrefix: '_',       // layers whose name starts with this are ignored

  fontName: 'ArialMT',
  arrowRGB: [0, 0, 0],
  textRGB: [0, 0, 0],

  groupName: '\u0420\u0430\u0437\u043c\u0435\u0440\u044b',
  arrowsName: '\u0421\u0442\u0440\u0435\u043b\u043a\u0438',
  unitText: '\u043c\u043c'
};

var PSL_STATE = '';

function psl_fmt(v) {
  var r = Math.round(v * 10) / 10;
  return String(r).replace('.', ',');
}

function psl_color(rgb) {
  var c = new SolidColor();
  c.rgb.red = rgb[0];
  c.rgb.green = rgb[1];
  c.rgb.blue = rgb[2];
  return c;
}

// Collects visible layers recursively. In the root the bottom layer is skipped.
function psl_collect(container, list, skipLastArt) {
  var i;
  for (i = 0; i < container.artLayers.length; i++) {
    if (skipLastArt && i === container.artLayers.length - 1) { continue; }
    var l = container.artLayers[i];
    if (l.visible) { list.push(l); }
  }
  for (i = 0; i < container.layerSets.length; i++) {
    var g = container.layerSets[i];
    if (g.visible && g.name !== PSL.groupName) { psl_collect(g, list, false); }
  }
}

function psl_allowed(layer) {
  try {
    var kd = layer.kind;
    return kd === LayerKind.NORMAL || kd === LayerKind.SMARTOBJECT || kd === LayerKind.SOLIDFILL;
  } catch (e) {
    return true;
  }
}

function psl_box(layer) {
  try {
    var b = layer.bounds;
    return { l: b[0].as('px'), t: b[1].as('px'), r: b[2].as('px'), b: b[3].as('px'), name: layer.name };
  } catch (e) {
    return null;
  }
}

function psl_fill(doc, pts, color) {
  doc.selection.select(pts, SelectionType.REPLACE, 0, true);
  doc.selection.fill(color);
}

function psl_rect(x1, y1, x2, y2) {
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
}

function psl_vArrow(doc, layer, color, cx, tipY, endY, hl, hw, lw) {
  var dir = endY > tipY ? 1 : -1;
  if (Math.abs(endY - tipY) < hl) { return; }
  doc.activeLayer = layer;
  psl_fill(doc, [[cx, tipY], [cx - hw / 2, tipY + dir * hl], [cx + hw / 2, tipY + dir * hl]], color);
  var y1 = tipY + dir * hl * 0.8;
  psl_fill(doc, psl_rect(cx - lw / 2, Math.min(y1, endY), cx + lw / 2, Math.max(y1, endY)), color);
}

function psl_hArrow(doc, layer, color, cy, tipX, endX, hl, hw, lw) {
  var dir = endX > tipX ? 1 : -1;
  if (Math.abs(endX - tipX) < hl) { return; }
  doc.activeLayer = layer;
  psl_fill(doc, [[tipX, cy], [tipX + dir * hl, cy - hw / 2], [tipX + dir * hl, cy + hw / 2]], color);
  var x1 = tipX + dir * hl * 0.8;
  psl_fill(doc, psl_rect(Math.min(x1, endX), cy - lw / 2, Math.max(x1, endX), cy + lw / 2), color);
}

function psl_addText(group, str, size, rgb) {
  var l = group.artLayers.add();
  l.kind = LayerKind.TEXT;
  var ti = l.textItem;
  try { ti.font = PSL.fontName; } catch (e) {}
  ti.contents = str;
  ti.size = size;
  ti.color = psl_color(rgb);
  ti.justification = Justification.CENTER;
  l.name = str;
  return l;
}

function psl_center(layer, cx, cy) {
  var b = layer.bounds;
  var l = b[0].as('px'), t = b[1].as('px'), r = b[2].as('px'), bt = b[3].as('px');
  layer.translate(cx - (l + r) / 2, cy - (t + bt) / 2);
}

// Picks a font size that gives digits of the requested height in pixels.
// It measures the real result, so it does not depend on Photoshop's text units.
function psl_calibrate(group, targetPx) {
  var s0 = 100;
  var l = psl_addText(group, '0', s0, PSL.textRGB);
  var b = l.bounds;
  var h0 = b[3].as('px') - b[1].as('px');
  l.remove();
  if (!(h0 > 0)) { return null; }
  return s0 * targetPx / h0;
}

function psl_drawHeight(c, p) {
  var side = PSL.side;
  var need = c.off + c.over;
  if (side === 'right' && p.r + need > c.docW) { side = 'left'; }
  else if (side === 'left' && p.l - need < 0) { side = 'right'; }
  var dir = (side === 'left') ? -1 : 1;
  var edgeX = (dir === 1) ? p.r : p.l;
  var cx = edgeX + dir * c.off;
  var cy = (p.t + p.b) / 2;

  var t = psl_addText(c.group, psl_fmt((p.b - p.t) / c.k) + ' ' + PSL.unitText, c.fontSize, PSL.textRGB);
  t.rotate(-90, AnchorPosition.MIDDLECENTER);
  psl_center(t, cx, cy);
  var tb = t.bounds;
  var gap = (tb[3].as('px') - tb[1].as('px')) + 2 * c.pad;

  psl_vArrow(c.doc, c.arrowLayer, c.color, cx, p.t, cy - gap / 2, c.hl, c.hw, c.lw);
  psl_vArrow(c.doc, c.arrowLayer, c.color, cx, p.b, cy + gap / 2, c.hl, c.hw, c.lw);

  if (PSL.extLines) {
    var x1 = edgeX + dir * c.eg;
    var x2 = cx + dir * c.over;
    c.doc.activeLayer = c.arrowLayer;
    psl_fill(c.doc, psl_rect(Math.min(x1, x2), p.t - c.elw / 2, Math.max(x1, x2), p.t + c.elw / 2), c.color);
    psl_fill(c.doc, psl_rect(Math.min(x1, x2), p.b - c.elw / 2, Math.max(x1, x2), p.b + c.elw / 2), c.color);
  }
}

function psl_drawWidth(c, p) {
  var below = !(p.b + c.off + c.over > c.docH);
  var dir = below ? 1 : -1;
  var edgeY = below ? p.b : p.t;
  var cy = edgeY + dir * c.off;
  var cx = (p.l + p.r) / 2;

  var t = psl_addText(c.group, psl_fmt((p.r - p.l) / c.k) + ' ' + PSL.unitText, c.fontSize, PSL.textRGB);
  psl_center(t, cx, cy);
  var tb = t.bounds;
  var gap = (tb[2].as('px') - tb[0].as('px')) + 2 * c.pad;

  psl_hArrow(c.doc, c.arrowLayer, c.color, cy, p.l, cx - gap / 2, c.hl, c.hw, c.lw);
  psl_hArrow(c.doc, c.arrowLayer, c.color, cy, p.r, cx + gap / 2, c.hl, c.hw, c.lw);

  if (PSL.extLines) {
    var y1 = edgeY + dir * c.eg;
    var y2 = cy + dir * c.over;
    c.doc.activeLayer = c.arrowLayer;
    psl_fill(c.doc, psl_rect(p.l - c.elw / 2, Math.min(y1, y2), p.l + c.elw / 2, Math.max(y1, y2)), c.color);
    psl_fill(c.doc, psl_rect(p.r - c.elw / 2, Math.min(y1, y2), p.r + c.elw / 2, Math.max(y1, y2)), c.color);
  }
}

function psl_sameWidthBelow(p, items, k) {
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

// Finds all layers that need labels: every visible layer above the bottom one.
function psl_detect(doc, k) {
  var n = doc.layers.length;
  var bottomIsArt = (n > 0 && doc.layers[n - 1].typename === 'ArtLayer');
  var all = [];
  psl_collect(doc, all, bottomIsArt);

  var docW = doc.width.as('px');
  var docH = doc.height.as('px');
  var items = [];
  var i, j;

  for (i = 0; i < all.length; i++) {
    var lay = all[i];
    if (!psl_allowed(lay)) { continue; }
    if (PSL.skipPrefix && lay.name.charAt(0) === PSL.skipPrefix) { continue; }
    var bx = psl_box(lay);
    if (!bx) { continue; }
    var w = bx.r - bx.l;
    var h = bx.b - bx.t;
    if (w < PSL.minSizeMM * k || h < PSL.minSizeMM * k) { continue; }
    if (w >= docW * PSL.fullCanvas && h >= docH * PSL.fullCanvas) { continue; }
    var dup = false;   // a frame and a photo in the same place count once
    for (j = 0; j < items.length; j++) {
      var q = items[j];
      if (Math.abs(q.l - bx.l) < k && Math.abs(q.t - bx.t) < k &&
          Math.abs(q.r - bx.r) < k && Math.abs(q.b - bx.b) < k) { dup = true; break; }
    }
    if (!dup) { items.push(bx); }
  }

  items.sort(function (a, b) {
    if (Math.abs(a.t - b.t) > 2 * k) { return a.t - b.t; }
    return a.l - b.l;
  });
  return items;
}

// Runs inside suspendHistory, so the whole job is one undo step.
function psl_main() {
  var doc = app.activeDocument;
  var k = doc.resolution / 25.4;
  var i;

  for (i = doc.layerSets.length - 1; i >= 0; i--) {
    if (doc.layerSets[i].name === PSL.groupName) { doc.layerSets[i].remove(); }
  }

  var items = psl_detect(doc, k);
  if (items.length === 0) { PSL_STATE = 'NOITEMS'; return; }

  var group = doc.layerSets.add();
  group.name = PSL.groupName;
  try {
    if (doc.layers[0].name !== PSL.groupName) { group.move(doc.layers[0], ElementPlacement.PLACEBEFORE); }
  } catch (e) {}
  var arrowLayer = group.artLayers.add();
  arrowLayer.name = PSL.arrowsName;

  var fontSize = psl_calibrate(group, PSL.textHeightMM * k);
  if (fontSize === null) { fontSize = PSL.textHeightMM / 0.72 * 72 / 25.4; }

  var ctx = {
    doc: doc, group: group, arrowLayer: arrowLayer, color: psl_color(PSL.arrowRGB), k: k,
    off: PSL.offsetMM * k, hl: PSL.headLenMM * k, hw: PSL.headWMM * k,
    lw: Math.max(1, PSL.lineMM * k), pad: PSL.padMM * k,
    elw: Math.max(1, PSL.extLineMM * k), eg: PSL.extGapMM * k, over: PSL.extOverMM * k,
    fontSize: fontSize, docW: doc.width.as('px'), docH: doc.height.as('px')
  };

  for (i = 0; i < items.length; i++) {
    var p = items[i];
    psl_drawHeight(ctx, p);
    var wantWidth = false;
    if (PSL.widthOn === 'all') { wantWidth = true; }
    else if (PSL.widthOn === 'bottom') { wantWidth = !psl_sameWidthBelow(p, items, k); }
    if (wantWidth) { psl_drawWidth(ctx, p); }
  }

  doc.selection.deselect();
  PSL_STATE = 'OK|' + items.length;
}

// ---- entry points for the panel ----

function psl_count() {
  if (app.documents.length === 0) { return 'NODOC'; }
  var oldRuler = app.preferences.rulerUnits;
  var res;
  app.preferences.rulerUnits = Units.PIXELS;
  try {
    var doc = app.activeDocument;
    var k = doc.resolution / 25.4;
    var items = psl_detect(doc, k);
    var names = [], counts = [];
    var i, j, key, idx;
    for (i = 0; i < items.length; i++) {
      key = psl_fmt((items[i].r - items[i].l) / k) + 'x' + psl_fmt((items[i].b - items[i].t) / k);
      idx = -1;
      for (j = 0; j < names.length; j++) { if (names[j] === key) { idx = j; break; } }
      if (idx < 0) { names.push(key); counts.push(1); } else { counts[idx] = counts[idx] + 1; }
    }
    var parts = [];
    for (i = 0; i < names.length; i++) { parts.push(names[i] + ':' + counts[i]); }
    res = 'OK|' + items.length + '|' + parts.join(';');
  } catch (e) {
    res = 'ERR|' + e;
  }
  app.preferences.rulerUnits = oldRuler;
  return res;
}

function psl_run(textH, offsetMM, lineMM, side, widthOn) {
  if (app.documents.length === 0) { return 'NODOC'; }
  if (typeof textH === 'number' && textH > 0) { PSL.textHeightMM = textH; }
  if (typeof offsetMM === 'number' && offsetMM >= 0) { PSL.offsetMM = offsetMM; }
  if (typeof lineMM === 'number' && lineMM > 0) {
    PSL.lineMM = lineMM;
    PSL.extLineMM = Math.max(0.03, lineMM * 0.55);
  }
  if (side === 'left' || side === 'right') { PSL.side = side; }
  if (widthOn === 'all' || widthOn === 'bottom' || widthOn === 'none') { PSL.widthOn = widthOn; }

  var doc = app.activeDocument;
  var oldRuler = app.preferences.rulerUnits;
  var res;
  app.preferences.rulerUnits = Units.PIXELS;
  PSL_STATE = '';
  try {
    doc.suspendHistory('Size labels', 'psl_main()');
    res = (PSL_STATE === '') ? 'ERR|no result' : PSL_STATE;
  } catch (e) {
    res = 'ERR|' + e + (e.line ? ' (line ' + e.line + ')' : '');
  }
  app.preferences.rulerUnits = oldRuler;
  return res;
}

function psl_remove() {
  if (app.documents.length === 0) { return 'NODOC'; }
  var doc = app.activeDocument;
  var removed = 0;
  var i;
  try {
    for (i = doc.layerSets.length - 1; i >= 0; i--) {
      if (doc.layerSets[i].name === PSL.groupName) { doc.layerSets[i].remove(); removed = removed + 1; }
    }
  } catch (e) {
    return 'ERR|' + e;
  }
  return 'OK|' + removed;
}
