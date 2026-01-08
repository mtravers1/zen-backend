class UnknownItemError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnknownItemError';
  }
}

export { UnknownItemError };
