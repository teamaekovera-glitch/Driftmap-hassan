// Installed globally for the Vitest run: Node has no IndexedDB, so the real
// storage module is tested against fake-indexeddb's spec-compliant
// implementation (Blob cloning included — verified against idb).
import "fake-indexeddb/auto";
