// bt.js v1.0.3
const {
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    SeparatorBuilder,
    MessageFlags,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');

//================== CONSTANTES ==================

const POKEMON_DATA_PATH = path.join(__dirname, '..', 'pokemon_data.json');
const ITEMS_PER_PAGE    = 15;
const UPDATE_INTERVAL   = 10_000; // 10 segundos
const TIMEOUT_DURATION  = 5 * 60 * 1000; // 5 minutos
const DECORATION_GIF    = 'https://64.media.tumblr.com/46b10f58389e6fd28150a8306b8f34f7/tumblr_mx6re14jMH1rpn9eno1_500.gif';

//================== fin CONSTANTES ==================


//================== loadPokemonData ==================

let _pokemonDataCache = null;
function loadPokemonData() {
    if (_pokemonDataCache) return _pokemonDataCache;
    try {
        if (!fs.existsSync(POKEMON_DATA_PATH)) return [];
        _pokemonDataCache = JSON.parse(fs.readFileSync(POKEMON_DATA_PATH, 'utf8'));
        return _pokemonDataCache;
    } catch (e) {
        console.error('❌ bt.js: Error al cargar pokemon_data.json:', e.message);
        return [];
    }
}

//================== fin loadPokemonData ==================


//================== detectSearchMode (detecta si la query es tipo, región, rareza o nombre) ==================

const KNOWN_TYPES = [
    'normal','fire','water','grass','electric','ice','fighting','poison',
    'ground','flying','psychic','bug','rock','ghost','dragon','dark',
    'steel','fairy'
];
const KNOWN_REGIONS = [
    'kanto','johto','hoenn','sinnoh','unova','kalos','alola','galar','paldea','hisui'
];
const KNOWN_RARITIES = [
    'normal','legendary','mythical','ultra beast','pseudo legendary',
    'paradox','rare','common'
];

function detectSearchMode(query) {
    const q = query.toLowerCase().trim();
    if (KNOWN_TYPES.includes(q))    return { mode: 'type',   label: `Tipo ${capitalize(q)}` };
    if (KNOWN_REGIONS.includes(q))  return { mode: 'region', label: `Región ${capitalize(q)}` };
    if (KNOWN_RARITIES.some(r => q.includes(r))) return { mode: 'rarity', label: `Rareza: ${capitalize(q)}` };
    return { mode: 'name', label: `Nombre: "${capitalize(q)}"` };
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

//================== fin detectSearchMode ==================


//================== getPokemonNamesForQuery (devuelve set de nombres que coinciden con la query) ==================

function getPokemonNamesForQuery(query) {
    const db   = loadPokemonData();
    const q    = query.toLowerCase().trim();
    const { mode } = detectSearchMode(query);
    const matchedNames = new Set();

    for (const entry of db) {
        let match = false;

        if (mode === 'type') {
            match = entry.tipos
                ? entry.tipos.toLowerCase().split(',').map(t => t.trim()).includes(q)
                : false;
        } else if (mode === 'region') {
            match = entry.region
                ? entry.region.toLowerCase().trim() === q
                : false;
        } else if (mode === 'rarity') {
            const rarityValue = (entry.rarity || entry.rareza || entry.rarereza || '').toLowerCase();
            match = rarityValue.includes(q);
        } else {
            // Búsqueda por nombre o alias
            const nameMatch = entry.nombre
                ? entry.nombre.toLowerCase().includes(q)
                : false;
            const aliasMatch = Array.isArray(entry.alias)
                ? entry.alias.some(a => a.toLowerCase().includes(q))
                : false;
            match = nameMatch || aliasMatch;
        }

        if (match) {
            // Guardamos el nombre en minúsculas para comparar con lockedChannels
            matchedNames.add(entry.nombre.toLowerCase());
            // También los alias en minúsculas
            if (Array.isArray(entry.alias)) {
                entry.alias.forEach(a => matchedNames.add(a.toLowerCase()));
            }
        }
    }

    return matchedNames;
}

//================== fin getPokemonNamesForQuery ==================


//================== getLockedList ==================

function getLockedList(client, matchedNames, guildId, lockedChannels) {
    const result = [];

    for (const [channelId, data] of lockedChannels.entries()) {
        if (!data.pokemon) continue;

        const channel = client.channels.cache.get(channelId);
        if (!channel || !channel.guild) continue;

        if (guildId && channel.guild.id !== guildId) continue;

        const pokemonLower = data.pokemon.toLowerCase();
        if (!matchedNames.has(pokemonLower)) continue;

        result.push({
            id:          channelId,
            channelName: channel.name,
            guildId:     channel.guild.id,
            guildName:   channel.guild.name,
            pokemon:     data.pokemon,
            type:        data.type === 'private' ? 'Privado' : 'Público',
        });
    }

    return result.sort((a, b) => a.pokemon.localeCompare(b.pokemon) || a.channelName.localeCompare(b.channelName));
}

//================== fin getLockedList ==================


//================== buildMessage ==================

function buildMessage(state) {
    const { query, list, currentPage, isGlobal, searchLabel, globalHint } = state;
    const totalPages  = Math.max(1, Math.ceil(list.length / ITEMS_PER_PAGE));
    const start       = currentPage * ITEMS_PER_PAGE;
    const pageItems   = list.slice(start, start + ITEMS_PER_PAGE);
    const modeLabel   = isGlobal ? '🌎 Global' : '🏠 Local';
    const count       = list.length;

    // ── Contenedor principal ──
    const container = new ContainerBuilder();

    // Sección: título + gif decorativo
    const section = new SectionBuilder();
    section.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## 🔍 Búsqueda: ${searchLabel}\n` +
            `**${modeLabel}** · ${count} canal${count !== 1 ? 'es' : ''} bloqueado${count !== 1 ? 's' : ''}`
        )
    );
    section.setThumbnailAccessory(
        thumbnail => thumbnail.setURL(DECORATION_GIF)
    );
    container.addSectionComponents(section);

    // Separador
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Botones de canales
    if (pageItems.length === 0) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `*No hay canales bloqueados con __${query}__ en este servidor.*${globalHint || ''}`
            )
        );
    } else {
        for (let r = 0; r < pageItems.length; r += 5) {
            const rowItems = pageItems.slice(r, r + 5);
            const row = new ActionRowBuilder();
            for (const item of rowItems) {
                // Mostrar nombre del pokemon + número de canal
                const label = `${item.pokemon} #${item.channelName}`.slice(0, 25);
                row.addComponents(
                    new ButtonBuilder()
                        .setLabel(label)
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/channels/${item.guildId}/${item.id}`)
                );
            }
            container.addActionRowComponents(row);
        }
    }

    // ── Fila de navegación fuera del contenedor ──
    const isFirstPage = currentPage === 0;
    const isLastPage  = currentPage >= totalPages - 1;

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('bt_prev')
            .setLabel('◀ Anterior')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(isFirstPage),

        new ButtonBuilder()
            .setCustomId('bt_page')
            .setLabel(`${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),

        new ButtonBuilder()
            .setCustomId('bt_next')
            .setLabel('Siguiente ▶')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(isLastPage),

        new ButtonBuilder()
            .setCustomId('bt_toggle_global')
            .setLabel('🌎 Glob.')
            .setStyle(isGlobal ? ButtonStyle.Success : ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('bt_close')
            .setLabel('❌ Cerrar')
            .setStyle(ButtonStyle.Danger)
    );

    return { container, navRow };
}

//================== fin buildMessage ==================


//================== setActivityTimeout ==================

function setActivityTimeout(message, state, paginationStates) {
    if (state.timeoutId) clearTimeout(state.timeoutId);

    const timeoutId = setTimeout(async () => {
        const latest = paginationStates.get(message.id);
        if (!latest) return;

        if (latest.intervalId) clearInterval(latest.intervalId);
        latest.timeoutId  = null;
        latest.intervalId = null;
        latest.expired    = true;
        paginationStates.set(message.id, latest);

        try {
            if (message.editable) {
                const totalPages = Math.max(1, Math.ceil(latest.list.length / ITEMS_PER_PAGE));
                const disabledNav = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('bt_prev').setLabel('◀ Anterior').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('bt_page').setLabel(`${latest.currentPage + 1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('bt_next').setLabel('Siguiente ▶').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('bt_toggle_global').setLabel('🌎 Glob.').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('bt_close').setLabel('❌ Cerrar').setStyle(ButtonStyle.Danger).setDisabled(true),
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


//================== startUpdateInterval ==================

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
            current.matchedNames,
            current.isGlobal ? null : current.guildId,
            lockedChannels
        );

        const oldIds = current.list.map(x => x.id).sort().join(',');
        const newIds = newList.map(x => x.id).sort().join(',');
        if (oldIds === newIds) return;

        current.list = newList;
        const totalPages = Math.max(1, Math.ceil(newList.length / ITEMS_PER_PAGE));
        if (current.currentPage >= totalPages) current.currentPage = totalPages - 1;

        paginationStates.set(message.id, current);

        try {
            const { container, navRow } = buildMessage(current);
            current.container = container;
            await message.edit({
                components: [container, navRow],
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
    name: 'bt',
    description: 'Busca canales bloqueados por tipo, región, rareza o nombre usando la base de datos.',
    aliases: ['buscartype', 'buscartipos'],

    //================== execute ==================
    async execute(client, message, args, { lockedChannels, paginationStates }) {

        if (!args.length) {
            return message.reply(
                '❌ Uso: `!bt <búsqueda>`\n' +
                '> Por tipo: `!bt poison`\n' +
                '> Por región: `!bt kanto`\n' +
                '> Por rareza: `!bt legendary`\n' +
                '> Por nombre: `!bt alolan`'
            );
        }

        const query      = args.join(' ').trim();
        const { label: searchLabel } = detectSearchMode(query);
        const matchedNames = getPokemonNamesForQuery(query);

        if (matchedNames.size === 0) {
            return message.reply(`❌ No se encontró ningún Pokémon en la base de datos para: **${query}**`);
        }

        const list = getLockedList(client, matchedNames, message.guild.id, lockedChannels);

        // Si no hay nada local, verificar si hay en global para mostrar aviso dentro del mensaje
        let globalHint = '';
        if (list.length === 0) {
            const globalList = getLockedList(client, matchedNames, null, lockedChannels);
            if (globalList.length > 0) {
                globalHint = `\n> 🌎 Hay **${globalList.length}** canal${globalList.length !== 1 ? 'es' : ''} en otros servidores. Tocá **Glob.** para verlos.`;
            }
        }

        const state = {
            commandName:     'bt',
            query,
            searchLabel,
            matchedNames,
            globalHint,
            guildId:         message.guild.id,
            isGlobal:        false,
            list,
            currentPage:     0,
            messageAuthorId: message.author.id,
            timeoutId:       null,
            intervalId:      null,
            expired:         false,
            container:       null,
        };

        const { container, navRow } = buildMessage(state);
        state.container = container;

        const reply = await message.reply({
            components: [container, navRow],
            flags: MessageFlags.IsComponentsV2,
        });

        paginationStates.set(reply.id, state);
        setActivityTimeout(reply, state, paginationStates);
        startUpdateInterval(reply, state, paginationStates, client, lockedChannels);
    },
    //================== fin execute ==================


    //================== handleInteraction ==================
    async handleInteraction(interaction, state, { paginationStates, lockedChannels }) {

        if (state.expired) return interaction.deferUpdate().catch(() => {});

        await interaction.deferUpdate().catch(() => {});

        setActivityTimeout(interaction.message, state, paginationStates);

        const { customId } = interaction;

        // ── Cerrar ──
        if (customId === 'bt_close') {
            if (state.timeoutId)  clearTimeout(state.timeoutId);
            if (state.intervalId) clearInterval(state.intervalId);
            paginationStates.delete(interaction.message.id);
            return interaction.message.delete().catch(() => {});
        }

        // ── Toggle local / global ──
        if (customId === 'bt_toggle_global') {
            state.isGlobal    = !state.isGlobal;
            state.currentPage = 0;
            state.list        = getLockedList(
                interaction.client,
                state.matchedNames,
                state.isGlobal ? null : state.guildId,
                lockedChannels
            );
            // Recalcular el hint cuando volvemos a local
            if (!state.isGlobal && state.list.length === 0) {
                const globalList = getLockedList(interaction.client, state.matchedNames, null, lockedChannels);
                state.globalHint = globalList.length > 0
                    ? `\n> 🌎 Hay **${globalList.length}** canal${globalList.length !== 1 ? 'es' : ''} en otros servidores. Tocá **Glob.** para verlos.`
                    : '';
            } else {
                state.globalHint = '';
            }
        }

        // ── Paginación ──
        if (customId === 'bt_prev' && state.currentPage > 0) {
            state.currentPage--;
        }
        if (customId === 'bt_next') {
            const totalPages = Math.max(1, Math.ceil(state.list.length / ITEMS_PER_PAGE));
            if (state.currentPage < totalPages - 1) state.currentPage++;
        }

        const { container, navRow } = buildMessage(state);
        state.container = container;
        paginationStates.set(interaction.message.id, state);

        await interaction.message.edit({
            components: [container, navRow],
            flags: MessageFlags.IsComponentsV2,
        }).catch(err => {
            console.error('❌ Error editando mensaje bt:', err.message);
        });
    },
    //================== fin handleInteraction ==================
};

//================== fin module.exports ==================