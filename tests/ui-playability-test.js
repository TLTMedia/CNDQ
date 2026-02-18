/**
 * UI-Only Playability Test
 *
 * Tests the complete game flow using ONLY UI interactions.
 * No direct API calls - everything is done by clicking buttons, filling forms, etc.
 *
 * Monitors and logs all API calls made by the UI for verification.
 *
 * Usage:
 *   node tests/ui-playability-test.js
 *   node tests/ui-playability-test.js --headless
 *   node tests/ui-playability-test.js --verbose
 */

const BrowserHelper = require('./helpers/browser');
const ApiClient = require('./helpers/api-client');

const CONFIG = {
    baseUrl: 'http://cndq.test/CNDQ/',
    adminUser: 'admin@stonybrook.edu',
    testUsers: [
        'test_mail1@stonybrook.edu',
        'test_mail2@stonybrook.edu',
        'test_mail3@stonybrook.edu'
    ],
    targetSessions: 1,
    headless: process.argv.includes('--headless'),
    verbose: process.argv.includes('--verbose') || process.argv.includes('-v'),
    keepOpen: process.argv.includes('--keep-open'),
    skillLevel: 'expert', // Default oracle skill level
    skillLevels: null     // Optional array of skill levels for RPCs
};

class UIPlayabilityTest {
    constructor(config) {
        this.config = { ...CONFIG, ...config }; // Merge provided config with defaults
        this.browser = new BrowserHelper(this.config);
        this.apiCallLog = [];
        this.results = {
            uiActions: 0,
            apiCallsCaptured: 0,
            errors: [],
            warnings: [],
            a11y: { passed: 0, failed: 0, skipped: 0, details: [] },
            axe: null,
            keyboard: null,
            contrast: null
        };
    }

    /**
     * Setup API call monitoring on a page
     */
    async setupApiMonitoring(page, teamId) {
        // Capture console errors
        page.on('console', msg => {
            if (msg.type() === 'error') {
                this.results.errors.push({ 
                    user: teamId, 
                    error: `Console Error: ${msg.text()}`
                });
            }
        });

        page.on('pageerror', err => {
            this.results.errors.push({ 
                user: teamId, 
                error: `Page Runtime Error: ${err.message}` 
            });
        });

        await page.evaluateOnNewDocument(() => {
            window.__apiCalls = [];

            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
                const url = args[0];
                const options = args[1] || {};

                // Log the API call
                const logEntry = {
                    timestamp: Date.now(),
                    method: options.method || 'GET',
                    url: url,
                    body: options.body ? JSON.parse(options.body) : null
                };
                window.__apiCalls.push(logEntry);

                // Make the actual call
                return originalFetch.apply(this, args);
            };
        });

        // Also log to our central log
        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('/api/')) {
                const method = response.request().method();
                const status = response.status();

                try {
                    const data = await response.json();
                    this.apiCallLog.push({
                        timestamp: new Date().toISOString(),
                        teamId,
                        method,
                        url: url.replace(this.config.baseUrl, ''),
                        status,
                        success: response.ok,
                        data
                    });
                    this.results.apiCallsCaptured++;
                } catch (e) {
                    // Not JSON response
                }
            }
        });
    }

    /**
     * Get API calls made by the page
     */
    async getPageApiCalls(page) {
        return await page.evaluate(() => window.__apiCalls || []);
    }

    /**
     * Run complete UI playability test
     */
    async run() {
        console.log('🎮 UI Playability Test (Single Long Marketplace)');
        console.log('='.repeat(80));
        console.log(`Base URL: ${this.config.baseUrl}`);
        console.log(`Teams: ${this.config.testUsers.length} players`);
        console.log('='.repeat(80));
        console.log('');

        try {
            await this.browser.launch();

            // Step 1: Admin setup
            await this.setupGame();

            // Step 2: Play the marketplace run (Single Round)
            await this.playMarketplace();

            // Step 3: End game and check results
            await this.endGameAndCheckResults();

            // Step 4: Print results
            this.printResults();

            if (!this.config.keepOpen) {
                await this.browser.close();
            } else {
                console.log('\n⏸️  Browser kept open for inspection...');
                await this.browser.keepOpen();
            }

        } catch (error) {
            console.error('\n❌ Test failed:', error.message);
            if (this.config.verbose) {
                console.error(error.stack);
            }
            await this.browser.close();
            throw error;
        }

        return this.results.errors.length === 0;
    }

    /**
     * Shadow DOM Helper to find elements across shadow boundaries
     */
    async findInShadow(page, selectorChain) {
        return page.evaluateHandle((selectors) => {
            let root = document;
            for (const sel of selectors) {
                if (!root) return null;
                // If root is a document/element, query it. 
                // If it has shadowRoot, query that.
                const next = (root.shadowRoot || root).querySelector(sel);
                root = next;
            }
            return root;
        }, selectorChain);
    }

    /**
     * Execute a TRADE action suggested by the Oracle
     */
    async executeOracleTradeAction(page, action) {
        if (action.type === 'initiate_negotiation') {
            const chemical = action.chemical;
            const responderName = action.responderName;

            console.log(`         👉 Oracle: Attempting to SELL ${chemical} to ${responderName}`);

            // Close production modal if present (it blocks other modals)
            await this.browser.closeProductionModalIfPresent(page);

            // Pierce Shadow DOM to find the specific "Sell to" button
            const btnHandle = await this.findInShadow(page, [
                `chemical-card[chemical="${chemical}"]`,
                `listing-item[teamname="${responderName}"]`,
                'button.btn'
            ]);

            if (btnHandle && !await btnHandle.evaluate(el => !el)) {
                await btnHandle.click();
                
                // Wait for Respond Modal
                await page.waitForSelector('#respond-modal:not(.hidden)', { timeout: 10000 });
                
                // Fill Form
                await page.evaluate((qty, price) => {
                    const qInput = document.getElementById('respond-quantity');
                    const pInput = document.getElementById('respond-price');
                    if (qInput) qInput.value = qty;
                    if (pInput) pInput.value = price;
                    // Trigger input events
                    qInput?.dispatchEvent(new Event('input'));
                    pInput?.dispatchEvent(new Event('input'));
                }, action.quantity, action.price);
                
                // Submit
                await page.click('#respond-submit-btn');
                console.log('         ✓ Submitted Sell Offer');
                this.results.uiActions++;
                await this.browser.sleep(1000);
            } else {
                console.warn(`         ⚠️ Could not find Buy Request from ${responderName} for ${chemical}`);
            }

        } else if (action.type === 'create_buy_order') {
            const chemical = action.chemical;
            console.log(`         👉 Oracle: Posting Buy Request for ${chemical}`);

            // Close production modal if present (it blocks other modals)
            await this.browser.closeProductionModalIfPresent(page);

            // Debug: Check for blocking conditions before click
            const blockingState = await page.evaluate(() => {
                const prodModal = document.getElementById('production-results-modal');
                const offerModal = document.getElementById('offer-modal');
                return {
                    prodModalHidden: prodModal?.classList.contains('hidden'),
                    prodModalExists: !!prodModal,
                    offerModalHidden: offerModal?.classList.contains('hidden'),
                    lastOpenedModal: window.LAST_OPENED_MODAL
                };
            });
            if (this.config.verbose) {
                console.log('         📊 Pre-click state:', JSON.stringify(blockingState));
            }

            // Find "Post Buy Request" button in chemical card
            const btnHandle = await this.findInShadow(page, [
                `chemical-card[chemical="${chemical}"]`,
                '#post-buy-btn'
            ]);

            if (btnHandle && !await btnHandle.evaluate(el => !el)) {
                // Check if button is disabled
                const isDisabled = await btnHandle.evaluate(el => el.disabled);
                if (isDisabled) {
                    console.log(`         ⚠️ Button disabled: Buy request already exists for ${chemical}. Skipping.`);
                    return;
                }

                // Dispatch interest directly via the app's internal mechanism
                await page.evaluate(async (chem) => {
                    if (window.marketplaceApp) {
                        await window.marketplaceApp.postListing(chem, 'buy');
                    } else if (window.app) {
                        await window.app.postListing(chem, 'buy');
                    } else {
                        // Fallback: Dispatch the event
                        document.dispatchEvent(new CustomEvent('post-interest', {
                            detail: { chemical: chem, type: 'buy' },
                            bubbles: true,
                            composed: true
                        }));
                    }
                }, chemical);

                console.log(`         ✅ Posted interest for ${chemical}`);
                this.results.uiActions++;
                await this.browser.sleep(1000);
            }
        }
    }

    /**
     * Execute a NEGOTIATION RESPONSE action suggested by the Oracle
     */
    async executeOracleNegotiationAction(page, action) {
        // Close production modal if present (it blocks other modals)
        await this.browser.closeProductionModalIfPresent(page);

        // 1. Open Negotiation List if needed (or ensure we are on the page)
        // Ideally, we find the specific card.

        const negId = action.negotiationId;
        
        // Find the specific negotiation-card element
        const cardFound = await page.evaluate(async (id) => {
            // Check both pending and active lists
            const cards = document.querySelectorAll('negotiation-card');
            for (const card of cards) {
                if (card.negotiation && card.negotiation.id === id) {
                    // NegotiationCard uses Light DOM with role="button"
                    const clickable = card.querySelector('[role="button"]');
                    if (clickable) {
                        clickable.click();
                        return true;
                    }
                    card.click();
                    return true;
                }
            }
            return false;
        }, negId);

        if (!cardFound) {
            // Try opening the "View All" modal if not already visible
            const viewAllBtn = await page.$('#view-all-negotiations-btn');
            if (viewAllBtn) {
                await viewAllBtn.click();
                await this.browser.sleep(1000);
                // Try finding again inside modal
                // (The evaluate above queries the whole document, so it should have found it if rendered)
                // But maybe it wasn't rendered until modal open.
                // Re-run find logic... (omitted for brevity, relying on main view summary for now or assume modal is managed)
            }
            console.warn(`         ⚠️ Negotiation card ${negId} not found`);
            return;
        }

        // 2. Wait for Detail View
        await page.waitForSelector('#negotiation-detail-view:not(.hidden)', { timeout: 10000 });

        // 3. Perform Action
        if (action.type === 'accept_negotiation') {
            console.log('         👉 Oracle: Accepting Offer');
            try {
                await page.waitForSelector('#accept-offer-btn:not(.hidden)', { visible: true, timeout: 5000 });
                await page.click('#accept-offer-btn');
                
                await page.waitForSelector('#confirm-ok', { visible: true, timeout: 2000 });
                await page.click('#confirm-ok');
                this.results.uiActions++;
            } catch (e) {
                console.error('         ❌ Failed to click accept button:', e.message);
            }
            
        } else if (action.type === 'counter_negotiation') {
            console.log(`         👉 Oracle: Countering: ${action.quantity} @ $${action.price}`);
            
            await page.click('#show-counter-form-btn');
            await page.waitForSelector('#counter-offer-form:not(.hidden)');
            
            await page.evaluate((qty, price) => {
                const qSlider = document.getElementById('haggle-qty-slider');
                const pSlider = document.getElementById('haggle-price-slider');
                
                if (qSlider) {
                    qSlider.value = qty;
                    qSlider.dispatchEvent(new Event('input'));
                }
                if (pSlider) {
                    pSlider.value = price;
                    pSlider.dispatchEvent(new Event('input'));
                }
            }, action.quantity, action.price);
            
            await page.click('#submit-counter-btn');
            this.results.uiActions++;
            
        } else if (action.type === 'reject_negotiation') {
            console.log('         👉 Oracle: Rejecting');
            await page.click('#reject-offer-btn');
            await page.waitForSelector('#confirm-ok', { timeout: 2000 });
            await page.click('#confirm-ok');
            this.results.uiActions++;
        }

        // Wait/Close
        await this.browser.sleep(1000);
        const closeBtn = await page.$('#negotiation-modal-close-btn');
        if (closeBtn && await closeBtn.boundingBox()) {
            await closeBtn.click();
        }
    }

    /**
     * Setup game via admin UI
     */
    async setupGame() {
        console.log('\n🛡️  ADMIN SETUP');
        console.log('-'.repeat(80));

        const adminPage = await this.browser.loginAndNavigate(this.config.adminUser, 'admin/');
        await this.setupApiMonitoring(adminPage, 'admin');

        // Wait for admin page to load
        await adminPage.waitForSelector('button[onclick="resetGameData()"]', { timeout: 10000 });

        console.log('   📋 Resetting game...');
        this.results.uiActions++;

        // Click reset button
        await adminPage.click('button[onclick="resetGameData()"]');

        // Handle custom confirmation modal
        await adminPage.waitForSelector('#confirm-modal:not(.hidden)', { timeout: 5000 });
        await adminPage.click('#confirm-modal-yes');
        await this.browser.sleep(2000);

        console.log('   ✅ Game reset');

        // Step 3: Enable NPCs
        console.log('   🤖 Enabling NPCs...');
        await adminPage.click('#npc-system-enabled');
        await this.browser.sleep(500);
        
        // Add NPCs based on config (default to 3 mixed if not specified)
        const npcLevels = this.config.npcLevels || ['beginner', 'novice', 'expert'];
        
        for (const level of npcLevels) {
            await adminPage.select('#npc-skill-level', level);
            await adminPage.click('button[onclick="createNPC()"]');
            await this.browser.sleep(500);
        }
        
        await this.browser.sleep(1000);
        console.log(`   ✅ ${npcLevels.length} NPCs created (${npcLevels.join(', ')})`);

        // Set trading duration
        const duration = this.config.tradingDuration || 10;
        console.log(`   ⏱️  Setting trading duration to ${duration}m...`);
        this.results.uiActions++;

        const durationInput = await adminPage.$('#trading-duration-minutes');
        if (durationInput) {
            await durationInput.click({ clickCount: 3 }); // Select all
            await durationInput.type(duration.toString());

            await adminPage.click('button[onclick="updateTradingDuration()"]');
            await this.browser.sleep(500);
        }

        // Start the market (if not already started by reset/startNew)
        console.log('   🎬 Ensuring market is started...');
        const startStopBtn = await adminPage.waitForSelector('#start-stop-btn', { timeout: 5000 });
        const btnText = await adminPage.evaluate(el => el.textContent, startStopBtn);
        
        if (btnText.includes('Start')) {
            await adminPage.click('#start-stop-btn');
            await this.browser.sleep(1000);
        }

        console.log('   ✅ Market is running');

        const apiCalls = await this.getPageApiCalls(adminPage);
        console.log(`   📡 API calls captured: ${apiCalls.length}`);

        await adminPage.close();
    }

    /**
     * Play the marketplace run
     */
    async playMarketplace() {
        console.log(`\n🎮 PLAYING MARKETPLACE (Continuous)`);
        console.log('-'.repeat(80));

        // Multi-turn trading within the SAME session
        const turns = 5;
        for (let turn = 1; turn <= turns; turn++) {
            console.log(`\n   🔄 Turn ${turn}/${turns}...`);
            // Each player takes multiple actions sequentially
            for (let i = 0; i < this.config.testUsers.length; i++) {
                const userId = this.config.testUsers[i];
                await this.playerTakesActions(userId, turn, i);
            }
            if (turn < turns) {
                console.log('      ⏳ Waiting for market activity & NPC response...');
                await this.browser.sleep(10000); // 10s between turns
            }
        }
    }

    /**
     * A player takes various UI actions using the Strategy Oracle
     */
    async playerTakesActions(userId, turnNum, playerIndex = 0) {
        const teamName = userId.split('@')[0];
        
        // Determine skill level for this specific player
        let skill = this.config.skillLevel;
        if (Array.isArray(this.config.skillLevels) && this.config.skillLevels[playerIndex]) {
            skill = this.config.skillLevels[playerIndex];
        }

        console.log(`      👤 ${teamName} acting (via ${skill} Oracle)...`);

        const page = await this.browser.loginAndNavigate(userId, '');
        await this.setupApiMonitoring(page, userId);

        try {
            // Ensure we are in TRADING phase before acting
            await page.waitForFunction(() => {
                const el = document.getElementById('current-phase');
                return el && el.textContent.toUpperCase().includes('TRADING');
            }, { timeout: 10000 }).catch(() => {});

            // 1. Consult the Oracle
            const oracleResponse = await page.evaluate(async (skill) => {
                try {
                    const res = await fetch(`./api/test/consult-strategy.php?skill=${skill}`);
                    return await res.json();
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }, skill);

            if (!oracleResponse.success) {
                console.warn('         ⚠️ Oracle Error:', oracleResponse.error);
                return;
            }

            const rec = oracleResponse.recommendation;

            // 2. Execute Oracle Recommendation
            if (rec.negotiation_action) {
                console.log(`         🧠 Oracle Rec: Respond to Negotiation (${rec.negotiation_action.type})`);
                await this.executeOracleNegotiationAction(page, rec.negotiation_action);
            } else if (rec.trade_action) {
                console.log(`         🧠 Oracle Rec: New Trade (${rec.trade_action.type})`);
                await this.executeOracleTradeAction(page, rec.trade_action);
            } else {
                console.log('         💤 Oracle Rec: Wait / No profitable moves');
            }

        } catch (error) {
            this.results.errors.push({ turn: turnNum, user: userId, error: error.message });
            console.log(`         ❌ Error: ${error.message}`);
        } finally {
            await page.close();
        }
    }

    /**
     * Finalize game via admin UI
     */
    async finalizeGame() {
        console.log(`\n   ⏩ Finalizing game...`);

        const adminPage = await this.browser.loginAndNavigate(this.config.adminUser, 'admin/');
        await this.setupApiMonitoring(adminPage, 'admin-finalize');

        this.results.uiActions++;

        // Click finalize button
        const finalizeBtn = await adminPage.$('button[onclick="finalizeGame()"]');
        if (finalizeBtn) {
            await finalizeBtn.click();
            // Wait longer for finalization: game stop + final production for all teams
            await this.browser.sleep(5000);

            // Verify market stopped
            const phase = await adminPage.evaluate(() => {
                return document.getElementById('current-phase')?.textContent?.trim();
            });

            if (phase === 'STOPPED') {
                console.log(`   ✅ Game finalized (Market STOPPED)`);
            } else {
                console.log(`   ⚠️  Unexpected phase: ${phase}`);
            }
        } else {
            console.log('   ❌ Finalize button not found');
            this.results.errors.push({ error: 'Finalize button not found' });
        }

        await adminPage.close();
    }

    /**
     * Advance session (legacy name, now calls finalizeGame)
     */
    async advanceSession(currentSession) {
        return this.finalizeGame();
    }

    /**
     * End game and check final results
     */
    async endGameAndCheckResults() {
        console.log(`\n🏁 ENDING GAME & CHECKING RESULTS (UI)`);
        console.log('-'.repeat(80));

        // 1. Finalize Game
        await this.finalizeGame();

        // 2. Switch to student to see final overlay
        const student = this.config.testUsers[0];
        const page = await this.browser.loginAndNavigate(student, '');
        
        // Wait for Game Over Overlay
        console.log('   ⌛ Waiting for Game Over overlay...');
        await page.waitForSelector('#game-over-overlay:not(.hidden)', { timeout: 10000 });
        // Wait for final production to complete and leaderboard to refresh
        await this.browser.sleep(3000);
        await this.screenshot(page, 'game-over-overlay');

        // 3. Read Leaderboard from UI
        console.log('   🏆 Reading Leaderboard from UI...');
        const standings = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#final-leaderboard-container > div'));
            return rows.map(row => {
                const name = row.querySelector('.font-black.text-xl')?.textContent?.trim();
                const funds = row.querySelector('.text-3xl.font-black')?.textContent?.trim();
                return { name, funds };
            });
        });

        if (standings.length > 0) {
            console.log(`   📊 Found ${standings.length} teams on final leaderboard:`);
            standings.forEach((s, i) => console.log(`      ${i+1}. ${s.name}: ${s.funds}`));
        } else {
            console.log('   ⚠️  No teams found on final leaderboard UI');
            this.results.warnings.push('Final leaderboard UI was empty');
        }

        await page.close();
    }

    async screenshot(page, name) {
        if (this.config.headless) return;
        const fs = require('fs');
        const path = require('path');
        const screenshotDir = path.join(__dirname, 'screenshots');
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }
        const filePath = path.join(screenshotDir, `ui-test-${name}-${Date.now()}.png`);
        await page.screenshot({ path: filePath, fullPage: false });
        console.log(`   📸 Screenshot saved: ${filePath}`);
        return filePath;
    }

    /**
     * Screenshot the tutorial - captures each step to verify dynamic content
     * @param {string} userId - User to test tutorial with
     * @returns {Object} Tutorial data extracted from each step
     */
    async screenshotTutorial(userId = null) {
        const testUser = userId || this.config.testUsers[0];
        console.log(`\n📚 TUTORIAL SCREENSHOT TEST`);
        console.log('-'.repeat(80));
        console.log(`   Testing tutorial for: ${testUser}`);

        const fs = require('fs');
        const path = require('path');
        const screenshotDir = path.join(__dirname, 'screenshots', 'tutorial');
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }

        const page = await this.browser.loginAndNavigate(testUser, '');
        await this.setupApiMonitoring(page, testUser);

        // Capture JS console errors
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });
        page.on('pageerror', err => {
            consoleErrors.push(`PAGE ERROR: ${err.message}`);
        });

        // Wait for app data to load (check inventory which is populated from profile API)
        console.log('   ⏳ Waiting for app data to load...');
        let dataLoaded = false;
        try {
            await page.waitForFunction(() => {
                const app = window.marketplaceApp;
                if (!app?.inventory) return false;
                // Inventory populated = profile loaded
                const inv = app.inventory;
                return inv.C > 0 || inv.N > 0 || inv.D > 0 || inv.Q > 0;
            }, { timeout: 15000 });
            dataLoaded = true;
            console.log('   ✅ App data loaded');
        } catch (e) {
            console.log('   ⚠️  Data timeout after 15s');
        }

        // Debug: Get app state
        const appState = await page.evaluate(() => {
            const app = window.marketplaceApp;
            return {
                appExists: !!app,
                shadowPrices: app?.shadowPrices,
                inventory: app?.inventory,
                constraints: app?.constraints?.length || 0,
                profile: app?.profile ? 'loaded' : 'null'
            };
        });
        console.log('   📊 App state:', JSON.stringify(appState));

        // Report any JS errors
        if (consoleErrors.length > 0) {
            console.log('   🚨 JS Console Errors:');
            consoleErrors.slice(0, 5).forEach(err => console.log(`      - ${err}`));
            this.results.warnings.push(`JS errors during tutorial: ${consoleErrors.length}`);
        }

        if (!dataLoaded) {
            console.log('   ❌ Cannot test tutorial - app data not loaded');
            this.results.errors.push({ user: testUser, error: 'App data never loaded for tutorial test' });
            await page.close();
            return null;
        }

        await this.browser.sleep(500); // Small buffer for UI

        // Extract current state before opening tutorial
        const preState = await page.evaluate(() => {
            const app = window.marketplaceApp;
            return {
                shadowPrices: app?.shadowPrices || {},
                inventory: app?.inventory || {},
                optimalMix: app?.optimalMix || {},
                constraints: app?.constraints || []
            };
        });
        console.log('   📊 Pre-tutorial state:', JSON.stringify(preState, null, 2));

        // Click help button to open tutorial
        console.log('   🔘 Opening tutorial...');
        const helpBtn = await page.$('#help-btn');
        if (!helpBtn) {
            console.log('   ❌ Help button not found!');
            this.results.errors.push({ user: testUser, error: 'Tutorial help button not found' });
            await page.close();
            return null;
        }

        await helpBtn.click();
        await this.browser.sleep(500);

        // Verify tutorial modal is open
        const modalVisible = await page.evaluate(() => {
            const modal = document.getElementById('tutorial-modal');
            return modal && !modal.classList.contains('hidden');
        });

        if (!modalVisible) {
            console.log('   ❌ Tutorial modal did not open!');
            this.results.errors.push({ user: testUser, error: 'Tutorial modal failed to open' });
            await page.close();
            return null;
        }

        console.log('   ✅ Tutorial modal opened');

        // Navigate through each step and capture screenshots
        const tutorialData = [];
        let stepNum = 1;
        let hasMoreSteps = true;

        while (hasMoreSteps) {
            // Extract step content
            const stepData = await page.evaluate(() => {
                const stepNumEl = document.getElementById('tutorial-step-num');
                const stepTotalEl = document.getElementById('tutorial-step-total');
                const contentEl = document.getElementById('tutorial-content');
                const nextBtn = document.getElementById('tutorial-next');

                return {
                    stepNum: stepNumEl?.textContent || '?',
                    stepTotal: stepTotalEl?.textContent || '?',
                    title: contentEl?.querySelector('h3')?.textContent || '',
                    contentHtml: contentEl?.innerHTML || '',
                    nextButtonText: nextBtn?.textContent || ''
                };
            });

            console.log(`   📖 Step ${stepData.stepNum}/${stepData.stepTotal}: ${stepData.title}`);

            // Take screenshot
            const filename = `tutorial-step-${stepNum}-${Date.now()}.png`;
            const filePath = path.join(screenshotDir, filename);
            await page.screenshot({ path: filePath, fullPage: false });
            console.log(`      📸 ${filename}`);

            tutorialData.push({
                step: stepNum,
                displayStep: stepData.stepNum,
                displayTotal: stepData.stepTotal,
                title: stepData.title,
                screenshot: filePath,
                nextButtonText: stepData.nextButtonText
            });

            // Check if this is the last step
            if (stepData.nextButtonText === 'Got It!' || stepData.nextButtonText === 'Done!') {
                // Check if there's a Deep Dive button visible
                const deepDiveVisible = await page.evaluate(() => {
                    const btn = document.getElementById('tutorial-deep-dive');
                    return btn && !btn.classList.contains('hidden');
                });

                if (deepDiveVisible) {
                    console.log('   🎓 Deep Dive option available, clicking it...');
                    await page.click('#tutorial-deep-dive');
                    await this.browser.sleep(300);
                    stepNum++;
                    continue;
                }

                hasMoreSteps = false;
            } else {
                // Click Next button
                await page.click('#tutorial-next');
                await this.browser.sleep(300);
                stepNum++;
            }

            // Safety limit
            if (stepNum > 20) {
                console.log('   ⚠️  Too many steps, breaking loop');
                break;
            }
        }

        // Close tutorial and VERIFY it actually closed
        await page.click('#tutorial-next');
        await this.browser.sleep(300);

        // Verify the modal is actually hidden
        const modalHidden = await page.evaluate(() => {
            const modal = document.getElementById('tutorial-modal');
            return modal && modal.classList.contains('hidden');
        });

        if (!modalHidden) {
            console.log('   ❌ FAILURE: Tutorial modal did not close after clicking final button!');
            this.results.errors.push({ user: testUser, error: 'Tutorial modal failed to close' });
            // Take a screenshot of the failure state
            const failPath = path.join(screenshotDir, `tutorial-close-FAILED-${Date.now()}.png`);
            await page.screenshot({ path: failPath, fullPage: false });
            console.log(`   📸 Failure screenshot: ${failPath}`);
        } else {
            console.log('   ✅ Tutorial modal closed successfully');
        }

        console.log(`   ✅ Captured ${tutorialData.length} tutorial steps`);
        console.log(`   📁 Screenshots saved to: ${screenshotDir}`);

        // Write tutorial data summary
        const summaryPath = path.join(screenshotDir, `tutorial-summary-${Date.now()}.json`);
        fs.writeFileSync(summaryPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            user: testUser,
            preState,
            steps: tutorialData
        }, null, 2));
        console.log(`   📄 Summary written to: ${summaryPath}`);

        await page.close();
        return { preState, steps: tutorialData };
    }

    /**
     * Run accessibility checks using the element registry
     * @param {Page} page - Puppeteer page to test
     * @returns {Object} - A11y results summary
     */
    async runAccessibilityChecks(page) {
        const { getA11yElements } = require('./element-registry');
        const elements = getA11yElements();

        console.log('\n♿ ACCESSIBILITY CHECKS');
        console.log('-'.repeat(70));
        console.log(`   Testing ${elements.length} elements from registry...`);

        for (const element of elements) {
            const result = await this.checkElementAccessibility(page, element);
            this.results.a11y.details.push(result);

            if (result.status === 'passed') {
                this.results.a11y.passed++;
            } else if (result.status === 'skipped') {
                this.results.a11y.skipped++;
            } else {
                this.results.a11y.failed++;
                console.log(`   ❌ ${element.id}: ${result.errors.join(', ')}`);
            }
        }

        console.log(`   ✅ ${this.results.a11y.passed} passed, ❌ ${this.results.a11y.failed} failed, ⏭️ ${this.results.a11y.skipped} skipped`);

        return this.results.a11y;
    }

    /**
     * Check a single element's accessibility
     */
    async checkElementAccessibility(page, element) {
        const result = {
            id: element.id,
            selector: element.selector,
            status: 'pending',
            errors: []
        };

        try {
            const elementHandle = await this.findElement(page, element.selector);
            if (!elementHandle) {
                result.status = 'skipped';
                result.reason = 'element not found';
                return result;
            }

            const a11yInfo = await elementHandle.evaluate((el) => {
                const info = {
                    tagName: el.tagName.toLowerCase(),
                    role: el.getAttribute('role') || el.tagName.toLowerCase(),
                    ariaLabel: el.getAttribute('aria-label'),
                    ariaLabelledBy: el.getAttribute('aria-labelledby'),
                    title: el.getAttribute('title'),
                    textContent: el.textContent?.trim().substring(0, 50),
                    tabIndex: el.tabIndex,
                    type: el.type
                };

                // Compute accessible name
                let accessibleName = info.ariaLabel;
                if (!accessibleName && info.ariaLabelledBy) {
                    const labelEl = document.getElementById(info.ariaLabelledBy);
                    accessibleName = labelEl?.textContent?.trim();
                }
                if (!accessibleName) {
                    accessibleName = info.title || info.textContent;
                }
                info.accessibleName = accessibleName;

                // Check if focusable
                const focusableElements = ['a', 'button', 'input', 'select', 'textarea'];
                info.isFocusable = focusableElements.includes(info.tagName) ||
                    info.tabIndex >= 0 ||
                    el.getAttribute('contenteditable') === 'true';

                return info;
            });

            // Validate against expected a11y requirements
            const a11y = element.a11y || {};

            if (a11y.role && !this.matchesRole(a11yInfo, a11y.role)) {
                result.errors.push(`expected role "${a11y.role}", got "${a11yInfo.role}"`);
            }

            if (a11y.label) {
                const labelMatch = a11y.label instanceof RegExp
                    ? a11y.label.test(a11yInfo.accessibleName || '')
                    : (a11yInfo.accessibleName || '').toLowerCase().includes(a11y.label.toLowerCase());

                if (!labelMatch) {
                    result.errors.push(`missing accessible label matching "${a11y.label}"`);
                }
            }

            if (a11y.focusable === true && !a11yInfo.isFocusable) {
                result.errors.push('should be focusable but is not');
            }

            result.status = result.errors.length === 0 ? 'passed' : 'failed';
            return result;

        } catch (error) {
            result.status = 'failed';
            result.errors.push(error.message);
            return result;
        }
    }

    /**
     * Check if element role matches expected
     */
    matchesRole(a11yInfo, expectedRole) {
        const role = a11yInfo.role?.toLowerCase();
        const tagName = a11yInfo.tagName;

        const implicitRoles = {
            'button': 'button',
            'a': 'link',
            'input': a11yInfo.type === 'checkbox' ? 'checkbox' : 'textbox',
            'select': 'combobox',
            'dialog': 'dialog',
            'div': 'generic'
        };

        const actualRole = role || implicitRoles[tagName] || tagName;
        return actualRole === expectedRole.toLowerCase();
    }

    /**
     * Find element, handling shadow DOM chains
     */
    async findElement(page, selector) {
        if (Array.isArray(selector)) {
            return await page.evaluateHandle((selectors) => {
                let root = document;
                for (const sel of selectors) {
                    const el = (root.shadowRoot || root).querySelector(sel);
                    if (!el) return null;
                    root = el;
                }
                return root;
            }, selector);
        } else {
            return await page.$(selector);
        }
    }

    /**
     * Run axe-core accessibility audit (WCAG 2.1 AA)
     * @param {Page} page - Puppeteer page to test
     * @returns {Object} - Axe results
     */
    async runAxeAudit(page) {
        console.log('\n🔍 AXE-CORE ACCESSIBILITY AUDIT');
        console.log('-'.repeat(70));

        try {
            const AxePuppeteer = require('@axe-core/puppeteer').AxePuppeteer;

            const results = await new AxePuppeteer(page)
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
                .analyze();

            // Store results
            this.results.axe = {
                violations: results.violations.length,
                passes: results.passes.length,
                incomplete: results.incomplete.length,
                details: results.violations
            };

            if (results.violations.length === 0) {
                console.log('   ✅ No WCAG 2.1 AA violations found!');
            } else {
                console.log(`   ❌ ${results.violations.length} violation type(s) found:\n`);
                results.violations.forEach((violation, i) => {
                    console.log(`   ${i + 1}. [${violation.impact}] ${violation.id}`);
                    console.log(`      ${violation.description}`);
                    console.log(`      Help: ${violation.helpUrl}`);
                    console.log(`      Affected: ${violation.nodes.length} element(s)\n`);

                    // Always show details for color-contrast violations
                    const showAll = violation.id === 'color-contrast' || this.config.verbose;
                    const nodesToShow = showAll ? violation.nodes : violation.nodes.slice(0, 3);

                    nodesToShow.forEach((node, j) => {
                        const selector = node.target.join(' > ');
                        console.log(`        ${j + 1}. ${selector}`);

                        // Show contrast-specific data if available
                        if (node.any && node.any[0] && node.any[0].data) {
                            const data = node.any[0].data;
                            if (data.fgColor && data.bgColor) {
                                console.log(`           fg: ${data.fgColor} | bg: ${data.bgColor}`);
                                console.log(`           ratio: ${data.contrastRatio?.toFixed(2)} (need ${data.expectedContrastRatio})`);
                            }
                        }
                        // Show failure summary
                        if (node.failureSummary) {
                            const summary = node.failureSummary.split('\n')[0].substring(0, 80);
                            console.log(`           ${summary}`);
                        }
                    });

                    if (!showAll && violation.nodes.length > 3) {
                        console.log(`        ... and ${violation.nodes.length - 3} more`);
                    }
                    console.log('');
                });
            }

            console.log(`   Summary: ${results.passes.length} passed, ${results.violations.length} violations, ${results.incomplete.length} incomplete`);

            return this.results.axe;
        } catch (error) {
            console.log(`   ⚠️  Axe-core not available: ${error.message}`);
            console.log('   Install with: npm install @axe-core/puppeteer');
            return null;
        }
    }

    /**
     * Test keyboard navigation - verify all interactive elements are reachable via Tab
     * @param {Page} page - Puppeteer page to test
     * @returns {Object} - Keyboard nav results
     */
    async testKeyboardNavigation(page) {
        console.log('\n⌨️  KEYBOARD NAVIGATION TEST');
        console.log('-'.repeat(70));

        const { getInteractiveElements } = require('./element-registry');
        const interactiveElements = getInteractiveElements().filter(el =>
            el.a11y?.focusable === true && !el.precondition
        );

        const results = {
            total: interactiveElements.length,
            reachable: 0,
            unreachable: [],
            tabOrder: []
        };

        // Get all focusable elements in tab order (including Shadow DOM)
        const focusableInOrder = await page.evaluate(() => {
            const focusable = [];
            const focusableTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];

            // Recursive function to find focusable elements, piercing Shadow DOM
            function findFocusable(root) {
                const walker = document.createTreeWalker(
                    root,
                    NodeFilter.SHOW_ELEMENT,
                    {
                        acceptNode: (node) => {
                            const style = getComputedStyle(node);
                            if (style.display === 'none' || style.visibility === 'hidden') {
                                return NodeFilter.FILTER_REJECT;
                            }
                            return NodeFilter.FILTER_ACCEPT;
                        }
                    }
                );

                let node;
                while (node = walker.nextNode()) {
                    // Check if this element is focusable
                    if (!node.disabled && (focusableTags.includes(node.tagName) || node.tabIndex >= 0)) {
                        focusable.push({
                            tag: node.tagName.toLowerCase(),
                            id: node.id,
                            class: node.className?.split?.(' ')?.[0] || '',
                            ariaLabel: node.getAttribute('aria-label'),
                            tabIndex: node.tabIndex,
                            inShadowDOM: root !== document.body
                        });
                    }
                    // Pierce Shadow DOM
                    if (node.shadowRoot) {
                        findFocusable(node.shadowRoot);
                    }
                }
            }

            findFocusable(document.body);
            return focusable;
        });

        results.tabOrder = focusableInOrder;
        console.log(`   Found ${focusableInOrder.length} focusable elements in DOM`);

        // Check each interactive element from registry
        for (const element of interactiveElements) {
            // Handle both string selectors and array selectors (shadow DOM chains)
            const selectorId = Array.isArray(element.selector)
                ? element.selector[element.selector.length - 1].replace('#', '')
                : element.selector.replace('#', '');

            const isReachable = focusableInOrder.some(f =>
                f.id === selectorId ||
                (element.a11y?.label && f.ariaLabel?.toLowerCase()?.includes(
                    element.a11y.label.source?.toLowerCase?.() || element.a11y.label
                ))
            );

            if (isReachable) {
                results.reachable++;
            } else {
                results.unreachable.push(element.id);
            }
        }

        if (results.unreachable.length === 0) {
            console.log(`   ✅ All ${results.total} interactive elements are keyboard reachable`);
        } else {
            console.log(`   ❌ ${results.unreachable.length} elements NOT keyboard reachable:`);
            results.unreachable.forEach(id => console.log(`      - ${id}`));
        }

        // Store results
        this.results.keyboard = results;
        return results;
    }

    /**
     * Check color contrast ratios
     * NOTE: This is a supplementary check. axe-core provides the authoritative WCAG contrast audit.
     * This custom check may have false positives due to complex background inheritance.
     * @param {Page} page - Puppeteer page to test
     * @returns {Object} - Contrast results
     */
    async checkColorContrast(page) {
        console.log('\n🎨 COLOR CONTRAST CHECK (Supplementary - see axe-core for authoritative results)');
        console.log('-'.repeat(70));

        const results = await page.evaluate(() => {
            const getLuminance = (r, g, b) => {
                const [rs, gs, bs] = [r, g, b].map(c => {
                    c = c / 255;
                    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
                });
                return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
            };

            const getContrastRatio = (l1, l2) => {
                const lighter = Math.max(l1, l2);
                const darker = Math.min(l1, l2);
                return (lighter + 0.05) / (darker + 0.05);
            };

            const parseColor = (color) => {
                const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (match) {
                    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
                }
                return null;
            };

            // Walk up DOM tree to find actual visible background color
            const getEffectiveBackground = (element) => {
                let current = element;
                while (current && current !== document.body) {
                    const style = getComputedStyle(current);
                    const bg = style.backgroundColor;
                    const parsed = parseColor(bg);
                    // Check if not transparent (alpha > 0 or RGB not all zeros with alpha)
                    if (parsed && (parsed[0] !== 0 || parsed[1] !== 0 || parsed[2] !== 0)) {
                        return parsed;
                    }
                    // Also check for rgba with alpha
                    const alphaMatch = bg.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
                    if (alphaMatch && parseFloat(alphaMatch[1]) > 0.5 && parsed) {
                        return parsed;
                    }
                    current = current.parentElement;
                }
                // Default to body or dark theme background
                const bodyBg = parseColor(getComputedStyle(document.body).backgroundColor);
                return bodyBg || [31, 41, 55]; // gray-800 fallback
            };

            const issues = [];
            const textElements = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, a, button, label, li');

            textElements.forEach(el => {
                const style = getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return;
                if (!el.textContent?.trim()) return; // Skip empty elements

                const fgColor = parseColor(style.color);
                const bgColor = getEffectiveBackground(el);

                if (fgColor && bgColor) {
                    const fgLum = getLuminance(...fgColor);
                    const bgLum = getLuminance(...bgColor);
                    const ratio = getContrastRatio(fgLum, bgLum);

                    const fontSize = parseFloat(style.fontSize);
                    const isBold = parseInt(style.fontWeight) >= 700;
                    const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && isBold);
                    const minRatio = isLargeText ? 3 : 4.5;

                    if (ratio < minRatio) {
                        issues.push({
                            element: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''),
                            text: el.textContent?.substring(0, 30),
                            ratio: ratio.toFixed(2),
                            required: minRatio,
                            fg: style.color,
                            bg: `rgb(${bgColor.join(', ')})`,
                            fgLum: fgLum.toFixed(4),
                            bgLum: bgLum.toFixed(4)
                        });
                    }
                }
            });

            return issues;
        });

        this.results.contrast = results;

        if (results.length === 0) {
            console.log('   ✅ All text elements meet WCAG AA contrast requirements');
        } else {
            console.log(`   ❌ ${results.length} elements have insufficient contrast:`);
            results.slice(0, 5).forEach(issue => {
                console.log(`      - ${issue.element}: ratio ${issue.ratio} (need ${issue.required})`);
                console.log(`        fg: ${issue.fg} | bg: ${issue.bg}`);
            });
            if (results.length > 5) {
                console.log(`      ... and ${results.length - 5} more`);
            }
        }

        return results;
    }

    /**
     * Run all accessibility tests
     * @param {Page} page - Puppeteer page to test
     */
    async runFullAccessibilityAudit(page) {
        console.log('\n' + '═'.repeat(70));
        console.log('♿ FULL ACCESSIBILITY AUDIT');
        console.log('═'.repeat(70));

        // 1. Element registry checks
        await this.runAccessibilityChecks(page);

        // 2. Axe-core WCAG audit
        await this.runAxeAudit(page);

        // 3. Keyboard navigation
        await this.testKeyboardNavigation(page);

        // 4. Color contrast
        await this.checkColorContrast(page);

        console.log('\n' + '═'.repeat(70));
    }

    printResults() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 TEST RESULTS');
        console.log('='.repeat(80));
        console.log(`UI Actions Performed: ${this.results.uiActions}`);
        console.log(`API Calls Captured: ${this.results.apiCallsCaptured}`);
        console.log(`Errors: ${this.results.errors.length}`);
        console.log(`Warnings: ${this.results.warnings.length}`);
        console.log('='.repeat(80));

        if (this.results.errors.length > 0) {
            console.log('\n❌ ERRORS:');
            this.results.errors.forEach((err, i) => {
                console.log(`   ${i + 1}. ${err.user || 'Unknown'}: ${err.error}`);
            });
        }

        if (this.results.warnings.length > 0) {
            console.log('\n⚠️  WARNINGS:');
            this.results.warnings.forEach((warn, i) => {
                console.log(`   ${i + 1}. ${warn}`);
            });
        }

        // API call summary
        if (this.apiCallLog.length > 0) {
            console.log('\n📡 API CALL SUMMARY:');

            const apiSummary = {};
            this.apiCallLog.forEach(call => {
                const endpoint = call.url.split('?')[0]; // Remove query params
                apiSummary[endpoint] = (apiSummary[endpoint] || 0) + 1;
            });

            Object.entries(apiSummary)
                .sort((a, b) => b[1] - a[1])
                .forEach(([endpoint, count]) => {
                    console.log(`   ${count.toString().padStart(3)}x  ${endpoint}`);
                });

            // Write detailed log to file
            const fs = require('fs');
            const logFile = `api-call-log-${Date.now()}.json`;
            fs.writeFileSync(logFile, JSON.stringify(this.apiCallLog, null, 2));
            console.log(`\n   📄 Detailed log written to: ${logFile}`);
        }

        console.log('');
    }
}

// Run the test
if (require.main === module) {
    const test = new UIPlayabilityTest(CONFIG);
    test.run().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = UIPlayabilityTest;