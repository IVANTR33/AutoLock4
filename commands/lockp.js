const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'lockp',
    description: 'Bloquea un canal de spawn en modo PRIVADO (oculto para usuarios).',
    async execute(client, message, args, { lockChannel, lockedChannels, saveLockedChannels, config, lockMessages, SPAWN_ROLE_NAME }) {
        // Verificación de permisos de staff
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply('❌ Se requieren permisos para gestionar canales (Manage Channels) para usar el bloqueo privado.');
        }

        let canal, nombreBloqueo;
        const mencionCanal = message.mentions.channels.first();
        
        // Determinar canal y nombre del bloqueo
        if (mencionCanal) {
            canal = mencionCanal;
            nombreBloqueo = args.slice(1).join(' ').trim();
        } else {
            canal = message.channel;
            nombreBloqueo = args.join(' ').trim();
        }
        
        const nombreFinal = nombreBloqueo || 'Privado';

        // Validar que sea un canal de spawn (1-450)
        if (!/^\d{1,3}$/.test(canal.name) || parseInt(canal.name) > 450) {
            return message.reply('❌ Este comando solo funciona en canales de spawn (1-450).');
        }

        try {
            // Ejecutar bloqueo con hideChannel = true (modo privado)
            const exito = await lockChannel(canal, true);
            
            if (!exito) {
                return message.reply('❌ No se pudo bloquear el canal. Verifica los permisos del bot.');
            }

            // Guardar en la colección con tipo 'private'
            lockedChannels.set(canal.id, { type: 'private', pokemon: nombreFinal });
            saveLockedChannels(lockedChannels);

            // Crear botón de desbloqueo
            const filaBotones = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`unlock_${canal.id}`)
                    .setLabel('🔒 BLOQUEO PRIVADO')
                    .setStyle(ButtonStyle.Danger)
            );

            // Enviar mensaje de confirmación en el canal bloqueado
            const mensajeBloqueo = await canal.send({
                content: `🔰 **${nombreFinal}** `,
                components: [filaBotones]
            });

            // Registrar el mensaje para actualizaciones
            lockMessages.set(canal.id, {
                messageId: mensajeBloqueo.id,
                channelId: canal.id,
                timestamp: Date.now()
            });

            // Confirmación remota si el comando se usó desde otro canal
            if (message.channel.id !== canal.id) {
                message.reply(`✅ Canal ${canal.name} bloqueado en modo **PRIVADO** con éxito.`);
            }

            // Registro en el canal de logs (si está configurado)
            if (config.logChannel) {
                const canalLog = client.channels.cache.get(config.logChannel);
                if (canalLog) {
                    canalLog.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xFF0000) // Rojo para privado
                                .setTitle('🔒 Bloqueo Privado Manual')
                                .setDescription(`**Canal:** ${canal.name}\n**Iniciado por:** ${message.author.tag}\n**Referencia:** ${nombreFinal}`)
                                .setFooter({ text: 'El canal ahora es invisible para el rol de spawns.' })
                                .setTimestamp()
                        ]
                    }).catch(console.error);
                }
            }
        } catch (error) {
            console.error('❌ Error en comando lockp:', error);
            message.reply('❌ Ocurrió un error al ejecutar el bloqueo privado.');
        }
    },
};