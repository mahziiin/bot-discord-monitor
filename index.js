// ==================== CONFIGURAÇÃO ====================
require('dotenv').config();

const CONFIG = {
    // OBTER DO RENDER (Environment Variables)
    DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
    
    // CONFIGURAÇÕES DO BOT
    CHECK_INTERVAL: 10 * 60 * 1000, // 10 minutos
    NOTIFICATION_CHANNEL: 'notificacoes',
    
    // SITES PARA MONITORAR
    SITES: [
        {
            name: '📰 Diário Oficial CONSAÚDE',
            url: 'https://consaude.org.br/diario-oficial/',
            type: 'diario',
            patterns: ['EDIÇÃO:', 'Edição:', 'Edicao:']
        },
        {
            name: '📋 Concursos CONSAÚDE', 
            url: 'https://consaude.org.br/ver-concurso/?n=3',
            type: 'concurso',
            patterns: ['Edital de Convocação', 'ERRATA', 'CONVOCAÇÃO']
        },
        {
            name: '🏛️ Diário Prefeitura Iguape',
            url: 'https://www.iguape.sp.gov.br/portal/diario-oficial',
            type: 'prefeitura',
            patterns: ['Edição n', 'Edição nº', 'Edicao n']
        }
    ]
};

// ==================== VERIFICAÇÃO INICIAL ====================
console.log('🔧 Verificando configurações...');

if (!CONFIG.DISCORD_TOKEN || CONFIG.DISCORD_TOKEN === '') {
    console.error('❌ ERRO CRÍTICO: DISCORD_TOKEN não configurado!');
    console.log('👉 SOLUÇÃO: No Render.com, vá em:');
    console.log('   1. Seu serviço → Environment');
    console.log('   2. Clique "Add Environment Variable"');
    console.log('   3. Key: DISCORD_TOKEN');
    console.log('   4. Value: SEU_TOKEN_DO_BOT');
    console.log('   5. Faça deploy manual');
    process.exit(1);
}

console.log('✅ Configuração OK');
console.log(`📊 Sites para monitorar: ${CONFIG.SITES.length}`);

// ==================== IMPORTAR BIBLIOTECAS ====================
console.log('📦 Carregando bibliotecas...');

let discord, axios, cheerio;
try {
    discord = require('discord.js');
    axios = require('axios');
    cheerio = require('cheerio');
    console.log('✅ Bibliotecas carregadas');
} catch (error) {
    console.error('❌ Erro ao carregar bibliotecas:', error.message);
    console.log('👉 Execute no terminal: npm install');
    process.exit(1);
}

const { Client, GatewayIntentBits, EmbedBuilder } = discord;

// ==================== BOT PRINCIPAL ====================
console.log('🤖 Iniciando bot Discord...');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Histórico em memória (simples)
let history = {
    lastCheck: null,
    items: []
};

// ==================== FUNÇÕES DO BOT ====================

// Função para verificar UM site
async function checkWebsite(site) {
    console.log(`  🔍 Verificando: ${site.name}`);
    
    try {
        // Fazer requisição
        const response = await axios.get(site.url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        // Analisar HTML
        const $ = cheerio.load(response.data);
        const pageText = $('body').text();
        
        // Procurar padrões
        const foundItems = [];
        
        site.patterns.forEach(pattern => {
            if (pageText.includes(pattern)) {
                // Encontrar contexto ao redor do padrão
                const index = pageText.indexOf(pattern);
                if (index !== -1) {
                    const start = Math.max(0, index - 50);
                    const end = Math.min(pageText.length, index + 150);
                    const context = pageText.substring(start, end).trim();
                    
                    foundItems.push({
                        pattern: pattern,
                        text: context,
                        site: site.name
                    });
                }
            }
        });
        
        console.log(`    ✅ ${foundItems.length} item(s) encontrado(s)`);
        return foundItems;
        
    } catch (error) {
        console.log(`    ❌ Erro: ${error.message}`);
        return [];
    }
}

// Função para enviar notificação
async function sendNotification(channel, site, items) {
    try {
        // Escolher cor
        let color;
        if (site.type === 'diario') color = 0x0099FF;
        else if (site.type === 'concurso') color = 0xFF9900;
        else color = 0x00AA00;
        
        // Criar embed
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`📢 ${site.name}`)
            .setURL(site.url)
            .setDescription(`**Nova atualização detectada**\n📍 ${items.length} item(s) encontrado(s)`)
            .setTimestamp();
        
        // Adicionar itens (máximo 3)
        items.slice(0, 3).forEach((item, index) => {
            embed.addFields({
                name: `Item ${index + 1}`,
                value: `\`\`\`${item.text}\`\`\``,
                inline: false
            });
        });
        
        // Enviar
        await channel.send({ embeds: [embed] });
        console.log(`    📨 Notificação enviada`);
        
    } catch (error) {
        console.log(`    ❌ Erro ao enviar: ${error.message}`);
    }
}

// Verificar TODOS os sites
async function checkAllWebsites() {
    const now = new Date();
    console.log(`\n🕒 [${now.toLocaleTimeString('pt-BR')}] INICIANDO VERIFICAÇÃO`);
    console.log('─'.repeat(50));
    
    for (const site of CONFIG.SITES) {
        const items = await checkWebsite(site);
        
        if (items.length > 0) {
            // Encontrar canal
            const channel = client.channels.cache.find(
                ch => ch.name === CONFIG.NOTIFICATION_CHANNEL
            );
            
            if (channel) {
                await sendNotification(channel, site, items);
            } else {
                console.log(`    ⚠️ Canal "${CONFIG.NOTIFICATION_CHANNEL}" não encontrado`);
            }
            
            // Salvar no histórico
            items.forEach(item => {
                history.items.push({
                    ...item,
                    timestamp: now.toISOString()
                });
            });
        }
        
        // Aguardar 3 segundos entre sites
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    history.lastCheck = now.toISOString();
    console.log(`✅ [${now.toLocaleTimeString('pt-BR')}] VERIFICAÇÃO CONCLUÍDA\n`);
}

// ==================== COMANDOS DO BOT ====================

client.on('messageCreate', async (message) => {
    // Ignorar mensagens de outros bots
    if (message.author.bot) return;
    
    // Comandos começam com "!"
    if (!message.content.startsWith('!')) return;
    
    const command = message.content.slice(1).toLowerCase().split(' ')[0];
    
    try {
        switch (command) {
            case 'status':
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('🤖 STATUS DO BOT')
                    .setDescription('Sistema de monitoramento ativo')
                    .addFields(
                        {
                            name: '📊 Sites monitorados',
                            value: CONFIG.SITES.map(s => s.name).join('\n'),
                            inline: false
                        },
                        {
                            name: '⏱️ Última verificação',
                            value: history.lastCheck 
                                ? new Date(history.lastCheck).toLocaleString('pt-BR')
                                : 'Nunca',
                            inline: true
                        },
                        {
                            name: '📈 Itens detectados',
                            value: history.items.length.toString(),
                            inline: true
                        },
                        {
                            name: '🔔 Canal',
                            value: CONFIG.NOTIFICATION_CHANNEL,
                            inline: true
                        }
                    )
                    .setFooter({ text: `Verificação a cada ${CONFIG.CHECK_INTERVAL / 60000} minutos` })
                    .setTimestamp();
                
                await message.reply({ embeds: [embed] });
                break;
                
            case 'verificar':
                const msg = await message.reply('🔄 Verificando sites agora...');
                await checkAllWebsites();
                await msg.edit('✅ Verificação concluída!');
                break;
                
            case 'sites':
                const sitesList = CONFIG.SITES.map(s => 
                    `• **${s.name}**\n  🔗 ${s.url}\n  🔍 Padrões: ${s.patterns.join(', ')}`
                ).join('\n\n');
                
                await message.reply(`🌐 **SITES MONITORADOS:**\n\n${sitesList}`);
                break;
                
            case 'ping':
                const latency = Date.now() - message.createdTimestamp;
                await message.reply(`🏓 Pong! Latência: ${latency}ms`);
                break;
                
            case 'ajuda':
                const help = `
**🤖 COMANDOS DO BOT:**

\`!status\` - Status do sistema
\`!verificar\` - Verificar sites agora
\`!sites\` - Lista de sites monitorados
\`!ping\` - Testar latência
\`!ajuda\` - Esta mensagem

**⚙️ CONFIGURAÇÃO:**
• Canal: ${CONFIG.NOTIFICATION_CHANNEL}
• Intervalo: ${CONFIG.CHECK_INTERVAL / 60000} minutos
• Sites: ${CONFIG.SITES.length}
                `;
                await message.reply(help);
                break;
                
            case 'teste':
                await message.reply('🧪 **TESTE DE CONEXÃO:**\n\n' +
                    '1. ✅ Bot conectado ao Discord\n' +
                    '2. ✅ Bibliotecas carregadas\n' +
                    '3. ✅ Token configurado\n' +
                    '4. ✅ Pronto para monitorar!');
                break;
        }
    } catch (error) {
        console.error('Erro no comando:', error);
        await message.reply('❌ Erro ao processar comando');
    }
});

// ==================== EVENTOS DO BOT ====================

client.once('ready', () => {
    console.log('══════════════════════════════════════════════');
    console.log(`✅ BOT CONECTADO: ${client.user.tag}`);
    console.log(`📊 Servidores: ${client.guilds.cache.size}`);
    console.log(`⏱️  Intervalo: ${CONFIG.CHECK_INTERVAL / 60000} minutos`);
    console.log(`📢 Canal: ${CONFIG.NOTIFICATION_CHANNEL}`);
    console.log('══════════════════════════════════════════════\n');
    
    // Definir status do bot
    client.user.setActivity({
        name: `${CONFIG.SITES.length} sites`,
        type: 3 // WATCHING
    });
    
    // Iniciar verificações automáticas
    setInterval(checkAllWebsites, CONFIG.CHECK_INTERVAL);
    
    // Primeira verificação em 30 segundos
    setTimeout(checkAllWebsites, 30000);
});

client.on('error', (error) => {
    console.error('❌ Erro do Discord:', error.message);
});

// ==================== INICIAR BOT ====================

console.log('🔗 Conectando ao Discord...');

client.login(CONFIG.DISCORD_TOKEN).catch(error => {
    console.error('❌ ERRO AO CONECTAR:', error.message);
    console.log('\n👉 SOLUÇÕES POSSÍVEIS:');
    console.log('1. Token inválido - pegue novo em discord.com/developers');
    console.log('2. Bot não adicionado ao servidor');
    console.log('3. Permissões insuficientes');
    console.log('\n🔗 Link para adicionar bot (substitua CLIENT_ID):');
    console.log('https://discord.com/api/oauth2/authorize?client_id=SEU_CLIENT_ID&permissions=274877991936&scope=bot');
    
    process.exit(1);
});
