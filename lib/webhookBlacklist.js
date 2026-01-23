import { LimitedMap } from './limitedMap.js';

// Cache for unknown Plaid item IDs with a 24-hour TTL.
const unknownItemsCache = new LimitedMap(1000, 24 * 60 * 60 * 1000);

/**
 * Adds an item ID to the unknown items cache.
 * @param {string} itemId The Plaid item ID.
 */
export function addUnknownItem(itemId) {
  unknownItemsCache.set(itemId, true);
}

/**
 * Checks if an item ID is in the unknown items cache.
 * @param {string} itemId The Plaid item ID.
 * @returns {boolean} True if the item is in the cache, false otherwise.
 */
export function isUnknownItem(itemId) {
  return unknownItemsCache.has(itemId);
}
