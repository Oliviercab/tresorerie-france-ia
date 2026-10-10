/* Plateforme Trésorerie France IA : le classeur Excel, en plus visuel et jusqu'à la transaction.
   Reconstruite chaque nuit ; deux niveaux chiffrés (équipe avec le mot de passe, complet avec le code d'édition d'Olivier).
   Chaque montant mène à sa preuve : clic sur une cellule ou une barre, tiroir de détail, lien vers Qonto. */
(function () {
  "use strict";
  var CFG = window.TRESO_CONFIG || {};
  var KEYS = null, DATA = null, PRIV = null, PRIVC = null, EDIT = null, IX = null, SIM = null;
  var ST = { vue: "accueil", preset: "2a", from: null, to: null, gran: "mois", ouverts: {}, sel: null, plan: null, planOpts: {},
             tx: { rub: "", sr: "", flux: "", pole: "", just: "", cp: "", tri: "date", n: 100 }, fac: { onglet: "retard" }, bud: "rubriques", bpOnglet: "bp" };
  var $ = function (id) { return document.getElementById(id); };
  var NF0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  var NF1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  var JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  var ICO_EXT = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M5 2H2v8h8V7M7 2h3v3M10 2 5 7"/></svg>';
  var ICO_OK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5 5 9l4.5-6"/></svg>';
  var ICO_KO = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2.5v4M6 9.2v.3"/></svg>';
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function sp(s) { return s.replace(/ | /g, " "); }
  function eur(v) { return typeof v === "number" && isFinite(v) ? sp(NF0.format(Math.round(v))) + " €" : (v == null ? "" : esc(v)); }
  function eur2(v) { return typeof v === "number" ? sp(new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)) + " €" : ""; }
  function keur(v) { return Charts.keur(v).replace(/ /g, " "); }
  function pct(v, d) { return typeof v === "number" && isFinite(v) ? (v * 100).toFixed(d == null ? 1 : d).replace(".", ",") + " %" : ""; }
  function nb(v, d) { return typeof v === "number" ? sp(d ? NF1.format(v) : NF0.format(Math.round(v))) : (v == null ? "" : esc(v)); }
  function parNf(v, nf) {
    if (typeof v !== "number") return v == null ? "" : esc(v);
    nf = nf || "";
    if (nf.indexOf("%") >= 0) return pct(v, nf.indexOf("0.00") >= 0 ? 2 : 1);
    if (nf.indexOf("€") >= 0) return nf.indexOf("0.00") >= 0 ? eur2(v) : eur(v);
    if (nf.indexOf("0.0") >= 0) return nb(v, 1);
    return nb(v);
  }
  function dLong(iso) { if (!iso) return ""; var d = new Date(iso.slice(0, 10) + "T12:00:00"); return JOURS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()] + " " + d.getFullYear(); }
  function dCourt(iso) { if (!iso) return ""; return iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(2, 4); }
  function mLab(k) { return MOIS[+k.slice(5, 7) - 1] + " " + k.slice(2, 4); }
  function addM(k, d) { var y = +k.slice(0, 4), m = +k.slice(5, 7) + d; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y + "-" + (m < 10 ? "0" : "") + m; }
  function toast(msg, ms) { var t = $("toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.add("hidden"); }, ms || 4200); }
  function lienTx(id) { return (CFG.qonto_tx || "https://app.qonto.com/organizations/{org}/transactions?transactionId={id}").replace("{org}", (DATA.meta && DATA.meta.qonto_org) || "").replace("{id}", encodeURIComponent(id)); }
  function lienFac(id) { return (CFG.qonto_facture || "https://app.qonto.com/organizations/{org}/receivable-invoices/{id}").replace("{org}", (DATA.meta && DATA.meta.qonto_org) || "").replace("{id}", encodeURIComponent(id)); }
  function aQonto(url, lab) { return '<a class="lien-ext" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(lab || "Ouvrir dans Qonto") + ICO_EXT + "</a>"; }
  function complet() { return DATA && DATA.meta && DATA.meta.niveau === "complet"; }

  // ------------------------------------------------------------------ ouverture
  // les fichiers chiffrés sont servis par le webhook n8n (mis à jour chaque nuit dans le dossier moteur) ; à défaut, copie statique du site
  async function fichier(f, statique) {
    if (CFG.donnees) {
      try { var r = await fetch(CFG.donnees + "?f=" + f + "&t=" + Date.now(), { cache: "no-store" }); if (r.ok) return r; if (r.status === 404 && f !== "keys") return r; } catch (e) {}
    }
    return fetch(statique + "?t=" + Date.now(), { cache: "no-store" });
  }
  async function demarrer() {
    try { var r = await fichier("keys", "keys.json"); if (!r.ok) throw new Error("absent"); KEYS = await r.json(); }
    catch (e) { $("verrou").classList.add("hidden"); $("installation").classList.remove("hidden"); return; }
    try {
      var jc = sessionStorage.getItem("treso_cle_complet"), jv = sessionStorage.getItem("treso_cle");
      if (jc) { PRIVC = await Coffre.importerJwk(JSON.parse(jc)); await charger(true); return; }
      if (jv) { PRIV = await Coffre.importerJwk(JSON.parse(jv)); await charger(false); return; }
    } catch (e) { sessionStorage.removeItem("treso_cle"); sessionStorage.removeItem("treso_cle_complet"); }
    $("mdp").focus();
  }
  async function charger(niveauComplet) {
    var r = await fichier(niveauComplet ? "complet" : "data", niveauComplet ? "data_complet.enc" : "data.enc");
    if (!r.ok) { if (niveauComplet) return charger(false); throw new Error("Les données ne sont pas encore publiées."); }
    DATA = await Coffre.dechiffrer(niveauComplet ? PRIVC : PRIV, await r.json());
    indexer(); SIM = null; ST.plan = null;
    $("verrou").classList.add("hidden"); $("appli").classList.remove("hidden");
    $("arrete").textContent = "Données au " + dLong(DATA.meta.arrete);
    var pied = "Reflet du classeur « " + esc(DATA.meta.classeur || "Trésorerie France IA") + " ». Mis à jour chaque nuit (dernière génération le " + esc(DATA.meta.genere_le) + "). Les montants en gris italique sont des prévisions.";
    $("pied").innerHTML = pied;
    Coffre.empreinte(KEYS.view.spki).then(function (e) { $("pied").innerHTML = pied + " Empreinte des clés : " + e + "."; }).catch(function () {});
    majAcces(); route();
  }
  $("form-verrou").addEventListener("submit", async function (ev) {
    ev.preventDefault(); $("err-verrou").textContent = "";
    var b = ev.target.querySelector("button"); b.disabled = true; b.textContent = "Ouverture…";
    try {
      PRIV = await Coffre.ouvrir(KEYS, $("mdp").value);
      try { sessionStorage.setItem("treso_cle", JSON.stringify(await Coffre.exporterJwk(PRIV))); } catch (e) {}
      await charger(false);
    } catch (e) { $("err-verrou").textContent = PRIV ? (e.message || "Données illisibles.") : "Mot de passe incorrect."; PRIV = null; }
    b.disabled = false; b.textContent = "Ouvrir";
  });
  $("form-installation").addEventListener("submit", async function (ev) {
    ev.preventDefault(); var err = $("err-installation"); err.textContent = "";
    var m1 = $("i-mdp").value, m2 = $("i-mdp2").value, c1 = $("i-code").value, c2 = $("i-code2").value;
    if (m1.length < 12) return (err.textContent = "Le mot de passe doit faire au moins 12 caractères.");
    if (m1 !== m2) return (err.textContent = "Les deux mots de passe diffèrent.");
    if (c1.length < 10) return (err.textContent = "Le code d'édition doit faire au moins 10 caractères.");
    if (c1 !== c2) return (err.textContent = "Les deux codes d'édition diffèrent.");
    if (c1 === m1) return (err.textContent = "Le code d'édition doit être différent du mot de passe.");
    var b = ev.target.querySelector("button"); b.disabled = true; b.textContent = "Création des clés…";
    try {
      var cles = await Coffre.creerCles(m1, c1);
      cles.complet = await Coffre.creerCleComplet(c1);
      var r = await fetch(CFG.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "cles", cles: cles }) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      var emp = await Coffre.empreinte(cles.view.spki);
      ev.target.innerHTML = '<img src="assets/logo-france-ia.webp" alt="France IA"><h1 class="page">Clés créées</h1><p class="contrat">Empreinte de vos clés : <strong class="num">' + emp + "</strong>. Notez-la : elle s'affiche en bas de chaque page et dans l'e-mail du matin.</p><p class=\"contrat\">La plateforme s'ouvrira avec votre mot de passe dès la prochaine mise à jour. Gardez le mot de passe et le code d'édition en lieu sûr : ils ne sont stockés nulle part.</p>";
    } catch (e) { err.textContent = "Envoi impossible (" + e.message + "). Réessayez."; b.disabled = false; b.textContent = "Créer les clés"; }
  });
  $("btn-quitter").addEventListener("click", function () { sessionStorage.removeItem("treso_cle"); sessionStorage.removeItem("treso_cle_complet"); location.hash = ""; location.reload(); });

  // accès complet et édition
  $("btn-acces").addEventListener("click", function () {
    if (EDIT && complet()) { toast("Accès complet et édition déjà ouverts. « Verrouiller » referme tout."); return; }
    $("err-code").textContent = ""; $("code").value = ""; $("dlg-code").showModal(); setTimeout(function () { $("code").focus(); }, 30);
  });
  $("code-annuler").addEventListener("click", function () { $("dlg-code").close(); });
  $("form-code").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var code = $("code").value, b = ev.target.querySelector("button[type=submit]"); b.disabled = true;
    try { EDIT = await Coffre.ouvrirEdition(KEYS, code); }
    catch (e) { $("err-code").textContent = "Code d'édition incorrect."; b.disabled = false; return; }
    try {
      if (KEYS.complet) {
        PRIVC = await Coffre.ouvrirComplet(KEYS, code);
        try { sessionStorage.setItem("treso_cle_complet", JSON.stringify(await Coffre.exporterJwk(PRIVC))); } catch (e) {}
        $("dlg-code").close(); var v = ST.vue; await charger(true); ST.vue = v;
        toast(complet() ? "Accès complet ouvert : salaires, freelances et clients nominatifs visibles. Édition active." : "Édition active. Le détail complet sera publié cette nuit.");
      } else {
        var w = await Coffre.creerCleComplet(code), message = JSON.stringify({ ts: new Date().toISOString(), complet: w });
        var sig = await Coffre.signer(EDIT, message);
        var r = await fetch(CFG.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "cles_complet", message: message, signature: sig }) });
        $("dlg-code").close();
        toast(r.ok ? "Édition active. L'accès complet (détail nominatif) est créé : il sera disponible après la mise à jour de cette nuit." : "Édition active. La création de l'accès complet a échoué (HTTP " + r.status + "), réessayez plus tard.", 7000);
      }
    } catch (e) { $("dlg-code").close(); toast("Édition active. Ouverture du détail complet impossible : " + e.message); }
    b.disabled = false; majAcces(); afficher();
  });
  function majAcces() {
    var a = $("btn-acces"); a.classList.toggle("complet", complet());
    $("acces-l").textContent = complet() ? "Accès complet" : "Vue équipe";
    $("acces-s").textContent = EDIT ? "Édition active" : (complet() ? "Édition : saisir le code" : "Ouvrir l'accès complet");
  }

  // ------------------------------------------------------------------ index des données
  function indexer() {
    var D = DATA, X = { m: D.months, mi: {}, st: {}, cur: null };
    D.months.forEach(function (m, i) { X.mi[m.key] = i; X.st[m.key] = m.statut; });
    X.cur = D.meta.arrete ? D.meta.arrete.slice(0, 7) : D.months[0].key;
    // transactions en objets
    var T = D.transactions || { cols: [], rows: [] }, c = {}; T.cols.forEach(function (k, i) { c[k] = i; });
    X.tx = T.rows.map(function (r) { return { id: r[c.id], date: r[c.date], m: r[c.date].slice(0, 7), mt: r[c.montant], cp: r[c.contrepartie], lib: r[c.libelle], flux: r[c.flux], rub: r[c.rubrique], sr: r[c.sous_rubrique], det: r[c.detail], pole: r[c.pole], j: r[c.justificatif], type: r[c.type], cq: r[c.categorie_qonto], note: r[c.note] }; });
    var F = D.factures || { cols: [], rows: [] }, fc = {}; F.cols.forEach(function (k, i) { fc[k] = i; });
    X.fac = F.rows.map(function (r) { var o = {}; F.cols.forEach(function (k) { o[k] = r[fc[k]]; }); return o; });
    // arbre de trésorerie
    var rows = (D.treso || []).map(function (r, i) { return Object.assign({ i: i, kids: [] }, r); }), p1 = null, p2 = null;
    rows.forEach(function (r) {
      if (r.t === "band") { p1 = p2 = null; r.parent = null; return; }
      if (r.t === "total") { p1 = p2 = null; r.parent = null; return; }
      if (r.lvl === 1) { r.parent = null; p1 = r; p2 = null; }
      else if (r.lvl === 2) { r.parent = p1; if (p1) p1.kids.push(r); p2 = r; }
      else { r.parent = p2 || p1; if (r.parent) r.parent.kids.push(r); }
    });
    X.rows = rows; X.byId = {}; rows.forEach(function (r) { if (r.id) X.byId[r.id] = r; });
    IX = X;
    var n = ((D.analyses || {}).justificatifs || {}).nb; $("n-justif").textContent = n ? (n > 999 ? "999+" : n) : "";
  }

  // ------------------------------------------------------------------ période
  var PRESETS = [["2a", null], ["12m", "12 derniers mois"], ["3m", "3 derniers mois"], ["mois", "Ce mois"], ["a0", null], ["a1", null], ["fc", "Prévision 12 mois"], ["tout", "Tout"], ["perso", "Personnalisé"]];
  function presetLabel(k) {
    var y = +IX.cur.slice(0, 4);
    if (k === "2a") return y + " et " + (y + 1); if (k === "a0") return "Année " + y; if (k === "a1") return "Année " + (y + 1);
    var p = PRESETS.find(function (x) { return x[0] === k; }); return p ? p[1] : k;
  }
  function plage() {
    var all = IX.m.map(function (m) { return m.key; }), cur = IX.cur, y = cur.slice(0, 4), a, b;
    switch (ST.preset) {
      case "12m": a = addM(cur, -11); b = cur; break;
      case "3m": a = addM(cur, -2); b = cur; break;
      case "mois": a = b = cur; break;
      case "a0": a = y + "-01"; b = y + "-12"; break;
      case "a1": a = (+y + 1) + "-01"; b = (+y + 1) + "-12"; break;
      case "fc": a = cur; b = addM(cur, 11); break;
      case "tout": a = all[0]; b = all[all.length - 1]; break;
      case "perso": a = ST.from || all[0]; b = ST.to || all[all.length - 1]; break;
      default: a = y + "-01"; b = (+y + 1) + "-12";
    }
    return all.filter(function (k) { return k >= a && k <= b; });
  }
  function colonnes(mois) {
    var g = ST.gran;
    if (g === "mois") return mois.map(function (k) { return { cle: k, lab: mLab(k), mois: [k], est: IX.st[k] !== "Réalisé" }; });
    var out = [], by = {};
    mois.forEach(function (k) {
      var y = k.slice(0, 4), mo = +k.slice(5, 7), c = g === "annee" ? y : y + "-T" + Math.ceil(mo / 3);
      if (!by[c]) { by[c] = { cle: c, lab: g === "annee" ? y : "T" + Math.ceil(mo / 3) + " " + y.slice(2), mois: [], est: false }; out.push(by[c]); }
      by[c].mois.push(k); if (IX.st[k] !== "Réalisé") by[c].est = true;
    });
    return out;
  }
  function rendrePeriode() {
    var h = '<select id="sel-preset" aria-label="Période">' + PRESETS.map(function (p) { return '<option value="' + p[0] + '"' + (ST.preset === p[0] ? " selected" : "") + ">" + esc(presetLabel(p[0])) + "</option>"; }).join("") + "</select>";
    if (ST.preset === "perso") {
      var opts = function (v) { return IX.m.map(function (m) { return '<option value="' + m.key + '"' + (v === m.key ? " selected" : "") + ">" + esc(m.label) + "</option>"; }).join(""); };
      h += '<select id="sel-from" aria-label="Du">' + opts(ST.from || IX.m[0].key) + '</select><select id="sel-to" aria-label="Au">' + opts(ST.to || IX.m[IX.m.length - 1].key) + "</select>";
    }
    $("periode").innerHTML = h;
    $("sel-preset").addEventListener("change", function (e) { ST.preset = e.target.value; if (ST.preset === "perso" && !ST.from) { var p = plage(); ST.from = p[0]; ST.to = p[p.length - 1]; } afficher(); });
    if ($("sel-from")) { $("sel-from").addEventListener("change", function (e) { ST.from = e.target.value; afficher(); }); $("sel-to").addEventListener("change", function (e) { ST.to = e.target.value; afficher(); }); }
  }

  // ------------------------------------------------------------------ routeur
  var VUES = { accueil: vueAccueil, pilotage: vuePilotage, budget: vueBudget, tresorerie: vueTresorerie, resultat: vueResultat, bp: vueBP, bilan: vueBilan,
               transactions: vueTransactions, factures: vueFactures, justificatifs: vueJustificatifs, economies: vueEconomies };
  function route() {
    var h = (location.hash || "#/accueil").replace(/^#\/?/, "").split("?")[0];
    ST.vue = VUES[h] ? h : "accueil";
    document.querySelectorAll(".nav a").forEach(function (a) { if (a.dataset.v === ST.vue) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    $("nav").classList.remove("ouvert"); $("voile").classList.add("hidden");
    afficher(); window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", function () { if (DATA) route(); });
  function aller(v) { if (("#/" + v) === location.hash) route(); else location.hash = "#/" + v; }
  function afficher() {
    if (!DATA) return;
    rendrePeriode();
    var v = $("vue"); v.innerHTML = ""; fermerTiroir();
    try { VUES[ST.vue](v); } catch (e) { v.innerHTML = '<div class="bandeau ko">Affichage impossible : ' + esc(e.message) + "</div>"; console.error(e); }
  }
  var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { if (DATA && !$("tiroir").classList.contains("ouvert")) afficher(); }, 250); });
  $("btn-menu").addEventListener("click", function () { $("nav").classList.add("ouvert"); $("voile").classList.remove("hidden"); });
  $("voile").addEventListener("click", function () { $("nav").classList.remove("ouvert"); fermerTiroir(); $("voile").classList.add("hidden"); });

  // ------------------------------------------------------------------ tiroir de détail
  function ouvrirTiroir(titre, sous, html, apres) {
    $("tiroir-t").innerHTML = "<h2>" + esc(titre) + "</h2>" + (sous ? "<p>" + sous + "</p>" : "");
    $("tiroir-c").innerHTML = html; $("tiroir").classList.add("ouvert"); $("tiroir").setAttribute("aria-hidden", "false");
    $("tiroir-c").scrollTop = 0; if (apres) apres($("tiroir-c"));
    setTimeout(function () { $("tiroir-x").focus(); }, 50);
  }
  function fermerTiroir() { $("tiroir").classList.remove("ouvert"); $("tiroir").setAttribute("aria-hidden", "true"); }
  $("tiroir-x").addEventListener("click", fermerTiroir);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { fermerTiroir(); fermerRecherche(); }
    if (e.key === "/" && document.activeElement && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && DATA) { e.preventDefault(); $("q").focus(); }
  });
  function listeTx(txs, opts) {
    opts = opts || {};
    if (!txs.length) return '<p class="vide">' + esc(opts.vide || "Aucune transaction réglée sur cette période.") + "</p>";
    var max = opts.max || 300, h = '<table class="liste-t"><thead><tr><th>Date</th><th>Contrepartie</th>' + (opts.cat ? "<th>Catégorie</th>" : "") + '<th class="r">Montant</th><th></th></tr></thead><tbody>';
    txs.slice(0, max).forEach(function (t) {
      h += '<tr data-tx="' + esc(t.id) + '"><td class="num">' + dCourt(t.date) + '</td><td><span class="cp">' + esc(t.cp) + "</span>" + (t.lib ? '<span class="sous">' + esc(t.lib) + "</span>" : "") + "</td>" +
        (opts.cat ? '<td><span class="sous" style="color:var(--ink-500)">' + esc(t.rub) + (t.sr ? " › " + esc(t.sr) : "") + "</span></td>" : "") +
        '<td class="r ' + (t.mt < 0 ? "" : "pos") + '">' + eur2(t.mt) + "</td><td>" + justif(t) + "</td></tr>";
    });
    h += "</tbody></table>";
    if (txs.length > max) h += '<p class="muted small">' + (txs.length - max) + " transactions de plus : affinez la période ou ouvrez la liste complète.</p>";
    return h;
  }
  function justif(t) {
    if (t.mt > 0) return "";
    return t.j ? '<span class="ico-j ok" title="Justificatif joint">' + ICO_OK + "</span>" : '<span class="ico-j ko" title="Justificatif manquant">' + ICO_KO + "</span>";
  }
  function brancherTx(root) { root.querySelectorAll("tr[data-tx]").forEach(function (tr) { tr.addEventListener("click", function () { ouvrirTx(tr.dataset.tx); }); }); }
  function ouvrirTx(id) {
    var t = IX.tx.find(function (x) { return x.id === id; }); if (!t) return;
    var memes = IX.tx.filter(function (x) { return x.cp === t.cp && x.id !== t.id; }).slice(0, 12);
    var h = '<dl><dt>Montant</dt><dd class="num"><strong>' + eur2(t.mt) + "</strong></dd><dt>Date</dt><dd>" + dLong(t.date) + "</dd><dt>Contrepartie</dt><dd>" + esc(t.cp) + "</dd>" +
      (t.lib ? "<dt>Libellé</dt><dd>" + esc(t.lib) + "</dd>" : "") + "<dt>Catégorie</dt><dd>" + esc(t.flux) + " › " + esc(t.rub) + (t.sr ? " › " + esc(t.sr) : "") + (t.det && t.det !== t.sr ? " › " + esc(t.det) : "") + "</dd>" +
      (t.pole ? "<dt>Pôle</dt><dd>" + esc(t.pole) + "</dd>" : "") + (t.cq ? "<dt>Catégorie Qonto</dt><dd>" + esc(t.cq) + "</dd>" : "") +
      "<dt>Justificatif</dt><dd>" + (t.mt > 0 ? "non requis (encaissement)" : t.j ? '<span class="chip ok">Joint</span>' : '<span class="chip warn">Manquant</span>') + "</dd>" +
      (t.note ? "<dt>Note</dt><dd>" + esc(t.note) + "</dd>" : "") + "</dl>" +
      '<p style="display:flex;gap:12px;flex-wrap:wrap">' + aQonto(lienTx(t.id), "Ouvrir la transaction dans Qonto") + '<a href="#/transactions" id="voir-cp">Toutes les opérations avec ' + esc(t.cp) + "</a></p>";
    if (memes.length) h += '<h3 class="section">Opérations précédentes avec ' + esc(t.cp) + "</h3>" + listeTx(memes);
    ouvrirTiroir(t.cp, esc(t.rub) + (t.sr ? " › " + esc(t.sr) : ""), h, function (c) {
      brancherTx(c);
      var a = c.querySelector("#voir-cp"); if (a) a.addEventListener("click", function () { ST.tx = Object.assign(ST.tx, { cp: t.cp, rub: "", sr: "", flux: "", pole: "", just: "", n: 100 }); ST.preset = "tout"; });
    });
  }

  // ------------------------------------------------------------------ données dérivées
  function sum(a) { var s = 0; a.forEach(function (x) { s += x || 0; }); return s; }
  function serie(id, mois) { var r = IX.byId[id]; return mois.map(function (k) { return r && typeof r.v[k] === "number" ? r.v[k] : null; }); }
  function trouver(lab) { return IX.rows.find(function (r) { return r.label && r.label.indexOf(lab) === 0; }); }
  function valeur(row, col) {
    var vals = col.mois.map(function (k) { return row.v[k]; }).filter(function (x) { return typeof x === "number"; });
    if (!vals.length) return null;
    var l = (row.label || "").toLowerCase();
    if (/fin de mois|en fin de/.test(l)) return vals[vals.length - 1];
    if (/début de mois/.test(l)) return vals[0];
    return sum(vals);
  }
  function txDeLigne(row, mois) {
    var set = {}; mois.forEach(function (k) { set[k] = 1; });
    var f;
    if (row.t === "row") f = function (t) { return t.rub === row.r && (!row.s || t.sr === row.s) && (!row.d || t.det === row.d); };
    else {
      var l = row.label.toUpperCase();
      if (l.indexOf("TOTAL ENCAISSEMENTS") === 0) f = function (t) { return t.flux === "Encaissements"; };
      else if (l.indexOf("DONT ENCAISSEMENTS D'EXPLOITATION") === 0) f = function (t) { return t.flux === "Encaissements" && t.rub !== "Financement"; };
      else if (l.indexOf("TOTAL DÉCAISSEMENTS") === 0) f = function (t) { return t.flux === "Décaissements"; };
      else if (l.indexOf("TOTAL HORS EXPLOITATION") === 0) f = function (t) { return t.flux !== "Encaissements" && t.flux !== "Décaissements"; };
      else if (l.indexOf("FLUX NET") === 0) f = function () { return true; };
      else if (row.band && row.band.indexOf("PAR PÔLE") >= 0) f = function (t) { return t.flux === "Décaissements" && t.pole === row.label; };
      else return null;
    }
    return IX.tx.filter(function (t) { return set[t.m] && f(t); });
  }

  // ------------------------------------------------------------------ ACCUEIL
  function kpi(lab) { var k = (DATA.kpis || []).find(function (x) { return x.label.indexOf(lab) === 0; }); return k || {}; }
  function carte(lab, val, sub, extra, est) { return '<div class="carte kpi"><div class="lab">' + esc(lab) + '</div><div class="val' + (est ? " est" : "") + '">' + val + "</div>" + (sub ? '<div class="sub">' + sub + "</div>" : "") + (extra || "") + "</div>"; }
  function vueAccueil(v) {
    var D = DATA, A = D.analyses || {}, J = A.justificatifs || {}, top = (D.pilotage || {}).top || {}, h = "";
    var retard = IX.fac.filter(function (f) { return f.statut === "unpaid" && f.payeur !== "CPF" && f.echeance && f.echeance < D.meta.arrete; });
    h += '<div class="entete"><div><h1 class="page">Accueil</h1><p class="contrat">Où en est la trésorerie, où elle va, et ce qui demande votre attention. Données arrêtées au ' + esc(dLong(D.meta.arrete)) + ".</p></div></div>";
    h += '<div class="afaire">' +
      '<a href="#/justificatifs"><span>Justificatifs manquants</span><strong>' + nb(J.nb || 0) + "</strong><span>" + eur(Math.abs(J.montant || 0)) + " sur 12 mois</span><em>Voir par fournisseur</em></a>" +
      '<a href="#/factures"><span>Factures clients en retard</span><strong>' + nb(retard.length) + "</strong><span>" + eur(sum(retard.map(function (f) { return f.ttc; }))) + " TTC, hors CPF</span><em>Voir les relances</em></a>" +
      '<a href="#/economies"><span>Économies possibles</span><strong>' + eur(((A.totaux || {}).economies_mensuelles) || 0) + "</strong><span>par mois, " + ((A.pistes || []).length) + " pistes</span><em>Voir les pistes</em></a>" +
      '<a href="#/pilotage"><span>Réinvestissement possible</span><strong>' + eur((top.a_capx || {}).value) + "</strong><span>par mois sans passer sous le plancher</span><em>Voir le plan</em></a></div>";
    var pb = (top.a_pb || {}).value, pl = (top.a_plancher || {}).value, ok = pb >= pl;
    var cur = (D.kpis || []).find(function (k) { return /^Trésorerie fin .* \(e\)$/.test(k.label) && k.label.indexOf("décembre") < 0; }) || {};
    var treso = trouver("TRÉSORERIE EN FIN DE MOIS"), moisT = IX.m.map(function (m) { return m.key; }).filter(function (k) { return k >= addM(IX.cur, -11) && k <= IX.cur; });
    h += '<div class="grille g4">' +
      carte("Solde Qonto", eur(kpi("Solde Qonto").value), "au " + esc(dLong(D.meta.arrete)), treso ? Charts.spark(moisT.map(function (k) { return treso.v[k]; }), "#4f46e5", 120, 26) : "") +
      carte(cur.label ? cur.label.replace("Trésorerie fin ", "Fin ").replace(" (e)", "") + " (e)" : "Fin du mois (e)", eur(cur.value), "réalisé au jour + reste du mois estimé", "", true) +
      carte("Point bas prévu (e)", eur(pb), esc((top.a_pb || {}).extra || "") + ", plancher " + eur(pl), '<div style="margin-top:8px"><span class="chip ' + (ok ? "ok" : "ko") + '">' + (ok ? "Au-dessus du plancher" : "Sous le plancher") + "</span></div>", true) +
      carte("Fin 2026 et fin 2027 (e)", eur(kpi("Trésorerie fin décembre 2026").value), "fin 2027 : " + eur(kpi("Trésorerie fin décembre 2027").value), "", true) + "</div>";
    // graphique de trésorerie
    var mois = plage(); if (mois.length < 3) mois = IX.m.map(function (m) { return m.key; }).filter(function (k) { return k >= addM(IX.cur, -6) && k <= addM(IX.cur, 6); });
    h += '<div class="carte section"><div class="entete" style="margin-bottom:6px"><h2 style="margin:0">Trésorerie en fin de mois</h2><div class="legende" id="leg-t"></div></div><div id="ch-treso"></div><p class="muted small" style="margin:6px 0 0">Cliquez un mois pour voir ses opérations dans la trésorerie détaillée.</p></div>';
    h += '<div class="grille g21 section"><div class="carte"><div class="entete" style="margin-bottom:6px"><h2 style="margin:0">Encaissements et décaissements d\'exploitation</h2><div class="legende"><span><i class="blk" style="background:var(--s-enc)"></i>Encaissements</span><span><i class="blk" style="background:var(--s-dec)"></i>Décaissements</span></div></div><div id="ch-flux"></div></div>' +
      '<div class="carte"><h2>Où va l\'argent (' + esc(presetLabel(ST.preset).toLowerCase()) + ")</h2><div id=\"ch-rub\"></div></div></div>";
    var T = D.textes || {};
    h += '<div class="grille g2 section"><div class="carte"><h2>Lecture</h2>' + liste(T.interpretation) + '</div><div class="carte"><h2>Actions et questions</h2>' + liste((T.cr_actions || []).concat(T.cr_suggestions || [])) + (T.cr_questions && T.cr_questions.length ? '<h3 class="section">Questions pour Olivier</h3>' + liste(T.cr_questions) : "") + "</div></div>";
    var dg = D.digest || {};
    if (dg.qonto) {
      var pr = dg.qonto.principaux || [];
      h += '<div class="carte section"><h2>Depuis le ' + esc(dLong(dg.depuis)) + "</h2><div class=\"grille g3\"><div><h3>Encaissements notables</h3>" + mvt(pr.filter(function (x) { return x.montant > 0; })) + "</div><div><h3>Décaissements notables</h3>" + mvt(pr.filter(function (x) { return x.montant < 0; })) + "</div><div><h3>Équipe (Slack)</h3>" + equipe() + "</div></div></div>";
    }
    v.innerHTML = h;
    // trésorerie : réel + prévision, BP de référence, plan, plancher
    var ref = (D.bp_ref || {}).treso || {}, refRow = treso ? ref[treso.id] : null, split = mois.findIndex(function (k) { return IX.st[k] !== "Réalisé"; });
    var series = [{ name: "Trésorerie (réel puis prévision)", values: mois.map(function (k) { return treso ? treso.v[k] : null; }), color: "#4f46e5", split: split < 0 ? mois.length : split }];
    if (refRow) series.push({ name: "BP de référence", values: mois.map(function (k) { return refRow[k] != null && k >= (D.bp_ref.arrete || "").slice(0, 7) ? refRow[k] : null; }), color: "#94a3b8", dash: true, width: 1.5 });
    var P = D.plan || {};
    if (P.trajectoire && D.pilotage) {
      var pm = D.pilotage.months; series.push({ name: "Avec le plan de réinvestissement", values: mois.map(function (k) { var j = pm.indexOf(k); return j >= 0 && k >= D.pilotage.fc_first ? P.trajectoire[j] : null; }), color: "#eb6834", dash: true });
    }
    $("leg-t").innerHTML = series.map(function (s) { return '<span><i class="' + (s.dash ? "dash" : "") + '" style="border-color:' + s.color + '"></i>' + esc(s.name) + "</span>"; }).join("") + '<span><i class="dash" style="border-color:#334155"></i>Plancher</span>';
    Charts.line($("ch-treso"), { labels: mois.map(mLab), series: series, split: split < 0 ? null : split, threshold: pl ? { value: pl, label: "plancher " + keur(pl).replace(/ /g, " ") } : null, height: 280, title: "Trésorerie en fin de mois",
      onClick: function (i) { ST.preset = "perso"; ST.from = mois[Math.max(0, i - 2)]; ST.to = mois[Math.min(mois.length - 1, i + 2)]; ST.gran = "mois"; aller("tresorerie"); } });
    // flux
    var enc = trouver("dont encaissements d'exploitation"), dec = trouver("TOTAL DÉCAISSEMENTS D'EXPLOITATION");
    var mf = plage(); if (mf.length > 24) mf = mf.slice(-24);
    Charts.bars($("ch-flux"), { labels: mf.map(mLab), series: [{ name: "Encaissements", values: mf.map(function (k) { return enc ? enc.v[k] : null; }), color: "#2a78d6" }, { name: "Décaissements", values: mf.map(function (k) { return dec ? -dec.v[k] : null; }), color: "#eb6834" }],
      height: 240, title: "Encaissements et décaissements", extraRows: function (i) { var a = enc ? enc.v[mf[i]] || 0 : 0, b = dec ? dec.v[mf[i]] || 0 : 0; return [{ name: "flux d'exploitation" + (IX.st[mf[i]] !== "Réalisé" ? " (prévision)" : ""), value: a + b, color: "transparent" }]; },
      onClick: function (i) { ouvrirCellule(dec, { cle: mf[i], lab: mLab(mf[i]), mois: [mf[i]], est: IX.st[mf[i]] !== "Réalisé" }); } });
    // où va l'argent : rubriques de décaissements sur la période
    var rubs = IX.rows.filter(function (r) { return r.t === "row" && r.lvl === 1 && r.band && r.band.indexOf("DÉCAISSEMENTS D'EXPLOITATION") === 0; });
    var col = { mois: plage() };
    var items = rubs.map(function (r) { return { label: r.label, value: -(valeur(r, col) || 0), row: r }; }).filter(function (x) { return x.value > 0; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 9);
    Charts.hbars($("ch-rub"), { items: items, color: "#eb6834", onClick: function (it) { ST.ouverts[it.row.id] = true; ST.sel = it.row.id; aller("tresorerie"); } });
  }
  function liste(arr) { return arr && arr.length ? '<ul class="liste">' + arr.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : '<p class="muted small">Rien à signaler.</p>'; }
  function mvt(arr) { return arr && arr.length ? '<ul class="liste small">' + arr.slice(0, 6).map(function (x) { return "<li>" + esc(dCourt(x.date)) + " " + esc(x.libelle) + " : <strong class=\"num\">" + eur(x.montant) + "</strong></li>"; }).join("") + "</ul>" : '<p class="muted small">Aucun.</p>'; }
  function equipe() { var sl = ((DATA.slack || {}).evenements || []).slice(-6).reverse(); return sl.length ? '<ul class="liste small">' + sl.map(function (e) { return "<li>" + esc(dCourt(e.date)) + " " + esc(e.resume) + "</li>"; }).join("") + "</ul>" : '<p class="muted small">Rien de nouveau.</p>'; }

  // ------------------------------------------------------------------ TRÉSORERIE (arbre, drill-down)
  function vueTresorerie(v) {
    var cols = colonnes(plage()), h = "";
    h += '<div class="entete"><div><h1 class="page">Trésorerie</h1><p class="contrat">Toutes les rubriques, jusqu\'à la ligne. Cliquez un montant pour voir les transactions Qonto qui le composent ; les mois en gris italique sont des prévisions du BP.</p></div></div>';
    h += '<div class="outils"><div class="seg" role="group" aria-label="Granularité">' + [["mois", "Mois"], ["trimestre", "Trimestres"], ["annee", "Années"]].map(function (x) { return '<button type="button" data-g="' + x[0] + '" aria-pressed="' + (ST.gran === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>" +
      '<button class="btn" type="button" id="tout-ouvrir">Tout déplier</button><button class="btn" type="button" id="tout-fermer">Tout replier</button>' +
      '<input class="champ" id="f-ligne" type="search" placeholder="Filtrer les lignes" style="max-width:240px" value="' + esc(ST.filtreLigne || "") + '">' +
      '<label class="small muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="cb-ecart"' + (ST.ecart ? " checked" : "") + ">Écart au BP de référence</label></div>";
    h += '<div class="carte plate" id="ch-sel-w" style="margin-bottom:12px' + (ST.sel && IX.byId[ST.sel] ? "" : ";display:none") + '"><div class="entete" style="margin-bottom:4px"><h2 style="margin:0" id="ch-sel-t"></h2><button class="btn petit" type="button" id="sel-x">Fermer le graphique</button></div><div id="ch-sel"></div></div>';
    h += '<div class="tab-wrap" id="grille"><table class="t"><thead><tr><th>Rubrique</th>' + cols.map(function (c) { return '<th class="' + (c.est ? "est" : "") + '">' + esc(c.lab) + "</th>"; }).join("") + "</tr></thead><tbody>";
    var filtre = (ST.filtreLigne || "").toLowerCase(), ref = (DATA.bp_ref || {}).treso || {};
    function visible(r) {
      if (filtre) { var s = (r.label + " " + (r.r || "") + " " + (r.s || "")).toLowerCase(); return s.indexOf(filtre) >= 0 || r.kids.some(function (k) { return visible(k); }); }
      if (r.lvl <= 1) return true;
      var p = r.parent; while (p) { if (!ST.ouverts[p.id]) return false; p = p.parent; }
      return true;
    }
    IX.rows.forEach(function (r) {
      if (r.label && r.label.toLowerCase().indexOf("contrôle") === 0) return;
      if (r.t === "band") { if (!filtre) h += '<tr class="band"><td>' + esc(r.label) + '</td><td colspan="' + cols.length + '"></td></tr>'; return; }
      if (!visible(r)) return;
      var cls = r.t === "total" ? "total" : "l" + r.lvl;
      if (ST.sel === r.id) cls += " sel";
      var tog = r.kids.length ? '<button class="tog" type="button" data-tog="' + esc(r.id) + '" aria-expanded="' + !!(ST.ouverts[r.id] || filtre) + '" aria-label="' + (ST.ouverts[r.id] ? "Replier" : "Déplier") + '"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="' + (ST.ouverts[r.id] || filtre ? "M3 4.5 6 7.5 9 4.5" : "M4.5 3 7.5 6 4.5 9") + '"/></svg></button>' : (r.t === "row" ? '<span class="tog-sp"></span>' : "");
      h += '<tr class="' + cls + '"><td><span style="cursor:pointer" data-sel="' + esc(r.id) + '">' + tog + esc(r.label) + "</span></td>";
      cols.forEach(function (c, ci) {
        var val = valeur(r, c), est = c.est, cl = val != null && val !== 0 && r.t !== "band" ? " cl" : "", txt = val == null ? "" : eur(val);
        if (ST.ecart && val != null && ref[r.id]) {
          var rv = sum(c.mois.map(function (k) { return k >= (DATA.bp_ref.arrete || "").slice(0, 7) ? ref[r.id][k] : null; }).filter(function (x) { return typeof x === "number"; }));
          var d = val - rv; if (Math.abs(d) >= 1) txt += '<span class="sous ' + (d >= 0 ? "pos" : "neg") + '">' + (d > 0 ? "+" : "") + keur(d) + "</span>";
        }
        h += '<td class="' + (est ? "est" : "") + cl + (typeof val === "number" && val < 0 && /FIN DE MOIS|FLUX NET/.test(r.label) ? " neg" : "") + '" data-c="' + ci + '" data-r="' + esc(r.id) + '">' + txt + "</td>";
      });
      h += "</tr>";
    });
    h += "</tbody></table></div>";
    v.innerHTML = h;
    var g = $("grille");
    v.querySelectorAll(".seg button").forEach(function (b) { b.addEventListener("click", function () { ST.gran = b.dataset.g; afficher(); }); });
    $("tout-ouvrir").addEventListener("click", function () { IX.rows.forEach(function (r) { if (r.kids.length) ST.ouverts[r.id] = true; }); afficher(); });
    $("tout-fermer").addEventListener("click", function () { ST.ouverts = {}; afficher(); });
    $("cb-ecart").addEventListener("change", function (e) { ST.ecart = e.target.checked; afficher(); });
    var fl = $("f-ligne"); fl.addEventListener("input", function () { clearTimeout(fl.h); fl.h = setTimeout(function () { ST.filtreLigne = fl.value; var p = fl.selectionStart; afficher(); var n = $("f-ligne"); n.focus(); n.setSelectionRange(p, p); }, 250); });
    g.addEventListener("click", function (e) {
      var t = e.target.closest("[data-tog]"); if (t) { var id = t.dataset.tog; ST.ouverts[id] = !ST.ouverts[id]; afficher(); return; }
      var s = e.target.closest("[data-sel]"); if (s) { var r0 = IX.byId[s.dataset.sel]; if (r0 && r0.kids.length && !ST.ouverts[r0.id]) ST.ouverts[r0.id] = true; ST.sel = s.dataset.sel; afficher(); return; }
      var td = e.target.closest("td.cl"); if (td) ouvrirCellule(IX.byId[td.dataset.r] || IX.rows.find(function (x) { return x.id === td.dataset.r; }), cols[+td.dataset.c]);
    });
    if ($("sel-x")) $("sel-x").addEventListener("click", function () { ST.sel = null; afficher(); });
    if (ST.sel && IX.byId[ST.sel]) {
      var r = IX.byId[ST.sel], mois = plage();
      $("ch-sel-t").textContent = r.label;
      var refR = ref[r.id], series = [{ name: r.label, values: mois.map(function (k) { return r.v[k] == null ? null : r.v[k]; }), color: "#4f46e5" }];
      if (refR) series.push({ name: "BP de référence", values: mois.map(function (k) { return k >= (DATA.bp_ref.arrete || "").slice(0, 7) && refR[k] != null ? refR[k] : null; }), color: "#94a3b8", dash: true, width: 1.5 });
      Charts.bars($("ch-sel"), { labels: mois.map(mLab), series: series.slice(0, 1).map(function (s) { return Object.assign({}, s, { muted: mois.map(function (k) { return IX.st[k] !== "Réalisé"; }) }); }), height: 180,
        extraRows: function (i) { return refR && mois[i] >= (DATA.bp_ref.arrete || "").slice(0, 7) ? [{ name: "BP de référence", value: refR[mois[i]], color: "#94a3b8" }] : []; },
        onClick: function (i) { ouvrirCellule(r, { cle: mois[i], lab: mLab(mois[i]), mois: [mois[i]], est: IX.st[mois[i]] !== "Réalisé" }); } });
    }
    // ouvre la grille sur les derniers mois réalisés
    caler(g, cols);
  }
  function caler(g, cols) {   // fait défiler la grille pour montrer les 4 derniers mois réalisés, calé sur une colonne
    if (!g || ST.gran !== "mois") return;
    var i = cols.findIndex(function (c) { return c.est; }), ths = g.querySelectorAll("thead th");
    if (i < 5 || !ths[i - 3]) return;
    g.scrollLeft = 0;
    g.scrollLeft = ths[i - 3].getBoundingClientRect().left - ths[0].getBoundingClientRect().right;
  }
  function ouvrirCellule(row, col) {
    if (!row) return;
    var val = valeur(row, col), txs = txDeLigne(row, col.mois), real = col.mois.filter(function (k) { return IX.st[k] === "Réalisé" || k === IX.cur; });
    var sous = esc(col.lab) + (val != null ? " · " + eur(val) : "");
    var h = "";
    if (row.s === "Prévision (BP)" || row.s === "Prévision (Hypothèses)") h += '<div class="bandeau info">Ligne de prévision : montant calculé par le BP (hypothèses du classeur), sans transaction Qonto.</div>';
    else if (col.est) {
      var st = sum(txs.map(function (t) { return t.mt; }));
      h += '<div class="bandeau info">' + (real.length ? "Réalisé au " + esc(dLong(DATA.meta.arrete)) + " : " + eur(st) + " ; le reste est estimé par le BP." : "Mois à venir : montant estimé par le BP ; les transactions apparaîtront une fois réglées.") + "</div>";
    }
    if (txs === null) h += '<p class="muted">Ligne calculée (solde ou agrégat) : pas de transactions directement associées.</p>';
    else {
      var tot = sum(txs.map(function (t) { return t.mt; })), manq = txs.filter(function (t) { return t.mt < 0 && !t.j; }).length;
      h += '<div class="outils"><span class="chip">' + txs.length + " transaction" + (txs.length > 1 ? "s" : "") + "</span><span class=\"chip\">" + eur(tot) + "</span>" + (manq ? '<span class="chip warn">' + manq + " sans justificatif</span>" : "") + "</div>";
      // répartition par contrepartie
      var par = {}; txs.forEach(function (t) { par[t.cp] = (par[t.cp] || 0) + t.mt; });
      var it = Object.keys(par).map(function (k) { return { label: k, value: par[k] }; }).sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); });
      if (it.length > 1) h += '<h3>Par contrepartie</h3><div id="dr-cp"></div><h3 class="section">Transactions</h3>';
      h += listeTx(txs.sort(function (a, b) { return a.date < b.date ? 1 : -1; }), { cat: row.t !== "row" || row.lvl < 2 });
      ouvrirTiroir(row.label.replace(/^\s+/, ""), sous, h, function (c) {
        brancherTx(c);
        if (it.length > 1) Charts.hbars(c.querySelector("#dr-cp"), { items: it.slice(0, 8), color: tot < 0 ? "#eb6834" : "#2a78d6", fmt: function (x) { return Charts.eur(x); } });
      });
      return;
    }
    ouvrirTiroir(row.label, sous, h);
  }

  // ------------------------------------------------------------------ TRANSACTIONS
  function filtrerTx() {
    var mois = {}; plage().forEach(function (k) { mois[k] = 1; });
    var F = ST.tx, q = (F.q || "").toLowerCase();
    return IX.tx.filter(function (t) {
      if (!mois[t.m]) return false;
      if (F.flux && t.flux !== F.flux) return false;
      if (F.rub && t.rub !== F.rub) return false;
      if (F.sr && t.sr !== F.sr) return false;
      if (F.pole && t.pole !== F.pole) return false;
      if (F.cp && t.cp !== F.cp) return false;
      if (F.just === "manquant" && (t.mt >= 0 || t.j)) return false;
      if (F.just === "joint" && !t.j) return false;
      if (q && (t.cp + " " + t.lib + " " + t.rub + " " + t.sr + " " + t.det).toLowerCase().indexOf(q) < 0 && String(Math.abs(t.mt)).indexOf(q.replace(",", ".")) < 0) return false;
      return true;
    });
  }
  function vueTransactions(v) {
    var F = ST.tx, txs = filtrerTx();
    if (F.tri === "montant") txs.sort(function (a, b) { return a.mt - b.mt; }); else if (F.tri === "montant-") txs.sort(function (a, b) { return b.mt - a.mt; });
    var uniq = function (f) { var s = {}; IX.tx.forEach(function (t) { if (f(t)) s[f(t)] = 1; }); return Object.keys(s).sort(); };
    var rubs = uniq(function (t) { return t.rub; }), srs = uniq(function (t) { return F.rub && t.rub === F.rub ? t.sr : ""; }), poles = uniq(function (t) { return t.pole; });
    var sel = function (id, lab, vals, cur) { return '<select class="champ" id="' + id + '" aria-label="' + lab + '"><option value="">' + lab + "</option>" + vals.map(function (x) { return '<option' + (x === cur ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + "</select>"; };
    var enc = sum(txs.filter(function (t) { return t.mt > 0; }).map(function (t) { return t.mt; })), dec = sum(txs.filter(function (t) { return t.mt < 0; }).map(function (t) { return t.mt; }));
    var h = '<div class="entete"><div><h1 class="page">Transactions</h1><p class="contrat">Toutes les opérations Qonto réglées, classées comme dans l\'Excel. Cliquez une ligne pour le détail et le lien vers Qonto.</p></div><button class="btn" type="button" id="export">Exporter la vue (CSV)</button></div>';
    h += '<div class="outils"><input class="champ" id="f-q" type="search" placeholder="Fournisseur, libellé, montant" value="' + esc(F.q || "") + '" style="max-width:240px">' +
      sel("f-flux", "Tous les flux", ["Encaissements", "Décaissements", "Hors exploitation"], F.flux) + sel("f-rub", "Toutes les rubriques", rubs, F.rub) + (F.rub ? sel("f-sr", "Toutes les sous-rubriques", srs, F.sr) : "") +
      sel("f-pole", "Tous les pôles", poles, F.pole) +
      '<select class="champ" id="f-just" aria-label="Justificatif"><option value="">Justificatif : tous</option><option value="manquant"' + (F.just === "manquant" ? " selected" : "") + '>Manquant</option><option value="joint"' + (F.just === "joint" ? " selected" : "") + ">Joint</option></select>" +
      (F.cp ? '<span class="chip brand">' + esc(F.cp) + ' <button class="btn-lien" id="f-cp-x" type="button" aria-label="Retirer le filtre" style="padding:0">×</button></span>' : "") +
      (F.q || F.flux || F.rub || F.pole || F.just || F.cp ? '<button class="btn petit" type="button" id="f-raz">Effacer les filtres</button>' : "") + "</div>";
    h += '<div class="grille g3" style="margin-bottom:12px">' + carte("Opérations", nb(txs.length), esc(presetLabel(ST.preset))) + carte("Encaissements", eur(enc), "") + carte("Décaissements", eur(dec), txs.filter(function (t) { return t.mt < 0 && !t.j; }).length + " sans justificatif") + "</div>";
    h += '<div class="tab-wrap libre"><table class="liste-t" id="t-tx"><thead><tr><th>Date</th><th>Contrepartie</th><th>Catégorie</th><th>Pôle</th><th class="r"><button class="btn-lien" id="tri-m" type="button" style="padding:0;font-weight:600">Montant ' + (F.tri === "montant" ? "↑" : F.tri === "montant-" ? "↓" : "") + "</button></th><th></th></tr></thead><tbody>";
    txs.slice(0, F.n).forEach(function (t) {
      h += '<tr data-tx="' + esc(t.id) + '"><td class="num">' + dCourt(t.date) + '</td><td><span class="cp">' + esc(t.cp) + "</span>" + (t.lib ? '<span class="sous">' + esc(t.lib) + "</span>" : "") + '</td><td><span class="sous" style="color:var(--ink-500)">' + esc(t.rub) + (t.sr ? " › " + esc(t.sr) : "") + '</span></td><td class="small muted">' + esc(t.pole || "") + '</td><td class="r ' + (t.mt > 0 ? "pos" : "") + '">' + eur2(t.mt) + "</td><td>" + justif(t) + "</td></tr>";
    });
    h += "</tbody></table>" + (!txs.length ? '<p class="vide">Aucune transaction pour ces filtres et cette période.</p>' : "") + "</div>";
    if (txs.length > F.n) h += '<div class="outils" style="margin-top:10px"><button class="btn" type="button" id="plus">Afficher 200 de plus</button><span class="muted small">' + F.n + " sur " + txs.length + "</span></div>";
    v.innerHTML = h; brancherTx(v);
    var maj = function (k, val) { ST.tx[k] = val; ST.tx.n = 100; if (k === "rub") ST.tx.sr = ""; afficher(); };
    ["flux", "rub", "sr", "pole", "just"].forEach(function (k) { var e = $("f-" + k); if (e) e.addEventListener("change", function () { maj(k, e.value); }); });
    var fq = $("f-q"); fq.addEventListener("input", function () { clearTimeout(fq.h); fq.h = setTimeout(function () { ST.tx.q = fq.value; ST.tx.n = 100; afficher(); var n = $("f-q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); });
    if ($("f-raz")) $("f-raz").addEventListener("click", function () { ST.tx = { rub: "", sr: "", flux: "", pole: "", just: "", cp: "", q: "", tri: "date", n: 100 }; afficher(); });
    if ($("f-cp-x")) $("f-cp-x").addEventListener("click", function () { maj("cp", ""); });
    if ($("plus")) $("plus").addEventListener("click", function () { ST.tx.n += 200; afficher(); });
    $("tri-m").addEventListener("click", function () { ST.tx.tri = F.tri === "montant" ? "montant-" : F.tri === "montant-" ? "date" : "montant"; afficher(); });
    $("export").addEventListener("click", function () {
      var lignes = [["date", "montant", "contrepartie", "libelle", "flux", "rubrique", "sous_rubrique", "detail", "pole", "justificatif", "lien_qonto"].join(";")];
      txs.forEach(function (t) { lignes.push([t.date, String(t.mt).replace(".", ","), t.cp, t.lib, t.flux, t.rub, t.sr, t.det, t.pole, t.mt < 0 ? (t.j ? "joint" : "manquant") : "", lienTx(t.id)].map(function (x) { return '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"'; }).join(";")); });
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + lignes.join("\n")], { type: "text/csv;charset=utf-8" })); a.download = "transactions.csv"; a.click();
    });
  }

  // ------------------------------------------------------------------ FACTURES
  function vueFactures(v) {
    var A = DATA.meta.arrete, O = ST.fac.onglet;
    function retardJ(f) { return Math.round((new Date(A) - new Date(f.echeance)) / 864e5); }
    var groupes = {
      retard: IX.fac.filter(function (f) { return f.statut === "unpaid" && f.payeur !== "CPF" && f.echeance && f.echeance < A; }),
      cpf: IX.fac.filter(function (f) { return f.statut === "unpaid" && f.payeur === "CPF"; }),
      avenir: IX.fac.filter(function (f) { return f.statut === "unpaid" && f.payeur !== "CPF" && (!f.echeance || f.echeance >= A); }),
      payees: IX.fac.filter(function (f) { return f.statut === "paid"; }), toutes: IX.fac };
    var L = groupes[O] || groupes.retard;
    if (O === "retard") L.sort(function (a, b) { return b.ttc - a.ttc; }); else L.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var tranches = [["0 à 30 jours", 0, 30], ["31 à 60 jours", 31, 60], ["61 à 90 jours", 61, 90], ["plus de 90 jours", 91, 99999]].map(function (t) {
      var l = groupes.retard.filter(function (f) { var j = retardJ(f); return j >= t[1] && j <= t[2]; }); return { label: t[0], value: sum(l.map(function (f) { return f.ttc; })), sub: l.length + " facture" + (l.length > 1 ? "s" : "") };
    });
    var h = '<div class="entete"><div><h1 class="page">Factures clients</h1><p class="contrat">Factures émises dans Qonto, leur échéance et leur règlement. Les factures CPF sont réglées par la Caisse des Dépôts via Bibby.</p></div></div>';
    h += '<div class="grille g21"><div class="carte"><h2>Retards de paiement hors CPF, par ancienneté</h2><div id="ch-age"></div></div><div class="carte kpi"><div class="lab">En retard, hors CPF</div><div class="val">' + eur(sum(groupes.retard.map(function (f) { return f.ttc; }))) + '</div><div class="sub">' + groupes.retard.length + " factures ; à venir : " + eur(sum(groupes.avenir.map(function (f) { return f.ttc; }))) + "</div><div class=\"sub\">CPF en attente : " + eur(sum(groupes.cpf.map(function (f) { return f.ttc; }))) + "</div></div></div>";
    h += '<div class="outils section"><div class="seg" role="group" aria-label="Statut">' + [["retard", "En retard"], ["avenir", "À venir"], ["cpf", "CPF en attente"], ["payees", "Payées"], ["toutes", "Toutes"]].map(function (x) { return '<button type="button" data-o="' + x[0] + '" aria-pressed="' + (O === x[0]) + '">' + x[1] + " (" + groupes[x[0]].length + ")</button>"; }).join("") + "</div>" +
      (O === "retard" && L.length ? '<button class="btn" type="button" id="copier-rel">Copier la liste des relances</button>' : "") + "</div>";
    h += '<div class="tab-wrap libre"><table class="liste-t"><thead><tr><th>Numéro</th><th>Client</th><th>Émise</th><th>Échéance</th><th class="r">TTC</th><th>Statut</th><th></th></tr></thead><tbody>';
    L.slice(0, 400).forEach(function (f, i) {
      var j = f.statut === "unpaid" && f.echeance ? retardJ(f) : null;
      var stc = f.statut === "paid" ? '<span class="chip ok">Payée le ' + dCourt(f.paye_le) + "</span>" : f.statut === "canceled" ? '<span class="chip">Annulée</span>' : j > 0 ? '<span class="chip ' + (j > 60 ? "ko" : "warn") + '">' + j + " j de retard</span>" : '<span class="chip brand">À échéance</span>';
      h += '<tr data-f="' + i + '"><td class="num">' + esc(f.numero) + '</td><td><span class="cp">' + esc(f.client) + '</span><span class="sous">' + esc(f.intitule) + '</span></td><td class="num">' + dCourt(f.date) + '</td><td class="num">' + dCourt(f.echeance) + '</td><td class="r">' + eur2(f.ttc) + "</td><td>" + stc + "</td><td>" + aQonto(lienFac(f.id), "Qonto") + "</td></tr>";
    });
    h += "</tbody></table>" + (!L.length ? '<p class="vide">Aucune facture dans cette catégorie.</p>' : "") + "</div>";
    v.innerHTML = h;
    Charts.hbars($("ch-age"), { items: tranches, color: "#eb6834", fmt: function (x) { return Charts.eur(x); } });
    v.querySelectorAll("[data-o]").forEach(function (b) { b.addEventListener("click", function () { ST.fac.onglet = b.dataset.o; afficher(); }); });
    v.querySelectorAll("tr[data-f]").forEach(function (tr) { tr.addEventListener("click", function (e) { if (e.target.closest("a")) return; var f = L[+tr.dataset.f]; ouvrirTiroir("Facture " + f.numero, esc(f.client), '<dl><dt>Client</dt><dd>' + esc(f.client) + "</dd><dt>Intitulé</dt><dd>" + esc(f.intitule) + "</dd><dt>Payeur</dt><dd>" + esc(f.payeur) + " · " + esc(f.segment) + "</dd><dt>Montant</dt><dd>" + eur2(f.ttc) + " TTC (" + eur2(f.ht) + " HT)</dd><dt>Émise le</dt><dd>" + dLong(f.date) + "</dd><dt>Échéance</dt><dd>" + dLong(f.echeance) + "</dd><dt>Statut</dt><dd>" + (f.statut === "paid" ? "Payée le " + dLong(f.paye_le) : f.statut === "canceled" ? "Annulée" : "Non payée") + "</dd></dl><p>" + aQonto(lienFac(f.id), "Ouvrir la facture dans Qonto") + "</p>"); }); });
    if ($("copier-rel")) $("copier-rel").addEventListener("click", function () {
      var t = L.map(function (f) { return f.numero + " ; " + f.client + " ; " + Charts.eur(f.ttc) + " TTC ; échéance " + dCourt(f.echeance) + " (" + retardJ(f) + " j)"; }).join("\n");
      navigator.clipboard.writeText(t).then(function () { toast("Liste copiée : " + L.length + " factures."); }, function () { toast("Copie impossible dans ce navigateur."); });
    });
  }

  // ------------------------------------------------------------------ JUSTIFICATIFS
  function vueJustificatifs(v) {
    var J = (DATA.analyses || {}).justificatifs || {}, F = J.fournisseurs || [], pm = J.par_mois || {}, ks = Object.keys(pm).sort();
    var h = '<div class="entete"><div><h1 class="page">Justificatifs manquants</h1><p class="contrat">Dépenses des 12 derniers mois sans pièce jointe dans Qonto, regroupées par fournisseur, du plus gros montant au plus petit. Salaires, cotisations, impôts et frais Qonto sont exclus.</p></div><button class="btn primaire" type="button" id="copier-j">Copier la liste à demander</button></div>';
    var dernier = ks.length ? pm[ks[ks.length - 1]] : {};
    h += '<div class="grille g3">' + carte("Sans justificatif", nb(J.nb || 0) + " opérations", eur(Math.abs(J.montant || 0)) + " depuis le " + dCourt(J.depuis)) + carte("Fournisseurs concernés", nb(F.length), F.filter(function (x) { return x.personne; }).length + " prestataires individuels") +
      carte("Taux de justification du mois", pct(dernier.taux, 0), nb(dernier.justifies) + " sur " + nb(dernier.nb) + " opérations") + "</div>";
    h += '<div class="carte section"><h2>Montant sans justificatif, par mois</h2><div id="ch-j"></div></div>';
    h += '<div class="carte section"><h2>Par fournisseur</h2><table class="liste-t"><thead><tr><th>Fournisseur</th><th class="r">Opérations</th><th class="r">Montant</th><th>Période</th><th>Comment l\'obtenir</th></tr></thead><tbody>';
    F.forEach(function (f, i) { h += '<tr data-j="' + i + '"><td><span class="cp">' + esc(f.fournisseur) + '</span><span class="sous">' + esc(f.categorie) + '</span></td><td class="r">' + f.nb + '</td><td class="r">' + eur(f.montant) + '</td><td class="small muted">' + dCourt(f.plus_ancien) + " au " + dCourt(f.plus_recent) + '</td><td class="small" style="white-space:normal;max-width:380px">' + esc(f.conseil || "") + "</td></tr>"; });
    h += "</tbody></table></div>";
    v.innerHTML = h;
    Charts.bars($("ch-j"), { labels: ks.map(mLab), series: [{ name: "Montant sans justificatif", values: ks.map(function (k) { return Math.abs(pm[k].montant_manquant || 0); }), color: "#eb6834" }], height: 200,
      extraRows: function (i) { return [{ name: "taux de justification", value: pm[ks[i]].taux, color: "transparent", fmt: function (x) { return pct(x, 0); } }]; } });
    v.querySelectorAll("tr[data-j]").forEach(function (tr) { tr.addEventListener("click", function () {
      var f = F[+tr.dataset.j];
      var txs = f.transactions.map(function (t) { var o = IX.tx.find(function (x) { return x.id === t.id; }); return o || { id: t.id, date: t.date, mt: t.montant, cp: f.fournisseur, lib: t.libelle, j: 0 }; });
      ouvrirTiroir(f.fournisseur, f.nb + " opérations sans justificatif · " + eur(f.montant), '<div class="bandeau info">' + esc(f.conseil || "") + "</div>" + listeTx(txs), brancherTx);
    }); });
    $("copier-j").addEventListener("click", function () {
      var t = "Justificatifs à obtenir (" + (J.nb || 0) + " opérations, " + Charts.eur(Math.abs(J.montant || 0)) + ")\n\n" + F.map(function (f) { return "- " + f.fournisseur + " : " + f.nb + " opération" + (f.nb > 1 ? "s" : "") + ", " + Charts.eur(Math.abs(f.montant)) + " (" + dCourt(f.plus_ancien) + " au " + dCourt(f.plus_recent) + ")"; }).join("\n");
      navigator.clipboard.writeText(t).then(function () { toast("Liste copiée : " + F.length + " fournisseurs."); }, function () { toast("Copie impossible dans ce navigateur."); });
    });
  }

  // ------------------------------------------------------------------ ÉCONOMIES
  function vueEconomies(v) {
    var A = DATA.analyses || {}, T = A.totaux || {}, P = A.pistes || [], AB = (A.abonnements || []).filter(function (x) { return x.actif; }), C = A.chevauchements || [];
    var h = '<div class="entete"><div><h1 class="page">Économies</h1><p class="contrat">Abonnements et dépenses récurrentes repérés dans Qonto sur les 6 derniers mois, hausses, comptes multiples et outils qui font la même chose. Chaque piste est à vérifier avant d\'agir.</p></div></div>';
    h += '<div class="grille g3">' + carte("Abonnements", eur(T.abonnements_mensuels) + '<span class="small muted"> / mois</span>', "logiciels, assurances, honoraires récurrents") + carte("Autres dépenses récurrentes", eur(T.recurrents_mensuels) + '<span class="small muted"> / mois</span>', "ads, salles, certification, achats") + carte("Économies possibles", eur(T.economies_mensuelles) + '<span class="small muted"> / mois</span>', P.length + " pistes, soit " + eur((T.economies_mensuelles || 0) * 12) + " par an") + "</div>";
    h += '<div class="carte section"><h2>Pistes, de la plus rentable à la moins rentable</h2>' + (P.length ? '<table class="liste-t"><thead><tr><th>Piste</th><th>Que faire</th><th class="r">Par mois</th></tr></thead><tbody>' + P.map(function (p, i) { return '<tr data-p="' + i + '"><td><span class="cp">' + esc(p.titre) + '</span></td><td class="small" style="white-space:normal">' + esc(p.detail) + '</td><td class="r">' + eur(p.economie_mensuelle) + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="muted">Aucune piste ce mois-ci.</p>') + "</div>";
    if (C.length) h += '<div class="carte section"><h2>Outils qui se recoupent</h2><div class="grille g3">' + C.map(function (c) { return '<div><h3>' + esc(c.fonction) + " · " + eur(c.mensuel) + "/mois</h3>" + '<ul class="liste small">' + c.outils.map(function (o) { return "<li>" + esc(o.fournisseur) + " : " + eur(o.mensuel) + "</li>"; }).join("") + "</ul></div>"; }).join("") + "</div></div>";
    h += '<div class="carte section"><h2>Abonnements et dépenses récurrentes</h2><table class="liste-t"><thead><tr><th>Fournisseur</th><th>Fonction</th><th class="r">Par mois</th><th>6 derniers mois</th><th>À regarder</th></tr></thead><tbody>';
    AB.forEach(function (a, i) { var hist = Object.keys(a.historique).sort().map(function (k) { return a.historique[k]; }); h += '<tr data-a="' + i + '"><td><span class="cp">' + esc(a.fournisseur) + '</span><span class="sous">' + esc(a.categorie) + (a.type === "abonnement" ? "" : " · récurrent") + '</span></td><td class="small">' + esc(a.fonction || "") + '</td><td class="r">' + eur(a.mensuel) + "</td><td>" + Charts.spark(hist.slice(0, -1), "#4f46e5") + '</td><td class="small" style="white-space:normal;max-width:320px">' + a.signaux.map(function (s) { return '<span class="chip warn" style="white-space:normal;margin:2px 4px 2px 0">' + esc(s) + "</span>"; }).join("") + "</td></tr>"; });
    h += "</tbody></table></div>";
    var V = A.a_ventiler || [];
    if (V.length) h += '<div class="carte section"><h2>À mieux ventiler</h2><p class="contrat">Catégories fourre-tout : les répartir dans des sous-catégories précises rend le suivi plus fiable.</p>' + V.map(function (x) { return "<h3>" + esc(x.categorie) + " : " + x.nb + " opérations, " + eur(x.montant) + '</h3><ul class="liste small">' + x.fournisseurs.map(function (f) { return "<li>" + esc(f.fournisseur) + " : " + eur(f.montant) + "</li>"; }).join("") + "</ul>"; }).join("") + "</div>";
    v.innerHTML = h;
    function tiroirFournisseur(nom) {
      var n = nom.toLowerCase(), txs = IX.tx.filter(function (t) { return t.mt < 0 && t.cp && t.cp.toLowerCase() === n; });
      var par = {}; txs.forEach(function (t) { par[t.m] = (par[t.m] || 0) - t.mt; });
      var ms = Object.keys(par).sort().slice(-12);
      ouvrirTiroir(nom, txs.length + " opérations · " + eur(sum(txs.map(function (t) { return t.mt; }))), '<div id="dr-ab"></div>' + listeTx(txs.slice(0, 120)), function (c) {
        brancherTx(c); Charts.bars(c.querySelector("#dr-ab"), { labels: ms.map(mLab), series: [{ name: nom, values: ms.map(function (k) { return par[k]; }), color: "#eb6834" }], height: 160 });
      });
    }
    v.querySelectorAll("tr[data-a]").forEach(function (tr) { tr.addEventListener("click", function () { tiroirFournisseur(AB[+tr.dataset.a].fournisseur); }); });
    v.querySelectorAll("tr[data-p]").forEach(function (tr) { tr.addEventListener("click", function () { var p = P[+tr.dataset.p]; if (p.fournisseur) tiroirFournisseur(p.fournisseur); }); });
  }

  // ------------------------------------------------------------------ RÉEL ET BP DE RÉFÉRENCE
  function vueBudget(v) {
    var R = DATA.bp_ref || {}, ref = R.treso || {};
    var h = '<div class="entete"><div><h1 class="page">Réel et BP de référence</h1><p class="contrat">Le BP figé sert de repère : chaque mois réalisé est comparé à ce qu\'il prévoyait, et les mois à venir à la prévision actuelle. ' + (R.libelle ? esc(R.libelle) + " (arrêté au " + esc(dLong(R.arrete)) + ")." : "") + "</p></div>" + (EDIT ? '<button class="btn" type="button" id="figer">Figer un nouveau BP de référence</button>' : "") + "</div>";
    if (!R.treso) { v.innerHTML = h + '<div class="bandeau warn">Pas encore de BP de référence : il sera figé lors de la prochaine mise à jour.</div>'; return; }
    var debut = (R.arrete || "").slice(0, 7), mois = plage().filter(function (k) { return k >= debut; });
    if (!mois.length) mois = IX.m.map(function (m) { return m.key; }).filter(function (k) { return k >= debut; }).slice(0, 15);
    var treso = trouver("TRÉSORERIE EN FIN DE MOIS"), enc = trouver("dont encaissements d'exploitation"), dec = trouver("TOTAL DÉCAISSEMENTS D'EXPLOITATION");
    function cmp(row, ms) { var a = 0, b = 0; ms.forEach(function (k) { a += row && typeof row.v[k] === "number" ? row.v[k] : 0; b += row && ref[row.id] && typeof ref[row.id][k] === "number" ? ref[row.id][k] : 0; }); return { act: a, ref: b, ec: a - b }; }
    var real = mois.filter(function (k) { return IX.st[k] === "Réalisé"; }), cE = cmp(enc, mois), cD = cmp(dec, mois);
    var fin = mois[mois.length - 1], tA = treso ? treso.v[fin] : null, tR = treso && ref[treso.id] ? ref[treso.id][fin] : null;
    h += '<div class="grille g3">' + carte("Encaissements d'exploitation", eur(cE.act), "BP : " + eur(cE.ref) + " · écart " + '<span class="' + (cE.ec >= 0 ? "pos" : "neg") + '">' + (cE.ec > 0 ? "+" : "") + eur(cE.ec) + "</span>") +
      carte("Décaissements d'exploitation", eur(cD.act), "BP : " + eur(cD.ref) + " · écart " + '<span class="' + (cD.ec >= 0 ? "pos" : "neg") + '">' + (cD.ec > 0 ? "+" : "") + eur(cD.ec) + "</span>") +
      carte("Trésorerie fin " + mLab(fin), eur(tA), "BP : " + eur(tR) + " · écart " + '<span class="' + ((tA - tR) >= 0 ? "pos" : "neg") + '">' + ((tA - tR) > 0 ? "+" : "") + eur(tA - tR) + "</span>", "", IX.st[fin] !== "Réalisé") + "</div>";
    h += '<p class="muted small">' + (real.length ? real.length + " mois réalisé" + (real.length > 1 ? "s" : "") + " depuis le BP, " : "Aucun mois clos depuis le BP : ") + "les mois suivants comparent la prévision actuelle au BP. Écart positif = mieux que le BP (plus d'encaissements ou moins de dépenses).</p>";
    h += '<div class="carte section"><div class="entete" style="margin-bottom:6px"><h2 style="margin:0">Trésorerie : actuel et BP de référence</h2><div class="legende"><span><i style="border-color:#4f46e5"></i>Réel puis prévision actuelle</span><span><i class="dash" style="border-color:#94a3b8"></i>BP de référence</span></div></div><div id="ch-bud"></div></div>';
    // écarts par rubrique (période)
    var rubs = IX.rows.filter(function (r) { return r.t === "row" && r.lvl === 1 && ref[r.id]; });
    var items = rubs.map(function (r) { var c = cmp(r, mois); return { r: r, c: c }; }).filter(function (x) { return Math.abs(x.c.ec) >= 1; }).sort(function (a, b) { return Math.abs(b.c.ec) - Math.abs(a.c.ec); });
    h += '<div class="carte section"><h2>Écarts par rubrique sur la période</h2><table class="liste-t"><thead><tr><th>Rubrique</th><th class="r">BP de référence</th><th class="r">Réel et prévision</th><th class="r">Écart</th><th class="r">Écart %</th></tr></thead><tbody>';
    items.forEach(function (x, i) { var e = x.c.ec, p = x.c.ref ? e / Math.abs(x.c.ref) : null; h += '<tr data-b="' + i + '"><td><span class="cp">' + esc(x.r.label) + '</span></td><td class="r">' + eur(x.c.ref) + '</td><td class="r">' + eur(x.c.act) + '</td><td class="r ' + (e >= 0 ? "pos" : "neg") + '">' + (e > 0 ? "+" : "") + eur(e) + '</td><td class="r ' + (e >= 0 ? "pos" : "neg") + '">' + (p == null ? "" : (p > 0 ? "+" : "") + pct(p, 0)) + "</td></tr>"; });
    h += "</tbody></table>" + (!items.length ? '<p class="vide">Aucun écart sur la période : le BP et la prévision actuelle coïncident.</p>' : "") + "</div>";
    v.innerHTML = h;
    Charts.line($("ch-bud"), { labels: mois.map(mLab), series: [{ name: "Réel puis prévision actuelle", values: mois.map(function (k) { return treso ? treso.v[k] : null; }), color: "#4f46e5", split: Math.max(0, mois.findIndex(function (k) { return IX.st[k] !== "Réalisé"; })) },
      { name: "BP de référence", values: mois.map(function (k) { return treso && ref[treso.id] ? ref[treso.id][k] : null; }), color: "#94a3b8", dash: true, width: 1.5 }], height: 240, threshold: (DATA.pilotage.top.a_plancher || {}).value ? { value: DATA.pilotage.top.a_plancher.value, label: "plancher" } : null });
    v.querySelectorAll("tr[data-b]").forEach(function (tr) { tr.addEventListener("click", function () {
      var x = items[+tr.dataset.b], r = x.r, rr = ref[r.id];
      var h2 = '<div id="dr-b"></div><table class="liste-t"><thead><tr><th>Mois</th><th class="r">BP</th><th class="r">Actuel</th><th class="r">Écart</th></tr></thead><tbody>' + mois.map(function (k) { var a = r.v[k] || 0, b = rr[k] || 0; return "<tr><td>" + mLab(k) + (IX.st[k] !== "Réalisé" ? ' <span class="muted small">(e)</span>' : "") + '</td><td class="r">' + eur(b) + '</td><td class="r">' + eur(a) + '</td><td class="r ' + (a - b >= 0 ? "pos" : "neg") + '">' + eur(a - b) + "</td></tr>"; }).join("") + "</tbody></table>";
      ouvrirTiroir(r.label, "Écart sur la période : " + eur(x.c.ec), h2, function (c) { Charts.bars(c.querySelector("#dr-b"), { labels: mois.map(mLab), series: [{ name: "BP de référence", values: mois.map(function (k) { return rr[k]; }), color: "#94a3b8" }, { name: "Actuel", values: mois.map(function (k) { return r.v[k]; }), color: "#4f46e5" }], height: 180 }); });
    }); });
    if ($("figer")) $("figer").addEventListener("click", async function () {
      try { var message = JSON.stringify({ ts: new Date().toISOString(), libelle: "BP figé le " + new Date().toLocaleDateString("fr-FR") }); var sig = await Coffre.signer(EDIT, message);
        var r = await fetch(CFG.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "figer_bp", message: message, signature: sig }) });
        toast(r.ok ? "Demande enregistrée : le BP actuel deviendra la référence cette nuit." : "Envoi impossible (HTTP " + r.status + ")."); } catch (e) { toast("Envoi impossible : " + e.message); }
    });
  }

  // ------------------------------------------------------------------ RÉSULTAT, BP, BILAN (grilles)
  function grille(rows, titreCol) {
    var cols = colonnes(plage()), h = '<div class="tab-wrap" id="grille"><table class="t"><thead><tr><th>' + esc(titreCol) + "</th>" + cols.map(function (c) { return '<th class="' + (c.est ? "est" : "") + '">' + esc(c.lab) + "</th>"; }).join("") + "</tr></thead><tbody>";
    rows.forEach(function (r) {
      if (r.band) { h += '<tr class="band"><td>' + esc(r.label) + '</td><td colspan="' + cols.length + '"></td></tr>'; return; }
      var cls = /^(total|trésorerie en fin|flux net|ebitda|résultat net|chiffre d'affaires facturé)/i.test(r.label) ? "total" : (r.bold ? "l1" : (r.indent >= 3 ? "l2" : ""));
      h += '<tr class="' + cls + '"><td>' + esc(r.label) + "</td>" + cols.map(function (c) {
        var vals = c.mois.map(function (k) { return r.v[k]; }).filter(function (x) { return typeof x === "number"; });
        var val = !vals.length ? null : (/fin de mois|en fin de/i.test(r.label) ? vals[vals.length - 1] : (/début de mois/i.test(r.label) ? vals[0] : ((r.nf || "").indexOf("%") >= 0 || /par session|apprenants par|taux|marge d'ebitda|ouverte/i.test(r.label) ? sum(vals) / vals.length : sum(vals))));
        return '<td class="' + (c.est ? "est" : "") + (typeof val === "number" && val < 0 && /ebitda|résultat|flux net/i.test(r.label) ? " neg" : "") + '">' + (val == null ? "" : parNf(val, r.nf)) + "</td>";
      }).join("") + "</tr>";
    });
    return h + "</tbody></table></div>";
  }
  function segGran() { return '<div class="seg" role="group" aria-label="Granularité">' + [["mois", "Mois"], ["trimestre", "Trimestres"], ["annee", "Années"]].map(function (x) { return '<button type="button" data-g="' + x[0] + '" aria-pressed="' + (ST.gran === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>"; }
  function brancherGran(v) { v.querySelectorAll("[data-g]").forEach(function (b) { b.addEventListener("click", function () { ST.gran = b.dataset.g; afficher(); }); }); caler($("grille"), colonnes(plage())); }
  function vueResultat(v) {
    var rows = DATA.sheets.cr || [], mois = plage();
    var ca = rows.find(function (r) { return /^CHIFFRE D'AFFAIRES FACTURÉ/i.test(r.label); }), eb = rows.find(function (r) { return /^EBITDA/i.test(r.label); });
    var h = '<div class="entete"><div><h1 class="page">Résultat</h1><p class="contrat">Chiffre d\'affaires facturé, charges, EBITDA et résultat, mois par mois ; prévisionnel à partir du mois en cours.</p></div></div>';
    h += '<div class="carte"><div class="entete" style="margin-bottom:6px"><h2 style="margin:0">Chiffre d\'affaires et EBITDA</h2><div class="legende"><span><i class="blk" style="background:#2a78d6"></i>CA facturé</span><span><i class="blk" style="background:#4f46e5"></i>EBITDA</span></div></div><div id="ch-cr"></div></div>';
    h += '<div class="outils section">' + segGran() + "</div>" + grille(rows, "Ligne");
    v.innerHTML = h; brancherGran(v);
    var mm = mois.length > 24 ? mois.slice(-24) : mois;
    Charts.bars($("ch-cr"), { labels: mm.map(mLab), series: [{ name: "CA facturé", values: mm.map(function (k) { return ca ? ca.v[k] : null; }), color: "#2a78d6" }, { name: "EBITDA", values: mm.map(function (k) { return eb ? eb.v[k] : null; }), color: "#4f46e5" }], height: 230 });
  }
  function vueBP(v) {
    var o = ST.bpOnglet, h = '<div class="entete"><div><h1 class="page">BP détaillé</h1><p class="contrat">Le moteur du prévisionnel : sessions, apprenants, villes, ventes, encaissements avec délais, charges variables' + (complet() ? ", masse salariale nominative" : "") + " ; et la synthèse du classeur.</p></div></div>";
    h += '<div class="outils"><div class="seg" role="group" aria-label="Onglet"><button type="button" data-o="bp" aria-pressed="' + (o === "bp") + '">BP</button><button type="button" data-o="synthese" aria-pressed="' + (o === "synthese") + '">Synthèse</button></div>' + segGran() + "</div>";
    h += grille(DATA.sheets[o] || [], "Ligne");
    v.innerHTML = h; brancherGran(v);
    v.querySelectorAll("[data-o]").forEach(function (b) { b.addEventListener("click", function () { ST.bpOnglet = b.dataset.o; afficher(); }); });
  }
  function vueBilan(v) {
    var B = DATA.bilan, h = '<div class="entete"><div><h1 class="page">Bilan</h1><p class="contrat">Liasse au 31/12/2025, puis bilan de gestion reconstitué à la fin du dernier mois réalisé, à fin 2026 et fin 2027 (estimés).</p></div></div>';
    h += '<div class="tab-wrap libre"><table class="t"><thead><tr><th>Poste</th>' + B.cols.map(function (c, i) { return '<th class="' + (i >= 2 ? "est" : "") + '">' + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>";
    B.rows.forEach(function (r) {
      if (r.v.every(function (x) { return x == null; })) { h += '<tr class="band"><td colspan="5">' + esc(r.label) + "</td></tr>"; return; }
      h += '<tr class="' + (r.bold ? "total" : "") + '"><td title="' + esc(r.note || "") + '">' + esc(r.label) + "</td>" + r.v.map(function (x, i) { return '<td class="' + (i >= 2 ? "est" : "") + '">' + (typeof x === "number" ? eur(x) : esc(x || "")) + "</td>"; }).join("") + "</tr>";
    });
    v.innerHTML = h + "</tbody></table></div>";
  }

  // ------------------------------------------------------------------ PILOTAGE ET PLAN
  function pilInit() {
    var p = DATA.pilotage, params = {};
    p.params.forEach(function (x) { params[x.name] = x.retenu; });
    SIM = { params: params, decisions: p.decisions.map(function (d) { return Object.assign({}, d); }), modifie: false };
  }
  function pilCalc() { var p = DATA.pilotage; return Engine.run({ params: SIM.params, months: p.months, labels: p.labels, fc: Math.max(0, p.months.indexOf(p.fc_first)), base: p.base, hyp: p.hyp, decisions: SIM.decisions }); }
  function planCalc() {
    var p = DATA.pilotage;
    var base = SIM.decisions.filter(function (d) { return !/^Plan :/.test(d.libelle || ""); });
    return Engine.plan({ params: SIM.params, months: p.months, labels: p.labels, fc: Math.max(0, p.months.indexOf(p.fc_first)), base: p.base, hyp: p.hyp, decisions: base }, ST.planOpts);
  }
  function vuePilotage(v) {
    if (!SIM) pilInit();
    var p = DATA.pilotage, R = pilCalc(), T = R.top, PL = planCalc(), h = "";
    h += '<div class="entete"><div><h1 class="page">Pilotage et plan de réinvestissement</h1><p class="contrat">Peut-on recruter ou mettre plus en ads, à partir de quand, sans passer sous le plancher ? Le plan propose comment réinvestir la trésorerie disponible ; tout se recalcule ici comme dans l\'Excel.</p></div></div>';
    if (SIM.modifie) h += '<div class="bandeau info">Simulation en cours : ces chiffres ne sont pas encore dans l\'Excel.' + (EDIT ? " Enregistrez pour les reprendre cette nuit." : " Seul Olivier peut les enregistrer (accès complet et édition).") + "</div>";
    var ok = T.a_pb >= T.a_plancher;
    h += '<div class="grille g4">' + carte("Point bas prévu (e)", eur(T.a_pb), esc(T.a_pb_mois) + ", plancher " + eur(T.a_plancher), '<div style="margin-top:8px"><span class="chip ' + (ok ? "ok" : "ko") + '">' + (ok ? "Au-dessus du plancher" : "Sous le plancher") + "</span></div>", true) +
      carte("Dépense en plus supportable", eur(T.a_capx) + '<span class="small muted"> / mois</span>', "dès le mois prochain, sans compter les ventes rapportées", "", true) +
      carte("Marge par euro d'ads (à terme)", NF1.format(T.a_rend) + " €", "si les closers et setters suivent") +
      carte("Ads : nécessaire / prévu", keur(T.a_adsreq) + " / " + keur(T.a_ads), "moyenne mensuelle jusqu'à déc. 2027", "", true) + "</div>";
    // plan
    var O = PL.options;
    h += '<div class="carte section"><div class="entete" style="margin-bottom:8px"><div><h2 style="margin:0">Plan de réinvestissement proposé</h2><p class="contrat" style="margin:4px 0 0">Réinvestit la trésorerie au-dessus du plancher : ads et équipe commerciale d\'abord, formateurs CDI quand c\'est une économie, puis recrutements structurants financés sans compter sur les ventes en plus.</p></div>' +
      '<button class="btn primaire" type="button" id="plan-ajout">' + (PL.decisions.length ? "Ajouter le plan à mes décisions" : "Aucun investissement possible") + "</button></div>";
    if (PL.decisions.length) {
      h += '<div class="grille g2"><div><ul class="plan-l">' + PL.decisions.map(function (d) { return '<li><span class="q">' + esc(d.type) + "</span><span>" + esc(d.libelle.replace(/^Plan : /, "")) + '</span><span class="w">dès ' + esc(p.labels[p.months.indexOf(d.arrivee)] || d.arrivee) + "</span></li>"; }).join("") + "</ul>" +
        '<p class="small muted" style="margin-top:12px">Investissement moyen : ' + eur(PL.investissement_mensuel) + " par mois. Ventes en plus : " + nb(PL.ventes_plus_mois) + " par mois, soit environ " + nb(PL.sessions_plus_mois, 1) + " sessions de plus par mois (" + (PL.salles_ok ? "le parc de salles suffit" : "le parc de salles est dépassé") + "). Point bas avec la moitié seulement du retour des ventes : " + eur(PL.point_bas) + " (" + esc(PL.mois_point_bas) + ") ; sans aucun retour : " + eur(PL.point_bas_prudent) + ".</p></div>" +
        '<div><div class="legende"><span><i style="border-color:#4f46e5"></i>Sans le plan</span><span><i class="dash" style="border-color:#eb6834"></i>Avec le plan</span><span><i class="dash" style="border-color:#94a3b8"></i>Avec le plan, sans retour des ventes</span></div><div id="ch-plan"></div></div></div>';
    } else h += '<p class="muted">Avec ces réglages, aucun palier d\'investissement ne passe la marge de sécurité.</p>';
    h += '<div class="opts"><label>Marge de sécurité au-dessus du plancher<input class="champ num" type="number" step="5000" id="o-marge" value="' + O.marge_securite + '"></label>' +
      '<label>Part du retour des ventes comptée (%)<input class="champ num" type="number" step="10" min="0" max="100" id="o-retour" value="' + Math.round(O.part_retour * 100) + '"></label>' +
      '<label>Plafond des ads en plus (% du budget prévu)<input class="champ num" type="number" step="25" min="0" id="o-ads" value="' + Math.round(O.ads_max * 100) + '"></label></div></div>';
    // recommandations
    h += '<div class="carte section"><h2>Recommandations</h2><ul class="liste">' + ["a_reco_clo", "a_reco_set", "a_reco_form", "a_reco_salles", "a_reco_ads"].map(function (k) { return "<li>" + esc(T[k]) + "</li>"; }).join("") + "</ul></div>";
    // décisions
    var types = ["", "Closer", "Setter", "Formateur CDI", "Salarié", "Ads"];
    h += '<div class="section"><h2>Décisions à tester</h2><p class="contrat">Quantité = nombre de personnes, ou euros par mois pour Ads. Coût vide = coût par défaut du type. « Retenue : Oui » intègre la décision au BP et à la trésorerie.</p>';
    h += '<div class="tab-wrap libre"><table class="t dec-table"><thead><tr><th>Décision</th><th>Type</th><th>Quantité</th><th>Arrivée</th><th>Coût / mois</th><th>Retenue</th><th class="res">Verdict prudent</th><th class="res">Avec retour</th><th class="res">Point bas</th><th class="res">Coût / mois en régime</th><th class="res">Retour / mois</th><th class="res">Au plus tôt</th></tr></thead><tbody>';
    SIM.decisions.forEach(function (d, i) {
      var r = R.results[i];
      var vc = function (x) { return x ? '<span class="verdict ' + (x.indexOf("OUI") === 0 ? "ok" : "ko") + '">' + esc(x) + "</span>" : ""; };
      h += '<tr><td><input class="champ" style="width:168px" data-i="' + i + '" data-k="libelle" value="' + esc(d.libelle) + '" placeholder="Libellé"></td>' +
        '<td><select class="champ" style="width:112px" data-i="' + i + '" data-k="type">' + types.map(function (t) { return '<option value="' + t + '"' + (d.type === t ? " selected" : "") + ">" + (t || "(vide)") + "</option>"; }).join("") + "</select></td>" +
        '<td><input class="champ num" style="width:64px" data-i="' + i + '" data-k="quantite" inputmode="decimal" value="' + (d.quantite == null ? "" : d.quantite) + '"></td>' +
        '<td><select class="champ" style="width:88px" data-i="' + i + '" data-k="arrivee"><option value=""></option>' + p.months.map(function (m, j) { return '<option value="' + m + '"' + (d.arrivee === m ? " selected" : "") + ">" + esc(p.labels[j]) + "</option>"; }).join("") + "</select></td>" +
        '<td><input class="champ num" style="width:70px" data-i="' + i + '" data-k="cout" inputmode="decimal" placeholder="défaut" value="' + (d.cout == null ? "" : d.cout) + '"></td>' +
        '<td><select class="champ" style="width:62px" data-i="' + i + '" data-k="retenue"><option' + (d.retenue === "Non" ? " selected" : "") + ">Non</option><option" + (d.retenue === "Oui" ? " selected" : "") + ">Oui</option></select></td>" +
        "<td>" + (r ? vc(r.verdict) : "") + "</td><td>" + (r ? vc(r.verdict_retour) : "") + "</td><td>" + (r ? eur(r.point_bas) : "") + "</td><td>" + (r ? eur(r.cout_regime) : "") + "</td><td>" + (r ? eur(r.retour_regime) : "") + "</td><td>" + (r ? esc(r.au_plus_tot) : "") + "</td></tr>";
    });
    h += '</tbody></table></div><div class="outils" style="margin-top:10px"><button class="btn" type="button" id="ajout-dec">Ajouter une ligne</button></div></div>';
    // équation du mois
    var C = R.chain, L = p.labels;
    var lignes = [["Budget ads (BP + retenues)", C.ch_ads, eur], ["Ventes que les ads peuvent produire", C.ch_ventes_ads, nb], ["Ventes visées par le BP", C.ch_ventes_bp, nb], ["Budget ads nécessaire", C.ch_ads_req, eur],
      ["Setters disponibles / nécessaires", C.ch_set_dispo.map(function (x, j) { return nb(x) + " / " + nb(C.ch_set_req[j]); }), null], ["Closers disponibles / nécessaires", C.ch_clo_dispo.map(function (x, j) { return nb(x) + " / " + nb(C.ch_clo_req[j]); }), null],
      ["Formateurs disponibles / nécessaires", C.ch_form_dispo.map(function (x, j) { return nb(x) + " / " + nb(C.ch_form_req[j]); }), null], ["Sessions par semaine (parc " + nb(SIM.params.parc_sem) + ")", C.ch_salles, function (x) { return nb(x, 1); }],
      ["Premier levier en manque", C.ch_limit, null], ["Trésorerie fin de mois avec les décisions retenues", R.treso, eur], ["Trésorerie sans les décisions retenues", R.hors, eur], ["Dépense en plus supportable si départ ce mois", R.capx, eur]];
    h += '<div class="section"><h2>Équation du mois</h2><div class="tab-wrap libre"><table class="t"><thead><tr><th>Ligne</th>' + L.map(function (l) { return "<th>" + esc(l) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      lignes.map(function (lg) { return "<tr><td>" + esc(lg[0]) + "</td>" + lg[1].map(function (x) { return "<td>" + (lg[2] ? lg[2](x) : esc(x)) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div></div>";
    // paramètres
    h += '<div class="section"><h2>Paramètres</h2><p class="contrat">Valeurs retenues dans l\'Excel ; « Mesuré » vient des données (Qonto, ventes, paie). Modifiez pour simuler.</p><div class="tab-wrap libre"><table class="t"><thead><tr><th>Paramètre</th><th>Retenu</th><th>Mesuré</th><th style="text-align:left">Source</th></tr></thead><tbody>';
    p.params.forEach(function (x) {
      var val = SIM.params[x.name], mod = x.input && val !== x.retenu, isPct = String(x.nf || "").indexOf("%") >= 0;
      h += "<tr><td>" + esc(x.label) + "</td><td>" + (x.input ? '<input class="champ num' + (mod ? " modifie" : "") + '" style="width:120px" data-p="' + x.name + '" inputmode="decimal" value="' + (typeof val === "number" ? (isPct ? +(val * 100).toFixed(2) : val) : "") + '"> <span class="small muted">' + esc(isPct ? "%" : (x.unit || "")) + "</span>" : parNf(R.P[x.name], x.nf)) + "</td><td>" + parNf(x.mesure, x.nf) + '</td><td style="text-align:left;white-space:normal;min-width:280px" class="small muted">' + esc(x.src || "") + "</td></tr>";
    });
    h += "</tbody></table></div></div>";
    if (SIM.modifie) h += '<div class="sim-barre"><span>Simulation non enregistrée</span><span><button class="btn" type="button" id="sim-annuler">Revenir à l\'Excel</button> ' + (EDIT ? '<button class="btn" type="button" id="sim-enregistrer">Enregistrer dans l\'Excel</button>' : "") + "</span></div>";
    v.innerHTML = h;
    if (PL.decisions.length) {
      var fc = Math.max(0, p.months.indexOf(p.fc_first));
      Charts.line($("ch-plan"), { labels: p.labels, series: [{ name: "Sans le plan", values: PL.trajectoire_reference, color: "#4f46e5" }, { name: "Avec le plan", values: PL.trajectoire.map(function (x, j) { return j >= fc ? x : null; }), color: "#eb6834", dash: true },
        { name: "Avec le plan, sans retour des ventes", values: PL.trajectoire_prudente.map(function (x, j) { return j >= fc ? x : null; }), color: "#94a3b8", dash: true, width: 1.5 }], threshold: { value: T.a_plancher, label: "plancher" }, height: 230 });
    }
    // événements
    v.querySelectorAll("[data-i]").forEach(function (el) { el.addEventListener("change", function () {
      var d = SIM.decisions[+el.dataset.i], k = el.dataset.k, val = el.value;
      if (k === "quantite" || k === "cout") { val = val.replace(/\s/g, "").replace(",", "."); d[k] = val === "" ? null : +val; } else d[k] = val;
      SIM.modifie = true; afficher(); }); });
    v.querySelectorAll("[data-p]").forEach(function (el) { el.addEventListener("change", function () {
      var x = DATA.pilotage.params.find(function (q) { return q.name === el.dataset.p; }), val = +(el.value.replace(/\s/g, "").replace(",", "."));
      if (!isFinite(val)) return; if (String(x.nf || "").indexOf("%") >= 0) val = val / 100;
      SIM.params[x.name] = val; SIM.modifie = true; afficher(); }); });
    [["o-marge", "marge_securite", 1], ["o-retour", "part_retour", 100], ["o-ads", "ads_max", 100]].forEach(function (o) { var e = $(o[0]); e.addEventListener("change", function () { var x = +e.value; if (isFinite(x)) { ST.planOpts[o[1]] = x / o[2]; afficher(); } }); });
    $("plan-ajout").addEventListener("click", function () {
      if (!PL.decisions.length) return;
      SIM.decisions = SIM.decisions.filter(function (d) { return !/^(Plan :|Exemple)/.test(d.libelle || "") && d.type; }).concat(PL.decisions.map(function (d) { return { libelle: d.libelle, type: d.type, quantite: d.quantite, arrivee: d.arrivee, cout: null, retenue: "Oui" }; }));
      while (SIM.decisions.length < 10) SIM.decisions.push({ libelle: "", type: "", quantite: null, arrivee: "", cout: null, retenue: "Non" });
      SIM.modifie = true; afficher(); toast(EDIT ? "Plan ajouté à vos décisions (retenues). Vérifiez puis « Enregistrer dans l'Excel »." : "Plan ajouté à la simulation. L'enregistrement dans l'Excel demande le code d'édition.", 6000);
    });
    var a = $("ajout-dec"); if (a) a.addEventListener("click", function () { SIM.decisions.push({ libelle: "", type: "", quantite: null, arrivee: "", cout: null, retenue: "Non" }); afficher(); });
    var an = $("sim-annuler"); if (an) an.addEventListener("click", function () { SIM = null; afficher(); });
    var en = $("sim-enregistrer"); if (en) en.addEventListener("click", enregistrer);
  }
  async function enregistrer() {
    if (!EDIT) return;
    var p = DATA.pilotage, modifs = {};
    p.params.forEach(function (x) { if (x.input && SIM.params[x.name] !== x.retenu) modifs[x.name] = SIM.params[x.name]; });
    var message = JSON.stringify({ ts: new Date().toISOString(), base_arrete: DATA.meta.arrete, pilotage: modifs, decisions: SIM.decisions.filter(function (d) { return d.type || d.libelle; }) });
    try {
      var signature = await Coffre.signer(EDIT, message);
      var r = await fetch(CFG.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "pilotage", message: message, signature: signature }) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      toast("Enregistré : vos décisions et paramètres seront repris dans l'Excel cette nuit.", 6000);
    } catch (e) { toast("Envoi impossible (" + e.message + "). Réessayez."); }
  }

  // ------------------------------------------------------------------ RECHERCHE
  function fermerRecherche() { $("q-res").classList.add("hidden"); }
  $("q").addEventListener("input", function () {
    var q = $("q").value.trim().toLowerCase(), box = $("q-res");
    if (q.length < 2 || !DATA) { fermerRecherche(); return; }
    var cats = IX.rows.filter(function (r) { return r.t === "row" && r.label.toLowerCase().indexOf(q) >= 0; }).slice(0, 6);
    var fz = {}; IX.tx.forEach(function (t) { if (t.cp && t.cp.toLowerCase().indexOf(q) >= 0) fz[t.cp] = (fz[t.cp] || 0) + 1; });
    var fours = Object.keys(fz).sort(function (a, b) { return fz[b] - fz[a]; }).slice(0, 6);
    var num = q.replace(",", ".").replace(/\s/g, ""), txs = IX.tx.filter(function (t) { return (t.lib || "").toLowerCase().indexOf(q) >= 0 || (/^\d+(\.\d+)?$/.test(num) && String(Math.abs(t.mt)).indexOf(num) === 0); }).slice(0, 6);
    var facs = IX.fac.filter(function (f) { return (f.numero + " " + f.client).toLowerCase().indexOf(q) >= 0; }).slice(0, 5);
    var h = "", items = [];
    function grp(t, arr, fn) { if (!arr.length) return; h += '<div class="g">' + t + "</div>"; arr.forEach(function (x) { var r = fn(x); items.push(r.go); h += '<button type="button" data-q="' + (items.length - 1) + '"><span>' + r.l + '</span><span class="small muted">' + r.s + "</span></button>"; }); }
    grp("Catégories", cats, function (r) { return { l: esc(r.label), s: esc(r.parent ? r.parent.label : r.band || ""), go: function () { var p = r.parent; while (p) { ST.ouverts[p.id] = true; p = p.parent; } ST.sel = r.id; aller("tresorerie"); } }; });
    grp("Fournisseurs et clients", fours, function (n) { return { l: esc(n), s: fz[n] + " opérations", go: function () { ST.tx = { rub: "", sr: "", flux: "", pole: "", just: "", cp: n, q: "", tri: "date", n: 100 }; ST.preset = "tout"; aller("transactions"); } }; });
    grp("Transactions", txs, function (t) { return { l: esc(t.cp) + " · " + eur2(t.mt), s: dCourt(t.date), go: function () { ouvrirTx(t.id); } }; });
    grp("Factures", facs, function (f) { return { l: esc(f.numero) + " · " + esc(f.client), s: eur(f.ttc), go: function () { ST.fac.onglet = "toutes"; aller("factures"); } }; });
    box.innerHTML = h || '<p class="vide">Rien ne correspond à « ' + esc(q) + " ».</p>"; box.classList.remove("hidden");
    box.querySelectorAll("[data-q]").forEach(function (b) { b.addEventListener("click", function () { fermerRecherche(); $("q").value = ""; items[+b.dataset.q](); }); });
  });
  $("q").addEventListener("keydown", function (e) {
    var bs = Array.from($("q-res").querySelectorAll("[data-q]")), i = bs.findIndex(function (b) { return b.classList.contains("on"); });
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!bs.length) return; if (i >= 0) bs[i].classList.remove("on"); i = e.key === "ArrowDown" ? (i + 1) % bs.length : (i <= 0 ? bs.length - 1 : i - 1); bs[i].classList.add("on"); bs[i].scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter") { e.preventDefault(); (bs[i >= 0 ? i : 0] || { click: function () {} }).click(); }
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".recherche")) fermerRecherche(); });

  demarrer();
})();
