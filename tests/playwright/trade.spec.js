/**
 * Trade Execution — Deterministic Happy Path
 *
 * These tests verify the core economic mechanics with exact arithmetic: given a
 * known trade (quantity × price), the resulting fund and inventory changes must
 * match to the cent. No probabilistic pass criteria — if the numbers are wrong,
 * the test fails.
 *
 * Tests run serially: each one depends on a clean game started in beforeAll.
 *
 * Run: npx playwright test trade
 */

const { test, expect } = require('@playwright/test');
const { createClient, setupGame } = require('./setup');

test.describe.serial('Trade Execution', () => {
    let admin, seller, buyer;

    test.beforeAll(async ({ playwright, baseURL }) => {
        admin  = await setupGame(playwright, baseURL);
        seller = await createClient(playwright, 'test_mail1@stonybrook.edu', baseURL);
        buyer  = await createClient(playwright, 'test_mail2@stonybrook.edu', baseURL);
    });

    test.afterAll(async () => {
        await admin._dispose();
        await seller._dispose();
        await buyer._dispose();
    });

    // ── Direct trade: initiate → accept ───────────────────────────────────────

    test('accepted trade updates both teams balances and inventories by the exact amount', async () => {
        const QUANTITY = 50;
        const PRICE    = 5.00;
        const TOTAL    = QUANTITY * PRICE; // $250.00

        // Snapshot state before the trade
        const sellerBefore = await seller.team.getProfile();
        const buyerBefore  = await buyer.team.getProfile();

        const sellerFundsBefore = sellerBefore.data.profile.currentFunds;
        const buyerFundsBefore  = buyerBefore.data.profile.currentFunds;
        const sellerCBefore     = sellerBefore.data.inventory.C;
        const buyerCBefore      = buyerBefore.data.inventory.C;

        // Seller initiates: sell 50 units of C to buyer at $5.00 each
        const initRes = await seller.negotiations.initiate(
            'test_mail2@stonybrook.edu', 'C', QUANTITY, PRICE, 'sell'
        );
        expect(initRes.ok, 'initiate negotiation').toBe(true);
        const negId = initRes.data.negotiation.id;

        // Buyer accepts immediately (no counter)
        const acceptRes = await buyer.negotiations.accept(negId);
        expect(acceptRes.ok, 'accept negotiation').toBe(true);

        // Snapshot state after the trade
        const sellerAfter = await seller.team.getProfile();
        const buyerAfter  = await buyer.team.getProfile();

        // Funds: seller gains TOTAL, buyer loses TOTAL
        expect(sellerAfter.data.profile.currentFunds).toBeCloseTo(sellerFundsBefore + TOTAL, 2);
        expect(buyerAfter.data.profile.currentFunds).toBeCloseTo(buyerFundsBefore - TOTAL, 2);

        // Inventory: seller loses QUANTITY of C, buyer gains QUANTITY of C
        expect(sellerAfter.data.inventory.C).toBe(sellerCBefore - QUANTITY);
        expect(buyerAfter.data.inventory.C).toBe(buyerCBefore + QUANTITY);
    });

    test('completed trade appears in both teams trade history', async () => {
        const sellerHist = await seller.trades.history();
        const buyerHist  = await buyer.trades.history();

        expect(sellerHist.ok).toBe(true);
        expect(buyerHist.ok).toBe(true);

        const sellerTrades = sellerHist.data.transactions ?? [];
        const buyerTrades  = buyerHist.data.transactions ?? [];

        expect(sellerTrades.some(t => t.chemical === 'C')).toBe(true);
        expect(buyerTrades.some(t => t.chemical === 'C')).toBe(true);
    });

    test('shadow prices become stale after a trade', async () => {
        const res = await buyer.team.getProfile();
        // A trade invalidates the cached LP solution — staleness must not be "fresh"
        expect(res.data.inventory.stalenessLevel).not.toBe('fresh');
    });

    // ── Full negotiation cycle: initiate → counter → accept ───────────────────

    test('counter-offer cycle completes and updates balances correctly', async () => {
        const QUANTITY       = 20;
        const SELLER_PRICE   = 8.00;  // seller asks $8
        const BUYER_COUNTER  = 7.00;  // buyer counters at $7
        const TOTAL          = QUANTITY * BUYER_COUNTER; // $140.00 (the agreed price)

        const sellerBefore = await seller.team.getProfile();
        const buyerBefore  = await buyer.team.getProfile();
        const sellerNBefore = sellerBefore.data.inventory.N;
        const buyerNBefore  = buyerBefore.data.inventory.N;

        // Seller proposes: sell 20 N at $8.00
        const initRes = await seller.negotiations.initiate(
            'test_mail2@stonybrook.edu', 'N', QUANTITY, SELLER_PRICE, 'sell'
        );
        expect(initRes.ok, 'initiate negotiation').toBe(true);
        const negId = initRes.data.negotiation.id;

        // Buyer counters at $7.00
        const counterRes = await buyer.negotiations.counter(negId, QUANTITY, BUYER_COUNTER);
        expect(counterRes.ok, 'counter negotiation').toBe(true);

        // Seller accepts the counter
        const acceptRes = await seller.negotiations.accept(negId);
        expect(acceptRes.ok, 'accept counter-offer').toBe(true);

        // Verify exact balance and inventory changes at the counter price
        const sellerAfter = await seller.team.getProfile();
        const buyerAfter  = await buyer.team.getProfile();

        expect(sellerAfter.data.profile.currentFunds).toBeCloseTo(
            sellerBefore.data.profile.currentFunds + TOTAL, 2
        );
        expect(buyerAfter.data.profile.currentFunds).toBeCloseTo(
            buyerBefore.data.profile.currentFunds - TOTAL, 2
        );
        expect(sellerAfter.data.inventory.N).toBe(sellerNBefore - QUANTITY);
        expect(buyerAfter.data.inventory.N).toBe(buyerNBefore + QUANTITY);
    });
});
