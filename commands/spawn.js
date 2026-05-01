// spawn.js v2.0.1
const {
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
} = require('discord.js');

//================== CACHE Y ESTADO GLOBAL ==================

// Map: channelId → { pokemonName, timestamp, guildId }
const spawnCache = new Map();

// Set de canales ya escaneados en el arranque
const scannedChannels = new Set();

let scanComplete    = false;
let scanInProgress  = false;
let totalToScan     = 0;
let totalScanned    = 0;

//================== fin CACHE Y ESTADO GLOBAL ==================


//================== CONSTANTES ==================

const ITEMS_PER_PAGE   = 15;
const TIMEOUT_DURATION = 5 * 60 * 1000; // 5 minutos
const UPDATE_INTERVAL  = 3_000;          // 3 segundos (más rápido porque es tiempo real)
const SCAN_BATCH_SIZE  = 10;             // canales por lote en el escaneo inicial
const SCAN_DELAY_MS    = 300;            // delay entre lotes para evitar rate limit

const CAPTURE_KEYWORDS = ['you caught a', 'congratulations', 'felicidades'];
const SPAWN_KEYWORDS   = ['a wild pokémon has appeared', 'apareció un pokémon salvaje'];
const MESSAGES_TO_FETCH = 3;

//================== fin CONSTANTES ==================


//================== HELPERS DE CACHE ==================

function setCache(channelId, pokemonName, guildId) {
    spawnCache.set(channelId, {
        pokemonName: pokemonName.toLowerCase(),
        displayName: pokemonName,
        timestamp:   Date.now(),
        guildId,
    });
}

function clearCache(channelId) {
    spawnCache.delete(channelId);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

//================== fin HELPERS DE CACHE ==================


//================== PROCESADOR DE MENSAJES (extrae spawn o captura) ==================

function processMessages(messages, NAME_BOT_IDS, POKETWO_ID, extractPokemonName, normalizeForComparison) {
    const arr = Array.from(messages.values());

    let isCaptured       = false;
    let mostRecentSpawn  = 0;
    let detectedName     = null;

    // Fase 1: detectar captura o spawn de Pokétwo
    for (const msg of arr) {
        if (msg.author.id !== POKETWO_ID) continue;
        const lower = (msg.content || '').toLowerCase();

        if (CAPTURE_KEYWORDS.some(k => lower.includes(k))) {
            isCaptured = true;
            break;
        }
        if (SPAWN_KEYWORDS.some(k => lower.includes(k)) ||
            (msg.embeds.length > 0 && msg.embeds[0].image)) {
            if (msg.createdAt.getTime() > mostRecentSpawn) {
                mostRecentSpawn = msg.createdAt.getTime();
            }
        }
    }

    if (isCaptured) return { isCaptured: true, name: null };

    // Fase 2: buscar nombre del bot de nombres
    for (const msg of arr) {
        if (!NAME_BOT_IDS.includes(msg.author.id)) continue;
        const extracted = extractPokemonName(msg.content, msg.author.id);
        if (!extracted) continue;

        // Ignorar si el mensaje de nombre es más viejo que el spawn más reciente
        if (mostRecentSpawn > 0 && mostRecentSpawn > msg.createdAt.getTime()) continue;

        detectedName = extracted;
        break;
    }

    return { isCaptured: false, name: detectedName };
}

//================== fin PROCESADOR DE MENSAJES ==================


//================== ESCANEO INICIAL ==================

async function runInitialScan(client, NAME_BOT_IDS, POKETWO_ID, extractPokemonName, normalizeForComparison, lockedChannels) {
    if (scanInProgress) return;
    scanInProgress = true;
    scanComplete   = false;

    console.log('🔍 [spawn.js] Iniciando escaneo inicial de canales...');

    // Recopilar todos los canales válidos de todos los servidores, saltear bloqueados
    const allChannels = [];
    for (const guild of client.guilds.cache.values()) {
        const channels = guild.channels.cache.filter(c =>
            c.type === 0 &&
            /^\d{1,3}$/.test(c.name) &&
            parseInt(c.name) <= 450 &&
            !lockedChannels.has(c.id)
        );
        for (const channel of channels.values()) {
            allChannels.push(channel);
        }
    }

    totalToScan  = allChannels.length;
    totalScanned = 0;

    console.log(`🔍 [spawn.js] ${totalToScan} canales a escanear en ${client.guilds.cache.size} servidores.`);

    // Escanear en lotes para evitar rate limit
    for (let i = 0; i < allChannels.length; i += SCAN_BATCH_SIZE) {
        const batch = allChannels.slice(i, i + SCAN_BATCH_SIZE);

        await Promise.all(batch.map(async (channel) => {
            // Si el listener ya registró este canal, saltearlo
            if (scannedChannels.has(channel.id)) {
                totalScanned++;
                return;
            }

            try {
                const messages = await channel.messages.fetch({ limit: MESSAGES_TO_FETCH });
                const { isCaptured, name } = processMessages(
                    messages, NAME_BOT_IDS, POKETWO_ID,
                    extractPokemonName, normalizeForComparison
                );

                if (!isCaptured && name) {
                    setCache(channel.id, name, channel.guild.id);
                } else {
                    clearCache(channel.id);
                }

                scannedChannels.add(channel.id);
            } catch (_) {
                // Sin permisos o canal inaccesible — ignorar
            }

            totalScanned++;
        }));

        // Log de progreso cada 100 canales
        if (Math.floor(totalScanned / 100) > Math.floor((totalScanned - SCAN_BATCH_SIZE) / 100)) {
            console.log(`🔍 [spawn.js] Progreso: ${totalScanned}/${totalToScan} canales escaneados. Cache: ${spawnCache.size} spawns.`);
        }

        await sleep(SCAN_DELAY_MS);
    }

    scanComplete   = true;
    scanInProgress = false;
    console.log(`✅ [spawn.js] Escaneo completo. ${spawnCache.size} spawns en cache de ${totalToScan} canales.`);
}

//================== fin ESCANEO INICIAL ==================


//================== LISTENER EN TIEMPO REAL ==================

function registerListener(client, NAME_BOT_IDS, POKETWO_ID, extractPokemonName, normalizeForComparison) {
    client.on('messageCreate', async (message) => {
        // Solo canales de spawn (1-450)
        if (!/^\d{1,3}$/.test(message.channel.name) || parseInt(message.channel.name) > 450) return;

        const channelId = message.channel.id;
        const guildId   = message.guild?.id;
        if (!guildId) return;

        // Mensaje de Pokétwo
        if (message.author.id === POKETWO_ID) {
            const lower = (message.content || '').toLowerCase();

            // Captura → limpiar cache
            if (CAPTURE_KEYWORDS.some(k => lower.includes(k))) {
                clearCache(channelId);
                scannedChannels.add(channelId);
                return;
            }

            // Nuevo spawn → marcar canal como "esperando nombre"
            const isSpawn = SPAWN_KEYWORDS.some(k => lower.includes(k)) ||
                (message.embeds.length > 0 && message.embeds[0].image);

            if (isSpawn) {
                // Limpiar cache anterior del canal porque hay spawn nuevo
                clearCache(channelId);
                scannedChannels.add(channelId);
            }
            return;
        }

        // Mensaje de bot de nombres → registrar en cache
        if (NAME_BOT_IDS.includes(message.author.id)) {
            const extracted = extractPokemonName(message.content, message.author.id);
            if (!extracted) return;

            setCache(channelId, extracted, guildId);
            scannedChannels.add(channelId);
        }
    });
}

//================== fin LISTENER EN TIEMPO REAL ==================


//================== getResults (consulta el cache) ==================

function getResults(client, searchTerm, guildId, normalizeForComparison) {
    const normalized = normalizeForComparison(searchTerm);
    const results    = [];

    for (const [channelId, data] of spawnCache.entries()) {
        if (normalizeForComparison(data.pokemonName) !== normalized) continue;

        // Filtro por servidor si es local
        if (guildId && data.guildId !== guildId) continue;

        const channel = client.channels.cache.get(channelId);
        if (!channel || !channel.guild) continue;

        results.push({
            channelId,
            channelName: channel.name,
            channelMention: `<#${channelId}>`,
            guildId:     data.guildId,
            guildName:   channel.guild.name,
            displayName: data.displayName,
            timestamp:   data.timestamp,
        });
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
}

//================== fin getResults ==================


//================== buildMessage (Components V2) ==================

function buildMessage(state) {
    const { searchTerm, results, currentPage, isGlobal } = state;
    const totalPages = Math.max(1, Math.ceil(results.length / ITEMS_PER_PAGE));
    const start      = currentPage * ITEMS_PER_PAGE;
    const pageItems  = results.slice(start, start + ITEMS_PER_PAGE);
    const modeLabel  = isGlobal ? '🌎 Global' : '🏠 Local';
    const count      = results.length;

    const scanStatus = scanComplete
        ? ''
        : `\n> ⏳ Escaneo en progreso: ${totalScanned}/${totalToScan} canales`;

    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## 🔍 Spawn: ${state.displayName}\n` +
            `**${modeLabel}** · ${count} canal${count !== 1 ? 'es' : ''} con spawn activo` +
            scanStatus
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (pageItems.length === 0) {
        const globalCount = state.globalCount || 0;
        const hint = (!isGlobal && globalCount > 0)
            ? `\n> 🌎 Hay **${globalCount}** resultado${globalCount !== 1 ? 's' : ''} en otros servidores. Tocá **Glob.** para verlos.`
            : '';
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `*No hay spawns activos de __${searchTerm}__ en este servidor.*${hint}`
            )
        );
    } else {
        for (let r = 0; r < pageItems.length; r += 5) {
            const rowItems = pageItems.slice(r, r + 5);
            const row = new ActionRowBuilder();
            for (const item of rowItems) {
                const label = `${item.displayName} #${item.channelName}`.slice(0, 25);
                row.addComponents(
                    new ButtonBuilder()
                        .setLabel(label)
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/channels/${item.guildId}/${item.channelId}`)
                );
            }
            container.addActionRowComponents(row);
        }
    }

    const isFirstPage = currentPage === 0;
    const isLastPage  = currentPage >= totalPages - 1;

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('spawn2_prev')
            .setLabel('◀ Anterior')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(isFirstPage),

        new ButtonBuilder()
            .setCustomId('spawn2_page')
            .setLabel(`${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),

        new ButtonBuilder()
            .setCustomId('spawn2_next')
            .setLabel('Siguiente ▶')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(isLastPage),

        new ButtonBuilder()
            .setCustomId('spawn2_toggle_global')
            .setLabel('🌎 Glob.')
            .setStyle(isGlobal ? ButtonStyle.Success : ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('spawn2_close')
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
                const totalPages = Math.max(1, Math.ceil(latest.results.length / ITEMS_PER_PAGE));
                const disabledNav = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('spawn2_prev').setLabel('◀ Anterior').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('spawn2_page').setLabel(`${latest.currentPage + 1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('spawn2_next').setLabel('Siguiente ▶').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('spawn2_toggle_global').setLabel('🌎 Glob.').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('spawn2_close').setLabel('❌ Cerrar').setStyle(ButtonStyle.Danger).setDisabled(true),
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

function startUpdateInterval(message, state, paginationStates, client, normalizeForComparison) {
    if (state.intervalId) clearInterval(state.intervalId);

    const intervalId = setInterval(async () => {
        const current = paginationStates.get(message.id);
        if (!current || current.expired) {
            clearInterval(intervalId);
            return;
        }

        const newResults = getResults(
            client,
            current.searchTerm,
            current.isGlobal ? null : current.guildId,
            normalizeForComparison
        );

        const oldIds = current.results.map(x => x.channelId).sort().join(',');
        const newIds = newResults.map(x => x.channelId).sort().join(',');

        // Actualizar también si el escaneo sigue en progreso (para mostrar progreso actualizado)
        const scanChanged = !scanComplete;

        if (oldIds === newIds && !scanChanged) return;

        current.results = newResults;

        // Calcular global count para el hint
        if (!current.isGlobal) {
            const globalResults = getResults(client, current.searchTerm, null, normalizeForComparison);
            current.globalCount = globalResults.length - newResults.length;
        }

        const totalPages = Math.max(1, Math.ceil(newResults.length / ITEMS_PER_PAGE));
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
    name: 'spawn',
    description: 'Busca spawns activos usando cache en tiempo real. Resultados instantáneos.',
    aliases: ['sp'],

    //================== init (llamado desde index.js al arrancar) ==================
    init(client, { NAME_BOT_IDS, POKETWO_ID, extractPokemonName, normalizeForComparison, lockedChannels }) {
        // Registrar listener en tiempo real
        registerListener(client, NAME_BOT_IDS, POKETWO_ID, extractPokemonName, normalizeForComparison);

        // Arrancar escaneo inicial en segundo plano (no bloquea el bot)
        runInitialScan(client, NAME_BOT_IDS, POKETWO_ID, extractPokemonName, normalizeForComparison, lockedChannels)
            .catch(err => console.error('❌ [spawn.js] Error en escaneo inicial:', err.message));
    },
    //================== fin init ==================


    //================== execute ==================
    async execute(client, message, args, { paginationStates, normalizeForComparison, lockedChannels }) {

        if (!args.length) {
            return message.reply('❌ Uso: `!spawn <nombre>` — Ejemplo: `!spawn pikachu`');
        }

        const searchTerm  = args.join(' ').trim();
        const displayName = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase();

        const results = getResults(client, searchTerm, message.guild.id, normalizeForComparison);

        // Calcular cuántos hay en global para el hint
        const globalResults = getResults(client, searchTerm, null, normalizeForComparison);
        const globalCount   = globalResults.length - results.length;

        const scanStatus = !scanComplete
            ? `\n> ⏳ Escaneo inicial en progreso (${totalScanned}/${totalToScan}). Los resultados se actualizan en tiempo real.`
            : '';

        const state = {
            commandName:     'spawn',
            searchTerm,
            displayName,
            guildId:         message.guild.id,
            isGlobal:        false,
            results,
            globalCount,
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
        startUpdateInterval(reply, state, paginationStates, client, normalizeForComparison);
    },
    //================== fin execute ==================


    //================== handleInteraction ==================
    async handleInteraction(interaction, state, { paginationStates, normalizeForComparison }) {

        if (state.expired) return interaction.deferUpdate().catch(() => {});

        await interaction.deferUpdate().catch(() => {});

        setActivityTimeout(interaction.message, state, paginationStates);

        const { customId } = interaction;

        // ── Cerrar ──
        if (customId === 'spawn2_close') {
            if (state.timeoutId)  clearTimeout(state.timeoutId);
            if (state.intervalId) clearInterval(state.intervalId);
            paginationStates.delete(interaction.message.id);
            return interaction.message.delete().catch(() => {});
        }

        // ── Toggle local / global ──
        if (customId === 'spawn2_toggle_global') {
            state.isGlobal    = !state.isGlobal;
            state.currentPage = 0;
            state.results     = getResults(
                interaction.client,
                state.searchTerm,
                state.isGlobal ? null : state.guildId,
                normalizeForComparison
            );
            if (!state.isGlobal) {
                const globalResults = getResults(interaction.client, state.searchTerm, null, normalizeForComparison);
                state.globalCount = globalResults.length - state.results.length;
            } else {
                state.globalCount = 0;
            }
        }

        // ── Paginación ──
        if (customId === 'spawn2_prev' && state.currentPage > 0) {
            state.currentPage--;
        }
        if (customId === 'spawn2_next') {
            const totalPages = Math.max(1, Math.ceil(state.results.length / ITEMS_PER_PAGE));
            if (state.currentPage < totalPages - 1) state.currentPage++;
        }

        const { container, navRow } = buildMessage(state);
        state.container = container;
        paginationStates.set(interaction.message.id, state);

        await interaction.message.edit({
            components: [container, navRow],
            flags: MessageFlags.IsComponentsV2,
        }).catch(err => {
            console.error('❌ Error editando mensaje spawn:', err.message);
        });
    },
    //================== fin handleInteraction ==================


    // Exponer cache para debug si hace falta
    getCache: () => spawnCache,
    getScanStatus: () => ({ scanComplete, scanInProgress, totalScanned, totalToScan }),
};

//================== fin module.exports ==================