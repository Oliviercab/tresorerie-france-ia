/* Adresses utilisées par la plateforme.
   webhook : dépôt des demandes (mise en place des clés, décisions enregistrées par Olivier) ; il ne fait que déposer.
   donnees : lecture des fichiers chiffrés (data.enc, data_complet.enc, keys.json) que la mise à jour de la nuit dépose dans le dossier moteur.
   live : solde Qonto en direct, chiffré (rafraîchi chaque minute quand la page est visible).
   version : v4 (vision Excel seule) ou v5 (Cockpit inspiré de Pigment/Agicap/Causal + vision Excel).
   qonto_tx / qonto_facture : liens vers Qonto ({org} = identifiant de l'organisation, {id} = transaction ou facture). */
window.TRESO_CONFIG = {
  version: "v4",   // "v4" : vision Excel seule (copie conforme du classeur) ; "v5" : Cockpit + vision Excel
  webhook: "https://olivier66.app.n8n.cloud/webhook/b7e4c2a9-3f61-4d8e-9c25-6a1f0e7d4b38",
  donnees: "https://olivier66.app.n8n.cloud/webhook/e5a1d9c3-7b24-4f86-a0c2-3d9b8f6e1a47",
  live: "https://olivier66.app.n8n.cloud/webhook/treso-live-9f2c7a1e",
  qonto_tx: "https://app.qonto.com/organizations/{org}/transactions?transactionId={id}",
  qonto_facture: "https://app.qonto.com/organizations/{org}/receivable-invoices/{id}"
};
