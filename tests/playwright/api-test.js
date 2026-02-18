/**
 * API-Only Playability Test (Playwright Version)
 *
 * Runs the complete game simulation using ONLY direct API calls via Playwright's APIRequestContext.
 * Also validates application health: shadow prices, leaderboard data quality,
 * full negotiation cycle, and CSV-ready export data.
 */

const { request } = require('playwright');
const CONFIG = require('./config');
const ApiClient = require('./lib/api-client');
const fs = require('fs');

class APIPlayabilityTest {
    constructor() {
        this.results = {
            apiCalls: 0,
            successful: 0,
            failed: 0,
            errors: [],
            warnings: [],
            checks: []   // named health checks
        };
        this.apiCallLog = [];
    }

    // ─────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────

    async run() {
        console.log('🔌 API Playability Test (Playwright Engine)');
        console.log('='.repeat(80));

        try {
            this.adminClient = await this.createClient(CONFIG.adminUser);

            this.players = [];
            for (const email of CONFIG.testUsers) {
                const client = await this.createClient(email);
                this.players.push({ email, client });
            }

            await this.setupGame();
            await this.verifyApplicationHealth();   // NEW: pre-game health check
            await this.playMarketplace();
            await this.endGameAndCheckResults();
            this.printResults();

        } catch (error) {
            console.error('\n❌ Test failed:', error.message);
            if (CONFIG.verbose) console.error(error.stack);
            process.exit(1);
        }
    }

    async createClient(email) {
        const context = await request.newContext({ baseURL: CONFIG.baseUrl });
        const loginUrl = `${CONFIG.baseUrl}/dev.php?user=${email}`;
        await context.get(loginUrl);
        return new ApiClient(context, CONFIG.baseUrl);
    }

    logResult(method, endpoint, response) {
        this.results.apiCalls++;
        if (response.ok) {
            this.results.successful++;
        } else {
            this.results.failed++;
        }
        this.apiCallLog.push({
            timestamp: new Date().toISOString(),
            method,
            endpoint,
            status: response.status,
            ok: response.ok,
            data: response.data
        });
        if (CONFIG.verbose) {
            const icon = response.ok ? '✅' : '❌';
            console.log(`      ${icon} ${method} ${endpoint} (${response.status})`);
        }
    }

    check(name, passed, detail = '') {
        const icon = passed ? '✅' : '❌';
        console.log(`   ${icon} ${name}${detail ? ': ' + detail : ''}`);
        this.results.checks.push({ name, passed, detail });
        if (!passed) this.results.errors.push(`FAILED CHECK: ${name}${detail ? ' — ' + detail : ''}`);
        return passed;
    }

    // ─────────────────────────────────────────────────────
    // Setup
    // ─────────────────────────────────────────────────────

    async setupGame() {
        console.log('\n🛡️  ADMIN SETUP');
        console.log('-'.repeat(80));

        const reset = await this.adminClient.resetGame();
        this.logResult('POST', 'admin/reset-game', reset);
        if (!reset.ok) throw new Error('Failed to reset game');
        console.log('   ✅ Game reset');

        await this.adminClient.admin.toggleNPCSystem(true);
        
        // Optimize NPC delays for testing (Fast response)
        console.log('🛡️  ADMIN: Optimizing NPC delays for test performance...');
        await this.adminClient.admin.updateDelays({
            expert: { min: 1, max: 2 },
            novice: { min: 1, max: 3 },
            beginner: { min: 1, max: 3 },
            negotiation: {
                expert: { min: 0, max: 1 },
                novice: { min: 1, max: 2 },
                beginner: { min: 1, max: 2 }
            },
            idle: { min: 1, max: 2 }
        });

        await this.adminClient.admin.createNPC('expert', 2);
        await this.adminClient.admin.createNPC('novice', 2);

        await this.adminClient.setAutoAdvance(false);
        await this.adminClient.setTradingDuration(600);

        const start = await this.adminClient.startGame();
        this.logResult('POST', 'admin/session/start', start);
        if (!start.ok) throw new Error('Failed to start game');
        console.log('   ✅ Game started');
    }

    // ─────────────────────────────────────────────────────
    // Application Health Checks (NEW)
    // ─────────────────────────────────────────────────────

    async verifyApplicationHealth() {
        console.log('\n🏥 APPLICATION HEALTH CHECKS');
        console.log('-'.repeat(80));

        const player = this.players[0];
        const api = player.client;

        // 1. Session status reachable
        const status = await this.adminClient.session.getStatus();
        this.logResult('GET', 'session/status', status);
        this.check('Session status reachable', status.ok);
        this.check('Session phase is "trading"', status.data?.phase?.toLowerCase() === 'trading', status.data?.phase);

        // 2. Team profile loads with expected fields
        const profileResp = await api.team.getProfile();
        this.logResult('GET', 'team/profile', profileResp);
        const profile = profileResp.data?.profile;
        const inventory = profileResp.data?.inventory;
        this.check('Profile endpoint reachable', profileResp.ok);
        this.check('Profile has currentFunds', typeof profile?.currentFunds === 'number');
        this.check('Profile has startingFunds', typeof profile?.startingFunds === 'number');
        this.check('Inventory has all 4 chemicals', inventory && ['C','N','D','Q'].every(c => c in inventory));
        this.check('Inventory returns staleness level', !!inventory?.stalenessLevel);

        // 3. Shadow price recalculation works
        const shadowResp = await api.production.getShadowPrices();
        this.logResult('GET', 'production/shadow-prices', shadowResp);
        const sp = shadowResp.data?.shadowPrices;
        this.check('Shadow prices endpoint reachable', shadowResp.ok);
        this.check('Shadow prices has all 4 chemicals', sp && ['C','N','D','Q'].every(c => c in sp));
        this.check('maxProfit is a number', typeof shadowResp.data?.maxProfit === 'number');
        this.check('Shadow prices includes ranges', shadowResp.data?.ranges !== undefined);

        // 4. Read-only shadow prices endpoint works
        const shadowReadResp = await api.production.readShadowPrices();
        this.logResult('GET', 'production/shadow-prices-read', shadowReadResp);
        this.check('Shadow prices read-only endpoint reachable', shadowReadResp.ok);
        this.check('Read-only returns staleness info', shadowReadResp.data?.staleness !== undefined);

        // 5. Post a simple buy listing (interest-only, no price/qty — our new flow)
        const listingResp = await api.listings.post('C', 'buy');
        this.logResult('POST', 'listings/post', listingResp);
        this.check('Can post buy listing (interest-only, no price/qty)', listingResp.ok);

        // 6. Listings load and include our new listing
        const listingsResp = await api.listings.list();
        this.logResult('GET', 'listings/list', listingsResp);
        this.check('Listings endpoint reachable', listingsResp.ok);
        const cBuyListings = listingsResp.data?.listings?.C?.buy || [];
        this.check('Buy listing appears in marketplace', cBuyListings.length > 0);

        // 7. Full negotiation cycle: initiate → counter → accept → trade executes
        await this.verifyNegotiationCycle(api, player.email);

        // 8. Reports endpoints reachable
        const reportResp = await api.reports.financial();
        this.logResult('GET', 'reports/financial', reportResp);
        this.check('Financial report endpoint reachable', reportResp.ok);

        const txResp = await api.reports.transactions();
        this.logResult('GET', 'reports/transactions', txResp);
        this.check('Transaction report endpoint reachable', txResp.ok);

        const sensitivityResp = await api.reports.sensitivity();
        this.logResult('GET', 'reports/sensitivity', sensitivityResp);
        this.check('Sensitivity report endpoint reachable', sensitivityResp.ok);

        // 9. Trade history endpoint
        const tradeHistoryResp = await api.trades.history();
        this.logResult('GET', 'trades/history', tradeHistoryResp);
        this.check('Trade history endpoint reachable', tradeHistoryResp.ok);

        // 10. Global market history endpoint
        const globalHistResp = await api.trades.global(10);
        this.logResult('GET', 'trades/global', globalHistResp);
        this.check('Global trade history endpoint reachable', globalHistResp.ok);

        // 11. Notifications endpoint
        const notifResp = await api.notifications.list();
        this.logResult('GET', 'notifications/list', notifResp);
        this.check('Notifications endpoint reachable', notifResp.ok);

        // 12. Leaderboard has correct data shape (our CSV fix)
        const lbResp = await this.adminClient.getLeaderboard();
        this.logResult('GET', 'leaderboard/standings', lbResp);
        this.check('Leaderboard endpoint reachable', lbResp.ok);
        const standings = lbResp.data?.standings || [];
        this.check('Leaderboard has standings rows', standings.length > 0);
        if (standings.length > 0) {
            const team = standings[0];
            this.check('Leaderboard has teamName field', typeof team.teamName === 'string');
            this.check('Leaderboard has startingFunds field', typeof team.startingFunds === 'number');
            this.check('Leaderboard has currentFunds field', typeof team.currentFunds === 'number');
            this.check('Leaderboard has percentChange field', typeof team.percentChange === 'number');
            this.check('Leaderboard has totalTrades field', typeof team.totalTrades === 'number');
            this.check('Leaderboard has inventory field', team.inventory !== undefined);
        }

        // 13. Admin: list teams works
        const teamsResp = await this.adminClient.admin.listTeams();
        this.logResult('GET', 'admin/list-teams', teamsResp);
        this.check('Admin list-teams endpoint reachable', teamsResp.ok);
        this.check('Teams list is non-empty', (teamsResp.data?.teams?.length ?? 0) > 0);

        console.log(`\n   Health check summary: ${this.results.checks.filter(c => c.passed).length}/${this.results.checks.length} passed`);
    }

    /**
     * End-to-end negotiation cycle between two player clients
     */
    async verifyNegotiationCycle(buyerApi, buyerEmail) {
        console.log('\n   🤝 Negotiation cycle check...');

        // Find a seller among other players
        const sellerPlayer = this.players.find(p => p.email !== buyerEmail);
        if (!sellerPlayer) {
            console.log('      ⚠️  Only one player, skipping negotiation cycle check');
            return;
        }
        const sellerApi = sellerPlayer.client;
        const sellerEmail = sellerPlayer.email;

        // Buyer posts a buy listing so the seller can find them
        await buyerApi.listings.post('N', 'buy');

        // Seller initiates a "sell" negotiation toward the buyer
        const initiateResp = await sellerApi.negotiations.initiate(
            buyerEmail, 'N', 50, 5.00, 'sell'
        );
        this.logResult('POST', 'negotiations/initiate', initiateResp);
        const negId = initiateResp.data?.negotiation?.id;
        this.check('Can initiate negotiation', initiateResp.ok && !!negId);
        if (!negId) return;

        // Buyer counters
        const counterResp = await buyerApi.negotiations.counter(negId, 50, 4.50);
        this.logResult('POST', 'negotiations/counter', counterResp);
        this.check('Can counter a negotiation', counterResp.ok);

        // Seller accepts the counter
        const acceptResp = await sellerApi.negotiations.accept(negId);
        this.logResult('POST', 'negotiations/accept', acceptResp);
        this.check('Can accept a negotiation (trade executes)', acceptResp.ok);

        // Verify trade appears in history
        const histResp = await buyerApi.trades.history();
        const trades = histResp.data?.transactions || [];
        const tradeExecuted = trades.some(t => t.chemical === 'N');
        this.check('Accepted negotiation produces a trade record', tradeExecuted);

        // Verify shadow prices are now stale (trade happened without recalc)
        const profileAfter = await buyerApi.team.getProfile();
        const stalenessAfter = profileAfter.data?.inventory?.stalenessLevel;
        this.check('Shadow prices are non-fresh after trade (expected)', stalenessAfter !== 'fresh', `level=${stalenessAfter}`);
    }

    // ─────────────────────────────────────────────────────
    // Marketplace Play
    // ─────────────────────────────────────────────────────

    async playMarketplace() {
        console.log(`\n🎮 PLAYING MARKETPLACE (API)`);
        console.log('-'.repeat(80));

        const turns = 4;
        for (let turn = 1; turn <= turns; turn++) {
            console.log(`\n   🔄 Turn ${turn}/${turns}...`);
            await this.pollStatus();

            for (const player of this.players) {
                await this.playerTurn(player);
            }

            if (turn < turns) {
                console.log('      ⏳ Waiting for market activity...');
                for (let i = 0; i < 3; i++) {
                    await new Promise(r => setTimeout(r, 2000));
                    await this.pollStatus();
                }
            }
        }
    }

    async pollStatus() {
        const status = await this.adminClient.session.getStatus();
        if (CONFIG.verbose) console.log('      📡 Polled status (triggers NPC cycle)');
        return status;
    }

    async playerTurn(player) {
        const api = player.client;

        // Shadow prices & profile
        const profileResponse = await api.team.getProfile();
        const inventory = profileResponse.data?.inventory || {};

        const shadowResponse = await api.production.getShadowPrices();
        const shadowPrices = shadowResponse.data?.shadowPrices || {};

        // Respond to any pending negotiations
        const negs = await api.listNegotiations();
        if (negs.ok && negs.data.negotiations) {
            const pending = negs.data.negotiations.filter(n =>
                n.status === 'pending' && n.lastOfferBy !== player.email
            );
            for (const neg of pending) {
                const latestOffer = neg.offers[neg.offers.length - 1];
                const chem = neg.chemical;
                const myValuation = shadowPrices[chem] || 0;
                const isBuyer = (neg.initiator_id === player.email && neg.type === 'buy') ||
                                (neg.initiator_id !== player.email && neg.type === 'sell');
                const acceptable = isBuyer
                    ? latestOffer.price <= myValuation * 1.05
                    : latestOffer.price >= myValuation * 0.95;

                if (acceptable) {
                    const accept = await api.acceptNegotiation(neg.id);
                    this.logResult('POST', 'negotiations/accept', accept);
                } else if (neg.offers.length < 3) {
                    const targetPrice = isBuyer ? myValuation * 0.95 : myValuation * 1.05;
                    const counter = await api.negotiations.counter(neg.id, latestOffer.quantity, targetPrice);
                    this.logResult('POST', 'negotiations/counter', counter);
                } else {
                    const reject = await api.rejectNegotiation(neg.id);
                    this.logResult('POST', 'negotiations/reject', reject);
                }
            }
        }

        // Browse marketplace listings and initiate negotiations
        const listingsResponse = await api.listings.list();
        if (listingsResponse.ok && listingsResponse.data.listings) {
            const allListings = listingsResponse.data.listings;

            for (const [chem, chemListings] of Object.entries(allListings)) {
                const myValuation = shadowPrices[chem] || 0;

                // Respond to BUY listings by selling (if I have surplus and low value)
                for (const listing of (chemListings.buy || [])) {
                    if (listing.teamId === player.email) continue;
                    if (myValuation < 3 && (inventory[chem] || 0) > 100 && Math.random() > 0.5) {
                        const neg = await api.negotiations.initiate(
                            listing.teamId, chem, 50, myValuation * 1.1, 'sell'
                        );
                        this.logResult('POST', 'negotiations/initiate', neg);
                    }
                }

                // Respond to SELL listings by buying (if I need this chemical)
                for (const listing of (chemListings.sell || [])) {
                    if (listing.teamId === player.email) continue;
                    if (myValuation > 5 && Math.random() > 0.5) {
                        const neg = await api.negotiations.initiate(
                            listing.teamId, chem, 50, myValuation * 0.9, 'buy'
                        );
                        this.logResult('POST', 'negotiations/initiate', neg);
                    }
                }
            }
        }

        // Post simple buy listing (interest-only — the new simplified flow)
        const chemicals = ['C', 'N', 'D', 'Q'];
        for (const chem of chemicals) {
            const valuation = shadowPrices[chem] || 0;
            if (valuation > 8 && Math.random() > 0.7) {
                const listing = await api.listings.post(chem, 'buy');
                this.logResult('POST', 'listings/post', listing);
            }
        }
    }

    // ─────────────────────────────────────────────────────
    // End Game & Results Validation
    // ─────────────────────────────────────────────────────

    async endGameAndCheckResults() {
        console.log(`\n🏁 ENDING GAME & VALIDATING RESULTS`);
        console.log('-'.repeat(80));

        const finalize = await this.adminClient.controlSession('finalize');
        this.logResult('POST', 'admin/session/finalize', finalize);
        if (!finalize.ok) throw new Error('Failed to finalize game');

        // Leaderboard
        const leaderboard = await this.adminClient.getLeaderboard();
        this.logResult('GET', 'leaderboard/standings', leaderboard);

        if (!leaderboard.ok) {
            this.check('Leaderboard returns data after game', false);
            return;
        }

        const standings = leaderboard.data?.standings || [];
        console.log(`\n   📊 Final Standings (${standings.length} teams):`);

        let totalRoi = 0;
        let positiveCount = 0;
        let totalTradesAll = 0;

        standings.forEach((t, i) => {
            const roi = t.percentChange * 100;
            totalRoi += roi;
            if (roi > 0) positiveCount++;
            totalTradesAll += t.totalTrades || 0;
            const icon = roi > 0 ? '📈' : (roi < 0 ? '📉' : '➖');
            console.log(`      ${i+1}. ${t.teamName.padEnd(20)}: $${(t.currentFunds||0).toFixed(2).padStart(10)} (${icon} ${roi.toFixed(1)}%)`);
        });

        const avgRoi = standings.length > 0 ? totalRoi / standings.length : 0;

        console.log(`\n   📊 Market Performance:`);
        this.check('At least 1 team with positive ROI', positiveCount >= 1, `${positiveCount}/${standings.length}`);
        const minRoi = CONFIG.minAverageRoi ?? -50;
        this.check(`Average ROI is acceptable (>${minRoi}%)`, avgRoi > minRoi, `${avgRoi.toFixed(1)}%`);
        this.check(`At least 3 trades executed`, totalTradesAll >= 3, `total=${totalTradesAll}`);
        this.check('Leaderboard data has all required CSV fields', standings.every(t =>
            typeof t.teamName === 'string' &&
            typeof t.startingFunds === 'number' &&
            typeof t.currentFunds === 'number' &&
            typeof t.percentChange === 'number' &&
            typeof t.totalTrades === 'number'
        ));

        // Global trade history has rows
        const globalHist = await this.adminClient.trades.global(100);
        const globalTrades = globalHist.data?.transactions || [];
        this.check('Global trade history has records', globalTrades.length > 0, `count=${globalTrades.length}`);
    }

    // ─────────────────────────────────────────────────────
    // Output
    // ─────────────────────────────────────────────────────

    printResults() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 API TEST RESULTS');
        console.log('='.repeat(80));
        console.log(`API Calls:   ${this.results.apiCalls}`);
        console.log(`Successful:  ${this.results.successful}`);
        console.log(`Failed:      ${this.results.failed}`);

        const passed = this.results.checks.filter(c => c.passed).length;
        const total = this.results.checks.length;
        console.log(`Health Checks: ${passed}/${total} passed`);

        if (this.results.errors.length > 0) {
            console.log('\n⚠️  Errors:');
            this.results.errors.forEach(e => console.log(`   - ${e}`));
        }

        const logFile = `api-call-log-${Date.now()}.json`;
        fs.writeFileSync(logFile, JSON.stringify(this.apiCallLog, null, 2));
        console.log(`\nLog saved to ${logFile}`);

        // Return pass/fail for run.js
        this.passed = this.results.errors.length === 0 && this.results.failed <= 2;
    }
}

if (require.main === module) {
    new APIPlayabilityTest().run();
}

module.exports = APIPlayabilityTest;
