/**
 * Application Health Checks
 *
 * Verifies that every major API endpoint is reachable and returns the expected
 * data shape after a clean game reset. These tests are independent — a failure
 * in one does not prevent the others from running.
 *
 * Run: npx playwright test health
 */

const { test, expect } = require('@playwright/test');
const { createClient, setupGame } = require('./setup');

test.describe('Application Health', () => {
    let admin, player;

    test.beforeAll(async ({ playwright, baseURL }) => {
        admin  = await setupGame(playwright, baseURL);
        player = await createClient(playwright, 'test_mail1@stonybrook.edu', baseURL);
    });

    test.afterAll(async () => {
        await admin._dispose();
        await player._dispose();
    });

    // ── Session ────────────────────────────────────────────────────────────────

    test('session status returns trading phase', async () => {
        const res = await admin.session.getStatus();
        expect(res.ok).toBe(true);
        expect(res.data.phase?.toLowerCase()).toBe('trading');
    });

    // ── Team profile ───────────────────────────────────────────────────────────

    test('team profile has currentFunds and startingFunds', async () => {
        const res = await player.team.getProfile();
        expect(res.ok).toBe(true);
        expect(typeof res.data.profile.currentFunds).toBe('number');
        expect(typeof res.data.profile.startingFunds).toBe('number');
    });

    test('inventory contains all four chemicals', async () => {
        const res = await player.team.getProfile();
        const inv = res.data.inventory;
        for (const chem of ['C', 'N', 'D', 'Q']) {
            expect(inv).toHaveProperty(chem);
        }
    });

    test('inventory includes a staleness level', async () => {
        const res = await player.team.getProfile();
        expect(res.data.inventory.stalenessLevel).toBeTruthy();
    });

    // ── Shadow prices ──────────────────────────────────────────────────────────

    test('shadow prices returns all four chemicals', async () => {
        const res = await player.production.getShadowPrices();
        expect(res.ok).toBe(true);
        for (const chem of ['C', 'N', 'D', 'Q']) {
            expect(res.data.shadowPrices).toHaveProperty(chem);
        }
    });

    test('shadow prices includes maxProfit and ranges', async () => {
        const res = await player.production.getShadowPrices();
        expect(typeof res.data.maxProfit).toBe('number');
        expect(res.data.ranges).toBeDefined();
    });

    test('shadow prices read-only endpoint returns staleness info', async () => {
        const res = await player.production.readShadowPrices();
        expect(res.ok).toBe(true);
        expect(res.data.staleness).toBeDefined();
    });

    // ── Listings ───────────────────────────────────────────────────────────────

    test('can post a buy listing', async () => {
        const res = await player.listings.post('C', 'buy');
        expect(res.ok).toBe(true);
    });

    test('posted buy listing appears in the marketplace', async () => {
        const res = await player.listings.list();
        expect(res.ok).toBe(true);
        const cBuy = res.data.listings?.C?.buy ?? [];
        expect(cBuy.length).toBeGreaterThan(0);
    });

    // ── Reports ────────────────────────────────────────────────────────────────

    test('financial report endpoint reachable', async () => {
        const res = await player.reports.financial();
        expect(res.ok).toBe(true);
    });

    test('transaction report endpoint reachable', async () => {
        const res = await player.reports.transactions();
        expect(res.ok).toBe(true);
    });

    test('sensitivity report endpoint reachable', async () => {
        const res = await player.reports.sensitivity();
        expect(res.ok).toBe(true);
    });

    // ── Trade history ──────────────────────────────────────────────────────────

    test('trade history endpoint reachable', async () => {
        const res = await player.trades.history();
        expect(res.ok).toBe(true);
    });

    test('global trade history endpoint reachable', async () => {
        const res = await admin.trades.global(10);
        expect(res.ok).toBe(true);
    });

    // ── Notifications ──────────────────────────────────────────────────────────

    test('notifications endpoint reachable', async () => {
        const res = await player.notifications.list();
        expect(res.ok).toBe(true);
    });

    // ── Leaderboard ────────────────────────────────────────────────────────────

    test('leaderboard has all fields required for CSV export', async () => {
        const res = await admin.leaderboard.getStandings();
        expect(res.ok).toBe(true);
        const standings = res.data.standings ?? [];
        expect(standings.length).toBeGreaterThan(0);
        for (const team of standings) {
            expect(typeof team.teamName).toBe('string');
            expect(typeof team.startingFunds).toBe('number');
            expect(typeof team.currentFunds).toBe('number');
            expect(typeof team.percentChange).toBe('number');
            expect(typeof team.totalTrades).toBe('number');
            expect(team.inventory).toBeDefined();
        }
    });

    // ── Admin ──────────────────────────────────────────────────────────────────

    test('admin can list teams', async () => {
        const res = await admin.admin.listTeams();
        expect(res.ok).toBe(true);
        expect(res.data.teams?.length).toBeGreaterThan(0);
    });
});
