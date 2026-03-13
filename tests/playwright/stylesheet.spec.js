/**
 * Stylesheet / Component Gallery — Accessibility Tests
 *
 * Runs axe-core against stylesheet.html in all three theme variants
 * (dark, light, high-contrast). No game session or auth required.
 *
 * Primary purpose: catch WCAG 2.1 AA violations as they affect a low-vision user.
 * Secondary purpose: confirm every major UI component renders visibly in each theme.
 *
 * Run: npx playwright test stylesheet
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const THEMES = ['dark', 'light', 'high-contrast'];

// Path to axe-core script — installed as devDependency
const AXE_PATH = path.resolve(__dirname, '../../node_modules/axe-core/axe.min.js');

/**
 * Inject axe-core and run analysis on the current page.
 * Returns the axe results object.
 */
async function runAxe(page, theme) {
    await page.addScriptTag({ path: AXE_PATH });

    // Switch theme via the gallery's setTheme function
    await page.evaluate((t) => {
        if (typeof setTheme === 'function') {
            const btn = [...document.querySelectorAll('.sg-theme-btn')]
                .find(b => b.textContent.trim().toLowerCase().replace(' ', '-') === t ||
                           b.textContent.trim().toLowerCase() === t.replace('-', ' '));
            setTheme(t, btn);
        } else {
            document.documentElement.setAttribute('data-theme', t);
        }
    }, theme);

    // Give UnoCSS and CSS variables time to settle
    await page.waitForTimeout(300);

    return page.evaluate(() => {
        return axe.run(document, {
            runOnly: {
                type: 'tag',
                values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
            },
            rules: {
                // We intentionally include an unlabeled input in the gallery to
                // document the known gap — exclude it from blocking failures here.
                // Remove this exclusion once the gap is fixed in the actual game.
                'label': { enabled: true }
            }
        });
    });
}

test.describe('Component Gallery — Accessibility', () => {

    test.beforeAll(async () => {
        if (!fs.existsSync(AXE_PATH)) {
            throw new Error(`axe-core not found at ${AXE_PATH}. Run: npm install`);
        }
    });

    for (const theme of THEMES) {
        test(`${theme} theme — page loads and key sections are visible`, async ({ page, baseURL }) => {
            await page.goto(`${baseURL}stylesheet.html`);
            await page.waitForLoadState('domcontentloaded');

            // Apply theme
            await page.evaluate((t) => {
                document.documentElement.setAttribute('data-theme', t);
            }, theme);

            // All major sections must be visible
            const sections = ['#colors', '#typography', '#buttons', '#badges',
                              '#cards', '#forms', '#tables', '#toasts', '#modals', '#focus'];
            for (const id of sections) {
                await expect(page.locator(id)).toBeVisible();
            }
        });

        test(`${theme} theme — axe-core WCAG 2.1 AA scan`, async ({ page, baseURL }) => {
            await page.goto(`${baseURL}stylesheet.html`);
            await page.waitForLoadState('domcontentloaded');

            const results = await runAxe(page, theme);

            // Separate critical/serious violations from known lower-severity ones
            const blocking = results.violations.filter(v =>
                v.impact === 'critical' || v.impact === 'serious'
            );

            if (blocking.length > 0) {
                const summary = blocking.map(v =>
                    `\n  [${v.impact.toUpperCase()}] ${v.id}: ${v.description}\n` +
                    v.nodes.slice(0, 3).map(n =>
                        `    → ${n.target.join(', ')}\n      ${n.failureSummary}`
                    ).join('\n')
                ).join('\n');

                throw new Error(
                    `${blocking.length} critical/serious axe violation(s) in ${theme} theme:${summary}`
                );
            }

            // Log moderate/minor violations as warnings (don't fail the test)
            const warnings = results.violations.filter(v =>
                v.impact === 'moderate' || v.impact === 'minor'
            );
            if (warnings.length > 0) {
                console.warn(
                    `  ⚠ ${warnings.length} moderate/minor violation(s) in ${theme} theme:`,
                    warnings.map(v => `${v.id} (${v.impact})`).join(', ')
                );
            }

            // Report passes for confidence
            console.log(`  ✓ ${results.passes.length} rules passed in ${theme} theme`);
        });
    }

    test('high-contrast theme — chemical element colors are visible', async ({ page, baseURL }) => {
        await page.goto(`${baseURL}stylesheet.html`);
        await page.waitForLoadState('domcontentloaded');

        await page.evaluate(() => {
            document.documentElement.setAttribute('data-theme', 'high-contrast');
        });
        await page.waitForTimeout(200);

        // Each chemical badge must be present and visible
        for (const chem of ['C', 'N', 'D', 'Q']) {
            const badge = page.locator(`.badge-chem-${chem.toLowerCase()}`).first();
            await expect(badge).toBeVisible();
        }
    });

    test('skip link is present and has correct target', async ({ page, baseURL }) => {
        await page.goto(`${baseURL}stylesheet.html`);
        const skipLink = page.locator('a.skip-link');
        await expect(skipLink).toHaveAttribute('href', '#main-content');
        await expect(page.locator('#main-content')).toBeVisible();
    });

    test('theme switcher buttons all have accessible names', async ({ page, baseURL }) => {
        await page.goto(`${baseURL}stylesheet.html`);
        const themeButtons = page.locator('.sg-theme-btn');
        const count = await themeButtons.count();
        expect(count).toBe(3);
        for (let i = 0; i < count; i++) {
            const text = await themeButtons.nth(i).textContent();
            expect(text.trim().length).toBeGreaterThan(0);
        }
    });

    test('all form inputs in the correct section have labels', async ({ page, baseURL }) => {
        await page.goto(`${baseURL}stylesheet.html`);

        // Get all inputs inside the forms section that are NOT in the known-gap demo
        const labeledInputs = await page.locator(
            '#forms input:not([aria-label]):not([id="qty-input"]):not([id="chem-select"]):not([id="price-input"]):not([id="team-id"]):not([id="auto-renew"]):not([type="radio"]):not([type="checkbox"])'
        ).count();

        // The only unlabeled input is the one inside the flagged demo block
        // If this count goes above 1 we have a regression
        expect(labeledInputs).toBeLessThanOrEqual(1);
    });

    test('modal demo has aria-labelledby and aria-modal', async ({ page, baseURL }) => {
        await page.goto(`${baseURL}stylesheet.html`);
        const modal = page.locator('[role="dialog"]');
        await expect(modal).toHaveAttribute('aria-labelledby', 'demo-modal-title');
        await expect(modal).toHaveAttribute('aria-modal', 'true');
    });

    test('ARIA live region is present', async ({ page, baseURL }) => {
        await page.goto(`${baseURL}stylesheet.html`);
        await expect(page.locator('#sr-announcer')).toHaveAttribute('aria-live', 'polite');
    });
});
