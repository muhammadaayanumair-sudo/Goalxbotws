'use strict';

const MyTeam = require('../../models/MyTeam');
const Card   = require('../../models/Card');

// Formation slot layout — defines what position each of the 11 slots expects
const FORMATION_SLOTS = {
  '4-3-3': [
    { index: 0,  position: 'Goalkeeper', label: 'GK'  },
    { index: 1,  position: 'Defender',   label: 'LB'  },
    { index: 2,  position: 'Defender',   label: 'CB'  },
    { index: 3,  position: 'Defender',   label: 'CB'  },
    { index: 4,  position: 'Defender',   label: 'RB'  },
    { index: 5,  position: 'Midfielder', label: 'CM'  },
    { index: 6,  position: 'Midfielder', label: 'CM'  },
    { index: 7,  position: 'Midfielder', label: 'CM'  },
    { index: 8,  position: 'Attacker',   label: 'LW'  },
    { index: 9,  position: 'Attacker',   label: 'ST'  },
    { index: 10, position: 'Attacker',   label: 'RW'  },
  ],
  '4-4-2': [
    { index: 0,  position: 'Goalkeeper', label: 'GK'  },
    { index: 1,  position: 'Defender',   label: 'LB'  },
    { index: 2,  position: 'Defender',   label: 'CB'  },
    { index: 3,  position: 'Defender',   label: 'CB'  },
    { index: 4,  position: 'Defender',   label: 'RB'  },
    { index: 5,  position: 'Midfielder', label: 'LM'  },
    { index: 6,  position: 'Midfielder', label: 'CM'  },
    { index: 7,  position: 'Midfielder', label: 'CM'  },
    { index: 8,  position: 'Midfielder', label: 'RM'  },
    { index: 9,  position: 'Attacker',   label: 'ST'  },
    { index: 10, position: 'Attacker',   label: 'ST'  },
  ],
  '3-5-2': [
    { index: 0,  position: 'Goalkeeper', label: 'GK'  },
    { index: 1,  position: 'Defender',   label: 'CB'  },
    { index: 2,  position: 'Defender',   label: 'CB'  },
    { index: 3,  position: 'Defender',   label: 'CB'  },
    { index: 4,  position: 'Midfielder', label: 'LM'  },
    { index: 5,  position: 'Midfielder', label: 'CM'  },
    { index: 6,  position: 'Midfielder', label: 'CM'  },
    { index: 7,  position: 'Midfielder', label: 'CM'  },
    { index: 8,  position: 'Midfielder', label: 'RM'  },
    { index: 9,  position: 'Attacker',   label: 'ST'  },
    { index: 10, position: 'Attacker',   label: 'ST'  },
  ],
  '4-2-3-1': [
    { index: 0,  position: 'Goalkeeper', label: 'GK'  },
    { index: 1,  position: 'Defender',   label: 'LB'  },
    { index: 2,  position: 'Defender',   label: 'CB'  },
    { index: 3,  position: 'Defender',   label: 'CB'  },
    { index: 4,  position: 'Defender',   label: 'RB'  },
    { index: 5,  position: 'Midfielder', label: 'CDM' },
    { index: 6,  position: 'Midfielder', label: 'CDM' },
    { index: 7,  position: 'Midfielder', label: 'LAM' },
    { index: 8,  position: 'Midfielder', label: 'CAM' },
    { index: 9,  position: 'Midfielder', label: 'RAM' },
    { index: 10, position: 'Attacker',   label: 'ST'  },
  ],
};

const VALID_FORMATIONS = Object.keys(FORMATION_SLOTS);

/**
 * TeamService — manages users' personal 11-player teams built from their card collection.
 */
class TeamService {

  /**
   * Gets or creates a user's team document.
   */
  static async getOrCreate(userId) {
    let team = await MyTeam.findOne({ userId });
    if (!team) {
      team = await MyTeam.create({ userId });
    }
    return team;
  }

  /**
   * Returns the full team for a user.
   */
  static async getTeam(userId) {
    return MyTeam.findOne({ userId });
  }

  /**
   * Adds a card to the team at a specific slot (0-10).
   *
   * Rules:
   *  - Card must be owned by the user
   *  - Slot must be 0-10
   *  - Slot must not already be occupied (or we replace it)
   *  - Card must not already be in the team
   *
   * @returns { team, replaced } — the updated team and the card that was replaced (if any)
   */
  static async addPlayer(userId, cardIdInput, slotIndex) {
    const slotNum = parseInt(slotIndex);
    if (isNaN(slotNum) || slotNum < 0 || slotNum > 10) {
      throw new Error('Slot must be between 0 and 10');
    }

    // Find the card
    const card = await Card.findOne({
      cardId: { $regex: `^${cardIdInput}` },
      ownerId: userId,
    });
    if (!card) throw new Error('Card not found or not owned by you');

    const team = await TeamService.getOrCreate(userId);

    // Check this player name not already in team (block duplicates like 2 Mbappés)
    const alreadyIn = team.players.find((p) => p.playerName === card.playerName);
    if (alreadyIn) throw new Error(`**${card.playerName}** is already in your team (slot ${alreadyIn.slotIndex}). You can't have the same player twice!`);

    // Check if slot is occupied — remove old player first
    let replaced = null;
    const existingIdx = team.players.findIndex((p) => p.slotIndex === slotNum);
    if (existingIdx !== -1) {
      replaced = team.players[existingIdx];
      team.players.splice(existingIdx, 1);
    }

    // Add new player
    team.players.push({
      cardId:     card.cardId,
      playerName: card.playerName,
      teamName:   card.teamName,
      position:   card.position || 'Midfielder',
      rarity:     card.rarity,
      overall:    card.stats.overall,
      pace:       card.stats.pace,
      shooting:   card.stats.shooting,
      passing:    card.stats.passing,
      dribbling:  card.stats.dribbling,
      defending:  card.stats.defending,
      physical:   card.stats.physical,
      slotIndex:  slotNum,
    });

    team.recalculate();
    await team.save();
    return { team, replaced };
  }

  /**
   * Removes a player from the team by slot index or card ID prefix.
   */
  static async removePlayer(userId, input) {
    const team = await MyTeam.findOne({ userId });
    if (!team || !team.players.length) throw new Error('Your team is empty');

    let idx;

    // Try as a slot number first
    const slotNum = parseInt(input);
    if (!isNaN(slotNum) && slotNum >= 0 && slotNum <= 10) {
      idx = team.players.findIndex((p) => p.slotIndex === slotNum);
    } else {
      // Try as a card ID prefix
      idx = team.players.findIndex((p) => p.cardId.startsWith(input));
    }

    if (idx === -1) throw new Error('Player not found in your team. Provide a slot number (0-10) or card ID.');

    const removed = team.players[idx];
    team.players.splice(idx, 1);
    team.recalculate();
    await team.save();
    return { team, removed };
  }

  /**
   * Clears all players from the team.
   */
  static async clearTeam(userId) {
    const team = await TeamService.getOrCreate(userId);
    team.players = [];
    team.recalculate();
    await team.save();
    return team;
  }

  /**
   * Renames the user's team.
   */
  static async renameTeam(userId, newName) {
    const team = await TeamService.getOrCreate(userId);
    team.teamName = newName.slice(0, 32);
    await team.save();
    return team;
  }

  /**
   * Sets the formation.
   */
  static async setFormation(userId, formation) {
    if (!VALID_FORMATIONS.includes(formation)) {
      throw new Error(`Invalid formation. Choose from: ${VALID_FORMATIONS.join(', ')}`);
    }
    const team = await TeamService.getOrCreate(userId);
    team.formation = formation;
    await team.save();
    return team;
  }

  /**
   * AUTO-SELECTS THE BEST 11 PLAYERS from the user's card collection.
   *
   * Algorithm:
   *  1. Load all cards owned by the user
   *  2. For each position needed (1 GK, 4 DEF, 3 MID, 3 ATT for 4-3-3):
   *     - Filter cards by matching position
   *     - Sort by overall DESC
   *     - Pick the best available card
   *  3. If a position has no exact match, fall back to best remaining card
   *  4. Save as the user's team
   *
   * @param {string} userId
   * @param {string} formation — defaults to user's current formation
   * @returns { team, selected } — the saved team and the array of selected cards
   */
  static async autoBest(userId, formation = null) {
    const team = await TeamService.getOrCreate(userId);
    const chosenFormation = formation || team.formation || '4-3-3';

    if (!VALID_FORMATIONS.includes(chosenFormation)) {
      throw new Error(`Invalid formation: ${chosenFormation}`);
    }

    // Load all user cards sorted by overall descending
    const allCards = await Card.find({ ownerId: userId }).sort({ 'stats.overall': -1 }).lean();

    if (!allCards.length) throw new Error('You have no cards in your collection. Open packs first with `/openpack`!');

    const slots = FORMATION_SLOTS[chosenFormation];
    const usedIds     = new Set(); // track used cardIds (prevent exact duplicate cards)
    const usedNames   = new Set(); // track used playerNames (prevent same player twice e.g. 2 Mbappés)
    const selected    = [];

    // First pass: try exact position match for each slot
    for (const slot of slots) {
      const match = allCards.find(
        (c) => !usedIds.has(c.cardId) && !usedNames.has(c.playerName) && c.position === slot.position
      );
      if (match) {
        usedIds.add(match.cardId);
        usedNames.add(match.playerName);
        selected.push({ card: match, slot });
      } else {
        selected.push({ card: null, slot }); // placeholder — fill in second pass
      }
    }

    // Second pass: fill unfilled slots with best remaining cards (any position, no duplicate names)
    for (const entry of selected) {
      if (!entry.card) {
        const fallback = allCards.find((c) => !usedIds.has(c.cardId) && !usedNames.has(c.playerName));
        if (fallback) {
          usedIds.add(fallback.cardId);
          usedNames.add(fallback.playerName);
          entry.card = fallback;
        }
      }
    }

    // Remove entries that still have no card (shouldn't happen if user has ≥ filled count cards)
    const valid = selected.filter((e) => e.card !== null);

    // Build new players array
    team.players = valid.map(({ card, slot }) => ({
      cardId:     card.cardId,
      playerName: card.playerName,
      teamName:   card.teamName,
      position:   card.position || slot.position,
      rarity:     card.rarity,
      overall:    card.stats.overall,
      pace:       card.stats.pace,
      shooting:   card.stats.shooting,
      passing:    card.stats.passing,
      dribbling:  card.stats.dribbling,
      defending:  card.stats.defending,
      physical:   card.stats.physical,
      slotIndex:  slot.index,
    }));

    team.formation = chosenFormation;
    team.recalculate();
    await team.save();

    return { team, selected: valid };
  }

  /**
   * Returns slot layout for a given formation.
   */
  static getFormationSlots(formation) {
    return FORMATION_SLOTS[formation] || FORMATION_SLOTS['4-3-3'];
  }

  static get validFormations() {
    return VALID_FORMATIONS;
  }
}

module.exports = { TeamService };