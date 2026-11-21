/**
 * Catalogue RBAC. `sensitive` = jamais héritable d'une policy ciblant un seul serveur :
 * il faut une policy projet entier (ou être OWNER).
 */
export const PERMISSIONS = {
  'project:admin': { sensitive: true },
  'access:manage': { sensitive: true },
  'apikeys:manage': { sensitive: true },
  'integrations:manage': { sensitive: true },
  'rcon:execute': { sensitive: true },
  'audit:read': { sensitive: true },

  'modules:manage': { sensitive: false },
  'tickets:read': { sensitive: false },
  'tickets:write': { sensitive: false },
  'transcripts:read': { sensitive: false },
  'reports:read': { sensitive: false },
  'embeds:read': { sensitive: false },
  'embeds:write': { sensitive: false },
  'douane:manage': { sensitive: false },
  'sync_roles:manage': { sensitive: false },
  'status:manage': { sensitive: false },
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

export function isSensitive(permission: Permission): boolean {
  return PERMISSIONS[permission].sensitive;
}
