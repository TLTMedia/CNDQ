#!/usr/bin/env node
/**
 * Test Controller - Unified test runner for CNDQ test suite
 *
 * Runs any combination of tests using a shared JSON config file.
 * Each test is isolated with try/catch - one failure won't crash others.
 * Generates a consolidated JSON report at the end.
 *
 * Usage:
 *   node tests/controller.js                      # Run dual test (default)
 *   node tests/controller.js --test dual          # Run dual playability test
 *   node tests/controller.js --test stress        # Run stress test
 *   node tests/controller.js --test lighthouse    # Run lighthouse audit
 *   node tests/controller.js --test accessibility # Run accessibility test
 *   node tests/controller.js --test visual        # Run visual screenshot test
 *   node tests/controller.js --test dual,stress   # Run multiple tests
 *   node tests/controller.js --test all           # Run all tests
 *
 * Background & Reporting:
 *   --background        Run in background mode (no interactive output)
 *   --report <path>     Output report file (default: test-report-{timestamp}.json)
 *   --quiet, -q         Minimal output (just summary)
 *
 * Config:
 *   --config <path>     Use custom config file (default: test-config.json)
 *
 * CLI Overrides:
 *   --headless          Run in headless mode
 *   --verbose / -v      Enable verbose output
 *   --npcs <n>          Number of NPCs
 *   --rpcs <n>          Number of real player clients
 *   --duration <s>      Trading duration in seconds
 *   --skill <level>     Set all skill levels (beginner, novice, expert)
 *   --baseUrl <url>     Override base URL
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// Available tests
const AVAILABLE_TESTS = {
    dual: {
        name: 'Dual Playability Test',
        file: './test.js',
        description: 'UI vs API comparison with ROI validation (Puppeteer)'
    },
    playwright: {
        name: 'Playwright Dual Test',
        file: './playwright/dual-test.js',
        description: 'API + UI health checks, negotiation cycle, CSV field validation (Playwright)'
    },
    stress: {
        name: 'Stress Test',
        file: './stress-test-playability.js',
        description: 'Load testing with multiple concurrent users'
    },
    lighthouse: {
        name: 'Lighthouse Audit',
        file: './lighthouse.js',
        description: 'Performance, accessibility, best practices'
    },
    accessibility: {
        name: 'Accessibility Test',
        file: './accessibility.js',
        description: 'WCAG 2.1 Level AA compliance'
    },
    visual: {
        name: 'Visual UX Screenshot Test',
        file: './visual-ux-screenshot-test.js',
        description: 'Visual regression screenshots'
    }
};

// Parse CLI arguments
function parseArgs() {
    const args = {
        tests: [],
        configPath: path.join(__dirname, 'test-config.json'),
        reportPath: null,
        background: false,
        quiet: false,
        overrides: {}
    };

    const argv = process.argv.slice(2);

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const nextArg = argv[i + 1];

        switch (arg) {
            case '--test':
            case '-t':
                if (nextArg) {
                    if (nextArg.toLowerCase() === 'all') {
                        args.tests = Object.keys(AVAILABLE_TESTS);
                    } else {
                        args.tests = nextArg.split(',').map(t => t.trim().toLowerCase());
                    }
                    i++;
                }
                break;
            case '--config':
            case '-c':
                if (nextArg) {
                    args.configPath = path.resolve(nextArg);
                    i++;
                }
                break;
            case '--report':
            case '-r':
                if (nextArg) {
                    args.reportPath = path.resolve(nextArg);
                    i++;
                }
                break;
            case '--background':
            case '-b':
                args.background = true;
                args.overrides.headless = true; // Background implies headless
                break;
            case '--quiet':
            case '-q':
                args.quiet = true;
                break;
            case '--headless':
                args.overrides.headless = true;
                break;
            case '--verbose':
            case '-v':
                args.overrides.verbose = true;
                break;
            case '--npcs':
                if (nextArg) {
                    args.overrides.npcCount = parseInt(nextArg);
                    i++;
                }
                break;
            case '--rpcs':
                if (nextArg) {
                    args.overrides.rpcCount = parseInt(nextArg);
                    i++;
                }
                break;
            case '--duration':
                if (nextArg) {
                    args.overrides.tradingDuration = parseInt(nextArg);
                    i++;
                }
                break;
            case '--skill':
                if (nextArg) {
                    args.overrides.skillLevel = nextArg;
                    i++;
                }
                break;
            case '--baseUrl':
                if (nextArg) {
                    args.overrides.baseUrl = nextArg;
                    i++;
                }
                break;
            case '--help':
            case '-h':
                printHelp();
                process.exit(0);
                break;
            case '--list':
                listTests();
                process.exit(0);
                break;
        }
    }

    // Default to dual test if none specified
    if (args.tests.length === 0) {
        args.tests = ['dual'];
    }

    // Default report path
    if (!args.reportPath) {
        args.reportPath = path.join(__dirname, `test-report-${Date.now()}.json`);
    }

    return args;
}

function printHelp() {
    console.log(`
CNDQ Test Controller - Unified test runner

Usage:
  node tests/controller.js [options]

Options:
  --test, -t <tests>    Tests to run (comma-separated): dual, stress, lighthouse, accessibility, visual, all
  --config, -c <path>   Config file path (default: test-config.json)
  --report, -r <path>   Output report file path
  --background, -b      Run in background mode (headless, minimal output)
  --quiet, -q           Minimal output (just summary)
  --headless            Run browsers in headless mode
  --verbose, -v         Enable verbose output
  --npcs <n>            Number of NPCs to create
  --rpcs <n>            Number of real player clients
  --duration <s>        Trading duration in seconds
  --skill <level>       Set all skill levels (beginner, novice, expert)
  --baseUrl <url>       Override base URL
  --list                List available tests
  --help, -h            Show this help

Examples:
  node tests/controller.js --test dual --headless
  node tests/controller.js --test all --background --report results.json
  node tests/controller.js --test dual,stress --npcs 10 --duration 120
  node tests/controller.js --config my-config.json --test accessibility
`);
}

function listTests() {
    console.log('\nAvailable Tests:\n');
    Object.entries(AVAILABLE_TESTS).forEach(([key, test]) => {
        console.log(`  ${key.padEnd(15)} ${test.name}`);
        console.log(`  ${''.padEnd(15)} ${test.description}\n`);
    });
}

function loadConfig(configPath, overrides) {
    let config = {};

    // Load base config if exists
    if (fs.existsSync(configPath)) {
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (e) {
            // Silent fail, use defaults
        }
    }

    // Apply defaults
    config = {
        baseUrl: 'http://localhost:8000/CNDQ/',
        adminUser: 'admin@stonybrook.edu',
        npcCount: 6,
        rpcCount: 6,
        tradingDuration: 300,
        targetSessions: 2,
        npcSkillMix: ['expert', 'expert', 'expert', 'expert', 'expert', 'expert'],
        rpcSkillMix: ['expert', 'expert', 'expert', 'expert', 'expert', 'expert'],
        headless: true,
        verbose: false,
        passCriteria: {
            minPositiveRoiTeams: 1,
            minAverageRoi: -50,
            minTotalTrades: 3,
            maxAcceptableErrors: 2
        },
        // Lighthouse/Accessibility specific
        pages: [
            { name: 'Login Page', url: '' },
            { name: 'Main App', url: 'index.php' },
            { name: 'Admin Panel', url: 'admin/' }
        ],
        themes: ['light', 'dark'],
        wcagLevel: 'AA',
        ...config
    };

    // Apply CLI overrides
    if (overrides.headless !== undefined) config.headless = overrides.headless;
    if (overrides.verbose !== undefined) config.verbose = overrides.verbose;
    if (overrides.npcCount !== undefined) config.npcCount = overrides.npcCount;
    if (overrides.rpcCount !== undefined) config.rpcCount = overrides.rpcCount;
    if (overrides.tradingDuration !== undefined) config.tradingDuration = overrides.tradingDuration;
    if (overrides.baseUrl !== undefined) config.baseUrl = overrides.baseUrl;

    // Apply skill level override to all mixes
    if (overrides.skillLevel) {
        config.npcSkillMix = Array(config.npcCount).fill(overrides.skillLevel);
        config.rpcSkillMix = Array(config.rpcCount).fill(overrides.skillLevel);
    }

    // Derive skill levels from mix
    config.npcLevels = config.npcSkillMix.slice(0, config.npcCount);
    config.rpcLevels = config.rpcSkillMix.slice(0, config.rpcCount);
    config.skillLevels = config.rpcLevels;

    // Flatten pass criteria for easy access
    if (config.passCriteria) {
        config.minPositiveRoiTeams = config.passCriteria.minPositiveRoiTeams;
        config.minAverageRoi = config.passCriteria.minAverageRoi;
        config.minTotalTrades = config.passCriteria.minTotalTrades;
        config.maxAcceptableErrors = config.passCriteria.maxAcceptableErrors;
    }

    // Test users for RPC tests
    config.testUsers = [
        'test_mail1@stonybrook.edu',
        'test_mail2@stonybrook.edu',
        'test_mail3@stonybrook.edu',
        'test_mail4@stonybrook.edu',
        'test_mail5@stonybrook.edu',
        'test_mail6@stonybrook.edu'
    ].slice(0, config.rpcCount);

    // Stress test teams
    config.teams = [
        'alpha@stonybrook.edu',
        'beta@stonybrook.edu',
        'gamma@stonybrook.edu'
    ];

    return config;
}

/**
 * Run a single test with full isolation
 * Catches all errors so one test can't crash others
 */
async function runTest(testKey, config, quiet = false) {
    const testInfo = AVAILABLE_TESTS[testKey];
    const startTime = Date.now();

    const result = {
        test: testKey,
        name: testInfo?.name || testKey,
        success: false,
        error: null,
        errorStack: null,
        startTime: new Date().toISOString(),
        endTime: null,
        durationMs: 0,
        details: {}
    };

    if (!testInfo) {
        result.error = `Unknown test: ${testKey}`;
        result.endTime = new Date().toISOString();
        return result;
    }

    if (!quiet) {
        console.log(`\n${'█'.repeat(80)}`);
        console.log(`█ ${testInfo.name.toUpperCase().padEnd(76)} █`);
        console.log(`█ ${testInfo.description.padEnd(76)} █`);
        console.log(`${'█'.repeat(80)}\n`);
    }

    try {
        let testResult;

        switch (testKey) {
            case 'dual': {
                const DualPlayabilityTest = require(testInfo.file);
                const test = new DualPlayabilityTest(config);
                await test.run();
                testResult = { success: true };
                break;
            }

            case 'playwright': {
                const PlaywrightDualTest = require(testInfo.file);
                const test = new PlaywrightDualTest();
                await test.run();
                testResult = { success: true };
                break;
            }

            case 'stress': {
                const StressTest = require(testInfo.file);
                const test = new StressTest();
                // Inject config values
                if (test.browserHelper) {
                    test.browserHelper.config = { ...test.browserHelper.config, ...config };
                }
                await test.run();
                testResult = { success: true };
                break;
            }

            case 'lighthouse': {
                const LighthouseTest = require(testInfo.file);
                const BrowserHelper = require('./helpers/browser');
                const browserHelper = new BrowserHelper(config);
                try {
                    await browserHelper.launch();
                    const test = new LighthouseTest(config, browserHelper);
                    testResult = await test.run();
                } finally {
                    try { await browserHelper.close(); } catch (e) { /* ignore cleanup errors */ }
                }
                break;
            }

            case 'accessibility': {
                const AccessibilityTest = require(testInfo.file);
                const BrowserHelper = require('./helpers/browser');
                const browserHelper = new BrowserHelper(config);
                try {
                    await browserHelper.launch();
                    const test = new AccessibilityTest(config, browserHelper);
                    testResult = await test.run();
                } finally {
                    try { await browserHelper.close(); } catch (e) { /* ignore cleanup errors */ }
                }
                break;
            }

            case 'visual': {
                const VisualTest = require(testInfo.file);
                const test = new VisualTest(config);
                await test.run();
                testResult = { success: true };
                break;
            }

            default:
                testResult = { success: false, error: 'Test not implemented' };
        }

        result.success = testResult?.success !== false;
        result.details = testResult || {};

    } catch (error) {
        result.success = false;
        result.error = error.message;
        result.errorStack = error.stack;

        if (!quiet) {
            console.error(`\n❌ ${testInfo.name} failed:`, error.message);
            if (config.verbose) {
                console.error(error.stack);
            }
        }
    }

    result.endTime = new Date().toISOString();
    result.durationMs = Date.now() - startTime;

    if (!quiet) {
        const status = result.success ? '✅' : '❌';
        const duration = (result.durationMs / 1000).toFixed(1);
        console.log(`\n${status} ${testInfo.name} completed in ${duration}s`);
    }

    return result;
}

/**
 * Generate consolidated report
 */
function generateReport(results, config, args) {
    const report = {
        timestamp: new Date().toISOString(),
        controller: {
            version: '1.0.0',
            configPath: args.configPath,
            testsRequested: args.tests
        },
        config: {
            baseUrl: config.baseUrl,
            npcCount: config.npcCount,
            rpcCount: config.rpcCount,
            tradingDuration: config.tradingDuration,
            headless: config.headless
        },
        summary: {
            total: results.length,
            passed: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0)
        },
        tests: results
    };

    report.summary.passRate = report.summary.total > 0
        ? Math.round((report.summary.passed / report.summary.total) * 100)
        : 0;

    return report;
}

/**
 * Check if the PHP server is already responding on port 8000.
 */
function isServerRunning(baseUrl) {
    return new Promise(resolve => {
        const url = baseUrl + 'api/session/status.php';
        http.get(url, res => {
            res.resume();
            resolve(true);
        }).on('error', () => resolve(false));
    });
}

/**
 * Start `php -S localhost:8000 -t ..` and wait until it responds.
 * Returns the child process so the caller can kill it when done.
 */
async function startServer() {
    const serverRoot = path.resolve(__dirname, '../..');
    const proc = spawn('php', ['-S', 'localhost:8000', '-t', serverRoot], {
        stdio: 'ignore',
        detached: false
    });

    // Wait up to 10s for the server to respond
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 300));
        if (await isServerRunning('http://localhost:8000/CNDQ/')) return proc;
    }
    proc.kill();
    throw new Error('PHP server did not start within 10 seconds');
}

/**
 * Main entry point
 */
async function main() {
    const args = parseArgs();
    const config = loadConfig(args.configPath, args.overrides);

    if (!args.quiet) {
        console.log('🎮 CNDQ Test Controller');
        console.log('='.repeat(80));
        console.log(`📄 Config: ${args.configPath}`);
        console.log(`📋 Tests: ${args.tests.join(', ')}`);
        console.log(`📊 Report: ${args.reportPath}`);
        if (args.background) console.log('🔇 Running in background mode');
        console.log('='.repeat(80));
    }

    // Start PHP server if not already running
    let serverProc = null;
    if (!(await isServerRunning(config.baseUrl))) {
        if (!args.quiet) console.log('🌐 Starting PHP server on localhost:8000...');
        serverProc = await startServer();
        if (!args.quiet) console.log('   ✅ Server ready\n');
    }

    const results = [];

    // Run each test sequentially with full isolation
    for (const testKey of args.tests) {
        const result = await runTest(testKey, config, args.quiet);
        results.push(result);

        // Small delay between tests to let resources clean up
        if (args.tests.indexOf(testKey) < args.tests.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // Generate and save report
    const report = generateReport(results, config, args);

    try {
        fs.writeFileSync(args.reportPath, JSON.stringify(report, null, 2));
        if (!args.quiet) {
            console.log(`\n📄 Report saved to: ${args.reportPath}`);
        }
    } catch (e) {
        console.error(`⚠️  Failed to save report: ${e.message}`);
    }

    // Print summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));

    results.forEach(result => {
        const status = result.success ? '✅ PASSED' : '❌ FAILED';
        const duration = (result.durationMs / 1000).toFixed(1);
        console.log(`   ${result.name.padEnd(30)} ${status} (${duration}s)`);
        if (!result.success && result.error) {
            console.log(`      Error: ${result.error}`);
        }
    });

    console.log('-'.repeat(80));
    console.log(`   Total: ${report.summary.total} | Passed: ${report.summary.passed} | Failed: ${report.summary.failed} | Pass Rate: ${report.summary.passRate}%`);
    console.log(`   Total Duration: ${(report.summary.totalDurationMs / 1000).toFixed(1)}s`);
    console.log('='.repeat(80));

    const allPassed = report.summary.failed === 0;
    console.log(allPassed ? '\n🎉 All tests passed!' : '\n⚠️  Some tests failed');

    if (serverProc) serverProc.kill();

    process.exit(allPassed ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal controller error:', error);
        // Still try to exit gracefully
        process.exit(1);
    });
}

module.exports = { runTest, loadConfig, generateReport, AVAILABLE_TESTS };
