'use strict';

const { v4: uuidv4 } = require('uuid');
const Card = require('../../models/Card');
const User = require('../../models/User');
const config = require('../../config/config');
const { FootballApiManager } = require('../FootballApiManager');
const { CURRENT_SEASON } = require('../../constants/leagues');

// Top 100 footballers pool for card generation
const PLAYER_POOL = [
  { id: '874', name: 'Lionel Messi', team: 'Inter Miami', pos: 'Attacker', nationality: 'Argentina' },
  { id: '306', name: 'Cristiano Ronaldo', team: 'Al Nassr', pos: 'Attacker', nationality: 'Portugal' },
  { id: '1100', name: 'Kylian Mbappé', team: 'Real Madrid', pos: 'Attacker', nationality: 'France' },
  { id: '1467', name: 'Erling Haaland', team: 'Manchester City', pos: 'Attacker', nationality: 'Norway' },
  { id: '1485', name: 'Vinicius Jr', team: 'Real Madrid', pos: 'Attacker', nationality: 'Brazil' },
  { id: '154', name: 'Mohamed Salah', team: 'Liverpool', pos: 'Attacker', nationality: 'Egypt' },
  { id: '521', name: 'Kevin De Bruyne', team: 'Manchester City', pos: 'Midfielder', nationality: 'Belgium' },
  { id: '284', name: 'Luka Modrić', team: 'Real Madrid', pos: 'Midfielder', nationality: 'Croatia' },
  { id: '276', name: 'Toni Kroos', team: 'Real Madrid', pos: 'Midfielder', nationality: 'Germany' },
  { id: '19', name: 'Neymar Jr', team: 'Al Hilal', pos: 'Attacker', nationality: 'Brazil' },
  { id: '389', name: 'Robert Lewandowski', team: 'FC Barcelona', pos: 'Attacker', nationality: 'Poland' },
  { id: '909', name: 'Harry Kane', team: 'Bayern Munich', pos: 'Attacker', nationality: 'England' },
  { id: '303', name: 'Bukayo Saka', team: 'Arsenal', pos: 'Attacker', nationality: 'England' },
  { id: '2295', name: 'Pedri', team: 'FC Barcelona', pos: 'Midfielder', nationality: 'Spain' },
  { id: '1468', name: 'Jude Bellingham', team: 'Real Madrid', pos: 'Midfielder', nationality: 'England' },
  { id: '184', name: 'Trent Alexander-Arnold', team: 'Real Madrid', pos: 'Defender', nationality: 'England' },
  { id: '723', name: 'Virgil van Dijk', team: 'Liverpool', pos: 'Defender', nationality: 'Netherlands' },
  { id: '2786', name: 'Gavi', team: 'FC Barcelona', pos: 'Midfielder', nationality: 'Spain' },
  { id: '910', name: 'Declan Rice', team: 'Arsenal', pos: 'Midfielder', nationality: 'England' },
  { id: '780', name: 'Marcus Rashford', team: 'Manchester United', pos: 'Attacker', nationality: 'England' },
  { id: '633', name: 'Antoine Griezmann', team: 'Atletico Madrid', pos: 'Attacker', nationality: 'France' },
  { id: '154', name: 'Son Heung-min', team: 'Tottenham', pos: 'Attacker', nationality: 'South Korea' },
  { id: '626', name: 'Bernardo Silva', team: 'Manchester City', pos: 'Midfielder', nationality: 'Portugal' },
  { id: '627', name: 'Rúben Dias', team: 'Manchester City', pos: 'Defender', nationality: 'Portugal' },
  { id: '19200', name: 'Rodri', team: 'Manchester City', pos: 'Midfielder', nationality: 'Spain' },
  { id: '288', name: 'Joshua Kimmich', team: 'Bayern Munich', pos: 'Midfielder', nationality: 'Germany' },
  { id: '759', name: 'Sadio Mané', team: 'Al Nassr', pos: 'Attacker', nationality: 'Senegal' },
  { id: '162', name: 'Raheem Sterling', team: 'Chelsea', pos: 'Attacker', nationality: 'England' },
  { id: '874', name: 'Phil Foden', team: 'Manchester City', pos: 'Midfielder', nationality: 'England' },
  { id: '22', name: 'Alisson Becker', team: 'Liverpool', pos: 'Goalkeeper', nationality: 'Brazil' },
  { id: '2460', name: 'Manuel Neuer', team: 'Bayern Munich', pos: 'Goalkeeper', nationality: 'Germany' },
  { id: '882', name: 'Jan Oblak', team: 'Atletico Madrid', pos: 'Goalkeeper', nationality: 'Slovenia' },
  { id: '745', name: 'Karim Benzema', team: 'Al Ittihad', pos: 'Attacker', nationality: 'France' },
  { id: '1412', name: 'Rafael Leão', team: 'AC Milan', pos: 'Attacker', nationality: 'Portugal' },
  { id: '3118', name: 'Jamal Musiala', team: 'Bayern Munich', pos: 'Midfielder', nationality: 'Germany' },
  { id: '2295', name: 'Florian Wirtz', team: 'Bayer Leverkusen', pos: 'Midfielder', nationality: 'Germany' },
];

/**
 * Generates realistic card stats based on rarity and position.
 */
function generateStats(rarity, position) {
  const base = { common: 55, rare: 68, epic: 78, legendary: 87, limited: 92, seasonal: 85 };
  const baseVal = base[rarity] || 60;
  const variance = () => Math.floor(Math.random() * 10) - 5;

  const isGK = position === 'Goalkeeper';
  const isDef = position === 'Defender';
  const isMid = position === 'Midfielder';
  const isAtt = position === 'Attacker';

  const pace = Math.min(99, Math.max(40, baseVal + variance() + (isAtt ? 8 : isDef ? -5 : 0)));
  const shooting = Math.min(99, Math.max(30, baseVal + variance() + (isAtt ? 10 : isDef ? -15 : isGK ? -30 : 0)));
  const passing = Math.min(99, Math.max(50, baseVal + variance() + (isMid ? 8 : isGK ? -5 : 0)));
  const dribbling = Math.min(99, Math.max(40, baseVal + variance() + (isAtt ? 8 : isGK ? -20 : 0)));
  const defending = Math.min(99, Math.max(30, baseVal + variance() + (isDef ? 12 : isAtt ? -15 : isGK ? -10 : 0)));
  const physical = Math.min(99, Math.max(50, baseVal + variance()));
  const overall = Math.floor((pace + shooting + passing + dribbling + defending + physical) / 6);

  return { pace, shooting, passing, dribbling, defending, physical, overall };
}

/**
 * Selects a rarity based on pack weights.
 */
function rollRarity(packType) {
  const weights = config.cards.rarityWeights[packType];
  const roll = Math.random() * 100;
  let cumulative = 0;

  for (const [rarity, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (roll < cumulative) return rarity;
  }
  return 'common';
}

/**
 * CardService handles card pack opening, listing, and management.
 */
class CardService {
  constructor(cacheService) {
    this.cache = cacheService;
  }

  /**
   * Opens a card pack for a user. Deducts coins, generates cards, saves to DB.
   */
  async openPack(userId, packType = 'basic') {
    const price = config.cards.packPrices[packType];
    const count = config.cards.cardsPerPack[packType];

    if (!price || !count) throw new Error(`Invalid pack type: ${packType}`);

    const user = await User.findOne({ userId });
    if (!user) throw new Error('User not found');
    if (!user.deductCoins(price)) throw new Error(`Insufficient coins. Need ${price} GoalCoins.`);

    const generatedCards = [];

    for (let i = 0; i < count; i++) {
      const rarity = rollRarity(packType);
      const playerData = PLAYER_POOL[Math.floor(Math.random() * PLAYER_POOL.length)];
      const stats = generateStats(rarity, playerData.pos);

      const card = new Card({
        cardId: uuidv4(),
        ownerId: userId,
        playerId: playerData.id,
        playerName: playerData.name,
        teamName: playerData.team,
        nationality: playerData.nationality,
        position: playerData.pos,
        rarity,
        season: `${CURRENT_SEASON}-${(CURRENT_SEASON + 1).toString().slice(2)}`,
        stats,
        obtainedFrom: 'pack',
      });

      await card.save();
      generatedCards.push(card);
    }

    user.packsOpened += 1;
    user.cardsOwned += count;
    user.addXp(count * 15);
    await user.save();

    return { cards: generatedCards, coinsSpent: price };
  }

  /**
   * Returns all cards owned by a user with optional rarity filter.
   */
  async getUserCards(userId, { rarity = null, page = 1, limit = 10 } = {}) {
    const query = { ownerId: userId };
    if (rarity) query.rarity = rarity;

    const cards = await Card.find(query)
      .sort({ 'stats.overall': -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Card.countDocuments(query);
    return { cards, total, page, pages: Math.ceil(total / limit) };
  }

  /**
   * Gets a specific card by ID, verifying ownership.
   */
  async getCard(cardId, ownerId = null) {
    const query = { cardId };
    if (ownerId) query.ownerId = ownerId;
    return Card.findOne(query);
  }

  /**
   * Sells a card for coins.
   */
  async sellCard(cardId, userId) {
    const card = await Card.findOne({ cardId, ownerId: userId });
    if (!card) throw new Error('Card not found or not owned by you');
    if (card.locked) throw new Error('This card is locked and cannot be sold');
    if (card.inAuction) throw new Error('This card is currently in an auction');

    const { RARITIES } = require('../../constants/rarities');
    const rarityData = RARITIES[card.rarity.toUpperCase()];
    const value = rarityData ? Math.floor(rarityData.baseValue * (card.stats.overall / 75)) : 100;

    await Card.deleteOne({ cardId });

    const user = await User.findOne({ userId });
    user.addCoins(value);
    user.cardsOwned = Math.max(0, user.cardsOwned - 1);
    await user.save();

    return { value, card };
  }
}

module.exports = { CardService };