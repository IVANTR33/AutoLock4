// info.js v1.0.2
const {
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    SeparatorBuilder,
    MessageFlags,
    PermissionsBitField,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');

//================== CONSTANTES ==================

const IMAGES_DIR        = path.join(__dirname, '..', 'imagenes');
const ITEMS_PER_PAGE    = 15;   // máximo de botones de canal (límite Discord: 40 componentes totales)
const UPDATE_INTERVAL   = 10_000; // 10 segundos
const TIMEOUT_DURATION  = 5 * 60 * 1000; // 5 minutos de inactividad

//================== fin CONSTANTES ==================


//================== findImagePath (busca la imagen del pokemon) ==================

function findImagePath(pokemonName) {
    if (!fs.existsSync(IMAGES_DIR)) return null;

    // Intentos de nombre en orden de prioridad
    const candidates = [
        `${pokemonName}.png`,
        `${pokemonName.charAt(0).toUpperCase() + pokemonName.slice(1).toLowerCase()}.png`,
        `${pokemonName.toLowerCase()}.png`,
        `${pokemonName.toUpperCase()}.png`,
    ];

    for (const candidate of candidates) {
        const full = path.join(IMAGES_DIR, candidate);
        if (fs.existsSync(full)) return full;
    }

    // Búsqueda case-insensitive como último recurso
    try {
        const files = fs.readdirSync(IMAGES_DIR);
        const lower = pokemonName.toLowerCase();
        const match = files.find(f => f.toLowerCase() === `${lower}.png`);
        if (match) return path.join(IMAGES_DIR, match);
    } catch (_) {}

    return null;
}

//================== fin findImagePath ==================


//================== getLockedList (obtiene canales bloqueados filtrados) ==================

function getLockedList(client, pokemonName, guildId, lockedChannels) {
    const lower = pokemonName.toLowerCase();
    const result = [];

    for (const [channelId, data] of lockedChannels.entries()) {
        if (!data.pokemon || !data.pokemon.toLowerCase().includes(lower)) continue;

        const channel = client.channels.cache.get(channelId);
        if (!channel || !channel.guild) continue;

        // Modo local: solo el servidor actual
        if (guildId && channel.guild.id !== guildId) continue;

        result.push({
            id:          channelId,
            channelName: channel.name,
            guildId:     channel.guild.id,
            guildName:   channel.guild.name,
            pokemon:     data.pokemon,
            type:        data.type === 'private' ? 'Privado' : 'Público',
        });
    }

    return result.sort((a, b) => a.channelName.localeCompare(b.channelName));
}

//================== fin getLockedList ==================


//================== buildMessage (construye el mensaje Components V2) ==================

function buildMessage(state, imagePath) {
    const { pokemonName, list, currentPage, isGlobal } = state;
    const totalPages = Math.max(1, Math.ceil(list.length / ITEMS_PER_PAGE));
    const start      = currentPage * ITEMS_PER_PAGE;
    const pageItems  = list.slice(start, start + ITEMS_PER_PAGE);

    const displayName = pokemonName.charAt(0).toUpperCase() + pokemonName.slice(1).toLowerCase();
    const modeLabel   = isGlobal ? '🌎 Global' : '🏠 Local';
    const count       = list.length;

    // ── Contenedor principal ──
    const container = new ContainerBuilder();

    // Sección: título + thumbnail
    const section = new SectionBuilder();

    section.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## ${displayName}\n` +
            `**${modeLabel}** · ${count} canal${count !== 1 ? 'es' : ''} bloqueado${count !== 1 ? 's' : ''}`
        )
    );

    if (imagePath) {
        section.setThumbnailAccessory(
            thumbnail => thumbnail.setURL(`attachment://${path.basename(imagePath)}`)
        );
    }

    container.addSectionComponents(section);

    // Separador
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Botones de canales (dentro del contenedor)
    if (pageItems.length === 0) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('*No hay canales bloqueados con este Pokémon.*')
        );
    } else {
        // Filas de hasta 5 botones cada una (máximo 3 filas = 15 botones)
        for (let r = 0; r < pageItems.length; r += 5) {
            const rowItems = pageItems.slice(r, r + 5);
            const row = new ActionRowBuilder();
            for (const item of rowItems) {
                const label = item.channelName.slice(0, 20);
                row.addComponents(
                    new ButtonBuilder()
                        .setLabel(`#${label}`)
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/channels/${item.guildId}/${item.id}`)
                );
            }
            container.addActionRowComponents(row);
        }
    }

    // ── Fila de navegación FUERA del contenedor ──
    const isFirstPage = currentPage === 0;
    const isLastPage  = currentPage >= totalPages - 1;

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('info_prev')
            .setLabel('◀ Anterior')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(isFirstPage),

        new ButtonBuilder()
            .setCustomId('info_page')
            .setLabel(`${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),

        new ButtonBuilder()
            .setCustomId('info_next')
            .setLabel('Siguiente ▶')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(isLastPage),

        new ButtonBuilder()
            .setCustomId('info_toggle_global')
            .setLabel(isGlobal ? '🌎 Glob.' : '🌎 Glob.')
            .setStyle(isGlobal ? ButtonStyle.Success : ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('info_close')
            .setLabel('❌ Cerrar')
            .setStyle(ButtonStyle.Danger)
    );

    return { container, navRow, imagePath };
}

//================== fin buildMessage ==================


//================== setActivityTimeout ==================

function setActivityTimeout(message, state, paginationStates) {
    if (state.timeoutId) clearTimeout(state.timeoutId);

    const timeoutId = setTimeout(async () => {
        const latest = paginationStates.get(message.id);
        if (!latest) return;

        // Limpiar intervalo de actualización
        if (latest.intervalId) clearInterval(latest.intervalId);

        latest.timeoutId  = null;
        latest.intervalId = null;
        latest.expired    = true;
        paginationStates.set(message.id, latest);

        try {
            if (message.editable) {
                // Deshabilitar solo la fila de navegación (components[1])
                const disabledNav = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('info_prev').setLabel('◀ Anterior').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('info_page').setLabel(`${latest.currentPage + 1}/${Math.max(1, Math.ceil(latest.list.length / ITEMS_PER_PAGE))}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('info_next').setLabel('Siguiente ▶').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('info_toggle_global').setLabel('🌎 Glob.').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('info_close').setLabel('❌ Cerrar').setStyle(ButtonStyle.Danger).setDisabled(true),
                );

                await message.edit({
                    components: [latest.container, disabledNav],
                    flags: MessageFlags.IsComponentsV2,
                }).catch(() => {});
            }
        } catch (_) {}

        paginationStates.delete(message.id);
    }, TIMEOUT_DURATION);

    state.timeoutId    = timeoutId;
    state.lastActivity = Date.now();
    paginationStates.set(message.id, state);
}

//================== fin setActivityTimeout ==================


//================== startUpdateInterval (actualiza la lista cada 10s) ==================

function startUpdateInterval(message, state, paginationStates, client, lockedChannels) {
    if (state.intervalId) clearInterval(state.intervalId);

    const intervalId = setInterval(async () => {
        const current = paginationStates.get(message.id);
        if (!current || current.expired) {
            clearInterval(intervalId);
            return;
        }

        const newList = getLockedList(
            client,
            current.pokemonName,
            current.isGlobal ? null : current.guildId,
            lockedChannels
        );

        // Solo redibujar si cambió la cantidad de canales
        const oldIds = current.list.map(x => x.id).sort().join(',');
        const newIds = newList.map(x => x.id).sort().join(',');
        if (oldIds === newIds) return;

        current.list = newList;

        // Ajustar página si quedó fuera de rango
        const totalPages = Math.max(1, Math.ceil(newList.length / ITEMS_PER_PAGE));
        if (current.currentPage >= totalPages) current.currentPage = totalPages - 1;

        paginationStates.set(message.id, current);

        try {
            const imagePath = current.imagePath;
            const { container, navRow } = buildMessage(current, imagePath);
            current.container = container;

            const files = imagePath ? [{ attachment: imagePath, name: path.basename(imagePath) }] : [];

            await message.edit({
                components: [container, navRow],
                files,
                flags: MessageFlags.IsComponentsV2,
            }).catch(() => {});
        } catch (_) {}

    }, UPDATE_INTERVAL);

    state.intervalId = intervalId;
    paginationStates.set(message.id, state);
}

//================== fin startUpdateInterval ==================


//================== module.exports ==================

module.exports = {
    name: 'info',
    description: 'Muestra información de canales bloqueados para un Pokémon con imagen.',
    aliases: ['pokemon', 'pkinfo'],

    //================== execute ==================
    async execute(client, message, args, { lockedChannels, paginationStates }) {
        try {

        if (!args.length) {
            return message.reply('❌ Uso: `!info <nombre>` — Ejemplo: `!info pikachu`');
        }

        const pokemonName = args.join(' ').trim();
        const imagePath   = findImagePath(pokemonName);

        // Lista inicial en modo LOCAL
        const list = getLockedList(client, pokemonName, message.guild.id, lockedChannels);

        const state = {
            commandName:  'info',
            pokemonName,
            guildId:      message.guild.id,
            isGlobal:     false,
            list,
            currentPage:  0,
            imagePath,
            messageAuthorId: message.author.id,
            timeoutId:    null,
            intervalId:   null,
            expired:      false,
            container:    null,
        };

        const { container, navRow } = buildMessage(state, imagePath);
        state.container = container;

        const files = imagePath
            ? [{ attachment: imagePath, name: path.basename(imagePath) }]
            : [];

        const reply = await message.reply({
            components: [container, navRow],
            files,
            flags: MessageFlags.IsComponentsV2,
        });

        paginationStates.set(reply.id, state);
        setActivityTimeout(reply, state, paginationStates);
        startUpdateInterval(reply, state, paginationStates, client, lockedChannels);

        } catch (err) {
            console.error('❌ Error ejecutando comando info:', err);
            message.reply('❌ Pokémon no encontrado. Verificá que el nombre sea correcto.').catch(() => {});
        }
    },
    //================== fin execute ==================


    //================== handleInteraction ==================
    async handleInteraction(interaction, state, { paginationStates, lockedChannels }) {

        if (state.expired) return interaction.deferUpdate().catch(() => {});

        await interaction.deferUpdate().catch(() => {});

        // Reiniciar temporizador de inactividad
        setActivityTimeout(interaction.message, state, paginationStates);

        const { customId } = interaction;

        // ── Cerrar ──
        if (customId === 'info_close') {
            if (state.timeoutId)  clearTimeout(state.timeoutId);
            if (state.intervalId) clearInterval(state.intervalId);
            paginationStates.delete(interaction.message.id);
            return interaction.message.delete().catch(() => {});
        }

        // ── Toggle local / global ──
        if (customId === 'info_toggle_global') {
            state.isGlobal    = !state.isGlobal;
            state.currentPage = 0;
            state.list        = getLockedList(
                interaction.client,
                state.pokemonName,
                state.isGlobal ? null : state.guildId,
                lockedChannels
            );
        }

        // ── Paginación ──
        if (customId === 'info_prev' && state.currentPage > 0) {
            state.currentPage--;
        }
        if (customId === 'info_next') {
            const totalPages = Math.max(1, Math.ceil(state.list.length / ITEMS_PER_PAGE));
            if (state.currentPage < totalPages - 1) state.currentPage++;
        }

        const { container, navRow } = buildMessage(state, state.imagePath);
        state.container = container;
        paginationStates.set(interaction.message.id, state);

        const files = state.imagePath
            ? [{ attachment: state.imagePath, name: path.basename(state.imagePath) }]
            : [];

        await interaction.message.edit({
            components: [container, navRow],
            files,
            flags: MessageFlags.IsComponentsV2,
        }).catch(err => {
            console.error('❌ Error editando mensaje info:', err.message);
        });
    },
    //================== fin handleInteraction ==================
};

//================== fin module.exports ==================