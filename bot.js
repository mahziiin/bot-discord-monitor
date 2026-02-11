// ================================================
// 🤖 BOT DE MONITORAMENTO - VERSÃO SIMPLIFICADA
// ================================================

console.log('🚀 INICIANDO BOT DE MONITORAMENTO');
console.log('='.repeat(50));

// Verificar variáveis de ambiente
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
    console.error('❌ ERRO: DISCORD_TOKEN não configurado!');
    console.log('👉 Configure no Railway:');
    console.log('   1. Vá em Variables');
    console.log('   2. Adicione: DISCORD_TOKEN = seu_token');
    process.exit(1);
}

console.log('✅ Token configurado');

// ==================== IMPORTAR BIBLIOTECAS ====================
console.log('📦 Carregando bibliotecas...');

try {
    // Forçar carregamento sincrono
    const discord = require('discord.js');
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    const { Client, GatewayIntentBits, EmbedBuilder } = discord;
    
    console.log('✅ Bibliotecas carregadas');
    
    // ==================== CONFIGURAÇÃO ====================
    const CONFIG = {
        token: DISCORD_TOKEN,
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
    
    // Histórico simples
    const detectedItems = new Set();
    
    // ==================== CRIAR CLIENTE DISCORD ====================
    console.log('🤖 Criando cliente Discord...');
    
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
        ]
    });
    
    // ==================== FUNÇÕES DO MONITORAMENTO ====================
    
    async function checkSite(site) {
        console.log(`\n🔍 Verificando: ${site.name}`);
        
        try {
            const response = await axios.get(site.url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            });
            
            const $ = cheerio.load(response.data);
            const text = $('body').text();
            const newItems = [];
            
            // Procurar padrões
            for (const pattern of site.patterns) {
                if (text.includes(pattern)) {
                    console.log(`    ✅ Encontrado: "${pattern}"`);
                    
                    // Encontrar contexto
                    const index = text.indexOf(pattern);
                    const start = Math.max(0, index - 50);
                    const end = Math.min(text.length, index + 150);
                    const content = text.substring(start, end).trim();
                    
                    const itemId = `${site.type}_${content.substring(0, 50).replace(/[^a-z0-9]/gi, '')}`;
                    
                    if (!detectedItems.has(itemId)) {
                        newItems.push({
                            site: site.name,
                            url: site.url,
                            type: site.type,
                            content: content,
                            itemId: itemId
                        });
                        detectedItems.add(itemId);
                    }
                }
            }
            
            if (newItems.length > 0) {
                console.log(`    🎯 ${newItems.length} novo(s) item(s)!`);
            } else {
                console.log(`    📭 Nenhum novo item`);
            }
            
            return newItems;
            
        } catch (error) {
            console.log(`    ❌ Erro: ${error.message}`);
            return [];
        }
    }
    
    async function sendNotification(items) {
        if (items.length === 0) return;
        
        try {
            const channel = client.channels.cache.find(
                ch => ch.name === CONFIG.channelName
            );
            
            if (!channel) {
                console.log(`    ⚠️ Canal "${CONFIG.channelName}" não encontrado`);
                return;
            }
            
            for (const item of items) {
                let color;
                if (item.type === 'diario') color = 0x0099FF;
                else if (item.type === 'concurso') color = 0xFF9900;
                else color = 0x00AA00;
                
                const embed = new EmbedBuilder()
                    .setColor(color)
                    .setTitle(`📢 ${item.site}`)
                    .setURL(item.url)
                    .setDescription(`Nova atualização detectada às ${new Date().toLocaleTimeString('pt-BR')}`)
                    .addFields({
                        name: 'Conteúdo',
                        value: `\`\`\`${item.content}\`\`\``,
                        inline: false
                    })
                    .setTimestamp();
                
                await channel.send({ embeds: [embed] });
                console.log(`    📨 Notificação enviada`);
            }
            
        } catch (error) {
            console.log(`    ❌ Erro ao notificar: ${error.message}`);
        }
    }
    
    async function checkAllSites() {
        console.log(`\n🕒 [${new Date().toLocaleTimeString('pt-BR')}] VERIFICAÇÃO INICIADA`);
        console.log('─'.repeat(50));
        
        let totalNew = 0;
        
        for (const site of CONFIG.sites) {
            const newItems = await checkSite(site);
            
            if (newItems.length > 0) {
                await sendNotification(newItems);
                totalNew += newItems.length;
            }
            
            // Aguardar 2 segundos
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        console.log(`✅ [${new Date().toLocaleTimeString('pt-BR')}] CONCLUÍDA`);
        console.log(`   📊 Novos itens: ${totalNew}`);
        console.log(`   💾 Histórico: ${detectedItems.size} itens\n`);
        
        return totalNew;
    }
    
    // ==================== COMANDOS DO BOT ====================
    
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.content.startsWith('!')) return;
        
        const command = message.content.slice(1).toLowerCase();
        
        switch (command) {
            case 'status':
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('🤖 STATUS DO BOT')
                    .setDescription('Monitoramento ativo no Railway')
                    .addFields(
                        { name: 'Sites monitorados', value: '3', inline: true },
                        { name: 'Itens detectados', value: detectedItems.size.toString(), inline: true },
                        { name: 'Intervalo', value: '5 minutos', inline: true }
                    )
                    .setTimestamp();
                
                await message.reply({ embeds: [embed] });
                break;
                
            case 'verificar':
                await message.reply('🔄 Verificando sites agora...');
                const count = await checkAllSites();
                await message.reply(`✅ Verificação concluída! ${count} novo(s) item(s)`);
                break;
                
            case 'testar':
                await message.reply('🧪 Testando conexão com sites...');
                
                for (const site of CONFIG.sites) {
                    try {
                        const response = await axios.get(site.url, { timeout: 5000 });
                        await message.channel.send(`✅ ${site.name}: Conectado (${response.status})`);
                    } catch (error) {
                        await message.channel.send(`❌ ${site.name}: Erro - ${error.message}`);
                    }
                }
                break;
                
            case 'ping':
                await message.reply('🏓 Pong! Bot online!');
                break;
                
            case 'sites':
                const list = CONFIG.sites.map(s => `• ${s.name}\n  ${s.url}`).join('\n\n');
                await message.reply(`🌐 **Sites monitorados:**\n\n${list}`);
                break;
        }
    });
    
    // ==================== EVENTOS DO BOT ====================
    
    client.once('ready', () => {
        console.log('══════════════════════════════════════════════');
        console.log(`✅ BOT CONECTADO: ${client.user.tag}`);
        console.log(`📊 Monitorando ${CONFIG.sites.length} sites`);
        console.log(`⏱️  Verificação: ${CONFIG.checkInterval / 60000} minutos`);
        console.log(`📢 Canal: ${CONFIG.channelName}`);
        console.log('══════════════════════════════════════════════\n');
        
        // Status do bot
        client.user.setActivity({
            name: 'sites oficiais',
            type: 3
        });
        
        // INICIAR MONITORAMENTO
        console.log('⏰ Iniciando monitoramento automático...');
        
        // Primeira verificação em 15 segundos
        setTimeout(() => {
            checkAllSites();
        }, 15000);
        
        // Verificar a cada 5 minutos
        setInterval(() => {
            checkAllSites();
        }, CONFIG.checkInterval);
        
        console.log('🎯 SISTEMA PRONTO!');
    });
    
    // ==================== INICIAR BOT ====================
    
    console.log('🔗 Conectando ao Discord...');
    
    client.login(CONFIG.token).catch(error => {
        console.error('❌ ERRO AO CONECTAR:', error.message);
        process.exit(1);
    });
    
} catch (error) {
    console.error('❌ ERRO AO CARREGAR:', error.message);
    process.exit(1);
}