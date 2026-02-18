/**
 * Stress Test - Playability & Flow Verification (Modularized)
 * 
 * Verifies the complete game loop with:
 * - 3 Real Players (simulated via RPC)
 * - 3 NPCs (Beginner, Novice, Expert)
 * - 1 Session (Single Session Model)
 * - Infinite Capital (Debt Spending Allowed)
 * - Final Production (End Game)
 */

const path = require('path');
const BrowserHelper = require('./helpers/browser');
const ReportingHelper = require('./helpers/reporting');
const TeamHelper = require('./helpers/team');
const SessionHelper = require('./helpers/session');

const CONFIG = {
    baseUrl: 'http://cndq.test/CNDQ/',
    teams: [
        'alpha@stonybrook.edu',
        'beta@stonybrook.edu',
        'gamma@stonybrook.edu'
    ],
    targetSessions: 1, 
    headless: false,
    slowMo: 0,
    verbose: true
};

class StressTest {
    constructor() {
        this.browserHelper = new BrowserHelper(CONFIG);
        this.session = new SessionHelper(this.browserHelper);
        this.teamHelper = new TeamHelper(this.browserHelper);
        this.browser = null;
        this.adminPage = null;
        this.pollerInterval = null;
        this.pollerPage = null;
    }

    async run() {
        ReportingHelper.printHeader('SCENARIO: Infinite Capital Playthrough');
        
        try {
            this.browser = await this.browserHelper.launch();

            await this.setupGame();
            
            // Run Trading Rounds
            ReportingHelper.printSessionHeader(1, 'TRADING (Infinite Capital)');
            for (let round = 1; round <= 3; round++) {
                await this.runTradingRound(round);
                await this.checkLogs(`After Round ${round}`);
            }

            await this.endGame();
            await this.verifyResults();

            ReportingHelper.printSuccess('\n✨ Stress Test Complete!');

        } catch (error) {
            ReportingHelper.printError(`Stress Test Failed: ${error.message}`);
            console.error(error.stack);
            process.exit(1);
        } finally {
            if (this.pollerInterval) clearInterval(this.pollerInterval);
            if (this.browser) await this.browser.close();
        }
    }

    async setupGame() {
        ReportingHelper.printStep(1, 'Resetting game and initializing NPCs');
        await this.session.resetGame();
        await new Promise(r => setTimeout(r, 2000));

        const adminContext = await this.browser.createBrowserContext();
        this.adminPage = await adminContext.newPage();
        await this.browserHelper.login(this.adminPage, 'admin@stonybrook.edu');
        
        await this.adminPage.evaluate(async () => {
            await fetch('api/admin/npc/toggle-system.php', { method: 'POST', body: JSON.stringify({ enabled: true }) });
            const levels = ['beginner', 'novice', 'expert'];
            for (const skill of levels) {
                await fetch('api/admin/npc/create.php', { method: 'POST', body: JSON.stringify({ skillLevel: skill, count: 2 }) });
            }
            await fetch('api/admin/session.php', { method: 'POST', body: JSON.stringify({ action: 'setTradingDuration', seconds: 300 }) });
            await fetch('api/admin/session.php', { method: 'POST', body: JSON.stringify({ action: 'toggleGameStop', stopped: false }) });
        });

        // Start Poller
        console.log('   - Starting persistent game driver (Poller)...');
        const pollerContext = await this.browser.createBrowserContext();
        this.pollerPage = await pollerContext.newPage();
        await this.browserHelper.login(this.pollerPage, 'admin@stonybrook.edu');
        
        const driveGame = async () => {
            try {
                await this.pollerPage.evaluate(async () => {
                    await fetch('api/session/status.php'); 
                    await fetch('api/admin/process-reflections.php');
                });
            } catch (e) {}
        };
        this.pollerInterval = setInterval(driveGame, 5000);

        // Initialize Teams
        for (const email of CONFIG.teams) {
            const context = await this.browser.createBrowserContext();
            const page = await context.newPage();
            await this.browserHelper.login(page, email);
            await this.browserHelper.closeProductionModalIfPresent(page);
            await context.close();
        }
    }

    async runTradingRound(round) {
        console.log(`   - [Round ${round}] Players performing actions...`);
        
        for (const email of CONFIG.teams) {
            const context = await this.browser.createBrowserContext();
            const page = await context.newPage();
            await this.browserHelper.login(page, email);
            await this.browserHelper.closeProductionModalIfPresent(page);

            try {
                const shadows = await this.teamHelper.getShadowPrices(page);
                const inventory = await this.teamHelper.getInventory(page);
                
                // 1. Post NEEDS (Demand)
                for (const [chem, price] of Object.entries(shadows)) {
                    if (price > 2.0) { 
                        await this.teamHelper.postBuyRequest(page, chem, price);
                    }
                }

                // 2. Fulfill others (Supply)
                for (const chem of ['C','N','D','Q']) {
                    if (inventory[chem] > 10) {
                        const buyReq = await this.teamHelper.findBuyer(page, chem);
                        if (buyReq) {
                            await this.teamHelper.respondToBuyRequest(page, buyReq, chem, shadows[chem], inventory[chem]);
                        }
                    }
                }
                
                // 3. Respond/Haggle
                if (Math.random() < 0.5) {
                    const res = await this.teamHelper.respondToNegotiations(page, shadows, 0.0);
                    if (res && res.chemical) {
                        await this.teamHelper.haggleWithMerchant(page, res.chemical, shadows[res.chemical]);
                    }
                } else {
                    const res = await this.teamHelper.respondToNegotiations(page, shadows, 1.0);
                    if (res && res.action === 'accepted') {
                        console.log(`      ✓ ${email} accepted trade for ${res.chemical}`);
                    }
                }
            } catch (e) {
                console.log(`      ⚠️ Action skipped for ${email}: ${e.message}`);
            } finally {
                await context.close();
            }
        }
        
        await new Promise(r => setTimeout(r, 8000));
    }

    async endGame() {
        ReportingHelper.printSection('🏁', 'Ending Game (Final Production)');
        await this.pollerPage.evaluate(() => fetch('api/admin/process-reflections.php'));
        await this.adminPage.evaluate(async () => {
            await fetch('api/admin/session.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'advance' })
            });
        });
        console.log(`   ✓ Game Ended. Final Production Run.`);
    }

    async verifyResults() {
        const lbContext = await this.browser.createBrowserContext();
        const lbPage = await lbContext.newPage();
        await this.browserHelper.login(lbPage, CONFIG.teams[0]);
        await new Promise(r => setTimeout(r, 3000));
        await this.browserHelper.closeProductionModalIfPresent(lbPage);
        
        const standings = await this.teamHelper.getLeaderboard();
        ReportingHelper.printLeaderboard(standings, 'FINAL');

        console.log('\n   🔍 Value Creation Sanity Checks:');
        let roiIssues = [];
        for (const team of standings) {
            const roi = team.roi;
            const currentFunds = team.currentFunds; 
            const starting = team.startingFunds;

            if (roi < -50) {
                roiIssues.push(`   ⚠️  ${team.teamName}: ROI ${roi.toFixed(1)}% (Significant value destruction)`);
            } else if (roi > 1000) {
                roiIssues.push(`   ⚠️  ${team.teamName}: ROI ${roi.toFixed(1)}% (Suspiciously high)`);
            } else if (Object.values(team.inventory || {}).some(v => v < -0.001)) { 
                roiIssues.push(`   ❌ ${team.teamName}: Negative inventory`);
            } else {
                console.log(`   ✓ ${team.teamName}: ROI ${roi.toFixed(1)}% (Value: $${currentFunds.toFixed(2)})`);
            }
        }

        if (roiIssues.length > 0) {
            console.log('\n   🚨 ISSUES DETECTED:');
            roiIssues.forEach(issue => console.log(issue));
            if (roiIssues.some(i => i.includes('Negative inventory'))) {
                throw new Error('Critical integrity check failed');
            }
        } else {
            console.log('   ✅ All teams have valid state\n');
        }
        await lbContext.close();
    }

        async checkLogs(checkpointName) {
            console.log(`\n   🔎 Checking logs at: ${checkpointName}`);
            // Here you could add logic to grep server logs or check specific DB states
            // For now, we just print a separator
            console.log('   ----------------------------------------');
        }
    }
    
    if (require.main === module) {
        new StressTest().run();
    }
    
    module.exports = StressTest;
    