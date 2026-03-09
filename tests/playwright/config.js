/**
 * Shared configuration for Playwright tests
 */

const CONFIG = {
    baseUrl: 'http://localhost:8000/CNDQ/',
    adminUser: 'admin@stonybrook.edu',
    testUsers: [
        'test_mail1@stonybrook.edu',
        'test_mail2@stonybrook.edu',
        'test_mail3@stonybrook.edu'
    ],
    headless: true, // Default to headless
    verbose: process.argv.includes('--verbose') || process.argv.includes('-v'),
};

module.exports = CONFIG;
