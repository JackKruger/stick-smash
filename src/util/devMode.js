// Dev-mode detection. Production never loads the dev test harness; it's pulled
// in only when this returns true. Pure (args injected) so it's unit-testable.
//
// Enabled by either a `?dev` query param (any value, even empty) or a
// localStorage 'dev' === '1'. Kept deliberately simple.
export function isDevMode(search = '', storageValue = null) {
  try {
    if (new URLSearchParams(search).has('dev')) return true;
  } catch (_) { /* malformed search string → fall through */ }
  return storageValue === '1';
}
