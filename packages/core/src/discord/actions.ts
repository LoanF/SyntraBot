import { REST } from '@discordjs/rest';
import { Routes, type APIGuildMember, type APIChannel, type APIMessage, type APIRole, type RESTPostAPIChannelMessageJSONBody } from 'discord-api-types/v10';
import { ExternalServiceError } from '@syntra/shared';

export interface MemberInfo {
  id: string;
  username: string;
  roles: string[];
}

/** Actions Discord utilisables depuis l'API (REST pur, sans gateway). */
export interface DiscordActions {
  getMember(guildId: string, userId: string): Promise<MemberInfo | null>;
  addRoles(guildId: string, userId: string, roleIds: readonly string[], reason?: string): Promise<void>;
  removeRoles(guildId: string, userId: string, roleIds: readonly string[], reason?: string): Promise<void>;
  sendDm(userId: string, body: RESTPostAPIChannelMessageJSONBody): Promise<void>;
  postMessage(channelId: string, body: RESTPostAPIChannelMessageJSONBody): Promise<string>;
  editMessage(channelId: string, messageId: string, body: RESTPostAPIChannelMessageJSONBody): Promise<void>;
  renameChannel(channelId: string, name: string): Promise<void>;
  /** Permissions effectives du bot (bitfield) ou null si absent du serveur */
  getBotPermissions(guildId: string): Promise<bigint | null>;
  /** Salons textuels (pour les sélecteurs du dashboard) */
  /** Serveur auquel appartient un salon (null si introuvable / MP) : empêche de publier dans le serveur d'un autre projet */
  getChannelGuildId(channelId: string): Promise<string | null>;
  /** Propriétaire ou détenteur d'ADMINISTRATOR : requis pour rattacher un serveur à un projet */
  isGuildAdmin(guildId: string, userId: string): Promise<boolean>;
  listChannels(guildId: string): Promise<{ id: string; name: string; parentId: string | null }[]>;
  listRoles(guildId: string): Promise<{ id: string; name: string; color: number }[]>;
}

/** Les mentions sont désactivées par défaut : un champ de formulaire ne peut jamais déclencher @everyone. */
const SAFE_MENTIONS = { parse: [] as never[] };

const isNotFound = (e: unknown) => typeof e === 'object' && e !== null && (e as { status?: number }).status === 404;

export class RestDiscordActions implements DiscordActions {
  private rest: REST;
  private botUserId?: string;
  constructor(token: string) {
    this.rest = new REST({ version: '10' }).setToken(token);
  }

  async getMember(guildId: string, userId: string): Promise<MemberInfo | null> {
    try {
      const m = (await this.rest.get(Routes.guildMember(guildId, userId))) as APIGuildMember;
      return { id: userId, username: m.user?.username ?? userId, roles: m.roles };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw new ExternalServiceError('Discord getMember a échoué', { cause: String(e) });
    }
  }

  async addRoles(guildId: string, userId: string, roleIds: readonly string[], reason?: string) {
    for (const r of roleIds) await this.rest.put(Routes.guildMemberRole(guildId, userId, r), { ...(reason ? { reason } : {}) });
  }

  async removeRoles(guildId: string, userId: string, roleIds: readonly string[], reason?: string) {
    for (const r of roleIds) await this.rest.delete(Routes.guildMemberRole(guildId, userId, r), { ...(reason ? { reason } : {}) });
  }

  async sendDm(userId: string, body: RESTPostAPIChannelMessageJSONBody) {
    const ch = (await this.rest.post(Routes.userChannels(), { body: { recipient_id: userId } })) as APIChannel;
    await this.rest.post(Routes.channelMessages(ch.id), { body: { allowed_mentions: SAFE_MENTIONS, ...body } });
  }

  async postMessage(channelId: string, body: RESTPostAPIChannelMessageJSONBody) {
    const m = (await this.rest.post(Routes.channelMessages(channelId), { body: { allowed_mentions: SAFE_MENTIONS, ...body } })) as APIMessage;
    return m.id;
  }

  async editMessage(channelId: string, messageId: string, body: RESTPostAPIChannelMessageJSONBody) {
    await this.rest.patch(Routes.channelMessage(channelId, messageId), { body: { allowed_mentions: SAFE_MENTIONS, ...body } });
  }

  async renameChannel(channelId: string, name: string) {
    await this.rest.patch(Routes.channel(channelId), { body: { name } });
  }

  async getChannelGuildId(channelId: string) {
    try {
      return ((await this.rest.get(Routes.channel(channelId))) as { guild_id?: string }).guild_id ?? null;
    } catch (e) {
      if (isNotFound(e)) return null;
      throw new ExternalServiceError('Discord getChannel a échoué', { cause: String(e) });
    }
  }

  async isGuildAdmin(guildId: string, userId: string) {
    try {
      const guild = (await this.rest.get(Routes.guild(guildId))) as { owner_id: string };
      if (guild.owner_id === userId) return true;
      const member = (await this.rest.get(Routes.guildMember(guildId, userId))) as APIGuildMember;
      const roles = (await this.rest.get(Routes.guildRoles(guildId))) as APIRole[];
      const ADMINISTRATOR = 8n;
      return roles.some((r) => (r.id === guildId || member.roles.includes(r.id)) && (BigInt(r.permissions) & ADMINISTRATOR) !== 0n);
    } catch (e) {
      if (isNotFound(e)) return false;
      throw new ExternalServiceError('Discord isGuildAdmin a échoué', { cause: String(e) });
    }
  }

  async listChannels(guildId: string) {
    const all = (await this.rest.get(Routes.guildChannels(guildId))) as APIChannel[];
    return all
      .filter((c) => c.type === 0 || c.type === 5)
      .map((c) => ({ id: c.id, name: (c as { name?: string }).name ?? c.id, parentId: (c as { parent_id?: string | null }).parent_id ?? null }));
  }

  async listRoles(guildId: string) {
    const roles = (await this.rest.get(Routes.guildRoles(guildId))) as APIRole[];
    return roles.filter((r) => r.id !== guildId).sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, name: r.name, color: r.color }));
  }

  async getBotPermissions(guildId: string): Promise<bigint | null> {
    try {
      this.botUserId ??= ((await this.rest.get(Routes.user())) as { id: string }).id;
      const m = (await this.rest.get(Routes.guildMember(guildId, this.botUserId))) as APIGuildMember;
      const roles = (await this.rest.get(Routes.guildRoles(guildId))) as { id: string; permissions: string }[];
      let perms = BigInt(roles.find((r) => r.id === guildId)?.permissions ?? 0); // @everyone
      for (const r of roles) if (m.roles.includes(r.id)) perms |= BigInt(r.permissions);
      return perms;
    } catch (e) {
      if (isNotFound(e)) return null;
      throw new ExternalServiceError('Discord getBotPermissions a échoué', { cause: String(e) });
    }
  }
}
