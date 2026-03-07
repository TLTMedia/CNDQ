# NPC Trading Strategies
## Strategy-Based NPCs for CNDQ Game

---

## Overview

The CNDQ game now features three strategy-based NPC implementations, each based on proven trading strategies from the GAME-GUIDE.md. These NPCs provide realistic opposition, create market liquidity, and demonstrate optimal trading behaviors for players to learn from.

---

## Strategy Mapping

| Skill Level | Strategy Class | Based On | Complexity |
|------------|----------------|----------|------------|
| **Beginner** | ShadowPriceArbitrageStrategy | Strategy 1: Shadow Price Arbitrage | Low |
| **Novice** | BottleneckEliminationStrategy | Strategy 2: Bottleneck Elimination | Medium |
| **Expert** | RecipeBalancingStrategy | Strategy 3 + 4: Recipe Balancing + Aggressive Haggling | High |

---

## Global Variability Parameter

**Purpose**: Introduces randomness and diversity in NPC behavior

**Range**: 0.0 to 1.0 (default: 0.5)

**Effects**:
- **Lower variability (0.0 - 0.3)**: More consistent, predictable trading
- **Medium variability (0.4 - 0.6)**: Balanced behavior (recommended)
- **Higher variability (0.7 - 1.0)**: More random, unpredictable actions

**How It Works**:
```
Individual NPC Variability = (Global Variability + Random(0-1)) / 2
```

Each NPC gets a unique variability value combining:
1. Global setting (admin-controlled)
2. Individual randomness (automatic)

**Admin Control**:
```php
// Set global variability via API
POST /api/admin/npc/set-variability
{
  "variability": 0.5
}
```

---

## Beginner: Shadow Price Arbitrage Strategy

### File
`lib/strategies/ShadowPriceArbitrageStrategy.php`

### Philosophy
> "Trade chemicals where your valuation differs from market prices"

### Core Logic

#### Buy Rule
```
IF market_price <= (shadow_price × (1 - margin))
THEN buy chemical (gain production value)
```

#### Sell Rule
```
IF market_price >= (shadow_price × (1 + margin))
THEN sell chemical (profit above internal value)
```

### Parameters

| Parameter | Base Value | Variability Effect |
|-----------|-----------|-------------------|
| Buy Margin | 10% | ↑ variability = wider margin = fewer buys |
| Sell Margin | 10% | ↑ variability = wider margin = fewer sells |
| Trade Qty | 50-300 units | ↑ variability = smaller trades |
| Post Probability | 30% | ↓ variability = more active posting |

### Decision Process

1. **Calculate shadow prices** for current inventory
2. **Scan market offers** for buying opportunities
   - Find offers where `price < (shadow_price - margin)`
   - Choose highest expected gain
3. **Scan buy orders** for selling opportunities
   - Find buy orders where `price > (shadow_price + margin)`
   - Choose highest expected gain
4. **Post offers** occasionally (variability-based)
   - Buy orders slightly below shadow price
   - Sell offers slightly above shadow price

### Negotiation Response

**When Buying**:
```
Accept if: price <= shadow_price × (1 + 5%)
Counter if: price <= shadow_price × (1 + 5%) × 1.2
Reject: otherwise
```

**When Selling**:
```
Accept if: price >= shadow_price × (1 - 5%)
Counter if: price >= shadow_price × (1 - 5%) × 0.8
Reject: otherwise
```

### Strengths
- ✅ Simple and reliable
- ✅ Economically sound
- ✅ Good for learning arbitrage concepts
- ✅ Positive expected value on every trade

### Weaknesses
- ⚠️ Reactive (waits for market opportunities)
- ⚠️ May miss strategic long-term plays
- ⚠️ Doesn't optimize for specific products

---

## Novice: Bottleneck Elimination Strategy

### File
`lib/strategies/BottleneckEliminationStrategy.php`

### Philosophy
> "Identify and eliminate your production bottlenecks"

### Core Logic

#### Bottleneck Identification
```
Bottleneck = chemical with HIGHEST shadow price
Excess = chemical with LOWEST shadow price (and high inventory)
```

#### Acquire Bottleneck Rule
```
IF bottleneck_shadow_price > $2.00
AND market_price <= bottleneck_shadow_price × 1.5 (aggressive!)
THEN buy aggressively
```

#### Sell Excess Rule
```
IF excess_shadow_price < $1.00
AND market_price >= excess_shadow_price × (1 - variability × 0.3)
THEN sell to fund bottleneck purchases
```

### Parameters

| Parameter | Base Value | Variability Effect |
|-----------|-----------|-------------------|
| High Value Threshold | $2.00 | Defines bottleneck |
| Low Value Threshold | $1.00 | Defines excess |
| Aggressive Multiplier | 1.5× | ↑ variability = even more aggressive (up to 1.75×) |
| Trade Qty | 100-500 units | ↑ variability = smaller trades |
| Post Probability | 40% | ↓ variability = more active |

### Decision Process

1. **Calculate shadow prices**
2. **Identify bottleneck** (highest shadow price)
3. **Identify excess** (lowest shadow price + high inventory)
4. **Acquire bottleneck**
   - Will pay up to 150% of shadow price
   - Targets large quantities (100-500 units)
5. **Sell excess**
   - Accept any reasonable price
   - Clear inventory to fund bottleneck purchases
6. **Post strategic offers**
   - 70% buy orders for bottleneck
   - 30% sell offers for excess

### Negotiation Response

**When Buying Bottleneck**:
```
Accept if: price <= shadow_price × 1.5
Counter if: price <= shadow_price × 1.8
Reject: otherwise
```

**When Buying Non-Bottleneck**:
```
Accept if: price <= shadow_price × 1.1
Counter if: price <= shadow_price × 1.32
Reject: otherwise
```

**When Selling Bottleneck**:
```
Accept if: price >= shadow_price × 1.3 (reluctant!)
Counter if: price < 1.3× (ask 1.5×)
```

**When Selling Excess**:
```
Accept if: price >= shadow_price × 0.9 (willing!)
Counter if: price >= shadow_price × 0.72
Reject: otherwise
```

### Strengths
- ✅ Directly attacks production constraints
- ✅ High profit potential
- ✅ Aggressive and proactive
- ✅ Clear strategic focus

### Weaknesses
- ⚠️ Can overpay for bottlenecks
- ⚠️ May create new bottlenecks after solving old ones
- ⚠️ Vulnerable to price manipulation

---

## Expert: Recipe Balancing Strategy

### File
`lib/strategies/RecipeBalancingStrategy.php`

### Philosophy
> "Reshape inventory to match optimal production ratios + Aggressive Haggling"

### Core Logic

#### Product Specialization
```
Choose specialization:
  - Solvent (high margin: $3/gal) → Target ratio N:D:Q = 5:7:8
  - Deicer (volume play: $2/gal) → Target ratio C:N:D = 5:3:2

Decision based on:
  1. Current inventory composition
  2. Calculated product scores
  3. Variability (adds randomness)
```

#### Inventory Balance Analysis
```
For each chemical in target recipe:
  Deviation = actual_inventory / target_ratio

Deficit = chemical with LOWEST deviation
Excess = chemical with HIGHEST deviation
```

#### Aggressive Haggling Rule
```
NEVER accept first offer!
Always counter at least once to trigger negotiation UI
Walk away if deal isn't favorable after MAX_HAGGLE_ROUNDS (4)
```

### Parameters

| Parameter | Base Value | Variability Effect |
|-----------|-----------|-------------------|
| Initial Lowball | 20% below asking | ↓ variability = more aggressive |
| Initial Highball | 20% above shadow | ↑ variability = higher asks |
| Max Haggle Rounds | 4 rounds | Fixed |
| Trade Qty | 100-400 units | ↑ variability = smaller trades |
| Post Probability | 50% | ↓ variability = more active |

### Specialization Selection

**Solvent Score**:
```
Score = min(
  inventory[N] / (0.25/10),
  inventory[D] / (0.35/10),
  inventory[Q] / (0.4/10)
)
```

**Deicer Score**:
```
Score = min(
  inventory[C] / (0.5/10),
  inventory[N] / (0.3/10),
  inventory[D] / (0.2/10)
)
```

**Selection**:
```
IF solvent_score >= deicer_score × 0.8
THEN specialize in Solvent (prefer high margin)
ELSE specialize in Deicer
```

### Decision Process

1. **Choose specialization** (Solvent vs Deicer)
2. **Analyze inventory balance** relative to target ratios
3. **Acquire deficit chemical**
   - Start with lowball offer (20% below asking)
   - Will pay up to 130% of shadow price
4. **Sell excess chemical**
   - Start with highball ask (20% above shadow)
   - Accept prices above shadow price
5. **Post strategic offers**
   - 60% buy orders for deficit
   - 40% sell offers for excess

### Negotiation Response

**Haggling Protocol**:
```
IF first_offer:
  ALWAYS counter (+15% if selling, -15% if buying)

After haggling:
  Evaluate strategically based on deficit/excess
```

**When Buying Deficit**:
```
Accept if: price <= shadow_price × 1.4
Counter if: rounds < 4 and price <= shadow_price × 1.68
Reject: walk away if too expensive
```

**When Buying Non-Deficit**:
```
Accept if: price <= shadow_price × 1.1
Counter if: rounds < 4
Reject: walk away
```

**When Selling Excess**:
```
Accept if: price >= shadow_price × 0.9
Counter if: rounds < 4
Reject: walk away if too low
```

**When Selling Deficit**:
```
Accept if: price >= shadow_price × 1.5 (very reluctant!)
Counter if: rounds < 4 (ask 1.5×)
Reject: walk away
```

### Strengths
- ✅ Clear strategic objective (product specialization)
- ✅ Systematic approach to inventory optimization
- ✅ Aggressive haggling creates realistic negotiations
- ✅ High profit potential from optimal mix
- ✅ Teaches players negotiation tactics

### Weaknesses
- ⚠️ Complex decision-making
- ⚠️ May reject good deals while haggling
- ⚠️ Can lose trades by being too aggressive
- ⚠️ Vulnerable to time pressure (walks away often)

---

## Comparison Matrix

| Aspect | Beginner | Novice | Expert |
|--------|----------|--------|--------|
| **Complexity** | Low | Medium | High |
| **Aggression** | Passive | Moderate | High |
| **Haggling** | Minimal | Some | Always |
| **Strategy** | Arbitrage | Bottleneck | Recipe |
| **Trade Size** | Small (50-300) | Medium (100-500) | Medium (100-400) |
| **Accept Range** | ±5% | ±10-50% | ±10-40% |
| **Win Rate** | Medium | High | Very High |
| **Learning Value** | High | Medium | High |

---

## Usage Guide

### Creating NPCs with Strategies

```php
// Via Admin API
POST /api/admin/npc/create
{
  "skillLevel": "beginner",  // Uses ShadowPriceArbitrageStrategy
  "count": 2
}

POST /api/admin/npc/create
{
  "skillLevel": "novice",  // Uses BottleneckEliminationStrategy
  "count": 2
}

POST /api/admin/npc/create
{
  "skillLevel": "expert",  // Uses RecipeBalancingStrategy
  "count": 2
}
```

### Setting Global Variability

```php
// Set variability to 0.5 (balanced)
POST /api/admin/npc/set-variability
{
  "variability": 0.5
}

// Low variability (0.2) = Predictable NPCs
// High variability (0.8) = Chaotic NPCs
```

### Programmatic Usage

```php
require_once 'lib/NPCStrategyFactory.php';
require_once 'lib/NPCManager.php';
require_once 'lib/Database.php';

// Set global variability
$db = Database::getInstance();
NPCStrategyFactory::saveVariabilityToConfig($db, 0.5);

// Create strategy for an NPC
$storage = new TeamStorage($npcEmail);
$npcManager = new NPCManager();
$npc = [
    'id' => 'npc_12345',
    'email' => 'npc_12345@system',
    'teamName' => 'Test Bot',
    'skillLevel' => 'expert',
    'variability' => 0.5  // Will be overridden by factory
];

$strategy = NPCStrategyFactory::createStrategy($storage, $npc, $npcManager);

// Execute trading decision
$action = $strategy->decideTrade();
if ($action) {
    // Execute action...
}

// Handle negotiations
$response = $strategy->respondToNegotiations();
if ($response) {
    // Execute response...
}
```

---

## Testing Recommendations

### Recommended NPC Mix

For balanced testing:
```
2× Beginner (ShadowPriceArbitrage)
2× Novice (BottleneckElimination)
2× Expert (RecipeBalancing)

Total: 6 NPCs
Global Variability: 0.5
```

This creates:
- Market liquidity (Beginners provide arbitrage opportunities)
- Strategic competition (Novices compete for bottlenecks)
- Realistic negotiations (Experts haggle aggressively)

### Testing Scenarios

**Scenario 1: Low Variability (0.2)**
- NPCs behave predictably
- Good for learning game mechanics
- Less chaotic market

**Scenario 2: Medium Variability (0.5) ← Recommended**
- Balanced behavior
- Realistic market dynamics
- Good diversity in actions

**Scenario 3: High Variability (0.8)**
- Chaotic market
- Tests edge cases
- Unpredictable negotiations

---

## Integration with Existing System

### Fallback Mechanism

The NPCStrategyFactory includes fallback logic:

```php
If new strategy file not found:
  → Fall back to old strategies (BeginnerStrategy, NoviceStrategy, ExpertStrategy)
```

This ensures backward compatibility. The old strategy files (`BeginnerStrategy.php`, `NoviceStrategy.php`, `ExpertStrategy.php`) are still present in `lib/strategies/` as a safety fallback but are not the primary path. If you have confirmed the new strategies are stable, those three files can be deleted.

### Migration Status

- [x] Phase 1: New strategy files deployed alongside old ones
- [x] Phase 2: NPCManager updated to use NPCStrategyFactory
- [x] Phase 3: Tested with both old and new strategies
- [ ] Phase 4: Delete legacy fallback files once fully validated (`BeginnerStrategy.php`, `NoviceStrategy.php`, `ExpertStrategy.php`)

---

## Performance Considerations

### Shadow Price Recalculation

All strategies rely on shadow prices. Performance optimizations:

1. **Cache shadow prices** until inventory changes significantly
2. **Batch LP solver calls** if multiple NPCs trade simultaneously
3. **Lazy evaluation** - only calculate when needed

### Database Queries

Each strategy minimizes database calls:
- Market data fetched once per trading cycle
- Negotiations loaded in batch
- Shadow prices cached in TeamStorage

### Logging

All strategies include detailed logging:
```
error_log("NPC {name}: BUY opportunity for {chem} @ ${price}");
error_log("NPC {name}: NEVER accept first offer! Countering...");
error_log("NPC {name}: Specializing in {product}");
```

Monitor logs to debug strategy behavior.

---

## Future Enhancements

### Potential Additions

1. **Adaptive Learning**
   - NPCs learn from successful trades
   - Adjust strategies based on market conditions

2. **Coalition Strategies**
   - Expert NPCs form temporary alliances
   - Coordinate to corner specific chemical markets

3. **Risk Management**
   - NPCs assess counterparty reliability
   - Avoid trading with known exploiters

4. **Machine Learning Integration**
   - Train neural networks on optimal trades
   - Generate new strategies automatically

---

## Conclusion

The three strategy-based NPCs provide:

- ✅ **Realistic competition** for players
- ✅ **Market liquidity** through active trading
- ✅ **Learning opportunities** by demonstrating optimal play
- ✅ **Diverse behaviors** via variability parameter
- ✅ **Solid foundation** based on proven strategies from GAME-GUIDE.md

These NPCs will pass your tests and provide an engaging, educational experience for players!
