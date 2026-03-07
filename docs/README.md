# CNDQ Documentation

Documentation for the CNDQ Marketplace game.

## API Documentation

The CNDQ API is fully documented using OpenAPI 3.0 (Swagger).

### Access Documentation

**Interactive Swagger UI** (Recommended):
- Navigate to `/api-docs.php` in your web browser
- Try out endpoints directly in the browser
- See request/response examples
- Test with your session

**Static Documentation**:
- Read [API.md](API.md) for a comprehensive guide
- View [openapi.yaml](openapi.yaml) for the raw OpenAPI spec

### Quick Links

- **[API Overview](API.md)** - Complete API documentation
- **[OpenAPI Spec](openapi.yaml)** - Machine-readable API specification
- **[Swagger UI](../api-docs.php)** - Interactive API explorer

## Other Documentation

- **[Database Guide](DATA.md)** - Database structure and initialization
- **[Professor Setup Guide](PROFESSOR-SETUP.md)** - Zero-to-running guide for Windows, no GUI installers, screen-reader friendly

## For Developers

### Testing the API

1. Start your local server (Laravel Herd, XAMPP, etc.)
2. Navigate to `http://your-domain.local/api-docs.php`
3. Log in to get a session cookie
4. Use "Try it out" in Swagger UI to test endpoints

### API Endpoints

All endpoints are under `/api/`:

```
/api/session/status          - Session and phase info
/api/marketplace/offers      - View marketplace
/api/offers/create           - Create offers
/api/negotiations/initiate   - Start negotiations
/api/listings/post           - Post buy listings
... and more
```

See [API.md](API.md) for the complete list.

### Authentication

Most endpoints require authentication via session cookies. The `/api/session/status` endpoint is public and doesn't require authentication.

### Making API Calls

**JavaScript (fetch)**:
```javascript
// Get session status (public)
const response = await fetch('/api/session/status');
const data = await response.json();

// Create an offer (requires auth)
const response = await fetch('/api/offers/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  credentials: 'include', // Include session cookie
  body: JSON.stringify({
    chemical: 'C',
    quantity: 100,
    minPrice: 5.50
  })
});
```

**cURL**:
```bash
# Get session status
curl https://your-domain.com/api/session/status

# Create an offer
curl -X POST https://your-domain.com/api/offers/create \
  -H "Content-Type: application/json" \
  -H "Cookie: PHPSESSID=your-session-id" \
  -d '{"chemical":"C","quantity":100,"minPrice":5.50}'
```

## Game Documentation

### Chemicals

- **C** - Carbon
- **N** - Nitrogen
- **D** - Deuterium
- **Q** - Quantum particles

### Game Phases

1. **TRADING** - Market open, players can trade
2. **PRODUCTION** - Production calculations running, market locked
3. **STOPPED** - Game paused by administrator

### Features

- **Marketplace** - Public offers and buy orders
- **Negotiations** - Private 1-on-1 trading
- **Advertisements** - Attract trading partners
- **Production** - Generate chemicals and earn points
- **Leaderboard** - Team rankings
- **NPC Teams** - AI-controlled teams (admin feature)

## Contributing

When adding new API endpoints:

1. Add the endpoint to [openapi.yaml](openapi.yaml)
2. Update [API.md](API.md) if needed
3. Test using Swagger UI at `/api-docs.php`
4. Follow existing patterns for request/response formats

## Questions?

Contact the game administrator or check the code comments in the PHP files.
