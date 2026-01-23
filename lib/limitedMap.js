export class LimitedMap extends Map {
  constructor(limit = 1000, ttlMs = 0) {
    super();
    this.limit = limit;
    this.ttlMs = ttlMs;
  }

  _updateLru(key) {
    const entry = super.get(key);
    super.delete(key);
    super.set(key, entry);
  }

  set(key, value) {
    let expirationTime = 0;
    if (this.ttlMs > 0) {
      expirationTime = Date.now() + this.ttlMs;
    }

    if (super.has(key)) {
      // If key exists, update value and expiration, and move to end for LRU
      expirationTime = this.ttlMs > 0 ? Date.now() + this.ttlMs : 0; // Refresh TTL on explicit set
      this._updateLru(key);
    } else {
      // If new key, check limit and add
      if (this.size >= this.limit) {
        const oldestKey = this.keys().next().value;
        super.delete(oldestKey);
      }
    }
    return super.set(key, { value, expirationTime });
  }

  get(key) {
    if (super.has(key)) {
      const entry = super.get(key);
      if (this.ttlMs > 0 && entry.expirationTime > 0 && entry.expirationTime <= Date.now()) {
        super.delete(key); // Entry has expired
        return undefined;
      }
      this._updateLru(key); // Move to end for LRU
      return entry.value;
    }
    return undefined;
  }

  has(key) {
    if (super.has(key)) {
      const entry = super.get(key);
      if (this.ttlMs > 0 && entry.expirationTime > 0 && entry.expirationTime <= Date.now()) {
        super.delete(key); // Entry has expired
        return false;
      }
      this._updateLru(key); // Move to end for LRU
      return true;
    }
    return false;
  }

  delete(key) {
    return super.delete(key);
  }
}
