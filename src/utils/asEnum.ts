// Narrow an arbitrary string — e.g. a <select>'s `value`, which the DOM always
// types as plain `string` — to a member of an allowed set, falling back when it
// isn't one. Every <option> is rendered from the SAME set, so a real mismatch
// shouldn't happen; this replaces the unchecked `e.target.value as SomeUnion` cast
// (which would silently let a stray value put a non-member into typed state,
// bypassing the schema the rest of the app validates against) with a real runtime
// guard. The single internal `as T` is sound: it only runs once `includes` has
// confirmed membership — TypeScript just can't narrow `string` through `.includes`
// on its own. The fallback may be a DIFFERENT type than the members (e.g. '' for a
// filter's "all" option), so the result is `T | F`.
export function asEnum<T extends string, F = T>(
  allowed: readonly T[],
  value: string,
  fallback: F,
): T | F {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}
