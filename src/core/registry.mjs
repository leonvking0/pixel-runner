// src/core/registry.mjs — pluggable character registry (SPEC AC-3). Characters self-register; the core never imports a specific character to create one.
const registry = new Map();

export function registerCharacter(id, factory) {
  if (typeof id !== 'string' || id.length === 0) {
    throw new TypeError('registerCharacter: id must be a non-empty string');
  }
  if (typeof factory !== 'function') {
    throw new TypeError('registerCharacter: factory must be a function');
  }
  registry.set(id, factory);
  return factory;
}

export function createCharacter(id, ...args) {
  const factory = registry.get(id);
  if (!factory) {
    throw new Error('createCharacter: unknown character id "' + id + '"');
  }
  return factory(...args);
}
