export const API_SCOPES = [
  { id: 'webhooks:whitelist', label: 'Webhook whitelist', help: 'Le site vitrine notifie une décision' },
  { id: 'members:check', label: 'Présence Discord', help: 'Vérifier qu’un joueur est sur le serveur' },
  { id: 'bridge:report', label: 'Bridge : reports', help: 'Création et événements de reports' },
  { id: 'bridge:poll', label: 'Bridge : commandes', help: 'Récupérer les ordres (téléportation…)' },
  { id: 'bridge:link', label: 'Bridge : liaison', help: 'Associer Discord et identifiants FiveM' },
] as const;
