// ==================== CONFIGURAÇÃO ====================
require('dotenv').config();

console.log('🚀 INICIANDO BOT DE MONITORAMENTO');
console.log('='.repeat(50));

// Verificar variáveis
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN não configurado!');
    process.exit(1);
}

console.log('✅ Token configurado');
console.log('📦 Carregando módulos...');

// Importar módulos
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');

console.log('✅ Módulos carregados');

// ==================== CONFIGURAÇÕES ====================
const CONFIG = {
    token: process.env.DISCORD_TOKEN,
    channelName: process.env.NOTIFICATION_CHANNEL || 'notificacoes',
    checkInterval: 5 * 60 * 1000, // 5 minutos
    sites: [
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

// Histórico
const detectedItems = new Set();

// ==================== CLIENTE DISCORD ====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ==================== FUNÇÃO PARA VERIFICAR SITE ====================
async function checkSite(site) {
    try {
        console.log(`  🔍 Verificando: ${site.name}`);
        
        const response = await axios.get(site.url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const pageText = $('body').text();
        const newItems = [];
        
        // Procurar padrões
        for (const pattern of site.patterns) {
            const regex = new RegExp(`.{0,200}${pattern}.{0,200}`, 'gi');
            const matches = pageText.match(regex);
            
            if (matches) {
                console.log(`    ✅ "${pattern}" encontrado ${matches.length} vez(es)`);
                
                for (const match of matches.slice(0, 3)) { // Limitar a 3
                    const cleanMatch = match.trim().replace(/\s+/g, ' ');
                    const itemId = `${site.type}_${cleanMatch.substring(0, 100).replace(/[^a-z0-9]/gi, '')}`;
                    
                    if (!detectedItems.has(itemId)) {
                        newItems.push({
                            site: site.name,
                            url: site.url,
                            type: site.type,
                            content: cleanMatch.substring(0, 300),
                            itemId: itemId
                        });
                        detectedItems.add(itemId);
                    }
                }
            }
        }
        
        if (newItems.length > 0) {
            console.log(`    🎯 ${newItems.length} NOVO(S) ITEM(S)!`);
        } else {
            console.log(`    📭 Nenhum novo item`);
        }
        
        return newItems;
        
    } catch (error) {
        console.log(`    ❌ Erro: ${error.message}`);
        return [];
    }
}

// ==================== ENVIAR NOTIFICAÇÃO ====================
async function sendNotification(items) {
    try {
        // Encontrar canal
        const channel = client.channels.cache.find(
            ch => ch.name === CONFIG.channelName && ch.isTextBased()
        );
        
        if (!channel) {
            console.log(`    ⚠️ Canal "${CONFIG.channelName}" não encontrado!`);
            
            // Tentar enviar para qualquer canal
            const anyChannel = client.channels.cache.find(ch => ch.isTextBased());
            if (anyChannel) {
                console.log(`    ⚠️ Usando canal alternativo: ${anyChannel.name}`);
                await anyChannel.send(`⚠️ **Configuração**: Crie um canal chamado \`${CONFIG.channelName}\` para notificações automáticas.`);
            }
            return;
        }
        
        // Para cada item, enviar notificação separada
        for (const item of items) {
            let color, emoji;
            switch (item.type) {
                case 'diario': color = 0x0099FF; emoji = '📰'; break;
                case 'concurso': color = 0xFF9900; emoji = '📋'; break;
                case 'prefeitura': color = 0x00AA00; emoji = '🏛️'; break;
                default: color = 0x7289DA; emoji = '📢';
            }
            
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`${emoji} NOVA ATUALIZAÇÃO - ${item.site}`)
                .setURL(item.url)
                .setDescription(`**Fonte:** ${item.site}\n**Detectado em:** ${new Date().toLocaleTimeString('pt-BR')}`)
                .addFields({
                    name: '📋 Conteúdo detectado',
                    value: `\`\`\`${item.content}\`\`\``,
                    inline: false
                })
                .setTimestamp()
                .setFooter({ text: 'Sistema de Monitoramento Automático' });
            
            await channel.send({ embeds: [embed] });
            console.log(`    📨 Notificação enviada: ${item.site}`);
        }
        
    } catch (error) {
        console.log(`    ❌ Erro ao notificar: ${error.message}`);
    }
}

// ==================== VERIFICAR TODOS SITES ====================
async function checkAllSites() {
    const now = new Date();
    console.log(`\n🔍 [${now.toLocaleTimeString('pt-BR')}] VERIFICAÇÃO INICIADA`);
    console.log('─'.repeat(60));
    
    let totalNewItems = 0;
    
    for (const site of CONFIG.sites) {
        const newItems = await checkSite(site);
        
        if (newItems.length > 0) {
            await sendNotification(newItems);
            totalNewItems += newItems.length;
        }
        
        // Aguardar entre sites
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    console.log(`✅ [${new Date().toLocaleTimeString('pt-BR')}] VERIFICAÇÃO CONCLUÍDA`);
    console.log(`   📊 Total de novos itens: ${totalNewItems}`);
    console.log(`   💾 Itens no histórico: ${detectedItems.size}`);
    console.log('');
    
    return totalNewItems;
}

// ==================== COMANDOS DO BOT ====================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    
    if (!command) return;
    
    try {
        switch (command) {
            case 'status':
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('📊 STATUS DO SISTEMA')
                    .setDescription('Monitoramento ativo 24/7')
                    .addFields(
                        {
                            name: '🟢 Status',
                            value: 'Online e monitorando',
                            inline: true
                        },
                        {
                            name: '📈 Itens detectados',
                            value: detectedItems.size.toString(),
                            inline: true
                        },
                        {
                            name: '⏱️ Intervalo',
                            value: `${CONFIG.checkInterval / 60000} minutos`,
                            inline: true
                        }
                    )
                    .addFields({
                        name: '🌐 Sites monitorados',
                        value: CONFIG.sites.map(s => s.name).join('\n'),
                        inline: false
                    })
                    .addFields({
                        name: '🕒 Próxima verificação',
                        value: new Date(Date.now() + CONFIG.checkInterval).toLocaleTimeString('pt-BR'),
                        inline: false
                    })
                    .setTimestamp();
                
                await message.reply({ embeds: [embed] });
                break;
                
            case 'verificar':
                const msg = await message.reply('🔄 **VERIFICAÇÃO MANUAL INICIADA**\nEstou verificando todos os sites agora...');
                const newItems = await checkAllSites();
                await msg.edit(`✅ **VERIFICAÇÃO CONCLUÍDA**\nEncontrados: ${newItems} novo(s) item(s)`);
                break;
                
            case 'teste':
                await message.reply('🧪 **TESTE DE DETECÇÃO**\n\nVou testar cada site individualmente...');
                
                for (const site of CONFIG.sites) {
                    await message.channel.send(`**Testando:** ${site.name}`);
                    const items = await checkSite(site);
                    
                    if (items.length > 0) {
                        await message.channel.send(`✅ ${items.length} novo(s) item(s) detectado(s)`);
                    } else {
                        await message.channel.send(`📭 Nenhum novo item (histórico: ${detectedItems.size})`);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                break;
                
            case 'sites':
                const sitesList = CONFIG.sites.map((s, i) => 
                    `${i + 1}. **${s.name}**\n   🔗 ${s.url}\n   🔍 Padrões: ${s.patterns.join(', ')}`
                ).join('\n\n');
                
                await message.reply(`🌐 **SITES MONITORADOS:**\n\n${sitesList}`);
                break;
                
            case 'ping':
                const latency = Date.now() - message.createdTimestamp;
                await message.reply(`🏓 **PONG!**\nLatência: ${latency}ms\nItens detectados: ${detectedItems.size}`);
                break;
                
            case 'debug':
                await message.reply(`🔧 **INFORMAÇÕES DE DEBUG**\n\n` +
                    `• Conectado: ${client.user?.tag || 'Não'}\n` +
                    `• Canal configurado: ${CONFIG.channelName}\n` +
                    `• Sites: ${CONFIG.sites.length}\n` +
                    `• Histórico: ${detectedItems.size} itens\n` +
                    `• Intervalo: ${CONFIG.checkInterval / 60000}min\n` +
                    `• Railway: ✅ Online`);
                break;
                
            case 'limpar':
                // Comando para limpar histórico (apenas admin)
                if (message.author.id === 'SEU_ID_DO_DISCORD') {
                    const oldSize = detectedItems.size;
                    detectedItems.clear();
                    await message.reply(`🧹 **HISTÓRICO LIMPO**\n${oldSize} itens removidos. Próxima verificação notificará tudo como novo.`);
                } else {
                    await message.reply('⛔ Apenas o administrador pode usar este comando.');
                }
                break;
        }
    } catch (error) {
        console.error('Erro no comando:', error);
        await message.reply('❌ Erro ao processar comando.');
    }
});

// ==================== INICIALIZAÇÃO ====================
client.once('ready', () => {
    console.log('══════════════════════════════════════════════');
    console.log(`✅ BOT CONECTADO: ${client.user.tag}`);
    console.log(`📊 Monitorando ${CONFIG.sites.length} sites:`);
    CONFIG.sites.forEach((site, i) => {
        console.log(`   ${i + 1}. ${site.name}`);
    });
    console.log(`⏱️  Verificação automática: ${CONFIG.checkInterval / 60000} minutos`);
    console.log(`📢 Canal de notificação: ${CONFIG.channelName}`);
    console.log('══════════════════════════════════════════════\n');
    
    // Definir status
    client.user.setActivity({
        name: 'por atualizações',
        type: 3 // WATCHING
    });
    
    // INICIAR MONITORAMENTO AUTOMÁTICO
    console.log('⏰ Agendando verificações automáticas...');
    
    // Verificação a cada X minutos
    setInterval(() => {
        checkAllSites();
    }, CONFIG.checkInterval);
    
    // Primeira verificação em 10 segundos
    console.log('🕒 Primeira verificação em 10 segundos...');
    setTimeout(() => {
        checkAllSites();
    }, 10000);
    
    console.log('🎯 SISTEMA DE MONITORAMENTO INICIADO!');
});

// ==================== TRATAMENTO DE ERROS ====================
client.on('error', (error) => {
    console.error('❌ Erro do Discord:', error.message);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Erro não tratado:', error.message);
});

// ==================== INICIAR BOT ====================
console.log('🔗 Conectando ao Discord...');

client.login(CONFIG.token).catch(error => {
    console.error('❌ ERRO FATAL AO CONECTAR:', error.message);
    console.log('\n👉 SOLUÇÕES:');
    console.log('1. Token inválido ou expirado');
    console.log('2. Bot não adicionado ao servidor');
    console.log('3. Permissões insuficientes');
    process.exit(1);
});

// Health check para Railway
const http = require('http');
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200);
        res.end('OK');
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(process.env.PORT || 3000, () => {
    console.log(`🌐 Health check rodando na porta ${process.env.PORT || 3000}`);
});
