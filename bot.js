const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');

console.log("🚀 Iniciando bot de monitoramento...");

// CONFIGURAÇÃO
const CONFIG = {
    token: process.env.DISCORD_TOKEN,
    checkInterval: 10 * 60 * 1000, // AUMENTEI PARA 10 MINUTOS
    channelName: 'notificacoes'
};

// Verificar token
if (!CONFIG.token) {
    console.error('❌ ERRO: DISCORD_TOKEN não configurado!');
    process.exit(1);
}

// SITES PARA MONITORAR
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

// HISTÓRICO - Carregar das variáveis de ambiente
function loadHistory() {
    const history = {
        diario: [],
        concurso: [], 
        prefeitura: [],
        lastCheck: null
    };
    
    try {
        if (process.env.HISTORY_DIARIO) {
            history.diario = JSON.parse(process.env.HISTORY_DIARIO);
        }
        if (process.env.HISTORY_CONCURSO) {
            history.concurso = JSON.parse(process.env.HISTORY_CONCURSO);
        }
        if (process.env.HISTORY_PREFEITURA) {
            history.prefeitura = JSON.parse(process.env.HISTORY_PREFEITURA);
        }
        if (process.env.LAST_CHECK) {
            history.lastCheck = process.env.LAST_CHECK;
        }
        
        console.log('📚 Histórico carregado:');
        console.log(`   Diário: ${history.diario.length} itens`);
        console.log(`   Concursos: ${history.concurso.length} itens`);
        console.log(`   Prefeitura: ${history.prefeitura.length} itens`);
        
        return history;
    } catch (error) {
        console.log('📝 Criando novo histórico...');
        return history;
    }
}

// Inicializar histórico
let detectedItems = loadHistory();

// FUNÇÃO PARA GERAR ID ÚNICO (MAIS SIMPLES)
function generateItemId(text) {
    // Extrair números e datas para criar ID
    const numbers = (text.match(/\d+/g) || []).join('');
    const first50 = text.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 50);
    
    return `${numbers}_${first50}`.substring(0, 100);
}

// FUNÇÃO PARA VERIFICAR SITE
async function checkSite(site) {
    try {
        console.log(`  📄 ${site.name}`);
        
        const response = await axios.get(site.url, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const text = response.data;
        const matches = text.match(site.pattern);
        const newItems = [];
        
        if (matches) {
            // Pegar apenas os PRIMEIROS 5 matches (mais recentes)
            const recentMatches = matches.slice(0, 5);
            console.log(`    ✅ ${recentMatches.length} item(s) recente(s)`);
            
            recentMatches.forEach(match => {
                const cleanMatch = match.trim()
                    .replace(/\s+/g, ' ')
                    .substring(0, 150);
                
                const itemId = generateItemId(cleanMatch);
                
                // Verificar se já existe no histórico
                if (!detectedItems[site.type].includes(itemId)) {
                    newItems.push(cleanMatch);
                    detectedItems[site.type].push(itemId);
                    
                    // Manter apenas últimos 20 itens
                    if (detectedItems[site.type].length > 20) {
                        detectedItems[site.type] = detectedItems[site.type].slice(-20);
                    }
                }
            });
            
            if (newItems.length > 0) {
                console.log(`    🎯 ${newItems.length} NOVO(S)!`);
                return newItems;
            } else {
                console.log(`    📭 Já notificados anteriormente`);
            }
        }
        
        return [];
        
    } catch (error) {
        console.log(`    ❌ Erro: ${error.message}`);
        return [];
    }
}

// FUNÇÃO DE NOTIFICAÇÃO SIMPLIFICADA
async function sendNotification(site, newItems) {
    try {
        const channel = client.channels.cache.find(ch => 
            ch.name === CONFIG.channelName && ch.isTextBased()
        );
        
        if (!channel) {
            console.log(`    ⚠️ Canal não encontrado`);
            return;
        }
        
        // Escolher cor
        let color;
        if (site.type === 'diario') color = 0x0099FF;
        else if (site.type === 'concurso') color = 0xFF9900;
        else color = 0x00AA00;
        
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`📢 ${site.name}`)
            .setDescription(`**Nova atualização detectada**\nHora: ${new Date().toLocaleTimeString('pt-BR')}`)
            .setTimestamp();
        
        // Adicionar itens (máximo 3)
        newItems.slice(0, 3).forEach((item, index) => {
            embed.addFields({
                name: `Item ${index + 1}`,
                value: item,
                inline: false
            });
        });
        
        await channel.send({ embeds: [embed] });
        console.log(`    📨 Notificação enviada`);
        
    } catch (error) {
        console.log(`    ❌ Erro: ${error.message}`);
    }
}

// VERIFICAÇÃO PRINCIPAL
async function checkAllSites() {
    console.log(`\n🔍 [${new Date().toLocaleTimeString('pt-BR')}] VERIFICAÇÃO`);
    console.log('─'.repeat(50));
    
    let hasNewItems = false;
    
    for (const site of SITES) {
        const newItems = await checkSite(site);
        
        if (newItems.length > 0) {
            hasNewItems = true;
            await sendNotification(site, newItems);
        }
        
        // Aguardar entre sites
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Atualizar timestamp da última verificação
    detectedItems.lastCheck = new Date().toISOString();
    
    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ✅ CONCLUÍDA`);
    console.log(`   📊 Novos itens: ${hasNewItems ? 'Sim' : 'Não'}`);
    console.log('');
    
    // Mostrar instrução para salvar histórico
    if (hasNewItems) {
        console.log('💡 **ATENÇÃO:** Para evitar notificações repetidas:');
        console.log('1. Copie os IDs abaixo para as variáveis de ambiente no Render');
        console.log('2. Vá em Environment → Add Environment Variable');
        console.log('');
        console.log('Diário CONSAÚDE:');
        console.log('Key: HISTORY_DIARIO');
        console.log(`Value: ${JSON.stringify(detectedItems.diario)}`);
        console.log('');
        console.log('Concursos CONSAÚDE:');
        console.log('Key: HISTORY_CONCURSO');
        console.log(`Value: ${JSON.stringify(detectedItems.concurso)}`);
        console.log('');
        console.log('Prefeitura Iguape:');
        console.log('Key: HISTORY_PREFEITURA');
        console.log(`Value: ${JSON.stringify(detectedItems.prefeitura)}`);
        console.log('');
    }
}

// COMANDOS SIMPLIFICADOS
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    
    const command = message.content.slice(1).toLowerCase().split(' ')[0];
    
    switch (command) {
        case 'status':
            const embed = new EmbedBuilder()
                .setColor(0x7289DA)
                .setTitle('🤖 STATUS')
                .setDescription(`Última verificação: ${detectedItems.lastCheck ? new Date(detectedItems.lastCheck).toLocaleString('pt-BR') : 'Nunca'}`)
                .addFields(
                    { name: '📰 Diário', value: `${detectedItems.diario.length} itens`, inline: true },
                    { name: '📋 Concursos', value: `${detectedItems.concurso.length} itens`, inline: true },
                    { name: '🏛️ Prefeitura', value: `${detectedItems.prefeitura.length} itens`, inline: true }
                )
                .addFields({
                    name: '⏱️ Próxima',
                    value: `Em ${CONFIG.checkInterval / 60000} minutos`,
                    inline: false
                })
                .setTimestamp();
            
            await message.reply({ embeds: [embed] });
            break;
            
        case 'verificar':
            await message.reply('🔄 Verificando...');
            await checkAllSites();
            break;
            
        case 'historico':
            await message.reply(`📊 **Histórico atual:**\n` +
                `• Diário: ${detectedItems.diario.length}\n` +
                `• Concursos: ${detectedItems.concurso.length}\n` +
                `• Prefeitura: ${detectedItems.prefeitura.length}`);
            break;
            
        case 'ajuda':
            await message.reply(`**Comandos:**\n` +
                `\`!status\` - Status do sistema\n` +
                `\`!verificar\` - Verificar agora\n` +
                `\`!historico\` - Ver histórico\n` +
                `\`!ajuda\` - Esta mensagem`);
            break;
    }
});

// INICIALIZAÇÃO
client.once('ready', () => {
    console.log('══════════════════════════════════');
    console.log(`✅ BOT: ${client.user.tag}`);
    console.log(`📊 Sites: ${SITES.length}`);
    console.log(`⏱️  Intervalo: ${CONFIG.checkInterval / 60000} min`);
    console.log('══════════════════════════════════\n');
    
    client.user.setActivity({ name: 'monitoramento', type: 3 });
    
    // Verificar a cada X minutos
    setInterval(checkAllSites, CONFIG.checkInterval);
    
    // Primeira em 30 segundos
    setTimeout(checkAllSites, 30000);
});

// INICIAR
client.login(CONFIG.token);
