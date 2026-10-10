/* Moteur du Pilotage : reproduit à l'identique les formules de l'onglet Pilotage du classeur
   « Trésorerie France IA » (build/model.py, sheet_pilotage) pour simuler dans le navigateur.
   Entrées : paramètres (section B), décisions (section E), séries de base exportées du classeur.
   Différence assumée : l'effet d'une décision sur l'impôt 2026 n'est pas recalculé ici (il l'est la nuit dans l'Excel). */
(function (root) {
  "use strict";
  var TYPES = ["Closer", "Setter", "Formateur CDI", "Salarié", "Ads"];
  function n(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
  function minArr(a, from) { var m = Infinity; for (var i = from || 0; i < a.length; i++) if (a[i] < m) m = a[i]; return m; }
  function zeros(N) { var a = new Array(N); for (var i = 0; i < N; i++) a[i] = 0; return a; }

  function derive(P) {
    var q = Object.assign({}, P);
    q.conv = n(P.taux_rdv) * n(P.taux_showup) * n(P.taux_closing);
    q.cap_closer = n(P.ventes_closer);
    q.cap_setter = n(P.ventes_setter);
    q.cout_vente_ads = q.conv ? n(P.cpl) / q.conv : 0;
    q.rendement_ads = q.cout_vente_ads ? n(P.panier) * (n(P.marge) - n(P.commission)) / q.cout_vente_ads : 0;
    return q;
  }

  function coutDefaut(P, t) {
    return t === "Closer" ? n(P.cout_closer) : t === "Setter" ? n(P.cout_setter) : t === "Formateur CDI" ? n(P.cout_form_cdi) : t === "Salarié" ? n(P.cout_salarie) : 0;
  }
  function ramp(P, t) { return (t === "Closer" || t === "Setter") ? n(P.delai_com) : t === "Formateur CDI" ? n(P.delai_form) : 0; }

  /* months : clés aaaa-mm (mois en cours -> déc. 2027) ; fc : index du mois prochain ; base : séries ;
     hyp : {tjm, jours_session} ; decisions : [{libelle,type,quantite,arrivee,cout,retenue}] */
  function run(input) {
    var P = derive(input.params), M = input.months, N = M.length, fc = input.fc || 0, B = input.base, H = input.hyp || {};
    var tjm = n(H.tjm), jours = n(H.jours_session);
    var D = (input.decisions || []).map(function (d) {
      var t = d && d.type && TYPES.indexOf(d.type) >= 0 ? d.type : "";
      var a = d && d.arrivee ? String(d.arrivee) : "";
      var o = { type: t, q: n(d && d.quantite), arr: a, cu: (d && typeof d.cout === "number") ? d.cout : coutDefaut(P, t), R: !!(d && d.retenue === "Oui"),
                act: zeros(N), prod: zeros(N), cost: zeros(N), eco: zeros(N) };
      var rp = ramp(P, t), cum = 0;
      for (var j = 0; j < N; j++) {
        o.act[j] = (!t || !a) ? 0 : (M[j] >= a ? 1 : 0);
        cum += o.act[j];
        o.prod[j] = o.act[j] === 0 ? 0 : (cum > rp ? 1 : 0);
        o.cost[j] = o.act[j] * (t === "Ads" ? o.q : o.q * o.cu);
        o.eco[j] = t === "Formateur CDI" ? o.prod[j] * Math.min(o.q * n(P.sess_cdi_mois), n(B.free_sess[j])) * tjm * jours : 0;
      }
      return o;
    });
    var A = { ads: zeros(N), closers: zeros(N), setters: zeros(N), cdi: zeros(N) };
    D.forEach(function (o) { if (!o.R) return; for (var j = 0; j < N; j++) {
      if (o.type === "Ads") A.ads[j] += o.cost[j];
      if (o.type === "Closer") A.closers[j] += o.prod[j] * o.q;
      if (o.type === "Setter") A.setters[j] += o.prod[j] * o.q;
      if (o.type === "Formateur CDI") A.cdi[j] += o.prod[j] * o.q; } });
    // ---- C. équation du mois
    var C = {};
    ["ch_ads","ch_leads","ch_rdv","ch_hon","ch_ventes_ads","ch_ventes_bp","ch_ads_req","ch_ads_gap","ch_set_dispo","ch_set_req","ch_set_gap","ch_clo_dispo","ch_clo_req","ch_clo_gap",
     "ch_sessions","ch_free_sess","ch_form_dispo","ch_form_req","ch_form_gap","ch_salles","ch_salles_gap"].forEach(function (k) { C[k] = zeros(N); });
    C.ch_limit = new Array(N);
    function ru(x) { return x > 0 ? Math.ceil(x - 1e-9) : 0; }
    for (var j = 0; j < N; j++) {
      C.ch_ads[j] = n(B.ads_bp[j]) + A.ads[j];
      C.ch_leads[j] = P.cpl ? C.ch_ads[j] / P.cpl : 0;
      C.ch_rdv[j] = C.ch_leads[j] * n(P.taux_rdv);
      C.ch_hon[j] = C.ch_rdv[j] * n(P.taux_showup);
      C.ch_ventes_ads[j] = C.ch_hon[j] * n(P.taux_closing);
      C.ch_ventes_bp[j] = P.panier ? n(B.ventes_bp[j]) / P.panier : 0;
      C.ch_ads_req[j] = C.ch_ventes_bp[j] * P.cout_vente_ads;
      C.ch_ads_gap[j] = C.ch_ads_req[j] - C.ch_ads[j];
      C.ch_set_dispo[j] = n(P.setters_act) + A.setters[j];
      C.ch_set_req[j] = P.cap_setter ? ru(C.ch_ventes_bp[j] / P.cap_setter) : 0;
      C.ch_set_gap[j] = Math.max(0, C.ch_set_req[j] - C.ch_set_dispo[j]);
      C.ch_clo_dispo[j] = n(P.closers_act) + A.closers[j];
      C.ch_clo_req[j] = P.cap_closer ? ru(C.ch_ventes_bp[j] / P.cap_closer) : 0;
      C.ch_clo_gap[j] = Math.max(0, C.ch_clo_req[j] - C.ch_clo_dispo[j]);
      C.ch_sessions[j] = n(B.sessions[j]); C.ch_free_sess[j] = n(B.free_sess[j]);
      C.ch_form_dispo[j] = n(P.form_free_act) + n(P.form_cdi_act) + A.cdi[j];
      C.ch_form_req[j] = P.sess_form_mois ? ru(C.ch_sessions[j] / P.sess_form_mois) : 0;
      C.ch_form_gap[j] = Math.max(0, C.ch_form_req[j] - C.ch_form_dispo[j]);
      C.ch_salles[j] = C.ch_sessions[j] * 12 / 52;
      C.ch_salles_gap[j] = Math.max(0, C.ch_salles[j] - n(P.parc_sem));
      C.ch_limit[j] = C.ch_ads_gap[j] > 0 ? "Ads" : C.ch_set_gap[j] > 0 ? "Setters" : C.ch_clo_gap[j] > 0 ? "Closers" : C.ch_form_gap[j] > 0 ? "Formateurs" : C.ch_salles_gap[j] > 0 ? "Salles" : "Aucun";
    }
    // ---- G. décisions : ventes additionnelles et effets
    var de = P.delai_enc | 0;
    D.forEach(function (o) {
      o.dv = zeros(N); o.dca = zeros(N); o.enc = zeros(N); o.gain = zeros(N); o.netp = zeros(N); o.neta = zeros(N); o.cump = zeros(N); o.cuma = zeros(N);
      var cp = 0, ca = 0;
      for (var j = 0; j < N; j++) {
        var dex = C.ch_ventes_ads[j] - ((o.R && o.type === "Ads") ? o.act[j] * o.q * P.conv / P.cpl : 0);
        var cex = (C.ch_clo_dispo[j] - ((o.R && o.type === "Closer") ? o.prod[j] * o.q : 0)) * P.cap_closer;
        var sex = (C.ch_set_dispo[j] - ((o.R && o.type === "Setter") ? o.prod[j] * o.q : 0)) * P.cap_setter;
        var base = Math.min(dex, cex, sex), avec = base;
        if (o.type === "Ads") avec = Math.min(dex + o.q * P.conv / P.cpl, cex, sex);
        else if (o.type === "Closer") avec = Math.min(dex, cex + o.q * P.cap_closer, sex);
        else if (o.type === "Setter") avec = Math.min(dex, cex, sex + o.q * P.cap_setter);
        o.dv[j] = o.prod[j] * (avec - base);
        o.dca[j] = o.dv[j] * n(P.panier);
      }
      for (j = 0; j < N; j++) {
        o.enc[j] = (j + 1 - de < 1) ? 0 : o.dca[j - de];
        o.gain[j] = o.enc[j] * (n(P.marge) - n(P.commission));
        o.netp[j] = o.eco[j] - o.cost[j];
        o.neta[j] = o.netp[j] + o.gain[j];
        cp += o.netp[j]; ca += o.neta[j]; o.cump[j] = cp; o.cuma[j] = ca;
      }
    });
    // ---- H. agrégats des décisions retenues ; D. trésorerie et capacité
    var G = { agg_cost_sal: zeros(N), agg_ads: A.ads.slice(), agg_eco: zeros(N), agg_dca: zeros(N), agg_enc: zeros(N), agg_var: zeros(N), agg_var_cr: zeros(N),
              agg_closers: A.closers, agg_setters: A.setters, agg_cdi: A.cdi, agg_cuma: zeros(N) };
    D.forEach(function (o) { if (!o.R) return; for (var j = 0; j < N; j++) {
      if (o.type !== "Ads") G.agg_cost_sal[j] += o.cost[j];
      G.agg_eco[j] += o.eco[j]; } });
    // ventes en plus de l'ensemble des décisions retenues, calculées ensemble (pas la somme des effets marginaux)
    G.agg_dv = zeros(N);
    for (var j1 = 0; j1 < N; j1++) {
      G.agg_dv[j1] = Math.min(C.ch_ventes_ads[j1], C.ch_clo_dispo[j1] * P.cap_closer, C.ch_set_dispo[j1] * P.cap_setter)
        - Math.min(C.ch_ventes_ads[j1] - A.ads[j1] * P.conv / P.cpl, n(P.closers_act) * P.cap_closer, n(P.setters_act) * P.cap_setter);
      G.agg_dca[j1] = G.agg_dv[j1] * n(P.panier);
    }
    for (j1 = 0; j1 < N; j1++) {
      G.agg_enc[j1] = (j1 + 1 - de < 1) ? 0 : G.agg_dca[j1 - de];
      G.agg_cuma[j1] = (j1 ? G.agg_cuma[j1 - 1] : 0) + G.agg_eco[j1] - G.agg_cost_sal[j1] - A.ads[j1] + G.agg_enc[j1] * (n(P.marge) - n(P.commission));
    }
    for (var j2 = 0; j2 < N; j2++) {
      G.agg_var[j2] = G.agg_enc[j2] * (1 - n(P.marge) + n(P.commission)) - G.agg_eco[j2];
      G.agg_var_cr[j2] = G.agg_dca[j2] * (1 - n(P.marge) + n(P.commission)) - G.agg_eco[j2];
    }
    // trésorerie sans décision = trésorerie du classeur - effet des décisions retenues dans le classeur
    var hors = zeros(N), treso = zeros(N), marge = zeros(N), capx = zeros(N);
    for (j = 0; j < N; j++) { hors[j] = n(B.treso[j]) - n(B.agg_cuma[j]); treso[j] = hors[j] + G.agg_cuma[j]; marge[j] = treso[j] - n(P.plancher); }
    for (var s = 0; s < N; s++) { var m = Infinity; for (var t = s; t < N; t++) m = Math.min(m, marge[t] / (t - s + 1)); capx[s] = Math.max(0, m); }
    // ---- F. verdicts
    var res = D.map(function (o, i) {
      var d = input.decisions[i] || {};
      o.trp = zeros(N); o.tra = zeros(N); o.rank = zeros(N);
      var arr = M.indexOf(o.arr); arr = arr < 0 ? 1 : arr + 1;
      var creg = Math.max(0, -o.netp[N - 1]);
      for (var j = 0; j < N; j++) {
        o.trp[j] = treso[j] - (o.R ? o.cuma[j] : 0) + o.cump[j];
        o.tra[j] = treso[j] - (o.R ? o.cuma[j] : 0) + o.cuma[j];
        o.rank[j] = (j + 1 >= arr && capx[j] >= creg) ? j + 1 : 999;
      }
      if (!o.type) return null;
      var mnp = minArr(o.trp, fc), mna = minArr(o.tra, fc), frk = minArr(o.rank, 0);
      var jmin = fc; for (var k = fc; k < N; k++) if (o.tra[k] === mna) { jmin = k; break; }
      return { libelle: d.libelle || o.type, verdict: mnp >= n(P.plancher) ? "OUI" : (frk < 999 ? "NON, OK dès " + input.labels[frk - 1] : "NON"),
               verdict_retour: mna >= n(P.plancher) ? "OUI" : "NON", point_bas: mnp, point_bas_retour: mna, mois_point_bas: input.labels[jmin],
               cout_regime: o.cost[N - 1] - o.eco[N - 1], retour_regime: o.gain[N - 1], au_plus_tot: frk < 999 ? input.labels[frk - 1] : "pas d'ici déc. 27" };
    });
    // ---- A. à retenir
    var mnt = minArr(treso, fc), jm = fc; for (j = fc; j < N; j++) if (treso[j] === mnt) { jm = j; break; }
    function first(gap) { for (var j = 0; j < N; j++) if (gap[j] > 0) return j + 1; return 999; }
    function maxArr(a) { var m = -Infinity; for (var j = 0; j < N; j++) m = Math.max(m, a[j]); return m; }
    function avgFc(a) { var s = 0, c = 0; for (var j = fc; j < N; j++) { s += a[j]; c++; } return c ? s / c : 0; }
    var L = input.labels;
    function reco(lab, gap, dispo, rp) {
      var f = first(gap);
      if (f === 999) return lab + " : effectif suffisant pour les ventes du BP jusqu'à déc. 2027 (" + Math.round(dispo[0]) + " en place).";
      return lab + " : il en manque " + maxArr(gap) + " dès " + L[f - 1] + " ; arrivée au plus tard " + (f - rp < 1 ? "tout de suite (déjà en retard)" : L[f - rp - 1]) + ".";
    }
    var fs = first(C.ch_salles_gap), fa = first(C.ch_ads_gap);
    var top = {
      a_plancher: n(P.plancher), a_pb: mnt, a_pb_mois: L[jm], a_pb_hors: minArr(hors, fc),
      a_verdict: mnt >= n(P.plancher) ? "OUI : au-dessus du plancher" : "NON : sous le plancher", a_capx: capx[fc], a_rend: P.rendement_ads,
      a_adsreq: avgFc(C.ch_ads_req), a_ads: avgFc(C.ch_ads),
      a_reco_clo: reco("Closers", C.ch_clo_gap, C.ch_clo_dispo, n(P.delai_com)),
      a_reco_set: reco("Setters", C.ch_set_gap, C.ch_set_dispo, n(P.delai_com)),
      a_reco_form: reco("Formateurs", C.ch_form_gap, C.ch_form_dispo, n(P.delai_form)),
      a_reco_salles: "Salles : " + (fs === 999 ? "le parc suffit jusqu'à déc. 2027." : "le parc est dépassé dès " + L[fs - 1] + " (jusqu'à " + (Math.round(maxArr(C.ch_salles_gap) * 10) / 10) + " session(s) par semaine en trop)."),
      a_reco_ads: "Ads : " + (fa === 999 ? "le budget prévu suffit pour les ventes du BP." : "le budget prévu est inférieur à ce qu'exigent les ventes du BP dès " + L[fa - 1] + " (écart moyen " + Math.round((C.ch_ads_gap.reduce(function (a, b) { return a + b; }, 0) / N) / 1000) + " K€ par mois).")
    };
    return { P: P, chain: C, agg: G, decisions: D, results: res, treso: treso, hors: hors, capx: capx, top: top };
  }
  /* Plan de réinvestissement : utilise la trésorerie au-dessus du plancher (plus une marge de sécurité) pour, dans l'ordre,
     1) augmenter les ads par paliers, avec les closers et setters nécessaires pour traiter les ventes en plus,
     2) remplacer des sessions freelances par des formateurs CDI quand c'est une économie nette,
     3) affecter l'enveloppe restante à des recrutements structurants (rôles à définir par Olivier).
     Contrainte : la trésorerie, en ne comptant qu'une part (haircut) des ventes rapportées, reste au-dessus du plancher + marge
     sur tout l'horizon. Les décisions déjà retenues sont conservées. */
  function plan(input, opts) {
    var o = Object.assign({ marge_securite: 20000, part_retour: 0.5, pas_ads: 2500, ads_max: 1, cdi_max: 0.5, app_session: 9, mois_test: 3 }, opts || {});
    var P = derive(input.params), M = input.months, N = M.length, fc = input.fc || 0, B = input.base, L = input.labels;
    var seuil = n(P.plancher) + n(o.marge_securite), h = Math.max(0, Math.min(1, n(o.part_retour)));
    var base = (input.decisions || []).filter(function (d) { return d && d.type; });
    function evaluer(pl) {
      var r = run(Object.assign({}, input, { decisions: base.concat(pl) })), G = r.agg;
      var th = r.hors.slice(), tp = r.hors.slice(), cp = 0;
      for (var j = 0; j < N; j++) {
        cp += G.agg_eco[j] - G.agg_cost_sal[j] - G.agg_ads[j];          // coûts et économies, sans les ventes
        tp[j] += cp; th[j] += cp + h * (G.agg_cuma[j] - cp);             // + une part seulement du retour des ventes
      }
      var minTest = Infinity; for (j = fc; j < Math.min(N, fc + n(o.mois_test)); j++) minTest = Math.min(minTest, tp[j]);
      return { r: r, th: th, tp: tp, min: minArr(th, fc), ok: minArr(th, fc) >= seuil && minTest >= n(P.plancher) };
    }
    function retenue(d) { return Object.assign({ retenue: "Oui", cout: null, plan: true }, d); }
    var ref = evaluer([]), adsMoy = 0, c = 0;
    for (var j = fc; j < N; j++) { adsMoy += n(B.ads_bp[j]) + ref.r.agg.agg_ads[j]; c++; }
    adsMoy = c ? adsMoy / c : 0;
    var maxAds = Math.max(0, n(o.ads_max) * adsMoy), pas = Math.max(500, n(o.pas_ads));
    // 1. ads + équipe commerciale
    function equipe(extra) {
      var pl = [], cloH = 0, setH = 0, a0 = ref.r.agg;
      for (var j = fc; j < N; j++) {
        var ventes = (n(B.ads_bp[j]) + a0.agg_ads[j] + extra) * P.conv / (P.cpl || 1);
        cloH = Math.max(cloH, Math.ceil(ventes / (P.cap_closer || 1) - 1e-9) - (n(P.closers_act) + a0.agg_closers[j]));
        setH = Math.max(setH, Math.ceil(ventes / (P.cap_setter || 1) - 1e-9) - (n(P.setters_act) + a0.agg_setters[j]));
      }
      var depart = (cloH > 0 || setH > 0) ? Math.min(N - 1, fc + Math.max(n(P.delai_com) | 0, 0)) : fc;
      if (cloH > 0) pl.push(retenue({ libelle: "Plan : " + cloH + " closer" + (cloH > 1 ? "s" : "") + " de plus", type: "Closer", quantite: cloH, arrivee: M[fc] }));
      if (setH > 0) pl.push(retenue({ libelle: "Plan : " + setH + " setter" + (setH > 1 ? "s" : "") + " de plus", type: "Setter", quantite: setH, arrivee: M[fc] }));
      if (extra > 0) pl.push(retenue({ libelle: "Plan : ads +" + Math.round(extra).toLocaleString("fr-FR") + " € par mois", type: "Ads", quantite: extra, arrivee: M[depart] }));
      return pl;
    }
    var extra = 0, pl = [], ev = ref;
    while (extra + pas <= maxAds + 1e-6) {
      var cand = equipe(extra + pas), e = evaluer(cand);
      if (!e.ok) break;
      extra += pas; pl = cand; ev = e;
    }
    // 2. formateurs CDI : économie nette, en gardant une part de sessions en freelance
    var minFree = Infinity; for (j = fc; j < N; j++) minFree = Math.min(minFree, n(B.free_sess[j]));
    var maxCdi = Math.floor(n(o.cdi_max) * (isFinite(minFree) ? minFree : 0) / (n(P.sess_cdi_mois) || 1));
    var cdi = 0, pl0 = null;
    for (var k = 1; k <= maxCdi; k++) {
      var cd = pl.concat([retenue({ libelle: "Plan : " + k + " formateur" + (k > 1 ? "s" : "") + " CDI de plus", type: "Formateur CDI", quantite: k, arrivee: M[Math.min(N - 1, fc + 1)] })]);
      var e2 = evaluer(cd), last = e2.r.decisions[e2.r.decisions.length - 1];
      if (!e2.ok || !(last.eco[N - 1] > last.cost[N - 1])) break;
      cdi = k; ev = e2; pl0 = cd;
    }
    if (cdi) pl = pl0;
    // 3. enveloppe restante : dépense constante supportable dès le mois suivant, financée SANS compter les ventes en plus
    var s0 = Math.min(N - 1, fc + 1), env = Infinity;
    for (var t = s0; t < N; t++) env = Math.min(env, (ev.tp[t] - seuil) / (t - s0 + 1));
    env = Math.max(0, isFinite(env) ? env : 0);
    var nSal = n(P.cout_salarie) ? Math.floor(env / n(P.cout_salarie)) : 0;
    if (nSal > 0) {
      var cs = pl.concat([retenue({ libelle: "Plan : " + nSal + " recrutement" + (nSal > 1 ? "s" : "") + " structurant" + (nSal > 1 ? "s" : "") + " (rôles à définir)", type: "Salarié", quantite: nSal, arrivee: M[s0] })]);
      var e3 = evaluer(cs);
      if (e3.ok) { pl = cs; ev = e3; env -= nSal * n(P.cout_salarie); }
    }
    // indicateurs
    var r = ev.r, ventesPlus = 0, caPlus = 0, invest = 0, cnt = 0, jmin = fc;
    for (j = fc; j < N; j++) { ventesPlus += r.agg.agg_dv[j] - ref.r.agg.agg_dv[j]; caPlus += r.agg.agg_dca[j] - ref.r.agg.agg_dca[j]; }
    r.decisions.forEach(function (d, i) { if (i < base.length || !d.R) return; for (var j = fc; j < N; j++) invest += d.cost[j] - d.eco[j]; });
    for (j = fc; j < N; j++) cnt++;
    for (j = fc; j < N; j++) if (ev.th[j] === ev.min) { jmin = j; break; }
    var sessPlus = (ventesPlus / Math.max(1, cnt)) * n(P.app_par_vente) / (n(o.app_session) || 9);
    var sallesMax = 0; for (j = fc; j < N; j++) sallesMax = Math.max(sallesMax, (n(B.sessions[j]) + sessPlus) * 12 / 52);
    return {
      options: o, decisions: pl, ads_extra: extra, ads_max: maxAds, cdi: cdi, salaries: nSal, enveloppe_restante: env,
      point_bas: ev.min, mois_point_bas: L[jmin], point_bas_prudent: minArr(ev.tp, fc), point_bas_reference: minArr(ref.th, fc),
      treso_fin: ev.th[N - 1], treso_fin_reference: ref.th[N - 1], ventes_plus_mois: ventesPlus / Math.max(1, cnt), ca_plus: caPlus,
      investissement_mensuel: invest / Math.max(1, cnt), sessions_plus_mois: sessPlus, salles_ok: sallesMax <= n(P.parc_sem),
      trajectoire: ev.th, trajectoire_prudente: ev.tp, trajectoire_reference: ref.th, seuil: seuil
    };
  }
  var api = { run: run, derive: derive, plan: plan, TYPES: TYPES };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Engine = api;
})(this);
