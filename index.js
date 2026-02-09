// Carregar variáveis de ambiente
require('dotenv').config();

// Importar módulos
const { startBot } = require('./src/bot');
const { setupMonitor } = require('./src/monitor');

console.log('🚀 Iniciando Bot de Monitoramento...');
console.log('='.repeat(50));

// Verificar variáveis obrigatórias
const requiredVars = ['DISCORD_TOKEN'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ VARIÁVEIS DE AMBIENTE FALTANDO:');
    missingVars.forEach(varName => {
        console.error(`   ${varName} não configurado`);
    });
    console.log('\n👉 Configure no Railway:');
    console.log('   1. Vá em Variables');
    console.log('   2. Adicione DISCORD_TOKEN');
    console.log('   3. Valor: seu_token_do_bot');
    process.exit(1);
}

// Iniciar bot
startBot().catch(error => {
    console.error('❌ ERRO AO INICIAR BOT:', error);
    process.exit(1);
});