/**
 * Closed enumeration of misconception signature codes.
 * Additions require review -- see architecture.html #contracts.
 */
export const SIGNATURE_CODES = [
  "WHOLE_NUMBER_BIAS",
  "LOG_COMPRESSION",
  "LONGER_IS_LARGER",
  "LANDMARK_ONLY",
  "RANGE_COMPRESSION",
  "DENOMINATOR_BIAS",
  "UNCLASSIFIED",
] as const;

export type SignatureCode = (typeof SIGNATURE_CODES)[number];

export function isSignatureCode(value: string): value is SignatureCode {
  return (SIGNATURE_CODES as readonly string[]).includes(value);
}
