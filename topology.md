# CNDQ Development Topology

This document describes the local development environment setup where the application resides in a subdirectory.

## Production vs. Development Parity

- **Production Environment**: The live application is hosted inside a subdirectory named `CNDQ`.
  - *Example URL*: `https://production.server.com/CNDQ/index.php`

- **Local Development (Herd/Valet)**: The web server root is the parent directory of the repository. This mimics the production subdirectory structure.
  - *Structure*: `[Web Root]/CNDQ/`
  - *Emulated URL*: `http://cndq.test/CNDQ/`

## Path Handling Strategy

The application uses **relative paths** (`./` and `../`) throughout, which automatically work regardless of the subdirectory name or URL casing.

### 1. Asset & API Pathing

All paths use relative references based on the current page location:

- **Root-level pages** (index.php): Use `./` prefix
  ```html
  <link rel="stylesheet" href="./css/styles.css">
  <script type="module" src="./js/marketplace.js"></script>
  ```

- **Subdirectory pages** (admin/index.php): Use `../` prefix
  ```html
  <link rel="stylesheet" href="../css/styles.css">
  ```

- **JavaScript API calls** (js/api.js): Automatically detect page depth
  ```javascript
  // Root pages: ./api/endpoint.php
  // Admin pages: ../api/endpoint.php
  if (path.includes('/admin/')) {
      this.pathPrefix = '../';
  } else {
      this.pathPrefix = './';
  }
  ```

### 2. Benefits of Relative Paths

- **No case sensitivity issues**: Works with `/CNDQ`, `/cndq`, or any subdirectory name
- **Simpler codebase**: No complex path detection or configuration variables needed
- **Standards-compliant**: Uses standard HTML/HTTP relative path resolution
- **Production-ready**: Works identically in subdirectory deployments

### 3. Testing (Puppeteer & Playwright)

Automated tests use absolute URLs but work seamlessly with relative paths:
- **`baseUrl` Configuration**: All test configurations (`tests/test-config.json`, `tests/haggle-test.js`, `tests/playwright/config.js`, etc.) set their `baseUrl` to `http://cndq.test/CNDQ/`.
- **Authentication**: Cookie paths are set to `/` to work across all pages.
- **Relative path resolution**: Once the test navigates to a page, all relative paths (like `./api/endpoint.php`) are resolved by the browser relative to that page's location.
