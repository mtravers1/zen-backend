export class LimitedMap extends Map {
  constructor(limit = 100) {
    super();
    this.limit = limit;
  }

  set(key, value) {
    if (this.has(key)) {
      this.delete(key);
    } else if (this.size >= this.limit) {
      const oldestKey = this.keys().next().value;
      this.delete(oldestKey);
    }
    return super.set(key, value);
  }
}
