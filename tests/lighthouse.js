/**
 * Lighthouse Test
 *
 * Comprehensive testing using Google Lighthouse
 * Tests: Accessibility, Performance, Best Practices, SEO
 */

const lighthouse = require('lighthouse').default;
const BrowserHelper = require('./helpers/browser');
const ReportingHelper = require('./helpers/reporting');
const fs = require('fs');
const path = require('path');

class LighthouseTest {
    constructor(config, browserHelper) {
        this.config = config;
        this.browser = browserHelper;
        this.outputDir = config.outputDir || './lighthouse-reports';
    }

    async run() {
        ReportingHelper.printHeader('Lighthouse Audit');

        ReportingHelper.printInfo(`Base URL: ${this.config.baseUrl}`);
        ReportingHelper.printInfo(`Testing ${this.config.pages.length} page(s)`);

        this.ensureOutputDir();

        try {
            const browser = await this.browser.getBrowser();
            const endpoint = browser.wsEndpoint();
            const endpointURL = new URL(endpoint);

            const results = [];

            for (const pageConfig of this.config.pages) {
                const result = await this.testPage(endpointURL.port, pageConfig.url, pageConfig.name);
                results.push(result);
            }

            this.printResults(results);
            await this.saveResults(results);

            const allPassed = results.every(r => r.success);
            return { success: allPassed };

        } catch (error) {
            ReportingHelper.printError(`Lighthouse test failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async testPage(port, url, pageName) {
        try {
            const fullUrl = `${this.config.baseUrl}${url}`;
            ReportingHelper.printInfo(`Testing: ${pageName}`);

            const options = {
                logLevel: 'error',
                output: 'json',
                onlyCategories: ['accessibility', 'best-practices', 'seo', 'performance'],
                port: port,
                disableStorageReset: true
            };

            const runnerResult = await lighthouse(fullUrl, options);
            const { lhr } = runnerResult;

            const scores = {
                accessibility: lhr.categories.accessibility.score * 100,
                performance: lhr.categories.performance.score * 100,
                bestPractices: lhr.categories['best-practices'].score * 100,
                seo: lhr.categories.seo.score * 100
            };

            // Get accessibility issues
            const accessibilityAudits = Object.entries(lhr.audits)
                .filter(([_, audit]) =>
                    audit.score !== null &&
                    audit.score < 1 &&
                    lhr.categories.accessibility.auditRefs.some(ref => ref.id === audit.id)
                )
                .map(([id, audit]) => ({
                    id,
                    title: audit.title,
                    description: audit.description,
                    score: audit.score
                }));

            const success = scores.accessibility >= (this.config.minAccessibilityScore || 90);

            return {
                pageName,
                url,
                scores,
                accessibilityAudits,
                success,
                report: lhr
            };
        } catch (error) {
            return {
                pageName,
                url,
                scores: {},
                accessibilityAudits: [],
                success: false,
                error: error.message
            };
        }
    }

    printResults(results) {
        results.forEach(result => {
            ReportingHelper.printSubHeader(`${result.pageName}`);

            if (result.error) {
                ReportingHelper.printError(`Test failed: ${result.error}`);
                return;
            }

            console.log('');
            console.log(`  📊 Scores:`);
            console.log(`     Accessibility:  ${this.formatScore(result.scores.accessibility)}`);
            console.log(`     Performance:    ${this.formatScore(result.scores.performance)}`);
            console.log(`     Best Practices: ${this.formatScore(result.scores.bestPractices)}`);
            console.log(`     SEO:            ${this.formatScore(result.scores.seo)}`);

            if (result.accessibilityAudits.length > 0) {
                console.log('');
                console.log(`  ⚠️  Accessibility Issues (${result.accessibilityAudits.length}):`);
                result.accessibilityAudits.forEach(audit => {
                    console.log(`     • ${audit.title} (${Math.round(audit.score * 100)}%)`);
                });
            } else {
                console.log('');
                ReportingHelper.printSuccess('No accessibility issues found!');
            }
            console.log('');
        });

        // Print summary
        ReportingHelper.printHeader('Test Summary');
        const avgScores = this.calculateAverageScores(results);
        console.log(`\nAverage Scores:`);
        console.log(`  Accessibility:  ${this.formatScore(avgScores.accessibility)}`);
        console.log(`  Performance:    ${this.formatScore(avgScores.performance)}`);
        console.log(`  Best Practices: ${this.formatScore(avgScores.bestPractices)}`);
        console.log(`  SEO:            ${this.formatScore(avgScores.seo)}`);
    }

    formatScore(score) {
        const color = score >= 90 ? '\x1b[32m' : score >= 50 ? '\x1b[33m' : '\x1b[31m';
        const reset = '\x1b[0m';
        return `${color}${Math.round(score)}${reset}`;
    }

    calculateAverageScores(results) {
        const validResults = results.filter(r => !r.error);
        if (validResults.length === 0) return { accessibility: 0, performance: 0, bestPractices: 0, seo: 0 };

        const sum = validResults.reduce((acc, r) => ({
            accessibility: acc.accessibility + r.scores.accessibility,
            performance: acc.performance + r.scores.performance,
            bestPractices: acc.bestPractices + r.scores.bestPractices,
            seo: acc.seo + r.scores.seo
        }), { accessibility: 0, performance: 0, bestPractices: 0, seo: 0 });

        return {
            accessibility: sum.accessibility / validResults.length,
            performance: sum.performance / validResults.length,
            bestPractices: sum.bestPractices / validResults.length,
            seo: sum.seo / validResults.length
        };
    }

    ensureOutputDir() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    async saveResults(results) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const jsonPath = path.join(this.outputDir, `lighthouse-report-${timestamp}.json`);

        const summary = {
            timestamp: new Date().toISOString(),
            results: results.map(r => ({
                pageName: r.pageName,
                url: r.url,
                scores: r.scores,
                accessibilityAudits: r.accessibilityAudits,
                success: r.success,
                error: r.error
            })),
            averageScores: this.calculateAverageScores(results)
        };

        fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
        ReportingHelper.printSuccess(`JSON report saved: ${jsonPath}`);
    }
}

module.exports = LighthouseTest;
