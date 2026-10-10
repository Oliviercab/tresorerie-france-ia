/* Chiffrement de la plateforme (WebCrypto, rien ne part vers un serveur) :
   - consultation : paire RSA-OAEP ; la clé privée est chiffrée (AES-GCM) par une clé dérivée du mot de passe (PBKDF2-SHA256).
     Chaque nuit, les données sont chiffrées avec une clé AES aléatoire, elle-même chiffrée par la clé publique (data.enc).
   - édition : paire ECDSA P-256 ; la clé privée est chiffrée par le code d'édition ; elle signe les décisions envoyées vers l'Excel.
   keys.json ne contient que des clés publiques et des clés privées chiffrées. */
(function (root) {
  "use strict";
  var S = crypto.subtle, ITER = 310000;
  function b64(buf) { var b = new Uint8Array(buf), s = ""; for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { var bin = atob(s), b = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }
  function rnd(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  async function kek(secret, salt, iter) {
    var base = await S.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
    return S.deriveKey({ name: "PBKDF2", salt: salt, iterations: iter || ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function wrap(secret, pkcs8) {
    var salt = rnd(16), iv = rnd(12), k = await kek(secret, salt);
    var ct = await S.encrypt({ name: "AES-GCM", iv: iv }, k, pkcs8);
    return { salt: b64(salt), iv: b64(iv), wrapped: b64(ct), iter: ITER };
  }
  async function unwrap(secret, w) {
    var k = await kek(secret, unb64(w.salt), w.iter);
    return S.decrypt({ name: "AES-GCM", iv: unb64(w.iv) }, k, unb64(w.wrapped));
  }
  async function creerCles(mdp, code) {
    var v = await S.generateKey({ name: "RSA-OAEP", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
    var e = await S.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    var vw = await wrap(mdp, await S.exportKey("pkcs8", v.privateKey));
    var ew = await wrap(code, await S.exportKey("pkcs8", e.privateKey));
    vw.spki = b64(await S.exportKey("spki", v.publicKey));
    ew.spki = b64(await S.exportKey("spki", e.publicKey));
    return { v: 1, cree_le: new Date().toISOString(), view: vw, edit: ew };
  }
  async function ouvrir(keys, mdp) {
    var pk = await unwrap(mdp, keys.view);   // lève une erreur si le mot de passe est faux
    return S.importKey("pkcs8", pk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]);
  }
  async function exporterJwk(key) { return S.exportKey("jwk", key); }
  async function importerJwk(jwk) { return S.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]); }
  async function dechiffrer(priv, enc) {
    var raw = await S.decrypt({ name: "RSA-OAEP" }, priv, unb64(enc.ek));
    var aes = await S.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    var plain = await S.decrypt({ name: "AES-GCM", iv: unb64(enc.iv) }, aes, unb64(enc.ct));
    var stream = new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  }
  async function ouvrirEdition(keys, code) {
    var pk = await unwrap(code, keys.edit);
    return S.importKey("pkcs8", pk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  }
  async function signer(priv, message) {
    var sig = await S.sign({ name: "ECDSA", hash: "SHA-256" }, priv, new TextEncoder().encode(message));
    return b64(sig);   // format brut r||s (64 octets), converti en DER à la vérification (build/site_sync.py)
  }
  async function empreinte(spkiB64) {   // 8 caractères hexadécimaux du SHA-256 de la clé publique de consultation (même calcul dans build/site_sync.py)
    var h = new Uint8Array(await S.digest("SHA-256", unb64(spkiB64))), x = "";
    for (var i = 0; i < 4; i++) x += ("0" + h[i].toString(16)).slice(-2);
    x = x.toUpperCase(); return x.slice(0, 4) + "-" + x.slice(4);
  }
  root.Coffre = { empreinte: empreinte, creerCles: creerCles, ouvrir: ouvrir, dechiffrer: dechiffrer, ouvrirEdition: ouvrirEdition, signer: signer, exporterJwk: exporterJwk, importerJwk: importerJwk };
})(this);
