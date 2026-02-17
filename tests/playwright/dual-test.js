/**
 * Dual Playability Test (Playwright Version)
 *
 * Runs both UI and API tests using Playwright and compares results.
 */

const APIPlayabilityTest = require('./api-test');
const UIPlayabilityTest = require('./ui-test');
const fs = require('fs');

class DualPlayabilityTest {
    async run() {
        console.log('🔀 DUAL PLAYABILITY TEST - UI vs API (Playwright)');
        console.log('='.repeat(80));

        // 1. Run API Test
        console.log('\nRunning API Test...');
        const apiTest = new APIPlayabilityTest();
        await apiTest.run();
        const apiResults = {
            stats: apiTest.results,
            log: apiTest.apiCallLog
        };

        console.log('\n⏸️  Waiting 5 seconds...\n');
        await new Promise(r => setTimeout(r, 5000));

        // 2. Run UI Test
        console.log('\nRunning UI Test...');
        const uiTest = new UIPlayabilityTest();
        await uiTest.run();
        const uiResults = {
            stats: uiTest.results,
            log: uiTest.apiCallLog
        };

        // 3. Compare
        this.compare(apiResults, uiResults);
    }

    compare(api, ui) {
        console.log('\n' + '█'.repeat(80));
        console.log('█  COMPARISON REPORT');
        console.log('█'.repeat(80));

        // Normalize function: remove .php, remove leading/trailing slashes
        const normalize = (ep) => ep.replace(/\.php$/, '').replace(/^\/+|\/+$/g, '');

        const apiEndpoints = new Set(api.log.map(c => normalize(c.endpoint)));
        const uiEndpoints = new Set(ui.log.map(c => normalize(c.url.split('?')[0])));

        console.log(`\nEndpoints Covered:`);
        console.log(`   API Test: ${apiEndpoints.size} unique endpoints`);
        console.log(`   UI Test:  ${uiEndpoints.size} unique endpoints`);

        const missingInUi = [...apiEndpoints].filter(x => !uiEndpoints.has(x));
        if (missingInUi.length > 0) {
            console.log('\n⚠️  Endpoints tested by API but missed by UI capture:');
            missingInUi.forEach(e => console.log(`   - ${e}`));
        }

        const common = [...apiEndpoints].filter(x => uiEndpoints.has(x));
        if (common.length > 0) {
            console.log(`\n✅ ${common.length} endpoints successfully verified in both UI and API:`);
            common.forEach(e => console.log(`   - ${e}`));
        }

        console.log('\n✅ Comparison Complete');
    }
}

if (require.main === module) {
    new DualPlayabilityTest().run();
}

module.exports = DualPlayabilityTest;
