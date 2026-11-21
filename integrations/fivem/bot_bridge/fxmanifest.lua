fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'bot_bridge'
author 'Syntra'
description 'Pont entre le serveur FiveM et le bot Syntra (reports contextuels, liaison Discord, téléportation staff).'
version '0.1.0'

server_scripts {
    'server.js',
}

-- Exports serveur : exports.bot_bridge:SubmitReport(src, reason, meta)
dependencies {
    '/server:10731',
    '/onesync',
}
