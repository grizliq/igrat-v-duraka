/* Дурак против компьютера: подкидной и переводной, 36 карт, двое игроков.
   Все перемещения карт анимируются по принципу FLIP: запоминаем, где карта была, перерисовываем, плавно переносим. */
(function () {
  "use strict";
  var root = document.getElementById("durak");
  if (!root) return;
  var XFER = root.getAttribute("data-mode") === "perevodnoy";
  var Q = function (s) { return root.querySelector(s); };
  var tableEl = Q(".dk__table"), oppEl = Q(".dk__opp"), deckEl = Q(".dk__deck"), fieldEl = Q(".dk__field"), outEl = Q(".dk__out"),
      meEl = Q(".dk__me"), msgEl = Q(".dk__msg"), actBtn = Q("[data-a=act]"), newBtn = Q("[data-a=new]"), infoEl = Q(".dk__info"), lvlEl = Q(".dk__lvl");
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canAnim = !!(document.body.animate);

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  var RN = { 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "В", 12: "Д", 13: "К", 14: "Т" };
  var RW = { 6: "шестёрка", 7: "семёрка", 8: "восьмёрка", 9: "девятка", 10: "десятка", 11: "валет", 12: "дама", 13: "король", 14: "туз" };
  var SG = ["пик", "червей", "бубен", "треф"];
  var SN = ["пики", "червы", "бубны", "трефы"];
  var LEVELS = [["Внучок", "путает масти"], ["Попутчик в плацкарте", "играет на интерес"], ["Дед со двора", "бережёт козыри"], ["Бабка-картёжница", "помнит все вышедшие карты"]];
  var level = Math.max(0, Math.min(3, +(ls("durakLevel") || 1)));

  function suit(s, cls) { return '<svg class="' + (cls || "su") + '" aria-hidden="true" focusable="false"><use href="#su' + s + '"/></svg>'; }
  function name(c) { return (c.r <= 10 ? c.r : RW[c.r]) + " " + SG[c.s]; }
  function red(c) { return c.s === 1 || c.s === 2; }
  var PIPS = { 6: [[25, 10], [75, 10], [25, 50], [75, 50], [25, 90], [75, 90]] };
  PIPS[7] = PIPS[6].concat([[50, 30]]);
  PIPS[8] = PIPS[6].concat([[50, 30], [50, 70]]);
  PIPS[9] = [[25, 10], [75, 10], [25, 36.7], [75, 36.7], [25, 63.3], [75, 63.3], [25, 90], [75, 90], [50, 50]];
  PIPS[10] = PIPS[9].slice(0, 8).concat([[50, 23], [50, 77]]);
  var FIG = { 11: "fJ", 12: "fQ", 13: "fK" };
  function face(c) {
    var r = RN[c.r], mid;
    if (FIG[c.r]) {
      var f = FIG[c.r];
      mid = '<span class="cd__art"><svg viewBox="0 0 60 84" fill="currentColor" aria-hidden="true" focusable="false"><use href="#' + f + '" width="60" height="42"/>' +
        '<use href="#' + f + '" width="60" height="42" transform="rotate(180 30 42)"/><path d="M2 42H58" stroke="#D9A23A" stroke-width="1"/>' +
        '<use href="#su' + c.s + '" x="3" y="3" width="9" height="9"/><use href="#su' + c.s + '" x="48" y="72" width="9" height="9"/></svg></span>';
    } else if (c.r === 14) mid = suit(c.s, "cd__big");
    else mid = '<span class="cd__pips">' + PIPS[c.r].map(function (p) {
      return '<svg class="pp' + (p[1] > 50 ? " dn" : "") + '" style="left:' + p[0] + "%;top:" + p[1] + '%" aria-hidden="true" focusable="false"><use href="#su' + c.s + '"/></svg>';
    }).join("") + "</span>";
    return '<span class="cd__i">' + r + suit(c.s) + "</span>" + mid + '<span class="cd__i cd__i--b">' + r + suit(c.s) + "</span>";
  }

  /* ---------- состояние ---------- */
  var S = null, gid = 0, sel = null, busy = false, prevBack = {}, pend = null, curPrev = null;
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function fresh() {
    var d = [], id = 0;
    for (var s = 0; s < 4; s++) for (var r = 6; r <= 14; r++) d.push({ r: r, s: s, id: id++ });
    shuffle(d);
    return { deck: d, trump: d[0].s, tc: d[0], hands: [[], []], table: [], out: [], att: 0, def: 1, taking: false, over: false, mem: {} };
  }
  function val(c) { return c.r + (c.s === S.trump ? 20 : 0); }
  function byVal(a, b) { return val(a) - val(b); }
  function beats(a, d) { return (d.s === a.s && d.r > a.r) || (d.s === S.trump && a.s !== S.trump); }
  function unbeaten() { var n = 0; S.table.forEach(function (p) { if (!p.d) n++; }); return n; }
  function ranks() { var m = {}; S.table.forEach(function (p) { m[p.a.r] = 1; if (p.d) m[p.d.r] = 1; }); return m; }
  function canThrow(c) {
    return S.table.length > 0 && !!ranks()[c.r] && S.table.length < 6 && unbeaten() < S.hands[S.def].length;
  }
  function canXfer(c) {
    return XFER && S.table.length > 0 && !S.taking && S.table.every(function (p) { return !p.d; }) && S.table[0].a.r === c.r &&
      S.table.length < 6 && S.hands[S.att].length >= S.table.length + 1;
  }
  function targets(c) {
    var t = [];
    S.table.forEach(function (p, i) { if (!p.d && beats(p.a, c)) t.push(i); });
    if (canXfer(c)) t.push("x");
    return t;
  }
  function remove(h, c) { var i = h.indexOf(c); if (i >= 0) h.splice(i, 1); }
  function sortHand() {
    S.hands[0].sort(function (a, b) {
      var ta = a.s === S.trump ? 1 : 0, tb = b.s === S.trump ? 1 : 0;
      return ta - tb || (ta ? 0 : a.s - b.s) || a.r - b.r;
    });
  }
  function actor() {
    if (!S.table.length || S.taking) return S.att;
    return unbeaten() ? S.def : S.att;
  }

  /* ---------- отрисовка ---------- */
  function snap() {
    var m = {};
    root.querySelectorAll("[data-c]").forEach(function (e) { m[e.getAttribute("data-c")] = e.getBoundingClientRect(); });
    return m;
  }
  function flip(prev) {
    if (reduce || !canAnim) return;
    var dr = deckEl.getBoundingClientRect();
    root.querySelectorAll("[data-c]").forEach(function (e) {
      var p = prev[e.getAttribute("data-c")] || (e.closest(".dk__deck") ? null : dr);
      if (!p) return;
      var n = e.getBoundingClientRect();
      if (!n.width || !p.width) return;
      var dx = (p.left + p.width / 2) - (n.left + n.width / 2), dy = (p.top + p.height / 2) - (n.top + n.height / 2), sc = p.width / n.width;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sc - 1) < .03) return;
      e.style.zIndex = 30;
      var a = e.animate([{ translate: dx + "px " + dy + "px", scale: String(sc) }, { translate: "0px 0px", scale: "1" }],
        { duration: 440, easing: "cubic-bezier(.2,.75,.25,1)" });
      a.onfinish = a.oncancel = function () { e.style.zIndex = ""; };
    });
  }
  function cardHTML(c, o) {
    o = o || {};
    var cls = "cd" + (red(c) ? " cd--r" : "") + (c.s === S.trump ? " cd--t" : "") + (o.cls ? " " + o.cls : "");
    if (o.back) return '<div class="cd cd--back' + (o.cls ? " " + o.cls : "") + '" data-c="' + c.id + '"' + (o.st ? ' style="' + o.st + '"' : "") + "></div>";
    if (prevBack[c.id] || (o.btn && curPrev && !curPrev[c.id])) cls += " was-back";
    var tag = o.btn ? "button" : "div";
    return "<" + tag + ' class="' + cls + '" data-c="' + c.id + '"' + (o.btn ? ' type="button"' : ' role="img"') + ' aria-label="' + name(c) + '"' +
      (o.st ? ' style="' + o.st + '"' : "") + ">" + face(c) + "</" + tag + ">";
  }
  function fan(box, w0) {
    var cs = box.querySelectorAll(".cd"), n = cs.length;
    if (!n) return;
    var W = box.clientWidth, cw = cs[0].offsetWidth, step = n > 1 ? Math.min(cw * (w0 || 0.82), (W - cw - 8) / (n - 1)) : 0;
    var ang = Math.min(5, 34 / Math.max(n, 1)), opp = box === oppEl;
    for (var i = 0; i < n; i++) {
      var k = i - (n - 1) / 2;
      cs[i].style.left = (W / 2 - cw / 2 + k * step) + "px";
      cs[i].style.rotate = (opp ? -k * ang : k * ang) + "deg";
      cs[i].style.top = (opp ? -Math.abs(k) * Math.abs(k) * 0.6 : Math.abs(k) * Math.abs(k) * 0.9) + "px";
    }
  }
  function render(over) {
    var prev = snap(), i;
    if (over) for (var k in over) prev[k] = over[k];
    if (pend) { for (var k2 in pend) prev[k2] = pend[k2]; pend = null; }
    curPrev = prev;
    var me = actor() === 0 && !S.over && !busy, mode = null;
    if (me) mode = !S.table.length || S.taking || !unbeaten() ? "play" : "def";
    root.classList.toggle("is-you", me);
    /* соперник */
    oppEl.innerHTML = S.hands[1].map(function (c) { return cardHTML(c, { back: true }); }).join("") +
      '<span class="dk__who">' + LEVELS[level][0] + "<small>" + cardsWord(S.hands[1].length) + "</small></span>";
    /* колода */
    var dh = "";
    if (S.deck.length) {
      dh += cardHTML(S.tc, { cls: "cd--trump" });
      for (i = 0; i < Math.min(3, S.deck.length - 1); i++) dh += '<div class="cd cd--back cd--pile" style="--k:' + i + '"></div>';
      dh += '<span class="dk__cnt">' + S.deck.length + "</span>";
    } else dh += '<span class="dk__empty' + (red({ s: S.trump }) ? " is-r" : "") + '">' + suit(S.trump) + "<small>козырь</small></span>";
    deckEl.innerHTML = dh;
    /* стол */
    var fh = "";
    S.table.forEach(function (p, i) {
      var t = sel && !p.d && beats(p.a, sel) && targets(sel).indexOf(i) >= 0;
      fh += '<div class="pr' + (t ? " is-to" : "") + '"' + (t ? ' data-t="' + i + '" role="button" tabindex="0" aria-label="Побить: ' + name(p.a) + '"' : "") + ">" +
        cardHTML(p.a, { cls: "cd--a" }) + (p.d ? cardHTML(p.d, { cls: "cd--d" }) : "") + "</div>";
    });
    if (me && mode === "def" && S.hands[0].some(canXfer)) {
      var xt = sel && canXfer(sel);
      fh += '<div class="pr pr--x' + (xt ? " is-to" : "") + '"' + (xt ? ' data-t="x" role="button" tabindex="0" aria-label="Перевести"' : "") + "><span>Перевести</span></div>";
    }
    fieldEl.innerHTML = fh;
    fieldEl.classList.toggle("is-drop", me && mode === "play");
    /* бито */
    outEl.innerHTML = S.out.map(function (c) { return cardHTML(c, { back: true, st: "rotate:" + ((c.id * 37) % 34 - 17) + "deg" }); }).join("") +
      (S.out.length ? '<span class="dk__olab">Бито</span>' : "");
    /* рука */
    meEl.innerHTML = S.hands[0].map(function (c) {
      var ok = me && (mode === "play" ? (!S.table.length || canThrow(c)) : targets(c).length > 0);
      return cardHTML(c, { btn: true, cls: (ok ? "is-ok" : me ? "is-no" : "") + (sel === c ? " is-sel" : "") });
    }).join("");
    fan(meEl); fan(oppEl, 0.5);
    prevBack = {};
    S.hands[1].forEach(function (c) { prevBack[c.id] = 1; });
    S.out.forEach(function (c) { prevBack[c.id] = 1; });
    /* панель */
    var lab = "";
    if (me) lab = mode === "def" ? "Беру" : S.taking ? "Хватит" : S.table.length ? "Бито" : "";
    actBtn.textContent = lab || (!S.hands[0].length && !S.hands[1].length && !S.over ? "Выберите соперника" : me ? "Ваш ход" : "Ход компьютера");
    actBtn.disabled = !lab || (mode === "play" && !S.table.length);
    if (!lab && S.over) actBtn.textContent = "Партия окончена";
    infoEl.innerHTML = '<span class="dk__tr' + (red({ s: S.trump }) ? " is-r" : "") + '">' + suit(S.trump) + "<span>Козырь<b>" + SN[S.trump] + "</b></span></span>" +
      "<span>Колода<b>" + S.deck.length + "</b></span><span>Счёт<b>" + score()[0] + " : " + score()[1] + "</b></span>";
    flip(prev);
  }
  function cardsWord(n) { var m = n % 10, h = n % 100; return n + " " + (m === 1 && h !== 11 ? "карта" : m >= 2 && m <= 4 && (h < 12 || h > 14) ? "карты" : "карт"); }
  function score() { var s = (ls("durakScore") || "0:0").split(":"); return [+s[0] || 0, +s[1] || 0]; }
  function msg(t, shake) {
    if (msgEl.innerHTML === t) return;
    msgEl.innerHTML = t;
    msgEl.classList.remove("is-new", "is-shake"); void msgEl.offsetWidth; msgEl.classList.add(shake ? "is-shake" : "is-new");
  }

  /* ---------- ход партии ---------- */
  function later(f, ms) { var g = gid; setTimeout(function () { if (g === gid) f(); }, ms); }
  function next() {
    if (S.over) return;
    sel = null;
    render();
    var p = actor();
    if (p === 1) { later(ai, level === 0 ? 650 : 800); return; }
    prompt();
  }
  function prompt() {
    var h = S.hands[0];
    if (!S.table.length) { msg("Ваш ход: положите на стол любую карту. Лучше начинать с младших."); return; }
    if (S.taking || !unbeaten()) {
      var can = h.some(canThrow);
      if (!can) {
        msg(S.taking ? "Подкинуть нечего — компьютер забирает карты." : "Подкинуть нечего. Бито.");
        busy = true; render();
        later(function () { busy = false; endBout(S.taking); }, 900);
        return;
      }
      msg(S.taking ? "Компьютер берёт. Можете подкинуть карты того же достоинства или нажмите «Хватит»." : "Компьютер отбился. Подкиньте карту того же достоинства или нажмите «Бито».");
      return;
    }
    var any = h.some(function (c) { return targets(c).length; });
    var xf = h.some(canXfer);
    if (!any) { msg("Отбиться нечем — придётся взять. Нажмите «Беру».", true); return; }
    msg("Отбивайтесь: старшая карта той же масти или козырь." + (xf ? " Можно перевести картой того же достоинства." : "") + " Или нажмите «Беру».");
  }
  function play(p, c) { remove(S.hands[p], c); S.table.push({ a: c, d: null }); }
  function beat(p, c, i) { remove(S.hands[p], c); S.table[i].d = c; }
  function xfer(p, c) { remove(S.hands[p], c); S.table.push({ a: c, d: null }); var t = S.att; S.att = S.def; S.def = t; }
  function endBout(took) {
    var cards = [];
    S.table.forEach(function (p) { cards.push(p.a); if (p.d) cards.push(p.d); });
    if (took) {
      cards.forEach(function (c) { S.hands[S.def].push(c); if (S.def === 0) S.mem[c.id] = 1; });
      if (S.def === 0) sortHand();
    } else S.out = S.out.concat(cards);
    S.table = []; S.taking = false; sel = null;
    busy = true; render();
    later(function () {
      refill([S.att, S.def], function () {
        if (!took) { var t = S.att; S.att = S.def; S.def = t; }
        busy = false;
        if (!checkOver()) {
          if (S.att === 1) msg(took ? "Вы взяли карты. Компьютер ходит снова." : "Бито. Ходит компьютер.");
          next();
        }
      });
    }, 480);
  }
  function refill(order, cb) {
    var seq = [], need = [6 - S.hands[0].length, 6 - S.hands[1].length], left = S.deck.length;
    order.forEach(function (p) { while (need[p] > 0 && left > 0) { seq.push(p); need[p]--; left--; } });
    var i = 0;
    (function nx() {
      if (i >= seq.length) { cb(); return; }
      var p = seq[i++];
      S.hands[p].push(S.deck.pop());
      if (p === 0) sortHand();
      render();
      later(nx, 110);
    })();
  }
  function checkOver() {
    if (S.deck.length) return false;
    var a = S.hands[0].length, b = S.hands[1].length;
    if (a && b) return false;
    S.over = true; busy = false;
    var sc = score(), res = !a && !b ? 0 : !a ? 1 : -1;
    if (res > 0) sc[0]++; else if (res < 0) sc[1]++;
    ls("durakScore", sc[0] + ":" + sc[1]);
    render();
    msg(res > 0 ? "Вы вышли первым. " + LEVELS[level][0] + " остаётся в дураках." : res < 0 ? "Карты остались у вас — вы в дураках. Отыграйтесь!" : "Оба вышли одновременно — ничья.");
    var big = res > 0 ? "Победа" : res < 0 ? "Вы дурак" : "Ничья",
        sub = res > 0 ? "Соперник «" + LEVELS[level][0] + "» остался с картами." : res < 0 ? "У вас остал" + (S.hands[0].length === 1 ? "ась " : "ось ") + cardsWord(S.hands[0].length) + ". Попробуйте ещё раз." : "Карты кончились у обоих в один ход.";
    tableEl.insertAdjacentHTML("beforeend", '<div class="dk__result' + (res > 0 ? " is-win" : res < 0 ? " is-lose" : "") + '"><span class="dk__burst" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><b>' + big + "</b><span>" + sub +
      '</span><button type="button" class="dk__again">Ещё партию</button><span class="dk__rhint">Нажмите на стол, чтобы посмотреть, что осталось</span></div>');
    root.classList.add("is-over");
    return true;
  }

  /* ---------- компьютер ---------- */
  function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
  function oppKnown() {
    if (!S.deck.length) return S.hands[0].slice();
    return S.hands[0].filter(function (c) { return S.mem[c.id]; });
  }
  function aiLead() {
    var h = S.hands[1].slice().sort(byVal);
    if (level === 0) return rnd(h);
    if (level >= 3) {
      var o = oppKnown();
      if (o.length && !S.deck.length) {
        var cant = h.filter(function (c) { return !o.some(function (x) { return beats(c, x); }); });
        if (cant.length) return cant[0];
      }
    }
    var plain = h.filter(function (c) { return c.s !== S.trump; });
    if (level >= 2 && plain.length) {
      for (var i = 0; i < plain.length; i++) {
        var r = plain[i].r;
        if (r <= 11 && plain.filter(function (c) { return c.r === r; }).length >= 2) return plain[i];
      }
    }
    return plain.length ? plain[0] : h[0];
  }
  function aiThrow() {
    var h = S.hands[1].filter(canThrow).sort(byVal);
    if (!h.length) return null;
    if (level === 0) return Math.random() < .5 ? rnd(h) : null;
    var c = h[0], end = !S.deck.length, tr = c.s === S.trump;
    if (S.taking) return (!tr && (c.r <= 12 || end)) || (end && level >= 2 && S.hands[1].length <= 3) ? c : null;
    if (level === 1) return !tr && c.r <= 11 ? c : null;
    if (end) {
      if (level >= 3) {
        var o = oppKnown(), cant = h.filter(function (x) { return !o.some(function (y) { return beats(x, y); }); });
        if (cant.length) return cant[0];
      }
      return !tr || S.hands[1].length <= 2 ? c : null;
    }
    return !tr && c.r <= 10 ? c : null;
  }
  function aiDefend() {
    var h = S.hands[1];
    if (XFER) {
      var xs = h.filter(canXfer).sort(byVal);
      if (xs.length) {
        if (level === 0 ? Math.random() < .5 : (level === 1 || xs[0].s !== S.trump || !S.deck.length)) return { t: "x", c: xs[0] };
      }
    }
    var avail = h.slice(), plan = [];
    var un = [];
    S.table.forEach(function (p, i) { if (!p.d) un.push(i); });
    un.sort(function (a, b) { return val(S.table[b].a) - val(S.table[a].a); });
    for (var k = 0; k < un.length; k++) {
      var a = S.table[un[k]].a;
      var bs = avail.filter(function (c) { return beats(a, c); }).sort(byVal);
      if (!bs.length) return { t: "take" };
      var pick = level === 0 ? rnd(bs) : bs[0];
      plan.push({ c: pick, i: un[k] }); remove(avail, pick);
    }
    if (level === 0 && Math.random() < .12) return { t: "take" };
    if (level >= 2 && S.deck.length >= 6 && S.table.length <= 2) {
      var dear = plan.filter(function (p) { return p.c.s === S.trump && p.c.r >= (level >= 3 ? 13 : 12); }).length;
      var cheap = S.table.every(function (p) { return p.a.s !== S.trump && p.a.r <= 10; });
      if (dear && cheap) return { t: "take" };
    }
    return { t: "b", c: plan[0].c, i: plan[0].i };
  }
  function ai() {
    if (S.over || actor() !== 1) return;
    var c;
    if (!S.table.length) {
      c = aiLead(); play(1, c);
      msg("Компьютер ходит: " + name(c) + ".");
      next(); return;
    }
    if (S.att === 1 && (S.taking || !unbeaten())) {
      c = aiThrow();
      if (c) { play(1, c); msg((S.taking ? "Компьютер подкидывает вдогонку: " : "Компьютер подкидывает: ") + name(c) + "."); next(); return; }
      if (S.taking) { msg("Вы забираете карты."); endBout(true); } else { msg("Бито."); endBout(false); }
      return;
    }
    var d = aiDefend();
    if (d.t === "x") { xfer(1, d.c); msg("Компьютер переводит картой " + name(d.c) + ". Теперь отбиваетесь вы."); next(); return; }
    if (d.t === "take") { S.taking = true; msg("Компьютер берёт."); next(); return; }
    beat(1, d.c, d.i);
    msg("Компьютер бьёт: " + name(d.c) + ".");
    next();
  }

  /* ---------- действия человека ---------- */
  function human(c, t, over) {
    if (S.over || busy || actor() !== 0) return false;
    var mode = !S.table.length || S.taking || !unbeaten() ? "play" : "def";
    if (mode === "play") {
      if (S.table.length && !canThrow(c)) { msg(S.table.length >= 6 || unbeaten() >= S.hands[S.def].length ? "Больше подкидывать нельзя." : "Подкинуть можно только карту того же достоинства, что уже на столе.", true); return false; }
      play(0, c); sel = null; pend = over || null;
      next(); return true;
    }
    var ts = targets(c);
    if (!ts.length) { msg("Этой картой не отбиться: нужна старшая той же масти или козырь.", true); return false; }
    if (t === undefined) { if (ts.length === 1) t = ts[0]; else { sel = sel === c ? null : c; render(); msg("Выберите, какую карту побить" + (ts.indexOf("x") >= 0 ? ", или переведите." : ".")); return false; } }
    if (ts.indexOf(t) < 0) { msg("Сюда эту карту положить нельзя.", true); return false; }
    if (t === "x") xfer(0, c); else beat(0, c, t);
    sel = null; pend = over || null;
    next(); return true;
  }
  function cardById(id) { var r = null; S.hands[0].forEach(function (c) { if (c.id == id) r = c; }); return r; }
  var dragged = false;
  meEl.addEventListener("click", function (e) {
    if (dragged) { dragged = false; return; }
    var b = e.target.closest(".cd"); if (!b || !S) return;
    var c = cardById(b.getAttribute("data-c")); if (c) human(c);
  });
  fieldEl.addEventListener("click", function (e) {
    var t = e.target.closest("[data-t]"); if (!t || !sel) return;
    var v = t.getAttribute("data-t"); human(sel, v === "x" ? "x" : +v);
  });
  fieldEl.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var t = e.target.closest("[data-t]"); if (!t || !sel) return;
    e.preventDefault(); var v = t.getAttribute("data-t"); human(sel, v === "x" ? "x" : +v);
  });
  actBtn.addEventListener("click", function () {
    if (!S || S.over || busy || actor() !== 0) return;
    if (S.table.length && unbeaten() && !S.taking) { S.taking = true; msg("Вы берёте."); next(); return; }
    if (S.table.length) endBout(S.taking);
  });

  /* перетаскивание */
  var drag = null;
  meEl.addEventListener("pointerdown", function (e) {
    var b = e.target.closest(".cd.is-ok"); if (!b || e.button > 0) return;
    drag = { el: b, id: b.getAttribute("data-c"), x: e.clientX, y: e.clientY, on: false, pid: e.pointerId };
  });
  window.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.pid) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on) {
      if (dx * dx + dy * dy < 64) return;
      drag.on = true;
      var r = drag.el.getBoundingClientRect(), g = drag.el.cloneNode(true);
      g.classList.add("cd--ghost"); g.classList.remove("is-ok", "was-back");
      g.style.cssText = "left:" + r.left + "px;top:" + r.top + "px;width:" + drag.el.offsetWidth + "px;height:" + drag.el.offsetHeight + "px";
      document.body.appendChild(g);
      drag.g = g; drag.r = r; drag.el.style.visibility = "hidden";
      var c = cardById(drag.id);
      if (c && S.table.length && unbeaten() && !S.taking && targets(c).length > 1) { sel = c; render(); drag.el = meEl.querySelector('[data-c="' + drag.id + '"]'); drag.el.style.visibility = "hidden"; }
      tableEl.classList.add("is-dragging");
    }
    drag.g.style.translate = dx + "px " + dy + "px";
    var hit = document.elementFromPoint(e.clientX, e.clientY);
    root.querySelectorAll(".is-hot").forEach(function (x) { x.classList.remove("is-hot"); });
    var t = hit && hit.closest("[data-t]"); if (t) t.classList.add("is-hot");
    else if (hit && fieldEl.classList.contains("is-drop") && hit.closest(".dk__mid")) fieldEl.classList.add("is-hot");
    e.preventDefault();
  }, { passive: false });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    var d = drag; drag = null;
    if (!d.on) return;
    dragged = true; setTimeout(function () { dragged = false; }, 50);
    tableEl.classList.remove("is-dragging");
    root.querySelectorAll(".is-hot").forEach(function (x) { x.classList.remove("is-hot"); });
    var gr = d.g.getBoundingClientRect(), hit = document.elementFromPoint(e.clientX, e.clientY), c = cardById(d.id), done = false, over = {};
    over[d.id] = gr;
    if (c && hit) {
      var t = hit.closest("[data-t]");
      var mode = !S.table.length || S.taking || !unbeaten() ? "play" : "def";
      if (mode === "play" && hit.closest(".dk__mid")) done = human(c, undefined, over);
      else if (mode === "def" && t) { var v = t.getAttribute("data-t"); done = human(c, v === "x" ? "x" : +v, over); }
      else if (mode === "def" && hit.closest(".dk__mid") && targets(c).length === 1) done = human(c, undefined, over);
    }
    d.g.remove();
    if (!done) {
      var el = meEl.querySelector('[data-c="' + d.id + '"]');
      if (el) {
        el.style.visibility = "";
        if (!reduce && canAnim) {
          var n = el.getBoundingClientRect();
          el.animate([{ translate: (gr.left - n.left) + "px " + (gr.top - n.top) + "px" }, { translate: "0px 0px" }], { duration: 300, easing: "cubic-bezier(.2,.75,.25,1)" });
        }
      }
    }
  }
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  /* ---------- новая партия и выбор соперника ---------- */
  function bars(k) { var s = ""; for (var i = 0; i < 4; i++) s += '<s class="' + (i <= k ? "on" : "") + '"></s>'; return '<span class="lvlbar" aria-hidden="true">' + s + "</span>"; }
  function drawLevel() { lvlEl.innerHTML = '<span class="dk__lvlt">Соперник: <b>' + LEVELS[level][0] + "</b> — " + LEVELS[level][1] + "</span>"; }
  function picker() {
    gid++; busy = false;
    var old = tableEl.querySelector(".dk__pick, .dk__result"); if (old) old.remove();
    root.classList.remove("is-over");
    var h = '<div class="dk__pick" role="dialog" aria-label="Выбор соперника"><p class="dk__pickt">С кем играем?</p><div class="dk__pickg">';
    LEVELS.forEach(function (l, i) { h += '<button type="button" data-l="' + i + '" style="--k:' + i + '"' + (i === level ? ' class="is-last"' : "") + "><b>" + l[0] + "</b><span>" + l[1] + "</span>" + bars(i) + "</button>"; });
    tableEl.insertAdjacentHTML("beforeend", h + "</div></div>");
    msg("Выберите соперника — и раздаём.");
    var f = tableEl.querySelector(".dk__pick .is-last"); if (f && document.activeElement && document.activeElement.closest && document.activeElement.closest("#durak")) f.focus();
  }
  tableEl.addEventListener("click", function (e) {
    var b = e.target.closest(".dk__pick [data-l]");
    if (b) { level = +b.getAttribute("data-l"); ls("durakLevel", level); var p = tableEl.querySelector(".dk__pick"); if (p) p.remove(); start(); return; }
    if (e.target.closest(".dk__again")) { picker(); return; }
    var r = e.target.closest(".dk__result"); if (r) r.remove();
  });
  newBtn.addEventListener("click", picker);

  function start() {
    gid++; S = fresh(); sel = null; busy = true; prevBack = {};
    oppEl.innerHTML = meEl.innerHTML = fieldEl.innerHTML = outEl.innerHTML = deckEl.innerHTML = "";
    drawLevel(); render();
    var seq = []; for (var i = 0; i < 12; i++) seq.push(i % 2);
    var i2 = 0;
    msg("Тасуем колоду…");
    deckEl.classList.add("is-shuffle");
    later(function () { deckEl.classList.remove("is-shuffle"); deckEl.classList.add("is-reveal"); msg("Раздаём по шесть карт. Козырь — " + SN[S.trump] + "."); nx(); }, reduce ? 10 : 900);
    later(function () { deckEl.classList.remove("is-reveal"); }, 3200);
    function nx() {
      if (i2 >= seq.length) { done(); return; }
      var p = seq[i2++]; S.hands[p].push(S.deck.pop()); if (p === 0) sortHand(); render(); later(nx, 95);
    }
    function done() {
      busy = false;
      var lo = [null, null];
      [0, 1].forEach(function (p) { S.hands[p].forEach(function (c) { if (c.s === S.trump && (!lo[p] || c.r < lo[p].r)) lo[p] = c; }); });
      var first = lo[1] && (!lo[0] || lo[1].r < lo[0].r) ? 1 : 0;
      S.att = first; S.def = 1 - first;
      if (first === 1) { msg("Первым ходит компьютер: у него младший козырь — " + name(lo[1]) + "."); render(); later(ai, 1300); }
      else { render(); msg(lo[0] ? "У вас младший козырь (" + name(lo[0]) + ") — вы ходите первым. Положите любую карту." : "Ходите первым: положите на стол любую карту."); }
    }
  }

  /* до выбора соперника показываем пустой стол */
  S = fresh(); render(); drawLevel(); picker();
  window.addEventListener("resize", function () { if (S) { fan(meEl); fan(oppEl, 0.5); } });
})();
