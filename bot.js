const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');

// CONFIGURAÇÃO
const CONFIG = {
    token: process.env.DISCORD_TOKEN,
    checkInterval: 5 * 60 * 1000, // 5 minutos
    channelName: 'notificacoes'
};

// SITES PARA MONITORAR
const SITES = [
    {
        name: 'Diário CONSAÚDE',
        url: 'https://consaude.org.br/diario-oficial/',
        pattern: /EDIÇÃO:|Edição:/gi
    },
    {
        name: 'Concursos CONSAÚDE',
        url: 'https://consaude.org.br/ver-concurso/?n=3',
        pattern: /Edital de Convocação|ERRATA/gi
    },
    {
        name: 'Prefeitura Iguape',
        url: 'https://www.iguape.sp.gov.br/portal/diario-oficial',
        pattern: /Edição n|Edição nº/gi
    }
];

// Histórico em memória
let history = {
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

// FUNÇÃO PARA VERIFICAR SITES
async function checkSites() {
    console.log(`[${new Date().toLocaleTimeString()}] 🔍 Verificando sites...`);
    
    for (const site of SITES) {
        try {
            console.log(`  Verificando: ${site.name}`);
            
            // Baixar a página
            const response = await axios.get(site.url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            });
            
            // Extrair texto
            const text = response.data;
            
            // Buscar padrões
            const matches = text.match(site.pattern);
            
            if (matches) {
                // Filtrar novos itens
                const newItems = matches.filter(item => {
                    const key = site.name.includes('Diário') ? 'diario' :
                               site.name.includes('Concursos') ? 'concurso' : 'prefeitura';
                    
                    // Verificar se já existe
                    const exists = history[key].some(h => 
                        h.includes(item.substring(0, 50))
                    );
                    
                    if (!exists) {
                        history[key].push(item);
                        return true;
                    }
                    return false;
                });
                
                // Se houver novos, notificar
                if (newItems.length > 0) {
                    await sendNotification(site, newItems);
                }
            }
            
        } catch (error) {
            console.log(`  ❌ Erro em ${site.name}: ${error.message}`);
        }
        
        // Aguardar 2 segundos entre sites
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`[${new Date().toLocaleTimeString()}] ✅ Verificação concluída\n`);
}

// FUNÇÃO PARA ENVIAR NOTIFICAÇÃO
async function sendNotification(site, items) {
    try {
        // Encontrar canal
        const channel = client.channels.cache.find(ch => 
            ch.name === CONFIG.channelName && ch.isTextBased()
        );
        
        if (!channel) {
            console.log(`  ⚠️ Canal "${CONFIG.channelName}" não encontrado`);
            return;
        }
        
        // Criar mensagem
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`📢 NOVA ATUALIZAÇÃO - ${site.name}`)
            .setDescription(`**URL:** ${site.url}`)
            .setTimestamp();
        
        // Adicionar itens
        items.slice(0, 3).forEach((item, i) => {
            embed.addFields({
                name: `Item ${i + 1}`,
                value: item.substring(0, 200),
                inline: false
            });
        });
        
        // Enviar
        await channel.send({ embeds: [embed] });
        console.log(`  📨 Notificação enviada: ${items.length} item(s)`);
        
    } catch (error) {
        console.log(`  ❌ Erro ao notificar: ${error.message}`);
    }
}

// COMANDOS DO BOT
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    
    const command = message.content.slice(1).toLowerCase().split(' ')[0];
    
    switch (command) {
        case 'status':
            const embed = new EmbedBuilder()
                .setColor(0x7289DA)
                .setTitle('📊 STATUS DO BOT')
                .setDescription('Monitoramento ativo 24/7')
                .addFields(
                    { name: '📰 Diário CONSAÚDE', value: `${history.diario.length} itens`, inline: true },
                    { name: '📋 Concursos', value: `${history.concurso.length} itens`, inline: true },
                    { name: '🏛️ Prefeitura', value: `${history.prefeitura.length} itens`, inline: true }
                )
                .setTimestamp();
            
            await message.reply({ embeds: [embed] });
            break;
            
        case 'verificar':
            await message.reply('🔄 Verificando agora...');
            await checkSites();
            await message.reply('✅ Verificação completa!');
            break;
            
        case 'sites':
            const list = SITES.map(s => `• **${s.name}**\n  ${s.url}`).join('\n\n');
            await message.reply(`🌐 **Sites monitorados:**\n\n${list}`);
            break;
            
        case 'ajuda':
            const ajuda = `
**🤖 COMANDOS DISPONÍVEIS:**

\`!status\` - Mostra status
\`!verificar\` - Verifica sites agora
\`!sites\` - Lista sites monitorados
\`!ajuda\` - Mostra esta mensagem

O bot verifica automaticamente a cada 5 minutos.
            `;
            await message.reply(ajuda);
            break;
    }
});

// QUANDO O BOT INICIAR
client.once('ready', () => {
    console.log('================================');
    console.log(`✅ BOT CONECTADO: ${client.user.tag}`);
    console.log(`📊 Monitorando ${SITES.length} sites`);
    console.log(`⏱️  Verificando a cada 5 minutos`);
    console.log(`📢 Canal: ${CONFIG.channelName}`);
    console.log('================================\n');
    
    // Verificar a cada 5 minutos
    setInterval(checkSites, CONFIG.checkInterval);
    
    // Primeira verificação em 30 segundos
    setTimeout(checkSites, 30000);
});

// INICIAR BOT
if (!CONFIG.token) {
    console.error('❌ ERRO: DISCORD_TOKEN não configurado!');
    console.log('👉 Configure a variável de ambiente:');
    console.log('   DISCORD_TOKEN=seu_token_aqui');
    process.exit(1);
}

client.login(CONFIG.token);