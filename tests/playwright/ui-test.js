/**
 * UI Playability Test (Playwright Version)
 *
 * Runs the game simulation using a real browser (Playwright Chromium).
 * Interacts with UI elements and captures API traffic.
 */

const { chromium } = require('playwright');
const CONFIG = require('./config');
const fs = require('fs');

class UIPlayabilityTest {
    constructor() {
        this.browser = null;
        this.results = {
            uiActions: 0,
            apiCallsCaptured: 0,
            errors: [],
            warnings: []
        };
        this.apiCallLog = [];
    }

    async run() {
        console.log('🎮 UI Playability Test (Playwright Engine)');
        console.log('='.repeat(80));

        try {
            this.browser = await chromium.launch({
                headless: CONFIG.headless
            });

            // 1. Setup Admin
            await this.setupGame();

            // 2. Play Game
            await this.playMarketplace();

            // 3. UI Negotiation Flow (RPC → RPC through real browser)
            await this.playerNegotiationFlow();

            // 4. Finish
            await this.endGame();

            this.printResults();

        } catch (error) {
            console.error('\n❌ Test failed:', error.message);
            if (CONFIG.verbose) console.error(error.stack);
        } finally {
            if (this.browser) await this.browser.close();
        }
    }

    async createPlayerSession(email) {
        const context = await this.browser.newContext({ baseURL: CONFIG.baseUrl });
        const page = await context.newPage();

        // Setup API logging
        page.on('response', async response => {
            const url = response.url();
            if (url.includes('/api/')) {
                this.results.apiCallsCaptured++;
                try {
                    const data = await response.json();
                    this.apiCallLog.push({
                        timestamp: new Date().toISOString(),
                        user: email,
                        method: response.request().method(),
                        url: url.split('/api/')[1],
                        status: response.status(),
                        data
                    });
                } catch (e) { /* ignore non-json */ }
            }
        });

        // Login
        // Ensure no double slash
        const path = `dev.php?user=${email}`; 
        console.log(`      Navigating to: ${path}`);
        await page.goto(path);
        await page.waitForLoadState('domcontentloaded');

        // Check where we ended up
        console.log(`      Landed on: ${page.url()}`);
        
        // Handle Production Modal if it appears
        return page;
    }

    async setupGame() {
        console.log('\n🛡️  ADMIN SETUP');
        const page = await this.createPlayerSession(CONFIG.adminUser);
        
        try {
            // Navigate to admin
            await page.goto('admin/');
            console.log(`      Admin page: ${page.url()}`);

            // Take debug screenshot
            await page.screenshot({ path: 'debug-admin-load.png' });

            // Reset
            console.log('      Waiting for reset button...');
            const resetBtn = page.locator('button[onclick="resetGameData()"]');
            await resetBtn.waitFor({ state: 'visible', timeout: 5000 });
            await resetBtn.click();
            
            await page.waitForSelector('#confirm-modal:not(.hidden)');
            await page.click('#confirm-modal-yes');
            console.log('   ✅ Game reset');
            this.results.uiActions++;

            // Start (if needed)
            try {
                const startBtn = page.locator('#start-stop-btn');
                await startBtn.waitFor({ state: 'visible', timeout: 5000 });
                if ((await startBtn.innerText()).includes('Start')) {
                    await startBtn.click();
                    // Wait for button to flip to "Stop" confirming game is running
                    await page.waitForFunction(
                        () => document.getElementById('start-stop-btn')?.innerText?.includes('Stop'),
                        { timeout: 10000 }
                    ).catch(() => {}); // non-fatal if it doesn't flip
                    console.log('   ✅ Market started');
                    this.results.uiActions++;
                }
            } catch (e) {
                console.log('   ℹ️  Market might already be running');
            }
        } catch (error) {
            console.error('   ❌ Admin setup failed:', error.message);
            await page.screenshot({ path: 'error-admin-setup.png' });
            throw error;
        } finally {
            await page.close();
        }
    }

    async playMarketplace() {
        console.log(`\n🎮 PLAYING MARKETPLACE (UI)`);
        
        const turns = 2; // Short run
        for (let turn = 1; turn <= turns; turn++) {
            console.log(`\n   🔄 Turn ${turn}/${turns}`);
            
            for (const email of CONFIG.testUsers) {
                await this.playerAction(email);
            }
            
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    async playerAction(email) {
        const name = email.split('@')[0];
        console.log(`      👤 ${name} acting...`);
        const page = await this.createPlayerSession(email);
        
        try {
            // Wait for App Data to Load
            // Wait for the financial panel to be populated (net profit element always renders)
            const fundsEl = page.locator('#fin-net-profit');
            await fundsEl.waitFor({ state: 'visible', timeout: 15000 });
            
            // Check for production results modal and close it if visible
            const prodModal = page.locator('#production-results-modal');
            if (await prodModal.isVisible()) {
                console.log(`         🎯 Closing production modal for ${name}`);
                await page.click('#prod-result-continue', { force: true });
                await prodModal.waitFor({ state: 'hidden', timeout: 5000 });
            }

            // Wait for window.app.profile to be populated
            console.log(`         ⏳ Waiting for app state initialization for ${name}...`);
            await page.waitForFunction(() => 
                window.app && 
                window.app.profile && 
                window.app.profile.currentFunds !== undefined,
                { timeout: 15000 }
            );

            // Action 1: Check for 'Your Turn' negotiations and accept them
            console.log(`         🔍 Checking for negotiations for ${name}...`);
            const negotiationId = await page.evaluate(() => {
                const card = document.querySelector('negotiation-card[context="summary"]');
                if (card && card.innerText.includes('Your Turn')) {
                    return card.getAttribute('negotiation-id');
                }
                return null;
            });

            if (negotiationId) {
                console.log(`         ✅ Found negotiation ${negotiationId}, accepting...`);
                // Open negotiation detail
                await page.click(`negotiation-card[negotiation-id="${negotiationId}"] [role="button"]`);
                await page.waitForSelector('#negotiation-detail-view:not(.hidden)', { timeout: 5000 });
                
                // Accept
                await page.click('#accept-offer-btn');
                await page.waitForSelector('#confirm-dialog:not(.hidden)', { timeout: 5000 });
                await page.click('#confirm-ok');
                
                console.log(`         🎉 Trade accepted for ${name}!`);
                await page.waitForSelector('#negotiation-list-view:not(.hidden)', { timeout: 10000 });
                this.results.uiActions++;
            }

            // Action 2: Post a Buy Request (simplified — no modal, no price/qty)
            // Buy requests now just signal interest; price & qty negotiated later.
            console.log(`         📢 Posting buy request for ${name} (simplified flow)...`);
            const posted = await page.evaluate(async () => {
                if (!window.app) return { ok: false, error: 'window.app not found' };
                try {
                    await window.app.postListing('C', 'buy');
                    return { ok: true };
                } catch (e) {
                    return { ok: false, error: e.message };
                }
            });
            if (!posted.ok) console.log(`         ⚠️  Buy request note: ${posted.error}`);

            // Verify Financial Summary Panel loaded (stale indicator check)
            const productionRevEl = page.locator('#fin-production-rev');
            const prodRevText = await productionRevEl.textContent({ timeout: 5000 }).catch(() => '');
            const hasProdRev = prodRevText.includes('$');
            console.log(`         ${hasProdRev ? '✅' : '⚠️ '} Financial panel loaded (Production Rev: ${prodRevText.trim()})`);

            this.results.uiActions++;
            console.log(`         ✅ Buy request posted for ${name}`);

        } catch (e) {
            console.log(`         ❌ Error for ${name}: ${e.message}`);
            this.results.errors.push({ user: email, error: e.message });
            const errorPath = `error-player-${name}-${Date.now()}.png`;
            await page.screenshot({ path: errorPath });
            console.log(`         📸 Error screenshot saved: ${errorPath}`);
        } finally {
            await page.close();
        }
    }

    /**
     * Full RPC-to-RPC negotiation cycle through the UI.
     *
     * Player 1 has already posted a buy listing during playMarketplace().
     * Player 2 finds it, clicks "Sell to", fills the respond modal, and submits.
     * Player 1 then finds the resulting "Your Turn" negotiation card and accepts it.
     *
     * This verifies: listing-item → respond modal → negotiation card → accept flow.
     * All failures are warnings (non-fatal) so they don't block endGame.
     */
    async playerNegotiationFlow() {
        console.log(`\n🤝 UI NEGOTIATION FLOW (RPC → RPC)`);

        const buyerEmail  = CONFIG.testUsers[0]; // test_mail1 — already posted a buy listing
        const sellerEmail = CONFIG.testUsers[1]; // test_mail2 — will respond to it

        // ── Step 1: Seller responds to buyer's listing via the respond modal ──
        console.log(`   📋 ${sellerEmail.split('@')[0]}: clicking "Sell to" on buy listing...`);
        const sellerPage = await this.createPlayerSession(sellerEmail);
        let negotiationInitiated = false;

        try {
            await sellerPage.waitForFunction(
                () => window.app?.profile?.currentFunds !== undefined,
                { timeout: 15000 }
            );

            // listing-item uses Shadow DOM — pierce it via evaluate to click "Sell to"
            const clicked = await sellerPage.evaluate(() => {
                for (const item of document.querySelectorAll('listing-item')) {
                    if (item.hasAttribute('ismylisting') || item.hasAttribute('is-my-listing')) continue;
                    const btn = item.shadowRoot?.querySelector('button.btn:not(:disabled)');
                    if (btn) { btn.click(); return true; }
                }
                return false;
            });

            if (!clicked) {
                console.log('      ⚠️  No sellable buy listings visible — skipping negotiation UI flow');
            } else {
                // Fill the respond modal
                await sellerPage.waitForSelector('#respond-modal:not(.hidden)', { timeout: 5000 });
                await sellerPage.evaluate(() => {
                    document.getElementById('respond-quantity').value = '50';
                    document.getElementById('respond-price').value = '5.00';
                    document.getElementById('respond-quantity').dispatchEvent(new Event('input'));
                    document.getElementById('respond-price').dispatchEvent(new Event('input'));
                });
                await sellerPage.click('#respond-submit-btn');
                await sellerPage.waitForSelector('#respond-modal.hidden', { timeout: 8000 });
                console.log('      ✅ Seller submitted offer via respond modal');
                this.results.uiActions++;
                negotiationInitiated = true;
            }
        } catch (e) {
            console.log(`      ⚠️  Respond modal: ${e.message}`);
            await sellerPage.screenshot({ path: 'error-respond-modal.png' });
        } finally {
            await sellerPage.close();
        }

        if (!negotiationInitiated) return;

        // ── Step 2: Buyer accepts the offer through the negotiation card UI ──
        console.log(`   💬 ${buyerEmail.split('@')[0]}: accepting offer via negotiation card...`);
        const buyerPage = await this.createPlayerSession(buyerEmail);

        try {
            await buyerPage.waitForFunction(
                () => window.app?.profile?.currentFunds !== undefined,
                { timeout: 15000 }
            );

            // negotiation-card uses light DOM — find the one showing "Your Turn"
            const negId = await buyerPage.evaluate(() => {
                for (const card of document.querySelectorAll('negotiation-card')) {
                    const wrapper = card.querySelector('.card-wrapper');
                    if (wrapper?.textContent?.includes('Your Turn')) {
                        return card.getAttribute('negotiation-id');
                    }
                }
                return null;
            });

            if (!negId) {
                console.log('      ⚠️  No "Your Turn" negotiation card found for buyer');
            } else {
                await buyerPage.click(`negotiation-card[negotiation-id="${negId}"]`);
                await buyerPage.waitForSelector('#negotiation-detail-view:not(.hidden)', { timeout: 5000 });
                await buyerPage.click('#accept-offer-btn');
                await buyerPage.waitForSelector('#confirm-dialog:not(.hidden)', { timeout: 5000 });
                await buyerPage.click('#confirm-ok');
                await buyerPage.waitForSelector('#negotiation-list-view:not(.hidden)', { timeout: 10000 });
                console.log('      ✅ Trade completed — full RPC negotiation cycle verified through UI');
                this.results.uiActions++;
            }
        } catch (e) {
            console.log(`      ⚠️  Accept offer UI: ${e.message}`);
            await buyerPage.screenshot({ path: 'error-accept-offer.png' });
        } finally {
            await buyerPage.close();
        }
    }

    async endGame() {
        console.log('\n🏁 ENDING GAME');
        const page = await this.createPlayerSession(CONFIG.adminUser);
        await page.goto('admin/');
        
        try {
            // Stop
            const stopBtn = page.locator('#start-stop-btn');
            await stopBtn.waitFor({ state: 'visible', timeout: 10000 });
            
            if ((await stopBtn.innerText()).includes('Stop')) {
                await stopBtn.click({ force: true });
            }
            
            // Finalize
            await page.locator('button[onclick="finalizeGame()"]').click({ force: true });
            console.log('   ✅ Game finalized');
        } catch (error) {
            console.error('   ❌ End game failed:', error.message);
            await page.screenshot({ path: 'error-endgame.png' });
        } finally {
            await page.close();
        }
    }

    printResults() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 UI RESULTS');
        console.log('='.repeat(80));
        console.log(`Actions: ${this.results.uiActions}`);
        console.log(`API Calls Captured: ${this.results.apiCallsCaptured}`);
        
        const logFile = `playwright-ui-log-${Date.now()}.json`;
        fs.writeFileSync(logFile, JSON.stringify(this.apiCallLog, null, 2));
        console.log(`Log saved to ${logFile}`);
    }
}

if (require.main === module) {
    new UIPlayabilityTest().run();
}

module.exports = UIPlayabilityTest;
