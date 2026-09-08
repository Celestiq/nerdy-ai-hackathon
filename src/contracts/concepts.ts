/**
 * Concept ID naming convention: STRAND[.SUBSTRAND].TOKEN, upper snake segments
 * separated by dots, e.g. "F.MAG.UNIT", "D.MAG.CMP", "N.ORD".
 * Uniqueness is enforced by the graph loader (src/graph/loader.ts), not here --
 * this module only knows the shape of a legal ID, never which IDs exist.
 */
const CONCEPT_ID_RE = /^[A-Z][A-Z0-9]*(\.[A-Z][A-Z0-9]*){1,3}$/;

export function isConceptId(value: string): boolean {
  return CONCEPT_ID_RE.test(value);
}
