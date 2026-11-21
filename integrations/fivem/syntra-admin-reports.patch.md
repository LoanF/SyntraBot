# Patch `syntra-admin` — brancher les reports sur Discord

**Non appliqué** : ces modifications touchent ton serveur (`resources/[syntra-custom]/syntra-admin`). Elles sont petites, additives, et sans effet si `bot_bridge` n'est pas démarré (`TriggerEvent` sans écouteur ne fait rien).

Principe : le jeu reste la **source de vérité** (`syntra_reports`). Il émet des événements vers `bot_bridge` (jeu → Discord) et expose un export pour recevoir les actions du staff faites sur Discord (Discord → jeu), sans `src` puisque l'acteur n'est pas connecté.

Tout se passe dans `server/modules/reports.lua` (les helpers `fetch`, `addMessage`, `notifyPlayer`, `refreshStaff`, `sourceOf` y sont locaux) + 1 export dans `server/main.lua`.

## 1. Événements (jeu → Discord)

**a)** Dans `addMessage` (messages joueur/staff uniquement, pas les lignes `system`) :

```lua
local function addMessage(id, kind, author, text)
    MySQL.insert.await(
        'INSERT INTO `syntra_report_messages` (`report_id`, `kind`, `author`, `message`) VALUES (?, ?, ?, ?)',
        { id, kind, author, text }
    )

    if kind ~= 'system' then
        TriggerEvent('syntra-admin:reportMessage', id, kind, author, text)
    end
end
```

**b)** Dans `reports.create`, **juste avant** `addMessage(id, 'player', name, text)` (le fil Discord doit exister avant le 1er message) :

```lua
    TriggerEvent('syntra-admin:reportCreated', id, src, text)
    addMessage(id, 'player', name, text)
```

**c)** Un événement de statut dans `reports.claim`, `reports.release`, `reports.close`, à côté de leur `addMessage(id, 'system', name, ...)` :

```lua
-- reports.claim   (après addMessage(id, 'system', name, 'claimed'))
TriggerEvent('syntra-admin:reportStatus', id, 'claim', name, '')

-- reports.release (après addMessage(id, 'system', identity.name(src), 'released'))
TriggerEvent('syntra-admin:reportStatus', id, 'release', identity.name(src), '')

-- reports.close   (après addMessage(id, 'system', name, 'closed'))
TriggerEvent('syntra-admin:reportStatus', id, 'close', name, note)
```

## 2. Actions Discord → jeu

À ajouter dans `reports.lua`, avant `return reports` :

```lua
-- Actions venant de Discord (via bot_bridge). `actor` = { id = <discord id>, name = <pseudo> } ; pas de `src`.
-- Une action Discord ne ré-émet PAS d'événement vers Discord (pas de boucle).
function reports.fromDiscord(action, id, actor, payload)
    local row = fetch(id)

    if not row then
        return false, 'not_found'
    end

    if row.status == 'closed' then
        return false, 'closed'
    end

    local name = clean(actor.name or '', 80)
    local key = 'discord:' .. tostring(actor.id)

    if name == '' then
        return false, 'invalid'
    end

    if action == 'message' then
        local text = clean(payload.text, MESSAGE_MAX)

        if text == '' then
            return false, 'invalid'
        end

        addMessage(id, 'staff', name, text)

        if row.claimed_license == '' then
            MySQL.query.await(
                'UPDATE `syntra_reports` SET `status` = ?, `awaiting` = ?, `claimed_license` = ?, `claimed_by` = ? WHERE `id` = ?',
                { 'claimed', 'player', key, name, id }
            )
        else
            MySQL.query.await('UPDATE `syntra_reports` SET `awaiting` = ? WHERE `id` = ?', { 'player', id })
        end

        notifyPlayer(sourceOf(row.reporter_license), locale('report_reply_title', id), identity.shorten(text, 120))
    elseif action == 'claim' then
        if row.claimed_license ~= '' and row.claimed_license ~= key then
            return false, 'claimed'
        end

        MySQL.query.await(
            'UPDATE `syntra_reports` SET `status` = ?, `claimed_license` = ?, `claimed_by` = ? WHERE `id` = ?',
            { 'claimed', key, name, id }
        )
        addMessage(id, 'system', name, 'claimed')
        notifyPlayer(sourceOf(row.reporter_license), locale('report_claimed_title', id), locale('report_claimed'))
    elseif action == 'release' then
        if row.status ~= 'claimed' then
            return false, 'invalid'
        end

        MySQL.query.await(
            "UPDATE `syntra_reports` SET `status` = 'open', `claimed_license` = '', `claimed_by` = '', `awaiting` = 'staff' WHERE `id` = ?",
            { id }
        )
        addMessage(id, 'system', name, 'released')
    elseif action == 'close' then
        local note = clean(payload.resolution or '', 300)

        MySQL.query.await(
            "UPDATE `syntra_reports` SET `status` = 'closed', `closed_by` = ?, `closed_at` = NOW(), `resolution` = ? WHERE `id` = ?",
            { name, note, id }
        )
        addMessage(id, 'system', name, 'closed')
        notifyPlayer(
            sourceOf(row.reporter_license),
            locale('report_closed_title', id),
            note ~= '' and note or locale('report_closed')
        )
    else
        return false, 'invalid'
    end

    refreshStaff()

    return true
end
```

Dans `server/main.lua`, avec les autres `exports(...)` :

```lua
exports('ReportFromDiscord', function(action, id, actor, payload)
    return reports.fromDiscord(action, id, actor, payload or {})
end)
```

> Si `reports.fromDiscord` renvoie `false, 'claimed'` (report déjà pris en jeu par un autre staff), l'action Discord est refusée côté jeu ; la prochaine synchro (événement de claim du jeu) remet l'état Discord d'équerre.

## Limites connues

- Un claim fait **en jeu** par un staff n'a pas de compte Discord associé : le fil affiche son pseudo en jeu (`claimedByName`) ; les boutons Discord de relâchement restent utilisables par tout le staff.
- Les commandes Discord → jeu vivent 10 min dans Redis ; si le serveur de jeu est arrêté plus longtemps, elles sont perdues (le jeu reste cohérent, seul le miroir Discord diverge).
