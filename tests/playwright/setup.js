/**
 * Shared test setup helpers for CNDQ Playwright spec files.
 *
 * Usage in a spec file:
 *
 *   const { createClient, setupGame } = require('./setup');
 *
 *   test.beforeAll(async ({ playwright, baseURL }) => {
 *       admin  = await setupGame(playwright, baseURL);
 *       player = await createClient(playwright, 'test_mail1@stonybrook.edu', baseURL);
 *   });
 *
 *   test.afterAll(async () => {
 *       await admin._dispose();
 *       await player._dispose();
 *   });
 */

const ApiClient = require('./lib/api-client');

/**
 * Creates an authenticated API client for the given user.
 * Logs in via dev.php (the local development auth bypass).
 *
 * @param {import('@playwright/test').PlaywrightTestArgs['playwright']} playwright
 * @param {string} email
 * @param {string} baseURL
 * @returns {Promise<ApiClient>}
 */
async function createClient(playwright, email, baseURL) {
    const url = baseURL.endsWith('/') ? baseURL : baseURL + '/';
    const ctx = await playwright.request.newContext({ baseURL: url });
    await ctx.get(`dev.php?user=${encodeURIComponent(email)}`);
    const client = new ApiClient(ctx, url);
    // Attach dispose helper so callers can clean up in afterAll
    client._dispose = () => ctx.dispose();
    return client;
}

/**
 * Resets and starts the game, returning an authenticated admin client.
 * Call this in beforeAll to get a clean game state for each spec file.
 *
 * @param {import('@playwright/test').PlaywrightTestArgs['playwright']} playwright
 * @param {string} baseURL
 * @returns {Promise<ApiClient>}
 */
async function setupGame(playwright, baseURL) {
    const admin = await createClient(playwright, 'admin@stonybrook.edu', baseURL);

    const reset = await admin.admin.resetGame();
    if (!reset.ok) {
        throw new Error('setupGame: failed to reset game — ' + JSON.stringify(reset.data));
    }

    const start = await admin.startGame();
    if (!start.ok) {
        throw new Error('setupGame: failed to start game — ' + JSON.stringify(start.data));
    }

    return admin;
}

module.exports = { createClient, setupGame };
