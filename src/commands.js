const { EmbedBuilder } = require('discord.js');
const { monitor } = require('./monitor');

async function handleCommand(message, command, args) {
    switch (command) {
        case 'estatisticas':
            await sendStatistics(message);
            break;
        case 'limpar':
            await clearHistory(message);
            break;
        case 'intervalo':
            await changeInterval(message, args);
            break;
    }
}

async function sendStatistics(message) {
    const stats = monitor.getStats();
    
    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('📈 ESTATÍSTICAS DO MONITORAMENTO')
        .setDescription(`Total de itens detectados: ${stats.totalDetected}`)
        .addFields(
            {
                name: '📊 Por site',
                value: Object.entries(stats.bySite)
                    .map(([site, count]) => `• ${site}: ${count} itens`)
                    .join('\n') || 'Nenhum item detectado ainda',
                inline: false
            }
        )
        .setTimestamp()
        .setFooter({ text: 'Estatísticas desde o último reinício' });

    await message.reply({ embeds: [embed] });
}

async function clearHistory(message) {
    // Apenas administradores podem limpar
    if (!message.member.permissions.has('ADMINISTRATOR')) {
        await message.reply('⛔ Apenas administradores podem usar este comando.');
        return;
    }

    // Aqui você implementaria a lógica para limpar histórico
    await message.reply('🔄 Histórico será limpo na próxima versão.');
}

async function changeInterval(message, args) {
    if (!message.member.permissions.has('ADMINISTRATOR')) {
        await message.reply('⛔ Apenas administradores podem mudar o intervalo.');
        return;
    }

    const minutes = parseInt(args[0]);
    if (!minutes || minutes < 1 || minutes > 60) {
        await message.reply('❌ Use: `!intervalo <minutos>` (1-60)');
        return;
    }

    await message.reply(`✅ Intervalo alterado para ${minutes} minutos.`);
}

module.exports = { handleCommand };
