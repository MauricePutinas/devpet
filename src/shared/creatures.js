// Single source of truth for all selectable creatures.
// id = folder name under assets/creatures/<id>/
const CREATURES = [
  // Volt (BVB/yellow) is the free default; the other coder skins are unlocked with coins.
  { id: 'bvbcoder',      name: 'Volt',  emoji: '⚡', call: 'Zap',   group: 'Coder' },
  { id: 'coolcoder',     name: 'Blaze', emoji: '🔥', call: 'Klack', group: 'Skins 🪙', price: 600 },
  { id: 'bluestarcoder', name: 'Nova',  emoji: '💫', call: 'Klack', group: 'Skins 🪙', price: 1500 },
  { id: 'darkcoder',     name: 'Hex',   emoji: '😈', call: 'Mwah',  group: 'Skins 🪙', price: 3000 },
  { id: 'kingcoder',     name: 'Root',  emoji: '👑', call: 'Hail',  group: 'Skins 🪙', price: 5000 },
];

const BY_ID = Object.fromEntries(CREATURES.map((c) => [c.id, c]));
function get(id) { return BY_ID[id] || CREATURES[0]; }
const priceOf = (id) => (BY_ID[id] && BY_ID[id].price) || 0;       // 0 = free / not a paid skin
// owned = free creatures + any skin whose id is in the unlocked list
function isUnlocked(id, unlocked) { return !priceOf(id) || (unlocked || []).includes(id); }

module.exports = { CREATURES, BY_ID, get, priceOf, isUnlocked };
