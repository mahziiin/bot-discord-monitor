const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');

console.log("🚀 Iniciando bot de monitoramento...");

// CONFIGURAÇÃO
const CONFIG = {
    token: process.env.DISCORD_TOKEN,
    checkInterval: 5 * 60 * 1000, // 5 minutos
    channelName: 'notificacoes'   // ALTERE AQUI SE QUISER OUTRO NOME
};

// Verificar token
if (!CONFIG.token) {
    console.error('❌ ERRO: DISCORD_TOKEN não configurado!');
    console.log('👉 Configure no Render.com:');
    console.log('   1. Vá em "Environment"');
    console.log('   2. Clique "Add Environment Variable"');
    console.log('   3. Key: DISCORD_TOKEN');
    console.log('   4. Value: seu_token_do_discord');
    process.exit(1);
}

// SITES PARA MONITORAR (NOMES CORRIGIDOS)
const SITES = [
    {
        name: 'Diário Oficial CONSAÚDE',
        url: 'https://consaude.org.br/diario-oficial/',
        pattern: /EDIÇÃO:|Edição:|Edicao:/gi,
        type: 'diario'
    },
    {
        name: 'Concursos CONSAÚDE',
        url: 'https://consaude.org.br/ver-concurso/?n=3',
        pattern: /Edital de Convocação|ERRATA|CONVOCAÇÃO/gi,
        type: 'concurso'
    },
    {
        name: 'Diário Prefeitura Iguape',
        url: 'https://www.iguape.sp.gov.br/portal/diario-oficial',
        pattern: /Edição n|Edição nº|Edicao n/gi,
        type: 'prefeitura'
    }
];

// Histórico de itens já detectados
const detectedItems = {
    diario: [],
    concurso: [], 
    prefeitura: []
};

// Criar cliente Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// FUNÇÃO PARA VERIFICAR UM SITE
async function checkSite(site) {
    try {
        console.log(`  📄 Verificando: ${site.name}`);
        
        // Fazer requisição
        const response = await axios.get(site.url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        // Extrair texto
        const text = response.data;
        
        // Buscar padrões
        const matches = text.match(site.pattern);
        const newItems = [];
        
        if (matches) {
            console.log(`    ✅ ${matches.length} padrão(ões) encontrado(s)`);
            
            // Filtrar apenas novos itens
            matches.forEach(match => {
                const cleanMatch = match.trim()
                    .replace(/\s+/g, ' ')
                    .substring(0, 200);
                
                // Verificar se já foi detectado
                if (!detectedItems[site.type].includes(cleanMatch)) {
                    newItems.push(cleanMatch);
                    detectedItems[site.type].push(cleanMatch);
                    
                    // Manter histórico limitado
                    if (detectedItems[site.type].length > 50) {
                        detectedItems[site.type].shift();
                    }
                }
            });
            
            if (newItems.length > 0) {
                console.log(`    🎯 ${newItems.length} NOVO(S) ITEM(S)!`);
                return newItems;
            }
        }
        
        return [];
        
    } catch (error) {
        console.log(`    ❌ Erro: ${error.message}`);
        return [];
    }
}

// FUNÇÃO PARA ENVIAR NOTIFICAÇÃO
async function sendNotification(site, newItems) {
    try {
        // Encontrar canal
        const channel = client.channels.cache.find(ch => 
            ch.name === CONFIG.channelName && ch.isTextBased()
        );
        
        if (!channel) {
            console.log(`    ⚠️ Canal "${CONFIG.channelName}" não encontrado!`);
            
            // Tentar encontrar qualquer canal
            const anyChannel = client.channels.cache.find(ch => ch.isTextBased());
            if (anyChannel) {
                console.log(`    ⚠️ Usando canal alternativo: ${anyChannel.name}`);
                await anyChannel.send(`⚠️ **Aviso**: Por favor, crie um canal chamado \`${CONFIG.channelName}\` para as notificações automáticas.`);
            }
            return;
        }
        
        // Definir cor e emoji
        let color, emoji;
        switch (site.type) {
            case 'diario': color = 0x0099FF; emoji = '📰'; break;
            case 'concurso': color = 0xFF9900; emoji = '📋'; break;
            case 'prefeitura': color = 0x00AA00; emoji = '🏛️'; break;
            default: color = 0x7289DA; emoji = '📢';
        }
        
        // Criar embed
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${emoji} NOVA ATUALIZAÇÃO - ${site.name}`)
            .setURL(site.url)
            .setDescription(`**Fonte:** ${site.name}\n**URL:** [Clique para acessar](${site.url})`)
            .setTimestamp()
            .setFooter({ text: 'Monitoramento Automático • ' + new Date().getFullYear() });
        
        // Adicionar itens
        newItems.slice(0, 3).forEach((item, index) => {
            embed.addFields({
                name: `📌 Item ${index + 1}`,
                value: item.length > 150 ? item.substring(0, 150) + '...' : item,
                inline: false
            });
        });
        
        // Enviar
        await channel.send({ embeds: [embed] });
        console.log(`    📨 Notificação enviada: ${newItems.length} item(s)`);
        
    } catch (error) {
        console.log(`    ❌ Erro ao notificar: ${error.message}`);
    }
}

// FUNÇÃO PRINCIPAL DE VERIFICAÇÃO
async function checkAllSites() {
    console.log(`\n🔍 [${new Date().toLocaleTimeString('pt-BR')}] VERIFICAÇÃO INICIADA`);
    console.log('='.repeat(50));
    
    for (const site of SITES) {
        const newItems = await checkSite(site);
        
        if (newItems.length > 0) {
            await sendNotification(site, newItems);
        }
        
        // Aguardar 3 segundos entre sites
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ✅ VERIFICAÇÃO CONCLUÍDA\n`);
}

// COMANDOS DO BOT
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    
    if (!command) return;
    
    try {
        switch (command) {
            case 'status':
                const embed = new EmbedBuilder()
                    .setColor(0x7289DA)
                    .setTitle('📊 STATUS DO SISTEMA')
                    .setDescription('Monitoramento ativo 24/7')
                    .addFields(
                        {
                            name: '📰 Diário CONSAÚDE',
                            value: `Itens detectados: ${detectedItems.diario.length}`,
                            inline: true
                        },
                        {
                            name: '📋 Concursos CONSAÚDE',
                            value: `Itens detectados: ${detectedItems.concurso.length}`,
                            inline: true
                        },
                        {
                            name: '🏛️ Prefeitura Iguape',
                            value: `Itens detectados: ${detectedItems.prefeitura.length}`,
                            inline: true
                        }
                    )
                    .addFields({
                        name: '⏱️ Configurações',
                        value: `Verificação: A cada ${CONFIG.checkInterval / 60000} minutos\nCanal: ${CONFIG.channelName}`,
                        inline: false
                    })
                    .setTimestamp();
                
                await message.reply({ embeds: [embed] });
                break;
                
            case 'verificar':
                await message.reply('🔄 Verificando todos os sites agora...');
                await checkAllSites();
                await message.reply('✅ Verificação concluída!');
                break;
                
            case 'sites':
                const sitesList = SITES.map(s => 
                    `• **${s.name}**\n  🔗 ${s.url}\n  🔍 Padrão: \`${s.pattern.toString().slice(1, 30)}...\``
                ).join('\n\n');
                
                const sitesEmbed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('🌐 SITES MONITORADOS')
                    .setDescription(sitesList)
                    .setFooter({ text: 'O bot busca pelos padrões especificados' });
                
                await message.reply({ embeds: [sitesEmbed] });
                break;
                
            case 'historico':
                const total = detectedItems.diario.length + detectedItems.concurso.length + detectedItems.prefeitura.length;
                await message.reply(`📊 **Histórico total:** ${total} itens detectados\n` +
                    `• Diário: ${detectedItems.diario.length}\n` +
                    `• Concursos: ${detectedItems.concurso.length}\n` +
                    `• Prefeitura: ${detectedItems.prefeitura.length}`);
                break;
                
            case 'ajuda':
                const ajudaEmbed = new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle('❓ COMANDOS DISPONÍVEIS')
                    .setDescription('Todos os comandos do bot:')
                    .addFields(
                        { name: '`!status`', value: 'Mostra status do sistema', inline: true },
                        { name: '`!verificar`', value: 'Verifica sites manualmente', inline: true },
                        { name: '`!sites`', value: 'Lista sites monitorados', inline: true },
                        { name: '`!historico`', value: 'Mostra contagem de itens', inline: true },
                        { name: '`!ajuda`', value: 'Mostra esta mensagem', inline: true }
                    )
                    .setFooter({ text: 'Verificação automática a cada 5 minutos' });
                
                await message.reply({ embeds: [ajudaEmbed] });
                break;
                
            case 'ping':
                const pingTime = Date.now() - message.createdTimestamp;
                await message.reply(`🏓 Pong! Latência: ${pingTime}ms`);
                break;
        }
    } catch (error) {
        console.error('Erro no comando:', error);
        await message.reply('❌ Ocorreu um erro ao processar o comando.');
    }
});

// QUANDO O BOT INICIAR
client.once('ready', () => {
    console.log('══════════════════════════════════════════════');
    console.log(`✅ BOT CONECTADO: ${client.user.tag}`);
    console.log(`📊 Monitorando ${SITES.length} sites:`);
    SITES.forEach((site, i) => {
        console.log(`   ${i + 1}. ${site.name}`);
    });
    console.log(`⏱️  Verificação: A cada ${CONFIG.checkInterval / 60000} minutos`);
    console.log(`📢 Canal de notificação: ${CONFIG.channelName}`);
    console.log('══════════════════════════════════════════════\n');
    
    // Definir status
    client.user.setActivity({
        name: 'por atualizações',
        type: 3 // WATCHING
    });
    
    // Iniciar verificações periódicas
    setInterval(checkAllSites, CONFIG.checkInterval);
    
    // Primeira verificação em 15 segundos
    setTimeout(checkAllSites, 15000);
});

// INICIAR BOT
client.login(CONFIG.token).catch(error => {
    console.error('❌ ERRO AO CONECTAR:', error.message);
    console.log('👉 Verifique:');
    console.log('   1. Se o token está correto');
    console.log('   2. Se o bot foi adicionado ao servidor');
    process.exit(1);
});
