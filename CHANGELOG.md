# Changelog

## [0.1.0-beta.1] - 2026-05-26

### Fixed
- Declaration file compat: import path in `src/index.ts` uses `.js` extension
- Benchmark cold-start baseline skew — added JIT warmup before measurement
- Contention benchmark now uses correct contention baseline for comparison
- Test `.then()` chains refactored to async/await (AGENTS.md compliance)
- README benchmark numbers refreshed; added hardware variance disclaimer
- `timeoutMs = 0` behavior documented in Limitations
- TODO.md version synced to `0.1.0-beta.0`

## [0.1.0-beta.0] - 2026-05-18

### Fixed
- O(n) `Array.shift()` on release replaced with O(1) linked-list Queue
- O(n) `Array.indexOf()` in timeout callback replaced with O(1) node reference removal
- `timeoutMs` now validated: NaN, Infinity, and negative values throw
- Non-null assertion `shift()!` replaced with explicit guard
- `Timer` type changed to `ReturnType<typeof setTimeout>` (portable)
- README error message synced: `"maxConcurrency must be >= 1"` → `"positive integer >= 1"`
- 7 new tests (23 total): NaN/Infinity constructor, edge case timeouts

## [0.1.0-alpha.0] - 2026-05-15
### Added
- Semaphore class with acquire/release/withLock
- Optional timeout on acquire
- FIFO waiter ordering
