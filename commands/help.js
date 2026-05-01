// help.js v2.0.0 — Components V2
const {
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
} = require('discord.js');

//================== CONSTANTES ==================

const TIMEOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutos

//================== fin CONSTANTES ==================


//================== CATEGORÍAS Y COMANDOS ==================

const CATEGORIES = [
    {
        id:    'bloqueos',
        emoji: '🔒',
        label: 'Bloqueos',
        commands: ['lock', 'lockp', 'unlock'],
    },
    {
        id:    'listas',
        emoji: '📋',
        label: 'Listas',
        commands: ['locks', 'locklist', 'ls', 'gls', 'ts'],
    },
    {
        id:    'busqueda',
        emoji: '🔍',
        label: 'Búsqueda',
        commands: ['spawn', 'info', 'bt'],
    },
    {
        id:    'config',
        emoji: '⚙️',
        label: 'Config',
        commands: ['lb', 'role', 'log', 'stats', 'help'],
    },
];

const COMMANDS_INFO = {
    help: {
        description: 'Muestra esta lista de comandos interactiva.',
        usage: '!help [comando]',
        examples: ['!help', '!help lb'],
    },
    lb: {
        description: 'Menú interactivo para configurar qué Pokémon se bloquean automáticamente y en qué modo (público o privado).',
        usage: '!lb [nombre_pokemon]',
        examples: ['!lb', '!lb rayquaza'],
    },
    lock: {
        description: 'Bloquea manualmente un canal de spawn y le asigna un nombre de referencia.',
        usage: '!lock [#canal] <nombre>',
        examples: ['!lock', '!lock #canal2 Zygarde', '!lock Jirachi'],
    },
    lockp: {
        description: 'Bloquea un canal de spawn en modo PRIVADO — el canal queda oculto para los usuarios.',
        usage: '!lockp [#canal] <nombre>',
        examples: ['!lockp', '!lockp #canal5 Rare', '!lockp Mewtwo'],
    },
    unlock: {
        description: 'Desbloquea manualmente un canal de spawn. Soporta desbloqueo masivo por Pokémon.',
        usage: '!unlock [#canal] | !unlock all <nombre>',
        examples: ['!unlock', '!unlock #canal2', '!unlock all Pikachu'],
    },
    locks: {
        description: 'Muestra los canales bloqueados SOLO en este servidor, con botones de acceso rápido.',
        usage: '!locks',
        examples: ['!locks'],
    },
    locklist: {
        description: 'Muestra todos los canales bloqueados de forma global (todos los servidores).',
        usage: '!locklist',
        examples: ['!locklist'],
    },
    ls: {
        description: 'Busca canales bloqueados por nombre de Pokémon en este servidor.',
        usage: '!ls <nombre>',
        examples: ['!ls zygarde', '!ls pikachu', '!ls alolan, pichu'],
    },
    gls: {
        description: 'Busca canales bloqueados por nombre de Pokémon en todos los servidores.',
        usage: '!gls <nombre>',
        examples: ['!gls zygarde', '!gls pikachu, raichu'],
    },
    ts: {
        description: 'Muestra el ranking de todos los Pokémon con más canales bloqueados.',
        usage: '!ts',
        examples: ['!ts'],
    },
    spawn: {
        description: 'Busca spawns activos de un Pokémon usando cache en tiempo real. Respuesta instantánea.',
        usage: '!spawn <nombre>',
        examples: ['!spawn rayquaza', '!spawn jirachi'],
    },
    info: {
        description: 'Muestra canales bloqueados de un Pokémon con su imagen y botones de acceso directo.',
        usage: '!info <nombre>',
        examples: ['!info pikachu', '!info swirlix'],
    },
    bt: {
        description: 'Busca canales bloqueados por tipo, región, rareza o nombre usando la base de datos.',
        usage: '!bt <búsqueda>',
        examples: ['!bt poison', '!bt kanto', '!bt legendary', '!bt alolan'],
    },
    role: {
        description: 'Establece el rol que se menciona cuando se detecta un bloqueo automático.',
        usage: '!role @rol',
        examples: ['!role @Staff'],
    },
    log: {
        description: 'Establece el canal donde el bot registra los bloqueos y desbloqueos.',
        usage: '!log #canal',
        examples: ['!log #logs'],
    },
    stats: {
        description: 'Muestra estadísticas avanzadas del bot: servidores, canales, RAM, uptime y más.',
        usage: '!stats',
        examples: ['!stats'],
    },
};

//================== fin CATEGORÍAS Y COMANDOS ==================


//================== getCategoryForCommand ==================

function getCategoryForCommand(commandKey) {
    return CATEGORIES.find(cat => cat.commands.includes(commandKey)) || null;
}

//================== fin getCategoryForCommand ==================


//================== buildMenuMessage ==================

function buildMenuMessage() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## 📖 Comandos del Bot\n` +
            `Tocá un comando para ver sus detalles.`
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    for (const cat of CATEGORIES) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${cat.emoji} ${cat.label}**`)
        );

        const row = new ActionRowBuilder();
        for (const cmdKey of cat.commands) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`help_cmd_${cmdKey}`)
                    .setLabel(`!${cmdKey}`)
                    .setStyle(ButtonStyle.Primary)
            );
        }
        container.addActionRowComponents(row);
    }

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('help_close')
            .setLabel('❌ Cerrar')
            .setStyle(ButtonStyle.Danger)
    );

    return { container, navRow };
}

//================== fin buildMenuMessage ==================


//================== buildDetailMessage ==================

function buildDetailMessage(commandKey) {
    const cmd = COMMANDS_INFO[commandKey];
    const cat = getCategoryForCommand(commandKey);
    if (!cmd || !cat) return null;

    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `${cat.emoji} **${cat.label}** · \`!${commandKey}\`\n\n` +
            `${cmd.description}\n\n` +
            `**Uso:**\n\`${cmd.usage}\`\n\n` +
            `**Ejemplos:**\n${cmd.examples.map(e => `\`${e}\``).join('\n')}`
        )
    );

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('help_back')
            .setLabel('🔙 Volver')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('help_close')
            .setLabel('❌ Cerrar')
            .setStyle(ButtonStyle.Danger)
    );

    return { container, navRow };
}

//================== fin buildDetailMessage ==================


//================== setActivityTimeout ==================

function setActivityTimeout(message, state, paginationStates) {
    if (state.timeoutId) clearTimeout(state.timeoutId);

    const timeoutId = setTimeout(async () => {
        const latest = paginationStates.get(message.id);
        if (!latest) return;

        latest.timeoutId = null;
        paginationStates.set(message.id, latest);

        try {
            if (message.editable) {
                const disabledClose = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('help_close')
                        .setLabel('❌ Cerrar')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(true)
                );
                await message.edit({
                    components: [latest.container, disabledClose],
                    flags: MessageFlags.IsComponentsV2,
                }).catch(() => {});
            }
        } catch (_) {}

        paginationStates.delete(message.id);
    }, TIMEOUT_DURATION_MS);

    state.timeoutId    = timeoutId;
    state.lastActivity = Date.now();
    paginationStates.set(message.id, state);
}

//================== fin setActivityTimeout ==================


//================== module.exports ==================

module.exports = {
    name: 'help',
    description: 'Muestra la lista de comandos interactiva.',
    aliases: ['ayuda'],

    //================== execute ==================
    async execute(client, message, args, { paginationStates }) {
        try {
            // Si se pasa un comando específico → respuesta simple sin botones
            if (args && args.length > 0) {
                const query      = args[0].toLowerCase();
                const commandKey = Object.keys(COMMANDS_INFO).find(k => k === query);

                if (!commandKey) {
                    return message.reply(`❌ No se encontró información para \`!${args[0]}\`.`);
                }

                const result = buildDetailMessage(commandKey);
                if (!result) return;

                return message.reply({
                    components: [result.container],
                    flags: MessageFlags.IsComponentsV2,
                });
            }

            // Menú principal
            const { container, navRow } = buildMenuMessage();

            const state = {
                commandName:     'help',
                view:            'menu',
                messageAuthorId: message.author.id,
                user:            message.author.id,
                container,
                timeoutId:       null,
            };

            const reply = await message.reply({
                components: [container, navRow],
                flags: MessageFlags.IsComponentsV2,
            });

            paginationStates.set(reply.id, state);
            setActivityTimeout(reply, state, paginationStates);

        } catch (err) {
            console.error('❌ Error execute help:', err);
        }
    },
    //================== fin execute ==================


    //================== handleInteraction ==================
    async handleInteraction(interaction, state, { paginationStates }) {
        try {
            if (!interaction.isButton()) return;

            if (interaction.user.id !== state.user) {
                return interaction.reply({ content: '❌ Solo el autor puede usar este menú.', flags: 64 });
            }

            await interaction.deferUpdate().catch(() => {});

            setActivityTimeout(interaction.message, state, paginationStates);

            // ── Cerrar ──
            if (interaction.customId === 'help_close') {
                if (state.timeoutId) clearTimeout(state.timeoutId);
                paginationStates.delete(interaction.message.id);
                return interaction.message.delete().catch(() => {});
            }

            // ── Volver al menú ──
            if (interaction.customId === 'help_back') {
                const { container, navRow } = buildMenuMessage();
                state.view      = 'menu';
                state.container = container;
                paginationStates.set(interaction.message.id, state);

                return interaction.message.edit({
                    components: [container, navRow],
                    flags: MessageFlags.IsComponentsV2,
                }).catch(() => {});
            }

            // ── Ver detalle de comando ──
            if (interaction.customId.startsWith('help_cmd_')) {
                const commandKey = interaction.customId.replace('help_cmd_', '');
                const result     = buildDetailMessage(commandKey);
                if (!result) return;

                state.view      = 'detail';
                state.container = result.container;
                paginationStates.set(interaction.message.id, state);

                return interaction.message.edit({
                    components: [result.container, result.navRow],
                    flags: MessageFlags.IsComponentsV2,
                }).catch(() => {});
            }

        } catch (err) {
            console.error('❌ Error handleInteraction help:', err);
        }
    },
    //================== fin handleInteraction ==================
};

//================== fin module.exports ==================