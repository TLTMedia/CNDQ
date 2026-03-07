/**
 * UI Smoke Tests
 *
 * Opens a real browser and verifies that the key pages render correctly and
 * that the frontend application initialises its state. These tests are
 * intentionally lightweight — they confirm the UI loads, not that every
 * feature works (the API tests cover behaviour).
 *
 * Run: npx playwright test ui-smoke
 */

const { test, expect } = require('@playwright/test');
const { setupGame } = require('./setup');

const ADMIN  = 'admin@stonybrook.edu';
const PLAYER = 'test_mail1@stonybrook.edu';

test.describe('UI Smoke Tests', () => {
    test.beforeAll(async ({ playwright, baseURL }) => {
        await setupGame(playwright, baseURL);
    });

    // ── Player marketplace ─────────────────────────────────────────────────────

    test('player marketplace loads and shows the financial panel', async ({ page, baseURL }) => {
        await page.goto(`${baseURL}dev.php?user=${PLAYER}`);
        await page.waitForLoadState('domcontentloaded');

        // The financial summary panel must be visible within 15 s
        await expect(page.locator('#fin-net-profit')).toBeVisible({ timeout: 15_000 });
    });

    test('frontend app state initialises with a numeric currentFunds value', async ({ page, baseURL }) => {
        await page.goto(`${baseURL}dev.php?user=${PLAYER}`);

        await page.waitForFunction(
            () => window.app?.profile?.currentFunds !== undefined,
            { timeout: 15_000 }
        );

        const funds = await page.evaluate(() => window.app.profile.currentFunds);
        expect(typeof funds).toBe('number');
        expect(funds).toBeGreaterThanOrEqual(0);
    });

    // ── Admin panel ────────────────────────────────────────────────────────────

    test('admin panel loads and shows the start/stop control', async ({ page, baseURL }) => {
        await page.goto(`${baseURL}dev.php?user=${ADMIN}`);
        await page.goto(`${baseURL}admin/`);

        await expect(page.locator('#start-stop-btn')).toBeVisible({ timeout: 10_000 });
    });
});
