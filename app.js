/* Plateforme Trésorerie France IA : reflet du classeur Excel, reconstruit chaque nuit.
   Tout chiffre affiché vient d'une cellule calculée du classeur ; l'onglet Pilotage se recalcule en direct
   pendant une simulation (engine.js, mêmes formules que l'Excel), et Olivier seul peut renvoyer ses décisions vers l'Excel. */
(function () {
  "use strict";
  var CFG = window.TRESO_CONFIG || {};
  var KEYS = null, DATA = null, PRIV = null, EDIT = null, VUE = "ensemble", PERIODE = "mois";
  var SIM = null;          // { params: {..}, decisions: [..] } : copie de travail du Pilotage
  var OUVERTS = {};        // rubriques dépliées dans la Trésorerie
  var $ = function (id) { return document.getElementById(id); };
  var NF0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  var NF1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function eur(v) { return typeof v === "number" ? NF0.format(Math.round(v)).replace(/ /g, " ") + " €" : (v == null ? "" : esc(v)); }
  function keur(v) { return typeof v === "number" ? NF0.format(Math.round(v / 1000)).replace(/ /g, " ") + " K€" : ""; }
  function pct(v, d) { return typeof v === "number" ? (v * 100).toFixed(d == null ? 1 : d).replace(".", ",") + " %" : ""; }
  function nb(v, d) { return typeof v === "number" ? (d ? NF1.format(v) : NF0.format(Math.round(v))).replace(/ /g, " ") : (v == null ? "" : esc(v)); }
  function parNf(v, nf) {
    if (typeof v !== "number") return v == null ? "" : esc(v);
    nf = nf || "";
    if (nf.indexOf("%") >= 0) return pct(v, nf.indexOf("0.00") >= 0 ? 2 : 1);
    if (nf.indexOf("€") >= 0) return nf.indexOf("0.00") >= 0 ? (NF1.format(v).replace(/ /g, " ") + " €") : eur(v);
    if (nf.indexOf("0.0") >= 0) return nb(v, 1);
    return nb(v);
  }

  // ------------------------------------------------------------------ ouverture
  async function demarrer() {
    try {
      var r = await fetch("keys.json", { cache: "no-store" });
      if (!r.ok) throw new Error("absent");
      KEYS = await r.json();
    } catch (e) { $("verrou").classList.add("hidden"); $("installation").classList.remove("hidden"); return; }
    try {
      var jwk = sessionStorage.getItem("treso_cle");
      if (jwk) { PRIV = await Coffre.importerJwk(JSON.parse(jwk)); await chargerDonnees(); return; }
    } catch (e) { sessionStorage.removeItem("treso_cle"); }
    $("mdp").focus();
  }
  async function chargerDonnees() {
    var r = await fetch("data.enc?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("Les données ne sont pas encore publiées.");
    DATA = await Coffre.dechiffrer(PRIV, await r.json());
    SIM = null;
    $("verrou").classList.add("hidden"); $("appli").classList.remove("hidden");
    $("arrete").textContent = "Données au " + dateLongue(DATA.meta.arrete) + " · mise à jour chaque nuit";
    $("pied").innerHTML = "Reflet du classeur « " + esc(DATA.meta.classeur || "Trésorerie France IA") + " » (Dropbox). Généré le " + esc(DATA.meta.genere_le) + ". (e) = estimé ; les chiffres en italique sont des prévisions.";
    Coffre.empreinte(KEYS.view.spki).then(function (e) { $("pied").innerHTML += " Empreinte des clés : " + e + "."; }).catch(function () {});
    afficher();
  }
  $("form-verrou").addEventListener("submit", async function (ev) {
    ev.preventDefault(); $("err-verrou").textContent = "";
    var b = ev.target.querySelector("button"); b.disabled = true; b.textContent = "Ouverture…";
    try {
      PRIV = await Coffre.ouvrir(KEYS, $("mdp").value);
      try { sessionStorage.setItem("treso_cle", JSON.stringify(await Coffre.exporterJwk(PRIV))); } catch (e) {}
      await chargerDonnees();
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
      var r = await fetch(CFG.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "cles", cles: cles }) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      var emp = await Coffre.empreinte(cles.view.spki);
      ev.target.innerHTML = '<img src="assets/logo-france-ia.webp" alt="France IA"><h1 class="page">Clés créées</h1><p class="contrat">Empreinte de vos clés : <strong class="num">' + emp + '</strong> (notez-la : elle s\'affichera en bas de chaque page et dans l\'e-mail du matin, pour vérifier que ce sont bien les vôtres).</p><p class="contrat">Les clés partent pour publication ; la plateforme s\'ouvrira avec votre mot de passe dès la prochaine mise à jour, ou tout de suite si Claude la publie en séance. Gardez le mot de passe et le code d\'édition en lieu sûr : ils ne sont stockés nulle part et ne peuvent pas être retrouvés.</p>';
    } catch (e) { err.textContent = "Envoi impossible (" + e.message + "). Réessayez."; b.disabled = false; b.textContent = "Créer les clés"; }
  });
  $("btn-quitter").addEventListener("click", function () { sessionStorage.removeItem("treso_cle"); location.reload(); });
  $("btn-edition").addEventListener("click", async function () {
    if (EDIT) { EDIT = null; majEdition(); return; }
    var code = prompt("Code d'édition (Olivier) :");
    if (!code) return;
    try { EDIT = await Coffre.ouvrirEdition(KEYS, code); majEdition(); }
    catch (e) { alert("Code d'édition incorrect."); }
  });
  function majEdition() {
    $("chip-edition").classList.toggle("hidden", !EDIT);
    $("btn-edition").textContent = EDIT ? "Quitter l'édition" : "Mode édition";
    if (VUE === "pilotage") afficher();
  }
  document.querySelectorAll("nav.onglets button").forEach(function (b) {
    b.addEventListener("click", function () {
      VUE = b.dataset.vue;
      document.querySelectorAll("nav.onglets button").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
      afficher(); window.scrollTo(0, 0);
    });
  });

  // ------------------------------------------------------------------ outils
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  var JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  function dateLongue(iso) { if (!iso) return ""; var d = new Date(iso + "T12:00:00"); return JOURS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()] + " " + d.getFullYear(); }
  function kpi(lab) { var k = (DATA.kpis || []).find(function (x) { return x.label.indexOf(lab) === 0; }); return k || {}; }
  function ligne(sheet, lab) { return (DATA.sheets[sheet] || []).find(function (r) { return r.label.indexOf(lab) === 0; }); }
  function carteKpi(lab, val, sub, est, chip) {
    return '<div class="carte kpi"><div class="lab">' + esc(lab) + '</div><div class="val' + (est ? " est" : "") + '">' + val + '</div>' + (sub ? '<div class="sub">' + sub + "</div>" : "") + (chip || "") + "</div>";
  }
  function liste(arr) { return arr && arr.length ? '<ul class="liste">' + arr.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : '<p class="muted small">Rien à signaler.</p>'; }

  // graphique : barres de trésorerie fin de mois (réalisé plein, estimé en pointillés) et ligne du plancher
  function graphTreso(keys, vals, statuts, plancher, labels) {
    var W = 1100, H = 260, pl = 64, pr = 10, pt = 14, pb = 28, n = keys.length;
    var max = Math.max.apply(null, vals.concat([plancher || 0])) * 1.08, min = Math.min(0, Math.min.apply(null, vals));
    var y = function (v) { return pt + (H - pt - pb) * (1 - (v - min) / (max - min)); };
    var bw = (W - pl - pr) / n, s = '<svg class="graph" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Trésorerie en fin de mois">';
    for (var g = 0; g <= 4; g++) { var gv = min + (max - min) * g / 4, gy = y(gv); s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + gy + '" y2="' + gy + '" stroke="#e2e8f0"/><text x="' + (pl - 6) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="#64748b">' + keur(gv) + "</text>"; }
    vals.forEach(function (v, i) {
      var x = pl + i * bw + bw * 0.15, w = bw * 0.7, y0 = y(Math.max(0, v)), h = Math.abs(y(v) - y(0)), est = statuts[i] !== "Réalisé";
      s += '<rect x="' + x + '" y="' + y0 + '" width="' + w + '" height="' + Math.max(1, h) + '" rx="2" fill="' + (est ? "#eef2ff" : "#4f46e5") + '" stroke="' + (est ? "#4f46e5" : "none") + '" stroke-dasharray="' + (est ? "3 2" : "") + '"><title>' + esc(labels[i]) + " : " + eur(v) + (est ? " (e)" : "") + "</title></rect>";
      if (i % Math.ceil(n / 14) === 0) s += '<text x="' + (x + w / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#64748b">' + esc(labels[i]) + "</text>";
    });
    if (plancher) { var py = y(plancher); s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + py + '" y2="' + py + '" stroke="#e11d48" stroke-dasharray="6 4" stroke-width="1.5"/><text x="' + (pl + 6) + '" y="' + (py - 5) + '" text-anchor="start" font-size="11" fill="#be123c">plancher ' + keur(plancher) + "</text>"; }
    return s + "</svg>";
  }

  // ------------------------------------------------------------------ vues
  function afficher() {
    var v = $("vue");
    if (VUE === "ensemble") v.innerHTML = vueEnsemble();
    else if (VUE === "pilotage") { v.innerHTML = vuePilotage(); brancherPilotage(); }
    else if (VUE === "tresorerie") { v.innerHTML = vueGrille("tresorerie", "Trésorerie mensuelle", "Encaissements et décaissements par rubrique (cliquer pour ouvrir les sous-rubriques), du réalisé Qonto au BP. Le détail ligne à ligne (salariés, formateurs) reste dans l'Excel."); brancherGrille("tresorerie"); }
    else if (VUE === "cr") { v.innerHTML = vueGrille("cr", "Compte de résultat", "Chiffre d'affaires facturé, charges, EBITDA et résultat, mois par mois ; prévisionnel à partir du mois en cours."); brancherGrille("cr"); }
    else if (VUE === "bp") { v.innerHTML = vueGrille("bp", "BP : volumes, ventes, encaissements", "Le moteur du prévisionnel : sessions, apprenants, chiffre d'affaires, encaissements avec délais, charges variables (masse salariale nominative exclue)."); brancherGrille("bp"); }
    else if (VUE === "synthese") { v.innerHTML = vueGrille("synthese", "Synthèse", "Les agrégats du classeur, mois par mois, avec cumuls par trimestre et par année."); brancherGrille("synthese"); }
    else if (VUE === "bilan") v.innerHTML = vueBilan();
  }

  function vueEnsemble() {
    var D = DATA, h = "";
    h += '<h1 class="page">Vue d\'ensemble</h1><p class="contrat">Où en est la trésorerie, où elle va, et ce qu\'il faut trancher. Données arrêtées au ' + esc(dateLongue(D.meta.arrete)) + '.</p>';
    if (D.meta.controles && D.meta.controles !== "OK") h += '<div class="bandeau warn">Contrôles du classeur : ' + esc(D.meta.controles) + " ; les chiffres sont à vérifier.</div>";
    var pb = kpi("Point bas"), pl = kpi("Plancher"), cap = kpi("Dépense nette"), ver = kpi("Verdict");
    var ok = typeof pb.value === "number" && typeof pl.value === "number" ? pb.value >= pl.value : null;
    var cur = (D.kpis || []).find(function (k) { return /^Trésorerie fin .* \(e\)$/.test(k.label) && k.label.indexOf("décembre") < 0; }) || {};
    var real = (D.kpis || []).find(function (k) { return /\(réalisé\)$/.test(k.label); }) || {};
    h += '<div class="grille g4">' +
      carteKpi("Solde Qonto", eur(kpi("Solde Qonto").value), "au " + esc(dateLongue(D.meta.arrete))) +
      carteKpi(cur.label ? cur.label.replace("Trésorerie fin ", "Fin ").replace(" (e)", "") + " (e)" : "Fin du mois (e)", eur(cur.value), real.label ? esc(real.label.replace("Trésorerie fin ", "fin ").replace(" (réalisé)", "")) + " (réalisé) : " + eur(real.value) : "", true) +
      carteKpi("Fin décembre 2026 (e)", eur(kpi("Trésorerie fin décembre 2026").value), "fin 2027 (e) : " + eur(kpi("Trésorerie fin décembre 2027").value), true) +
      carteKpi("Point bas prévu (e)", eur(pb.value), esc(pb.repere || "") + " · plancher " + eur(pl.value), true, ok == null ? "" : '<div style="margin-top:8px"><span class="chip ' + (ok ? "ok" : "ko") + '">' + (ok ? "Au-dessus du plancher" : "Sous le plancher") + "</span></div>") + "</div>";
    h += '<div class="grille g4" style="margin-top:14px">' +
      carteKpi("Capacité de dépense en plus", eur(cap.value) + '<span class="small muted"> / mois</span>', "recrutements ou ads, sans passer sous le plancher", true) +
      carteKpi("CA facturé 2026 (e)", eur(kpi("CA facturé 2026").value), "2027 (e) : " + eur(kpi("CA facturé 2026").repere), true) +
      carteKpi("EBITDA 2026 (e)", eur(kpi("EBITDA 2026").value), "2027 (e) : " + eur(kpi("EBITDA 2026").repere), true) +
      carteKpi("CPF en attente de la CDC", eur(kpi("CPF : encours").value), nb(kpi("CPF : encours").repere) + " dossiers facturés (Wedof)") + "</div>";
    var tr = ligne("synthese", "Trésorerie en fin de mois");
    if (tr) {
      var ks = D.months.map(function (m) { return m.key; }).filter(function (k) { return tr.v[k] != null && k >= "2026-01"; });
      var st = {}; D.months.forEach(function (m) { st[m.key] = m.statut; });
      h += '<div class="carte section"><h2>Trésorerie en fin de mois</h2>' + graphTreso(ks, ks.map(function (k) { return tr.v[k]; }), ks.map(function (k) { return st[k]; }), pl.value, ks.map(function (k) { var m = D.months.find(function (x) { return x.key === k; }); return m ? m.label : k; })) +
        '<div class="legende"><span><i style="background:#4f46e5"></i>réalisé (Qonto)</span><span><i style="background:#eef2ff;border:1px dashed #4f46e5"></i>estimé (BP)</span><span><i style="background:#e11d48;height:2px"></i>plancher</span></div></div>';
    }
    var T = D.textes || {};
    h += '<div class="grille g2 section"><div class="carte"><h2>Lecture</h2>' + liste(T.interpretation) + '</div><div class="carte"><h2>Points à trancher</h2>' + liste(T.points) + "</div></div>";
    h += '<div class="grille g2 section"><div class="carte"><h2>Actions proposées</h2>' + liste(T.cr_actions) + '</div><div class="carte"><h2>Questions en attente</h2>' + liste(T.cr_questions) + "</div></div>";
    var dg = D.digest || {};
    if (dg.arrete && dg.qonto) {
      var q = dg.qonto, fa = dg.factures || {}, w = dg.wedof || {}, pr = q.principaux || [];
      var em = fa.emises || {}, pa = fa.payees || {}, ec = fa.echues || {};
      var cpf = [["acceptes", "acceptés"], ["service_fait", "services faits"], ["factures", "facturés"], ["payes", "payés CDC"]].filter(function (x) { return (w[x[0]] || {}).nb; })
        .map(function (x) { return w[x[0]].nb + " " + x[1] + " (" + keur(w[x[0]].montant) + ")"; }).join(", ");
      h += '<div class="carte section"><h2>Depuis le ' + esc(dateLongue(dg.depuis)) + "</h2>";
      h += '<p class="small muted" style="margin:0 0 10px">Qonto : ' + eur(q.encaissements) + " encaissés, " + eur(q.decaissements) + " décaissés (" + nb(q.nb) + " opérations)." + "</p>";
      h += '<div class="grille g3">';
      h += '<div><h3>Encaissements notables</h3>' + mvt(pr.filter(function (x) { return x.montant > 0; })) + "</div>";
      h += '<div><h3>Décaissements notables</h3>' + mvt(pr.filter(function (x) { return x.montant < 0; })) + "</div>";
      h += '<div><h3>Factures et CPF</h3><ul class="liste small"><li>' + nb(em.nb || 0) + " émises (" + keur(em.ht) + " HT)</li><li>" + nb(pa.nb || 0) + " réglées (" + keur(pa.ttc) + " TTC)</li><li>échues hors CPF : " + nb(ec.nb || 0) + " (" + keur(ec.ttc) + ")" + (ec.plus_60j_nb ? ", dont " + ec.plus_60j_nb + " à plus de 60 jours" : "") + "</li><li>CPF : " + (cpf || "rien de nouveau") + "</li></ul></div>";
      h += "</div></div>";
    }
    var sl = (D.slack && D.slack.evenements) || [];
    if (sl.length) h += '<div class="carte section"><h2>Équipe : recrutements, arrivées, départs (Slack)</h2><ul class="liste">' + sl.slice(0, 12).map(function (e) { return "<li><strong>" + esc(e.date || "") + "</strong> · " + esc(e.type || "") + " : " + esc(e.resume || "") + "</li>"; }).join("") + "</ul></div>";
    return h;
  }
  function mvt(arr) {
    if (!arr || !arr.length) return '<p class="muted small">Aucun.</p>';
    return '<ul class="liste small">' + arr.slice(0, 8).map(function (x) { return "<li>" + esc(x.date ? x.date.slice(8, 10) + "/" + x.date.slice(5, 7) : "") + " · " + esc(x.libelle) + " : <strong class=\"num\">" + eur(x.montant) + "</strong></li>"; }).join("") + "</ul>";
  }

  // ---- grilles mensuelles (Trésorerie, CR, BP, Synthèse)
  function periodes() {
    var ms = DATA.months, out = [];
    if (PERIODE === "mois") return ms.map(function (m) { return { cle: m.key, lab: m.label, mois: [m.key], est: m.statut !== "Réalisé" }; });
    var by = {};
    ms.forEach(function (m) {
      var y = m.key.slice(0, 4), mo = +m.key.slice(5, 7);
      var c = PERIODE === "annee" ? y : PERIODE === "trimestre" ? y + "-T" + Math.ceil(mo / 3) : y + "-S" + (mo <= 6 ? 1 : 2);
      if (!by[c]) { by[c] = { cle: c, lab: PERIODE === "annee" ? y : (PERIODE === "trimestre" ? "T" + Math.ceil(mo / 3) : "S" + (mo <= 6 ? 1 : 2)) + " " + y.slice(2), mois: [], est: false }; out.push(by[c]); }
      by[c].mois.push(m.key); if (m.statut !== "Réalisé") by[c].est = true;
    });
    return out;
  }
  function agreger(row, p) {
    var vals = p.mois.map(function (k) { return row.v[k]; }).filter(function (x) { return typeof x === "number"; });
    if (!vals.length) return null;
    var l = row.label.toLowerCase();
    if (/fin de mois|fin de période|en fin de|solde|trésorerie fin/.test(l)) return p.mois.map(function (k) { return row.v[k]; }).filter(function (x) { return typeof x === "number"; }).slice(-1)[0];
    if (/début de mois/.test(l)) return vals[0];
    if ((row.nf || "").indexOf("%") >= 0 || /par session|apprenants par|taux|marge d'ebitda/.test(l)) return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    return vals.reduce(function (a, b) { return a + b; }, 0);
  }
  function vueGrille(sheet, titre, contrat) {
    var rows = DATA.sheets[sheet] || [], ps = periodes(), h = "";
    h += '<h1 class="page">' + esc(titre) + '</h1><p class="contrat">' + esc(contrat) + "</p>";
    h += '<div class="outils"><div class="seg" role="group" aria-label="Période">' + [["mois", "Mois"], ["trimestre", "Trimestres"], ["semestre", "Semestres"], ["annee", "Années"]].map(function (x) { return '<button type="button" data-p="' + x[0] + '" aria-pressed="' + (PERIODE === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>" +
      (sheet === "tresorerie" ? '<button class="btn" type="button" id="tout-ouvrir">Tout ouvrir</button><button class="btn" type="button" id="tout-fermer">Tout fermer</button>' : "") + "</div>";
    h += '<div class="tab-wrap" id="grille"><table class="t"><thead><tr><th>' + (sheet === "tresorerie" ? "Rubrique" : "Ligne") + "</th>" + ps.map(function (p) { return '<th class="' + (p.est ? "est" : "") + '">' + esc(p.lab) + "</th>"; }).join("") + "</tr></thead><tbody>";
    var rubOuverte = true, rubId = 0;
    rows.forEach(function (r) {
      if (r.band) { h += '<tr class="band"><td>' + esc(r.label) + '</td><td colspan="' + ps.length + '"></td></tr>'; return; }
      var cls = [];
      if (sheet === "tresorerie") {
        if (r.level === 1) { rubId++; rubOuverte = !!OUVERTS[r.label]; cls.push("clic"); if (rubOuverte) cls.push("ouvert"); }
        else if (r.level === 2) { if (!rubOuverte) return; cls.push("niv2"); }
        else if (r.bold) cls.push("total");
      } else if (r.bold) cls.push("gras");
      if (/^(total|trésorerie en fin|flux net|ebitda|résultat net|chiffre d'affaires facturé)/i.test(r.label)) cls.push("total");
      h += '<tr class="' + cls.join(" ") + '"' + (r.level === 1 ? ' data-rub="' + esc(r.label) + '"' : "") + "><td>" + esc(r.label) + "</td>";
      ps.forEach(function (p) {
        var v = agreger(r, p);
        h += '<td class="' + (p.est ? "est " : "") + (typeof v === "number" && v < 0 && /flux net|trésorerie en fin|ebitda|résultat/i.test(r.label) ? "neg" : "") + '">' + (v == null ? "" : parNf(v, r.nf)) + "</td>";
      });
      h += "</tr>";
    });
    return h + "</tbody></table></div>";
  }
  function brancherGrille(sheet) {
    document.querySelectorAll(".seg button").forEach(function (b) { b.addEventListener("click", function () { PERIODE = b.dataset.p; afficher(); }); });
    document.querySelectorAll("tr.clic").forEach(function (tr) { tr.addEventListener("click", function () { var k = tr.dataset.rub; OUVERTS[k] = !OUVERTS[k]; afficher(); }); });
    var to = $("tout-ouvrir"), tf = $("tout-fermer");
    if (to) to.addEventListener("click", function () { (DATA.sheets.tresorerie || []).forEach(function (r) { if (r.level === 1) OUVERTS[r.label] = true; }); afficher(); });
    if (tf) tf.addEventListener("click", function () { OUVERTS = {}; afficher(); });
    // ouvre la grille sur les derniers mois réalisés
    var g = $("grille"); if (g && PERIODE === "mois") { var i = DATA.months.findIndex(function (m) { return m.statut !== "Réalisé"; }); g.scrollLeft = Math.max(0, (i - 4) * 88); }
  }
  function vueBilan() {
    var B = DATA.bilan, h = '<h1 class="page">Bilan</h1><p class="contrat">Liasse 2024-2025 au 31/12/2025, puis bilan de gestion reconstitué à la fin du dernier mois réalisé, à fin 2026 et fin 2027 (estimés).</p>';
    h += '<div class="tab-wrap"><table class="t"><thead><tr><th>Poste</th>' + B.cols.map(function (c, i) { return '<th class="' + (i >= 2 ? "est" : "") + '">' + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>";
    B.rows.forEach(function (r) {
      var vide = r.v.every(function (x) { return x == null; });
      if (vide) { h += '<tr class="band"><td colspan="5">' + esc(r.label) + "</td></tr>"; return; }
      h += '<tr class="' + (r.bold ? "total" : "") + '"><td title="' + esc(r.note || "") + '">' + esc(r.label) + "</td>" + r.v.map(function (x, i) { return '<td class="' + (i >= 2 ? "est" : "") + '">' + (typeof x === "number" ? eur(x) : esc(x || "")) + "</td>"; }).join("") + "</tr>";
    });
    return h + "</tbody></table></div>";
  }

  // ---- Pilotage
  function pilInit() {
    var p = DATA.pilotage, params = {};
    p.params.forEach(function (x) { params[x.name] = x.retenu; });
    SIM = { params: params, decisions: p.decisions.map(function (d) { return { libelle: d.libelle || "", type: d.type || "", quantite: d.quantite, arrivee: d.arrivee || "", cout: typeof d.cout === "number" ? d.cout : null, retenue: d.retenue || "Non" }; }), modifie: false };
  }
  function pilCalc() {
    var p = DATA.pilotage;
    return Engine.run({ params: SIM.params, months: p.months, labels: p.labels, fc: Math.max(0, p.months.indexOf(p.fc_first)), base: p.base, hyp: p.hyp, decisions: SIM.decisions });
  }
  function vuePilotage() {
    if (!SIM) pilInit();
    var p = DATA.pilotage, R = pilCalc(), T = R.top, h = "";
    h += '<h1 class="page">Pilotage</h1><p class="contrat">Peut-on recruter (closers, setters, formateurs CDI, autres salariés) ou mettre plus en ads, et à partir de quand, sans passer sous le plancher de trésorerie ? L\'équation est celle de la page Scaling du data dashboard ; modifiez une décision ou un paramètre pour simuler, tout se recalcule ici comme dans l\'Excel.</p>';
    if (SIM.modifie) h += '<div class="bandeau info">Simulation en cours : ces chiffres ne sont pas encore dans l\'Excel.' + (EDIT ? " Enregistrez pour les reprendre cette nuit." : " Seul Olivier peut les enregistrer (mode édition).") + "</div>";
    var ok = T.a_pb >= T.a_plancher;
    h += '<div class="grille g4">' +
      carteKpi("Point bas prévu (e)", eur(T.a_pb), esc(T.a_pb_mois) + " · plancher " + eur(T.a_plancher), true, '<div style="margin-top:8px"><span class="chip ' + (ok ? "ok" : "ko") + '">' + (ok ? "Au-dessus du plancher" : "Sous le plancher") + "</span></div>") +
      carteKpi("Dépense en plus supportable", eur(T.a_capx) + '<span class="small muted"> / mois</span>', "dès le mois prochain, sans compter les ventes rapportées", true) +
      carteKpi("Marge par euro d'ads (à terme)", NF1.format(T.a_rend).replace(/ /g, " ") + " €", "si les closers et setters suivent") +
      carteKpi("Ads : nécessaire / prévu", keur(T.a_adsreq) + " / " + keur(T.a_ads), "moyenne mensuelle jusqu'à déc. 2027", true) + "</div>";
    h += '<div class="carte section"><h2>Recommandations</h2><ul class="liste">' + ["a_reco_clo", "a_reco_set", "a_reco_form", "a_reco_salles", "a_reco_ads"].map(function (k) { return "<li>" + esc(T[k]) + "</li>"; }).join("") + "</ul></div>";
    // décisions
    var types = ["", "Closer", "Setter", "Formateur CDI", "Salarié", "Ads"];
    h += '<div class="section"><h2>Décisions à tester</h2><p class="contrat">Quantité = nombre de personnes, ou euros par mois pour Ads. Coût vide = coût par défaut du type. « Retenue : Oui » intègre la décision au BP et à la trésorerie.</p>';
    h += '<div class="tab-wrap"><table class="t dec-table"><thead><tr><th>Décision</th><th>Type</th><th>Quantité</th><th>Arrivée</th><th>Coût / mois</th><th>Retenue</th><th class="res">Verdict prudent</th><th class="res">Avec retour</th><th class="res">Point bas</th><th class="res">Coût / mois en régime</th><th class="res">Retour / mois</th><th class="res">Au plus tôt</th></tr></thead><tbody>';
    SIM.decisions.forEach(function (d, i) {
      var r = R.results[i];
      var vc = function (v) { return v ? '<span class="verdict ' + (v.indexOf("OUI") === 0 ? "ok" : "ko") + '">' + esc(v) + "</span>" : ""; };
      h += "<tr><td><input class=\"champ\" style=\"width:168px\" data-i=\"" + i + "\" data-k=\"libelle\" value=\"" + esc(d.libelle) + "\" placeholder=\"Libellé\"></td>" +
        '<td><select class="champ" style="width:112px" data-i="' + i + '" data-k="type">' + types.map(function (t) { return '<option value="' + t + '"' + (d.type === t ? " selected" : "") + ">" + (t || "(vide)") + "</option>"; }).join("") + "</select></td>" +
        '<td><input class="champ num" style="width:64px" data-i="' + i + '" data-k="quantite" inputmode="decimal" value="' + (d.quantite == null ? "" : d.quantite) + '"></td>' +
        '<td><select class="champ" style="width:88px" data-i="' + i + '" data-k="arrivee"><option value=""></option>' + p.months.map(function (m, j) { return '<option value="' + m + '"' + (d.arrivee === m ? " selected" : "") + ">" + esc(p.labels[j]) + "</option>"; }).join("") + "</select></td>" +
        '<td><input class="champ num" style="width:70px" data-i="' + i + '" data-k="cout" inputmode="decimal" placeholder="défaut" value="' + (d.cout == null ? "" : d.cout) + '"></td>' +
        '<td><select class="champ" style="width:62px" data-i="' + i + '" data-k="retenue"><option' + (d.retenue === "Non" ? " selected" : "") + ">Non</option><option" + (d.retenue === "Oui" ? " selected" : "") + ">Oui</option></select></td>" +
        "<td>" + (r ? vc(r.verdict) : "") + "</td><td>" + (r ? vc(r.verdict_retour) : "") + "</td><td>" + (r ? eur(r.point_bas) : "") + "</td><td>" + (r ? eur(r.cout_regime) : "") + "</td><td>" + (r ? eur(r.retour_regime) : "") + "</td><td>" + (r ? esc(r.au_plus_tot) : "") + "</td></tr>";
    });
    h += "</tbody></table></div>" + '<div class="outils" style="margin-top:10px"><button class="btn" type="button" id="ajout-dec">Ajouter une ligne</button></div></div>';
    // équation du mois
    var C = R.chain, L = p.labels;
    var lignes = [["Budget ads (BP + retenues)", C.ch_ads, eur], ["Ventes que les ads peuvent produire", C.ch_ventes_ads, nb], ["Ventes visées par le BP", C.ch_ventes_bp, nb], ["Budget ads nécessaire", C.ch_ads_req, eur],
      ["Setters disponibles / nécessaires", C.ch_set_dispo.map(function (x, j) { return nb(x) + " / " + nb(C.ch_set_req[j]); }), null], ["Closers disponibles / nécessaires", C.ch_clo_dispo.map(function (x, j) { return nb(x) + " / " + nb(C.ch_clo_req[j]); }), null],
      ["Formateurs disponibles / nécessaires", C.ch_form_dispo.map(function (x, j) { return nb(x) + " / " + nb(C.ch_form_req[j]); }), null], ["Sessions par semaine (parc " + nb(SIM.params.parc_sem) + ")", C.ch_salles, function (x) { return nb(x, 1); }],
      ["Premier levier en manque", C.ch_limit, null], ["Trésorerie fin de mois avec les décisions retenues", R.treso, eur], ["Trésorerie sans les décisions retenues", R.hors, eur], ["Dépense en plus supportable si départ ce mois", R.capx, eur]];
    h += '<div class="section"><h2>Équation du mois</h2><div class="tab-wrap"><table class="t"><thead><tr><th>Ligne</th>' + L.map(function (l) { return "<th>" + esc(l) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      lignes.map(function (lg) { return "<tr><td>" + esc(lg[0]) + "</td>" + lg[1].map(function (x) { return "<td>" + (lg[2] ? lg[2](x) : esc(x)) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div></div>";
    // paramètres
    h += '<div class="section"><h2>Paramètres</h2><p class="contrat">Valeurs retenues dans l\'Excel ; « Mesuré » vient des données (Qonto, ventes, paie). Modifiez pour simuler.</p><div class="tab-wrap"><table class="t"><thead><tr><th>Paramètre</th><th>Retenu</th><th>Mesuré</th><th style="text-align:left">Source</th></tr></thead><tbody>';
    p.params.forEach(function (x) {
      var val = SIM.params[x.name], mod = x.input && val !== x.retenu;
      h += "<tr><td>" + esc(x.label) + "</td><td>" + (x.input ? '<input class="champ num' + (mod ? " modifie" : "") + '" style="width:120px" data-p="' + x.name + '" inputmode="decimal" value="' + (typeof val === "number" ? (String(x.nf || "").indexOf("%") >= 0 ? +(val * 100).toFixed(2) : val) : "") + '"' + (String(x.nf || "").indexOf("%") >= 0 ? ' title="en %"' : "") + '> <span class="small muted">' + esc(String(x.nf || "").indexOf("%") >= 0 ? "%" : (x.unit || "")) + "</span>" : parNf(R.P[x.name], x.nf)) + "</td><td>" + parNf(x.mesure, x.nf) + '</td><td style="text-align:left;white-space:normal;min-width:280px" class="small muted">' + esc(x.src || "") + "</td></tr>";
    });
    h += "</tbody></table></div></div>";
    if (SIM.modifie) h += '<div class="sim-barre"><span>Simulation non enregistrée</span><span><button class="btn" type="button" id="sim-annuler">Revenir à l\'Excel</button> ' + (EDIT ? '<button class="btn" type="button" id="sim-enregistrer">Enregistrer dans l\'Excel</button>' : "") + "</span></div>";
    return h;
  }
  function brancherPilotage() {
    document.querySelectorAll("[data-i]").forEach(function (el) {
      el.addEventListener("change", function () {
        var d = SIM.decisions[+el.dataset.i], k = el.dataset.k, v = el.value;
        if (k === "quantite" || k === "cout") { v = v.replace(/\s/g, "").replace(",", "."); d[k] = v === "" ? null : +v; }
        else d[k] = v;
        SIM.modifie = true; afficher();
      });
    });
    document.querySelectorAll("[data-p]").forEach(function (el) {
      el.addEventListener("change", function () {
        var x = DATA.pilotage.params.find(function (q) { return q.name === el.dataset.p; });
        var v = +(el.value.replace(/\s/g, "").replace(",", "."));
        if (!isFinite(v)) return;
        if (String(x.nf || "").indexOf("%") >= 0) v = v / 100;
        SIM.params[x.name] = v; SIM.modifie = true; afficher();
      });
    });
    var a = $("ajout-dec"); if (a) a.addEventListener("click", function () { SIM.decisions.push({ libelle: "", type: "", quantite: null, arrivee: "", cout: null, retenue: "Non" }); afficher(); });
    var an = $("sim-annuler"); if (an) an.addEventListener("click", function () { SIM = null; afficher(); });
    var en = $("sim-enregistrer"); if (en) en.addEventListener("click", enregistrer);
  }
  async function enregistrer() {
    if (!EDIT) return;
    var p = DATA.pilotage, modifs = {};
    p.params.forEach(function (x) { if (x.input && SIM.params[x.name] !== x.retenu) modifs[x.name] = SIM.params[x.name]; });
    var message = JSON.stringify({ ts: new Date().toISOString(), base_arrete: DATA.meta.arrete, pilotage: modifs, decisions: SIM.decisions });
    try {
      var signature = await Coffre.signer(EDIT, message);
      var r = await fetch(CFG.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "pilotage", message: message, signature: signature }) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      alert("Enregistré : vos décisions et paramètres seront repris dans l'Excel lors de la mise à jour de cette nuit.");
    } catch (e) { alert("Envoi impossible (" + e.message + "). Réessayez."); }
  }
  demarrer();
})();
