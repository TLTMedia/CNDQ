# CNDQ API Documentation

Welcome to the CNDQ (Chemical Name-Drop Quote) Marketplace API documentation.

## Quick Start

### View Interactive Documentation

Access the interactive Swagger UI documentation:

1. **Via Web Server**: Navigate to `/api-docs.php` in your browser
2. **Standalone**: Open `docs/index.html` in your browser

### API Base URL

All API endpoints are prefixed with `/api/`:

```
/api/session/status
/api/marketplace/offers
/api/offers/create
etc.
```

## Authentication

Most API endpoints require authentication via session cookies (except `/api/session/status`).

Users must be logged in through **Shibboleth** (university SSO). In local development, the `dev.php` page bypasses authentication for testing. The session cookie `PHPSESSID` is automatically managed by the browser.

## Game Flow

The CNDQ marketplace operates in phases:

1. **TRADING** - Players can create offers, negotiate, and execute trades
2. **PRODUCTION** - Production calculations run, market is locked
3. **STOPPED** - Game is paused by admin

Check the current phase using `/api/session/status`.

## Core Concepts

### Chemicals

Four types of chemicals can be traded:
- **C** - Carbon
- **N** - Nitrogen
- **D** - Deuterium
- **Q** - Quantum particles

### Trade Types

- **sell** - Offering to sell chemicals you own
- **buy** - Creating a buy order for chemicals you want

### Offers vs Buy Orders

- **Offers** (sell orders) - You post what you're selling
- **Buy Orders** - You post what you want to buy
- Both appear in the marketplace for other teams to see

### Negotiations

Private 1-on-1 negotiations between teams:
- Initiate a negotiation with a specific team
- Make counter-offers back and forth
- Accept or reject the final terms
- Can be tied to advertisements

### Advertisements

Public messages to attract trading partners:
- Post what you're looking to buy or sell
- Other teams can initiate negotiations based on your ad
- Limited to 280 characters

## API Endpoints by Category

### Session Management

- `GET /api/session/status` - Get current session, phase, and timer (public)
- `POST /api/session/status` - Acknowledge production results

### Marketplace

- `GET /api/marketplace/offers` - View all active offers and buy orders
  - Query param: `?chemical=C` or `?chemical=C,N,D` to filter

### Your Offers

- `POST /api/offers/create` - Create a sell offer
- `POST /api/offers/bid` - Create a buy order
- `POST /api/offers/cancel` - Cancel an offer

### Negotiations

- `GET /api/negotiations/list` - List your negotiations
- `POST /api/negotiations/initiate` - Start a negotiation
- `POST /api/negotiations/accept` - Accept current offer
- `POST /api/negotiations/counter` - Make counter-offer
- `POST /api/negotiations/reject` - Reject negotiation
- `POST /api/negotiations/react` - Add emoji reaction

### Buy Listings (Advertisements)

- `GET /api/listings/list` - View all active buy listings
- `GET /api/listings/my-listings` - View your own buy listings
- `POST /api/listings/post` - Post a buy listing
- `POST /api/listings/cancel` - Cancel a buy listing

### Game Data

- `GET /api/production/results` - Your production results
- `GET /api/production/shadow-prices` - Current shadow prices
- `GET /api/leaderboard/standings` - Team rankings
- `GET /api/notifications/list` - Your notifications

### Team Settings

- `GET /api/team/settings` - Get team profile
- `POST /api/team/settings` - Update team settings

### Admin Endpoints (Protected)

- `GET/POST /api/admin/session` - Control game session
- `POST /api/admin/reset-game` - Reset game state
- `GET /api/admin/npc/list` - List NPC teams
- `POST /api/admin/npc/create` - Create NPC
- `POST /api/admin/npc/delete` - Delete NPC
- `POST /api/admin/npc/toggle` - Enable/disable NPC
- `POST /api/admin/npc/toggle-system` - Enable/disable NPC system

## Common Request/Response Patterns

### Standard Success Response

```json
{
  "success": true,
  "message": "Operation completed",
  "data": { ... }
}
```

### Standard Error Response

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

### HTTP Status Codes

- `200` - Success
- `400` - Bad Request (invalid data)
- `401` - Unauthorized (not logged in)
- `403` - Forbidden (wrong phase, not admin, etc.)
- `405` - Method Not Allowed (wrong HTTP method)
- `500` - Server Error

## Example API Calls

### Check Session Status

```bash
curl https://your-domain.com/api/session/status
```

Response:
```json
{
  "success": true,
  "session": 3,
  "phase": "TRADING",
  "timeRemaining": 180,
  "autoAdvance": true,
  "productionJustRan": null,
  "gameStopped": false
}
```

### View Marketplace Offers

```bash
curl https://your-domain.com/api/marketplace/offers?chemical=C \
  -H "Cookie: PHPSESSID=your-session-id"
```

### Create a Sell Offer

```bash
curl -X POST https://your-domain.com/api/offers/create \
  -H "Content-Type: application/json" \
  -H "Cookie: PHPSESSID=your-session-id" \
  -d '{
    "chemical": "C",
    "quantity": 100,
    "minPrice": 5.50
  }'
```

### Initiate a Negotiation

```bash
curl -X POST https://your-domain.com/api/negotiations/initiate \
  -H "Content-Type: application/json" \
  -H "Cookie: PHPSESSID=your-session-id" \
  -d '{
    "responderId": "team@example.com",
    "chemical": "N",
    "quantity": 50,
    "price": 8.25,
    "type": "buy"
  }'
```

## Phase Restrictions

### During TRADING Phase

✅ Allowed:
- Create/cancel offers and buy orders
- Initiate/respond to negotiations
- Post advertisements
- Execute trades

### During PRODUCTION Phase

❌ Blocked:
- All trading activities
- Creating new offers
- Starting negotiations

✅ Allowed:
- View marketplace (read-only)
- View production results
- Check notifications

### When Game is STOPPED

❌ Almost all actions blocked
✅ Only viewing/reading allowed

## Rate Limiting & Caching

The marketplace uses a 3-second cache for `/api/marketplace/offers` to improve performance. Frequent polling is acceptable.

## WebSocket Support

Not yet implemented. Currently uses polling for real-time updates.

## Data Models

See the [OpenAPI Specification](openapi.yaml) for detailed schema definitions of:
- Offer
- BuyOrder
- Negotiation
- Advertisement
- And more...

## Development

### Testing the API

Use the interactive Swagger UI to test endpoints directly in your browser:

1. Navigate to `/api-docs.php`
2. Click "Try it out" on any endpoint
3. Fill in parameters
4. Click "Execute"
5. View the response

### Validation

All endpoints validate:
- Required fields are present
- Data types are correct
- Chemical codes are valid (C, N, D, Q)
- Quantities and prices are positive
- Trading is allowed in current phase

### Error Handling

The API returns descriptive error messages. Common errors:

- `"Not authenticated"` - Session expired or not logged in
- `"Trading not allowed"` - Wrong game phase
- `"Invalid chemical"` - Chemical must be C, N, D, or Q
- `"Insufficient inventory"` - Don't have enough to sell
- `"Cannot negotiate with yourself"` - Need to trade with another team

## Support

For bugs or feature requests, contact the game administrator.

## Version History

- **v1.0.0** - Initial API documentation (2026-01-05)
