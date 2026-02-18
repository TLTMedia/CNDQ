/**
 * Playwright API Client Helper
 * Wraps APIRequestContext to provide game-specific methods.
 * Structured to mirror the frontend js/api.js client.
 */

class ApiClient {
    /**
     * @param {import('playwright').APIRequestContext} requestContext
     * @param {string} baseUrl
     */
    constructor(requestContext, baseUrl) {
        this.request = requestContext;
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    async _fetch(method, endpoint, body = null) {
        const url = `${this.baseUrl}/api/${endpoint.replace(/^\/api\//, '')}`;
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (body && method !== 'GET' && method !== 'HEAD') {
            options.data = body;
        }

        try {
            const response = await this.request.fetch(url, options);
            
            // Try to parse JSON, fallback to text
            let data;
            try {
                data = await response.json();
            } catch (e) {
                data = await response.text();
            }

            return {
                ok: response.ok(),
                status: response.status(),
                statusText: response.statusText(),
                data: data,
                url: url
            };
        } catch (error) {
            return {
                ok: false,
                status: 0,
                statusText: error.message,
                data: { error: error.message },
                url: url
            };
        }
    }

    async get(endpoint) { return this._fetch('GET', endpoint); }
    async post(endpoint, body) { return this._fetch('POST', endpoint, body); }

    // ==========================================
    // Team & Profile APIs
    // ==========================================
    team = {
        getProfile: async () => this.get('team/profile.php'),
        getSettings: async () => this.get('team/settings.php'),
        updateSettings: async (settings) => this.post('team/settings.php', settings)
    };

    // ==========================================
    // Production & Shadow Prices APIs
    // ==========================================
    production = {
        getShadowPrices: async () => this.get('production/shadow-prices.php'),    // recalculates LP
        readShadowPrices: async () => this.get('production/shadow-prices-read.php') // read-only cached
    };

    // ==========================================
    // Listings APIs
    // ==========================================
    listings = {
        list: async () => this.get('listings/list.php'),
        post: async (chemical, type, message = '') => this.post('listings/post.php', { chemical, type, message }),
        getMyListings: async () => this.get('listings/my-listings.php')
    };

    // ==========================================
    // Offers APIs (Buy Requests)
    // ==========================================
    offers = {
        bid: async (chemical, quantity, maxPrice) => this.post('offers/bid.php', { chemical, quantity, maxPrice }),
        create: async (chemical, quantity, minPrice) => this.post('offers/create.php', { chemical, quantity, minPrice }),
        cancel: async (offerId) => this.post('offers/cancel.php', { offerId })
    };

    // ==========================================
    // Negotiation APIs
    // ==========================================
    negotiations = {
        list: async () => this.get('negotiations/list.php'),
        initiate: async (responderId, chemical, quantity, price, type = 'buy', adId = null) => {
            const body = { responderId, chemical, quantity, price, type };
            if (adId) body.adId = adId;
            return this.post('negotiations/initiate.php', body);
        },
        counter: async (negotiationId, quantity, price) => this.post('negotiations/counter.php', { negotiationId, quantity, price }),
        accept: async (negotiationId) => this.post('negotiations/accept.php', { negotiationId }),
        reject: async (negotiationId) => this.post('negotiations/reject.php', { negotiationId }),
        react: async (negotiationId, emoji) => this.post('negotiations/react.php', { negotiationId, emoji })
    };

    // ==========================================
    // Notification APIs
    // ==========================================
    notifications = {
        list: async () => this.get('notifications/list.php')
    };

    // ==========================================
    // Session APIs
    // ==========================================
    session = {
        getStatus: async () => this.get('session/status.php'),
        acknowledgeProduction: async () => this.post('session/status.php', { acknowledgeProduction: true })
    };

    // ==========================================
    // Leaderboard APIs
    // ==========================================
    leaderboard = {
        getStandings: async () => this.get('leaderboard/standings.php')
    };

    // ==========================================
    // Admin APIs
    // ==========================================
    admin = {
        getSession: async () => this.get('admin/session.php'),
        updateSession: async (action, params = {}) => this.post('admin/session.php', { action, ...params }),
        resetGame: async () => this.post('admin/reset-game.php', {}),
        listTeams: async () => this.get('admin/list-teams.php'),
        listNPCs: async () => this.get('admin/npc/list.php'),
        createNPC: async (skillLevel, count = 1) => this.post('admin/npc/create.php', { skillLevel, count }),
        deleteNPC: async (npcId) => this.post('admin/npc/delete.php', { npcId }),
        toggleNPC: async (npcId, active) => this.post('admin/npc/toggle.php', { npcId, active }),
        toggleNPCSystem: async (enabled) => this.post('admin/npc/toggle-system.php', { enabled }),
        updateDelays: async (delays) => this.post('admin/npc/update-delays.php', { delays })
    };

    // ==========================================
    // Reports APIs
    // ==========================================
    reports = {
        get: async (type) => this.get(`reports/index.php?type=${type}`),
        financial: async () => this.get('reports/index.php?type=financial'),
        transactions: async () => this.get('reports/index.php?type=transactions'),
        sensitivity: async () => this.get('reports/index.php?type=sensitivity')
    };

    // ==========================================
    // Trades APIs
    // ==========================================
    trades = {
        history: async () => this.get('trades/history.php'),
        global: async (limit = 50) => this.get(`trades/global.php?limit=${limit}`)
    };

    // Legacy/Convenience Aliases (mapped to new structure)
    async getSessionStatus() { return this.session.getStatus(); }
    async resetGame() { return this.admin.resetGame(); }
    async startGame() { return this.admin.updateSession('start'); }
    async controlSession(action, params = {}) { return this.admin.updateSession(action, params); }
    async setAutoAdvance(enabled) { return this.admin.updateSession('setAutoCycle', { enabled }); }
    async setTradingDuration(seconds) { return this.admin.updateSession('setTradingDuration', { seconds }); }
    async listNegotiations() { return this.negotiations.list(); }
    async acceptNegotiation(id) { return this.negotiations.accept(id); }
    async rejectNegotiation(id) { return this.negotiations.reject(id); }
    async createBuyOrder(c, q, p) { return this.offers.bid(c, q, p); }
    async postListing(c, t, m) { return this.listings.post(c, t, m); }
    async getLeaderboard() { return this.leaderboard.getStandings(); }

    // advertisements is an alias for listings (same data, same endpoints)
    advertisements = {
        list: async () => this.listings.list()
    };
    async postAdvertisement(chemical, type) { return this.listings.post(chemical, type); }
}

module.exports = ApiClient;