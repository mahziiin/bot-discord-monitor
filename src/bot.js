const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

class DiscordBot {
    constructor() {
        this.token = process.env.DISCORD_TOKEN;
        this.channelName = process.env.NOTIFICATION_CHANNEL || 'notificacoes';
        this.client = null;
        this.isReady = false;
    }

    async start() {
        console.log('🤖 Iniciando cliente Discord...');
        
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        // Evento: Bot pronto
        this.client.once('ready', () => {
            this.isReady = true;
            console.log('══════════════════════════════════════════════');
            console.log(`✅ BOT CONECTADO: ${this.client.user.tag}`);
            console.log(`📊 Servidores: ${this.client.guilds.cache.size}`);
            console.log(`📢 Canal: ${this.channelName}`);
            console.log('══════════════════════════════════════════════\n');
            
            this.client.user.setActivity({
                name: 'monitoramento',
                type: 3 // WATCHING
            });
        });

        // Evento: Mensagens
        this.client.on('messageCreate', this.handleMessage.bind(this));

        // Conectar
        try {
            await this.client.login(this.token);
            return this.client;
        } catch (error) {
            console.error('❌ ERRO AO CONECTAR:', error.message);
            throw error;
        }
    }

    async handleMessage(message) {
        if (message.author.bot || !message.content.startsWith('!')) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();

        switch (command) {
            case 'status':
                await this.sendStatus(message);
                break;
                
            case 'verificar':
                await message.reply('🔄 Verificando sites...');
                // A verificação será feita pelo monitor
                break;
                
            case 'sites':
                await this.sendSitesList(message);
                break;
                
            case 'ping':
                const latency = Date.now() - message.createdTimestamp;
                await message.reply(`🏓 Pong! ${latency}ms`);
                break;
                
            case 'ajuda':
                await this.sendHelp(message);
                break;
                
            case 'teste':
                await message.reply('✅ Bot funcionando no Railway!');
                break;
        }
    }

    async sendStatus(message) {
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('📊 STATUS DO SISTEMA')
            .setDescription('Bot de monitoramento ativo 24/7')
            .addFields(
                {
                    name: '🟢 Status',
                    value: 'Online e monitorando',
                    inline: true
                },
                {
                    name: '⏱️ Uptime',
                    value: this.formatUptime(process.uptime()),
                    inline: true
                },
                {
                    name: '📅 Iniciado',
                    value: new Date(Date.now() - process.uptime() * 1000).toLocaleString('pt-BR'),
                    inline: true
                }
            )
            .addFields({
                name: '🌐 Sites monitorados',
                value: '• Diário Oficial CONSAÚDE\n• Concursos CONSAÚDE\n• Prefeitura Iguape',
                inline: false
            })
            .setTimestamp()
            .setFooter({ text: 'Sistema de Monitoramento Automático' });

        await message.reply({ embeds: [embed] });
    }

    async sendSitesList(message) {
        const sites = [
            {
                name: '📰 Diário Oficial CONSAÚDE',
                url: process.env.SITE_DIARIO_CONSaude,
                desc: 'Busca por: EDIÇÃO:, Edição:'
            },
            {
                name: '📋 Concursos CONSAÚDE',
                url: process.env.SITE_CONCURSOS_CONSaude,
                desc: 'Busca por: Edital de Convocação, ERRATA'
            },
            {
                name: '🏛️ Prefeitura Iguape',
                url: process.env.SITE_PREFEITURA_IGUAPE,
                desc: 'Busca por: Edição n, Edição nº'
            }
        ];

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🌐 SITES MONITORADOS')
            .setDescription('Todos os sites sendo verificados:');

        sites.forEach(site => {
            embed.addFields({
                name: site.name,
                value: `${site.desc}\n🔗 ${site.url}`,
                inline: false
            });
        });

        await message.reply({ embeds: [embed] });
    }

    async sendHelp(message) {
        const embed = new EmbedBuilder()
            .setColor(0x7289DA)
            .setTitle('❓ COMANDOS DISPONÍVEIS')
            .setDescription('Lista de todos os comandos do bot:')
            .addFields(
                { name: '`!status`', value: 'Status do sistema', inline: true },
                { name: '`!verificar`', value: 'Verificar sites agora', inline: true },
                { name: '`!sites`', value: 'Listar sites monitorados', inline: true },
                { name: '`!ping`', value: 'Testar latência', inline: true },
                { name: '`!ajuda`', value: 'Mostrar esta mensagem', inline: true },
                { name: '`!teste`', value: 'Testar conexão', inline: true }
            )
            .setFooter({ text: 'O bot verifica automaticamente a cada 5 minutos' });

        await message.reply({ embeds: [embed] });
    }

    async sendNotification(items) {
        if (!this.isReady) {
            console.log('⚠️ Bot não está pronto para enviar notificações');
            return;
        }

        try {
            const channel = this.client.channels.cache.find(
                ch => ch.name === this.channelName && ch.isTextBased()
            );

            if (!channel) {
                console.log(`⚠️ Canal "${this.channelName}" não encontrado`);
                return;
            }

            for (const item of items) {
                const embed = new EmbedBuilder()
                    .setColor(this.getColorByType(item.type))
                    .setTitle(`📢 ${item.siteName}`)
                    .setURL(item.url)
                    .setDescription(`**Nova atualização detectada**\n${new Date().toLocaleTimeString('pt-BR')}`)
                    .addFields(
                        {
                            name: '📋 Conteúdo',
                            value: item.content.substring(0, 200),
                            inline: false
                        }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Monitoramento Automático' });

                await channel.send({ embeds: [embed] });
                console.log(`📨 Notificação enviada: ${item.siteName}`);
            }
        } catch (error) {
            console.error('❌ Erro ao enviar notificação:', error.message);
        }
    }

    getColorByType(type) {
        const colors = {
            diario: 0x0099FF,    // Azul
            concurso: 0xFF9900,  // Laranja
            prefeitura: 0x00AA00 // Verde
        };
        return colors[type] || 0x7289DA;
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }

    getClient() {
        return this.client;
    }

    isConnected() {
        return this.isReady;
    }
}

// Exportar instância única
const bot = new DiscordBot();
module.exports = { bot, startBot: () => bot.start() };
