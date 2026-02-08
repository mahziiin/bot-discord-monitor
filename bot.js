const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

console.log("🚀 Iniciando bot de monitoramento...");

// CONFIGURAÇÃO
const CONFIG = {
    token: process.env.DISCORD_TOKEN,
    checkInterval: 5 * 60 * 1000, // 5 minutos
    channelName: 'notificacoes',
    historyFile: 'history.json'
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

// Histórico (será carregado do arquivo)
let detectedItems = {
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

// ==================== FUNÇÕES DE HISTÓRICO ====================

// Salvar histórico em arquivo
async function saveHistory() {
    try {
        await fs.writeFile(
            CONFIG.historyFile, 
            JSON.stringify(detectedItems, null, 2)
        );
        console.log('💾 Histórico salvo');
    } catch (error) {
        console.error('❌ Erro ao salvar histórico:', error.message);
    }
}

// Carregar histórico do arquivo
async function loadHistory() {
    try {
        const data = await fs.readFile(CONFIG.historyFile, 'utf8');
        const loaded = JSON.parse(data);
        
        // Validar estrutura
        if (loaded.diario && loaded.concurso && loaded.prefeitura) {
            detectedItems = loaded;
            console.log(`📚 Histórico carregado:`);
            console.log(`   Diário: ${detectedItems.diario.length} itens`);
            console.log(`   Concursos: ${detectedItems.concurso.length} itens`);
            console.log(`   Prefeitura: ${detectedItems.prefeitura.length} itens`);
        }
    } catch (error) {
        // Arquivo não existe ainda - criar novo
        console.log('📝 Criando novo histórico...');
        await saveHistory();
    }
}

// Gerar ID único para um item (para evitar duplicatas)
function generateItemId(text, siteType) {
    // Extrair partes importantes para criar ID
    const cleanText = text.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 50);
    
    // Extrair datas (dd/mm/aaaa ou aaaa-mm-dd)
    const dateMatch = text.match(/\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/);
    const datePart = dateMatch ? dateMatch[0].replace(/\D/g, '') : '';
    
    // Extrair números de edição
    const editionMatch = text.match(/\d+\/\d+|\d+/);
    const editionPart = editionMatch ? editionMatch[0].replace(/\D/g, '') : '';
    
    return `${siteType}_${editionPart}_${datePart}_${cleanText.substring(0, 20)}`;
}

// ==================== FUNÇÕES DE MONITORAMENTO ====================

async function checkSite(site) {
    try {
        console.log(`  📄 Verificando: ${site.name}`);
        
        const response = await axios.get(site.url, {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const text = response.data;
        const matches = text.match(site.pattern);
        const newItems = [];
        
        if (matches) {
            console.log(`    ✅ ${matches.length} padrão(ões) encontrado(s)`);
            
            // Processar cada match
            matches.forEach(match => {
                const cleanMatch = match.trim()
                    .replace(/\s+/g, ' ')
                    .substring(0, 200);
                
                // Gerar ID único
                const itemId = generateItemId(cleanMatch, site.type);
                
                // Verificar se já existe
                if (!detectedItems[site.type].includes(itemId)) {
                    newItems.push({
                        text: cleanMatch,
                        id: itemId,
                        timestamp: new Date().toISOString()
                    });
                    
                    detectedItems[site.type].push(itemId);
                    
                    // Limitar histórico a 100 itens por tipo
                    if (detectedItems[site.type].length > 100) {
                        detectedItems[site.type] = detectedItems[site.type].slice(-100);
                    }
                }
            });
            
            if (newItems.length > 0) {
                console.log(`    🎯 ${newItems.length} NOVO(S) ITEM(S)!`);
                
                // Salvar histórico imediatamente
                await saveHistory();
                
                return newItems.map(item => item.text);
            } else {
                console.log(`    📭 Todos os itens já foram notificados anteriormente`);
            }
        }
        
        return [];
        
    } catch (error) {
        console.log(`    ❌ Erro: ${error.message}`);
        return [];
    }
}

async function sendNotification(site, newItems) {
    try {
        const channel = client.channels.cache.find(ch => 
            ch.name === CONFIG.channelName && ch.isTextBased()
        );
        
        if (!channel) {
            console.log(`    ⚠️ Canal "${CONFIG.channelName}" não encontrado!`);
            return;
        }
        
        // Definir estilo
        let color, emoji;
        switch (site.type) {
            case 'diario': color = 0x0099FF; emoji = '📰'; break;
            case 'concurso': color = 0xFF9900; emoji = '📋'; break;
            case 'prefeitura': color = 0x00AA00; emoji = '🏛️'; break;
            default: color = 0x7289DA; emoji = '📢';
        }
        
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${emoji} NOVA ATUALIZAÇÃO - ${site.name}`)
            .setURL(site.url)
            .setDescription(`**Fonte:** ${site.name}\n**Hora:** ${new Date().toLocaleTimeString('pt-BR')}`)
            .setTimestamp();
        
        // Adicionar itens (máximo 3)
        newItems.slice(0, 3).forEach((item, index) => {
            embed.addFields({
                name: `📌 Item ${index + 1}`,
                value: item.length > 150 ? item.substring(0, 150) + '...' : item,
                inline: false
            });
        });
        
        if (newItems.length > 3) {
            embed.addFields({
                name: '📊 Mais itens',
                value: `+${newItems.length - 3} item(s) adicionais`,
                inline: false
            });
        }
        
        await channel.send({ embeds: [embed] });
        console.log(`    📨 Notificação enviada: ${newItems.length} item(s)`);
        
    } catch (error) {
        console.log(`    ❌ Erro ao notificar: ${error.message}`);
    }
}

async function checkAllSites() {
    console.log(`\n🔍 [${new Date().toLocaleTimeString('pt-BR')}] VERIFICAÇÃO INICIADA`);
    console.log('='.repeat(50));
    
    let totalNewItems = 0;
    
    for (const site of SITES) {
        const newItems = await checkSite(site);
        
        if (newItems.length > 0) {
            await sendNotification(site, newItems);
            totalNewItems += newItems.length;
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ✅ VERIFICAÇÃO CONCLUÍDA`);
    console.log(`   📊 Total de novos itens: ${totalNewItems}`);
    console.log('');
}

// ==================== COMANDOS ====================

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
                        value: `Verificação: A cada ${CONFIG.checkInterval / 60000} minutos\nCanal: ${CONFIG.channelName}\nPróxima: ${new Date(Date.now() + CONFIG.checkInterval).toLocaleTimeString('pt-BR')}`,
                        inline: false
                    })
                    .setTimestamp();
                
                await message.reply({ embeds: [embed] });
                break;
                
            case 'verificar':
                await message.reply('🔄 Verificando todos os sites agora...');
                await checkAllSites();
                await message.reply(`✅ Verificação concluída!`);
                break;
                
            case 'limpar':
                // Comando para limpar histórico (apenas dono do bot)
                if (message.author.id === 'SEU_ID_DO_DISCORD') {
                    detectedItems = { diario: [], concurso: [], prefeitura: [] };
                    await saveHistory();
                    await message.reply('🧹 Histórico limpo! Próxima verificação notificará tudo como novo.');
                } else {
                    await message.reply('⛔ Apenas o administrador pode usar este comando.');
                }
                break;
                
            case 'testar':
                await message.reply('🧪 Testando detecção...');
                
                // Testar cada site individualmente
                for (const site of SITES) {
                    await message.channel.send(`**Testando:** ${site.name}`);
                    const items = await checkSite(site);
                    
                    if (items.length > 0) {
                        await message.channel.send(`✅ ${items.length} novo(s) item(s) detectado(s)`);
                    } else {
                        await message.channel.send(`📭 Nenhum novo item (já notificados: ${detectedItems[site.type].length})`);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                break;
                
            case 'ajuda':
                const ajuda = `
**🤖 COMANDOS DISPONÍVEIS:**

\`!status\` - Mostra status do sistema
\`!verificar\` - Força verificação manual
\`!testar\` - Testa cada site individualmente
\`!ajuda\` - Mostra esta mensagem

**🔧 Administrador:**
\`!limpar\` - Limpa histórico de notificações

O bot verifica automaticamente a cada 5 minutos.
                `;
                await message.reply(ajuda);
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

// ==================== INICIALIZAÇÃO ====================

client.once('ready', async () => {
    console.log('══════════════════════════════════════════════');
    console.log(`✅ BOT CONECTADO: ${client.user.tag}`);
    
    // Carregar histórico
    await loadHistory();
    
    console.log(`📊 Monitorando ${SITES.length} sites`);
    console.log(`⏱️  Verificação: A cada ${CONFIG.checkInterval / 60000} minutos`);
    console.log(`📢 Canal: ${CONFIG.channelName}`);
    console.log('══════════════════════════════════════════════\n');
    
    // Definir status
    client.user.setActivity({
        name: 'por atualizações',
        type: 3 // WATCHING
    });
    
    // Iniciar verificações periódicas
    setInterval(checkAllSites, CONFIG.checkInterval);
    
    // Primeira verificação em 10 segundos
    setTimeout(checkAllSites, 10000);
});

// Iniciar bot
client.login(CONFIG.token).catch(error => {
    console.error('❌ ERRO AO CONECTAR:', error.message);
    process.exit(1);
});
