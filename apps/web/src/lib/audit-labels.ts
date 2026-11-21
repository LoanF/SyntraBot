/** Libellés français des actions journalisées (le code brut reste affiché en secondaire dans l'audit). */
export const ACTION_LABELS: Record<string, string> = {
  'module.enable': 'a activé le module', 'module.disable': 'a désactivé le module', 'module.config': 'a modifié la configuration de',
  'apikey.create': 'a créé une clé API', 'apikey.revoke': 'a révoqué une clé API', 'apikey.rotate': 'a renouvelé une clé API',
  'embed.publish': 'a publié un embed', 'embed.edit_live': 'a modifié un embed en direct', 'embed.create': 'a créé un embed', 'embed.update': 'a modifié un embed',
  'guild.link': 'a rattaché un serveur Discord', 'access.create': 'a créé une règle d’accès', 'access.delete': 'a supprimé une règle d’accès',
  'pole.create': 'a créé un pôle', 'pole.update': 'a modifié un pôle', 'pole.delete': 'a supprimé un pôle',
  'status.create': 'a créé un statut', 'status.update': 'a modifié un statut', 'status.delete': 'a supprimé un statut',
  'snippet.create': 'a créé une réponse rapide', 'snippet.update': 'a modifié une réponse rapide', 'snippet.delete': 'a supprimé une réponse rapide',
  'message.update': 'a modifié un texte du bot', 'message.reset': 'a rétabli un texte par défaut',
  'syncrule.create': 'a créé une règle de synchro', 'syncrule.update': 'a modifié une règle de synchro', 'syncrule.delete': 'a supprimé une règle de synchro',
  'integration.fivemdb': 'a modifié la base FiveM', 'integration.rcon': 'a modifié la connexion RCON',
  'report.claim': 'a pris en charge un report', 'report.release': 'a relâché un report', 'report.close': 'a clôturé un report', 'report.teleport': 's’est téléporté sur un joueur',
  'ticket.claim': 'a pris en charge un ticket', 'ticket.close': 'a clôturé un ticket', 'ticket.transfer': 'a transféré un ticket',
  'rcon.execute': 'a exécuté une commande RCON', 'rcon.failed': 'commande RCON en échec',
  'whitelist.decision': 'décision de whitelist reçue', 'douane.accepted': 'a accepté un candidat (douane)', 'douane.refused': 'a refusé un candidat (douane)',
};

export const actionLabel = (action: string) => ACTION_LABELS[action] ?? action;
