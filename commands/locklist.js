// locklist.js v1.0.3 (Fix de Compatibilidad de IDs con index.js)
const { 
    EmbedBuilder, 
    PermissionsBitField, 
    ActionRowBuilder, 
    ButtonBuilder,   
    ButtonStyle,
    Collection      
} = require('discord.js');

const ITEMS_PER_PAGE = 15; 
const BUTTONS_PER_ROW = 5; 

// === FUNCIÓN AUXILIAR: CREACIÓN DE BOTONES DE CANAL ===
function createChannelLinkRows(currentItems, guildId, startItemIndex = 0) {
    const rows = [];
    let currentRow = new ActionRowBuilder();

    currentItems.forEach((item, index) => {
        const channelUrl = `https://discord.com/channels/${guildId}/${item.id}`;
        const itemNumber = startItemIndex + index + 1;
        
        const button = new ButtonBuilder()
            .setLabel(`#${itemNumber}`) // Mostrar el número de la lista en el botón
            .setStyle(ButtonStyle.Link) 
            .setURL(channelUrl);
        
        currentRow.addComponents(button);

        if (currentRow.components.length === BUTTONS_PER_ROW) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }
    });

    if (currentRow.components.length > 0) {
        rows.push(currentRow);
    }
    
    return rows;
}

// === FUNCIÓN AUXILIAR: CREACIÓN DE BOTONES DE PAGINACIÓN (ID FIJA) ===
function createPaginationRow(currentPage, totalPages, customPrefix) {
    const row = new ActionRowBuilder();

    // Mostrar botones de navegación solo si hay más de una página
    if (totalPages > 1) {
        const isFirstPage = currentPage === 0;
        const isLastPage = currentPage === totalPages - 1;

        // 1. Botón Anterior (Prev)
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`${customPrefix}_prev_page`) 
                .setLabel('⬅️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(isFirstPage)
        );

        // 2. Botón de Información de Página (Pág X/Y)
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`page_info_${customPrefix}_disabled`) 
                .setLabel(`Pág ${currentPage + 1}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );

        // 3. Botón Siguiente (Next)
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`${customPrefix}_next_page`) 
                .setLabel('➡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(isLastPage)
        );
    } 
    // 4. Botón Cerrar (Siempre se añade)
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`${customPrefix}_close_list`) // 🔑 FIX: Añadido el guion bajo (_)
            .setLabel('❌')
            .setStyle(ButtonStyle.Danger)
    );
    
    return row;
}

// === FUNCIÓN CLAVE: GENERACIÓN DE SALIDA COMPLETA (EMBED + BOTONES) ===
function generateListOutput(client, guildId, state, freshLockedChannels = null) {
    const isUpdate = !!freshLockedChannels;
    let lockedList = state.lockedList;
    let newTotalPages = state.totalPages;
    let newPage = state.currentPage;
    let shouldDelete = false;

    if (isUpdate) {
        // 1. Recalcular la lista de canales bloqueados
        lockedList = Array.from(freshLockedChannels.entries())
            .map(([id, data]) => {
                const listChannel = client.channels.cache.get(id);
                return listChannel ? {
                    id,
                    channelName: listChannel.name,
                    pokemon: data.pokemon || 'Desconocido',
                    type: data.type === 'private' ? 'Privado' : 'Público'
                } : null;
            })
            .filter(item => item !== null)
            .sort((a, b) => a.pokemon.localeCompare(b.pokemon));

        // 2. Determinar la nueva paginación
        newTotalPages = Math.ceil(lockedList.length / ITEMS_PER_PAGE);
        if (newPage >= newTotalPages && newTotalPages > 0) {
            newPage = newTotalPages - 1;
        } else if (newTotalPages === 0) {
            shouldDelete = true;
            newTotalPages = 1; 
        } 
        
        // 3. Actualizar el estado con los nuevos valores
        state.lockedList = lockedList;
        state.totalPages = newTotalPages;
        state.currentPage = newPage;
    }
    
    if (lockedList.length === 0) {
        shouldDelete = true;
        return {
            embed: new EmbedBuilder()
                .setColor(0xEE82EE)
                .setTitle('📋 Canales Bloqueados Localmente (0)')
                .setDescription('No hay canales bloqueados actualmente.'),
            components: [],
            shouldDelete: true
        };
    }

    const start = state.currentPage * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const currentItems = lockedList.slice(start, end);

    // 4. Crear el Embed
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`📋 Canales Bloqueados (${lockedList.length})`)
        .setDescription(
            currentItems.map((item, index) => 
                `**${start + index + 1}.** 🔒 **${item.pokemon}** (#${item.channelName})`
            ).join('\n')
        )
        .setFooter({ text: `Página ${state.currentPage + 1} de ${state.totalPages}` })
        .setTimestamp(Date.now()); // Forzar el refresh

    // 5. Crear los componentes (Botones de canal + Botones de paginación)
    const channelRows = createChannelLinkRows(currentItems, guildId, start);
    const paginationRow = createPaginationRow(state.currentPage, state.totalPages, state.customPrefix);
    
    const components = [...channelRows, paginationRow];

    return { embed, components, shouldDelete };
}


// === FUNCIÓN CLAVE: BUCLE DE AUTO-ACTUALIZACIÓN ===
async function updateActiveLists(client, paginationStates, lockedChannels) {
    for (const [messageId, state] of paginationStates.entries()) {
        if (state.commandName === 'locklist') {
            try {
                const channel = await client.channels.fetch(state.messageChannelId).catch(() => null);
                if (!channel) {
                    paginationStates.delete(messageId); 
                    continue;
                }
                
                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (!message) {
                    paginationStates.delete(messageId); 
                    continue;
                }

                // Generamos la salida fresca usando la lista de canales más reciente
                const { embed, components, shouldDelete } = generateListOutput(client, state.guildId, state, lockedChannels);
                
                if (shouldDelete) {
                    paginationStates.delete(messageId);
                    await message.delete().catch(() => {});
                    continue;
                }

                paginationStates.set(messageId, state);

                await message.edit({
                    embeds: [embed],
                    components: components
                }).catch(editError => {
                    // 10008: Unknown Message (borrado manual)
                    if (editError.code === 10008) { 
                        paginationStates.delete(messageId);
                    } else {
                        console.error(`❌ Error actualizando mensaje de locklist ${messageId}:`, editError.message);
                    }
                });

            } catch (error) {
                console.error(`❌ Error general en updateActiveLists para locklist ${messageId}:`, error.message);
                paginationStates.delete(messageId);
            }
        }
    }
}

module.exports = {
    name: 'locklist',
    description: 'Muestra los canales bloqueados con paginación y enlaces rápidos.',
    
    async execute(client, message, args, { lockedChannels, paginationStates }) { 
        

        try {
            // 1. Obtener la lista de bloqueos inicial
            const initialLockedList = Array.from(lockedChannels.entries())
                .map(([id, data]) => {
                    const channel = client.channels.cache.get(id);
                    return channel ? {
                        id,
                        channelName: channel.name,
                        pokemon: data.pokemon || 'Desconocido',
                        type: data.type === 'private' ? 'Privado' : 'Público'
                    } : null;
                })
                .filter(item => item !== null)
                .sort((a, b) => a.pokemon.localeCompare(b.pokemon));

            if (initialLockedList.length === 0) {
                return message.reply('No hay canales bloqueados actualmente.');
            }

            const totalPages = Math.ceil(initialLockedList.length / ITEMS_PER_PAGE);

            // 2. Crear estado inicial
            const initialState = { 
                currentPage: 0,
                lockedList: initialLockedList,
                itemsPerPage: ITEMS_PER_PAGE,
                totalPages,
                messageAuthorId: message.author.id,
                commandName: 'locklist', 
                customPrefix: 'locklist', 
                messageId: null, 
                messageChannelId: message.channel.id, 
                guildId: message.guild.id             
            };
            
            // 3. Generar la salida inicial
            const { embed, components } = generateListOutput(client, initialState.guildId, initialState);
            
            // 4. Enviar mensaje y guardar estado
            const reply = await message.reply({ 
                embeds: [embed], 
                components: components, 
                fetchReply: true
            });

            initialState.messageId = reply.id;
            paginationStates.set(reply.id, initialState);

        } catch (error) {
            console.error('❌ Error en comando locklist:', error);
            message.reply('❌ Ocurrió un error al mostrar la lista de bloqueos.');
        }
    },
    
    async handlePagination(interaction, state, { paginationStates, lockedChannels }) {
        if (!interaction.isButton()) return;
        
        // Verificar expiración
        if (!paginationStates.has(interaction.message.id)) {
            return interaction.update({
                components: [], 
                content: '⌛ Esta interacción ha expirado o no se encontró su estado.',
                embeds: []
            }).catch(() => {});
        }

        // Verificar autor
        if (interaction.user.id !== state.messageAuthorId) {
            return interaction.reply({ 
                content: '❌ Solo el autor del comando puede interactuar.', 
                ephemeral: true 
            });
        }

        // 1. Manejar cierre
        if (interaction.customId === `${state.customPrefix}_close_list`) { // Usamos el guion bajo
            paginationStates.delete(interaction.message.id);
            return interaction.message.delete().catch(() => interaction.update({ components: [] }));
        }

        // 2. Lógica de navegación
        let newPage = state.currentPage;
        if (interaction.customId === `${state.customPrefix}_prev_page` && state.currentPage > 0) { // Usamos el guion bajo
            newPage = state.currentPage - 1;
        } else if (interaction.customId === `${state.customPrefix}_next_page` && state.currentPage < state.totalPages - 1) { // Usamos el guion bajo
            newPage = state.currentPage + 1;
        } else {
            return interaction.deferUpdate(); 
        }

        if (newPage === state.currentPage) return interaction.deferUpdate();
        
        state.currentPage = newPage;
        
        // 3. Regenerar la salida
        const { embed, components } = generateListOutput(interaction.client, interaction.guild.id, state);
        
        paginationStates.set(interaction.message.id, state);

        await interaction.update({ 
            embeds: [embed], 
            components: components 
        });
    },

    // Exportar la función de actualización
    updateActiveLists: updateActiveLists
};
