const axios = require('axios');
const cheerio = require('cheerio');
const { bot } = require('./bot');

class SiteMonitor {
    constructor() {
        this.sites = [
            {
                name: 'Diário Oficial CONSAÚDE',
                url: process.env.SITE_DIARIO_CONSaude,
                type: 'diario',
                patterns: ['EDIÇÃO:', 'Edição:', 'Edicao:']
            },
            {
                name: 'Concursos CONSAÚDE',
                url: process.env.SITE_CONCURSOS_CONSaude,
                type: 'concurso',
                patterns: ['Edital de Convocação', 'ERRATA', 'CONVOCAÇÃO']
            },
            {
                name: 'Prefeitura Iguape',
                url: process.env.SITE_PREFEITURA_IGUAPE,
                type: 'prefeitura',
                patterns: ['Edição n', 'Edição nº', 'Edicao n']
            }
        ];

        this.checkInterval = parseInt(process.env.CHECK_INTERVAL_MINUTES || '5') * 60 * 1000;
        this.history = new Map(); // Site -> Array de IDs detectados
        this.isMonitoring = false;
    }

    async start() {
        console.log('🔍 Iniciando monitoramento...');
        console.log(`⏱️ Intervalo: ${this.checkInterval / 60000} minutos`);
        console.log(`📊 Sites: ${this.sites.length}\n`);

        this.isMonitoring = true;
        
        // Verificação inicial
        await this.checkAllSites();
        
        // Agendar verificações periódicas
        setInterval(() => {
            this.checkAllSites();
        }, this.checkInterval);

        return this;
    }

    async checkAllSites() {
        if (!this.isMonitoring) return;

        console.log(`\n[${new Date().toLocaleTimeString('pt-BR')}] 🔎 VERIFICAÇÃO INICIADA`);
        console.log('─'.repeat(50));

        const newItems = [];

        for (const site of this.sites) {
            try {
                const items = await this.checkSite(site);
                if (items.length > 0) {
                    newItems.push(...items);
                }
            } catch (error) {
                console.log(`❌ Erro em ${site.name}: ${error.message}`);
            }

            // Aguardar entre sites
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Enviar notificações se houver novos itens
        if (newItems.length > 0 && bot.isConnected()) {
            await bot.sendNotification(newItems);
        }

        console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ✅ VERIFICAÇÃO CONCLUÍDA`);
        console.log(`   📊 Novos itens: ${newItems.length}`);
        console.log('');
    }

    async checkSite(site) {
        console.log(`  📄 ${site.name}`);

        try {
            const response = await axios.get(site.url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const $ = cheerio.load(response.data);
            const pageText = $('body').text();
            const foundItems = [];

            // Procurar por cada padrão
            for (const pattern of site.patterns) {
                const regex = new RegExp(`.{0,100}${pattern}.{0,100}`, 'gi');
                const matches = pageText.match(regex);

                if (matches) {
                    for (const match of matches.slice(0, 5)) { // Pegar apenas 5 primeiros
                        const cleanMatch = match.trim();
                        const itemId = this.generateItemId(cleanMatch);

                        // Verificar se já foi detectado
                        if (!this.hasBeenDetected(site.url, itemId)) {
                            foundItems.push({
                                siteName: site.name,
                                url: site.url,
                                type: site.type,
                                content: cleanMatch,
                                pattern: pattern,
                                timestamp: new Date().toISOString()
                            });

                            this.addToHistory(site.url, itemId);
                        }
                    }
                }
            }

            console.log(`    ${foundItems.length > 0 ? '✅' : '📭'} ${foundItems.length} novo(s) item(s)`);
            return foundItems;

        } catch (error) {
            console.log(`    ❌ Erro: ${error.message}`);
            return [];
        }
    }

    generateItemId(text) {
        // Criar ID único baseado no conteúdo
        return Buffer.from(text.toLowerCase().replace(/\s+/g, ' '))
            .toString('base64')
            .substring(0, 50);
    }

    hasBeenDetected(siteUrl, itemId) {
        if (!this.history.has(siteUrl)) {
            this.history.set(siteUrl, []);
            return false;
        }
        return this.history.get(siteUrl).includes(itemId);
    }

    addToHistory(siteUrl, itemId) {
        if (!this.history.has(siteUrl)) {
            this.history.set(siteUrl, []);
        }

        const history = this.history.get(siteUrl);
        history.push(itemId);

        // Manter apenas últimos 100 itens por site
        if (history.length > 100) {
            this.history.set(siteUrl, history.slice(-100));
        }
    }

    getStats() {
        const stats = {
            totalSites: this.sites.length,
            totalDetected: 0,
            bySite: {}
        };

        for (const [siteUrl, items] of this.history.entries()) {
            const siteName = this.sites.find(s => s.url === siteUrl)?.name || siteUrl;
            stats.bySite[siteName] = items.length;
            stats.totalDetected += items.length;
        }

        return stats;
    }
}

// Inicializar e exportar
const monitor = new SiteMonitor();
module.exports = { monitor, setupMonitor: () => monitor.start() };
