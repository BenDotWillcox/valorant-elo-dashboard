export const PICK_BAN_HARD_RESET_RATING = 1000;

const HARD_RESET_TIMESTAMP_UTC =
  /^\d{4}-01-01T00:00:00\.000000Z$/;

export type PickBanRatingProvenance = {
  rating: number | string;
  ratingDate: string | Date;
  sourceMatchId?: string | number | null;
};

function missingIdentifier(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function ratingTimestampText(value: string | Date): string {
  if (!(value instanceof Date)) return String(value);
  return value.toISOString().replace(/\.000Z$/, ".000000Z");
}

/**
 * Source-less history is only auditable when it is an unmistakable synthetic
 * season reset. Every other row needs a source match so the target series can
 * be excluded when matches.completed_at is used as the cutoff proxy.
 */
export function isSourceLessPickBanHardResetRating(
  rating: PickBanRatingProvenance
): boolean {
  return (
    missingIdentifier(rating.sourceMatchId) &&
    Number(rating.rating) === PICK_BAN_HARD_RESET_RATING &&
    HARD_RESET_TIMESTAMP_UTC.test(ratingTimestampText(rating.ratingDate))
  );
}

export function classifySourceLessPickBanRatings(
  ratings: PickBanRatingProvenance[]
): {
  ratingsWithoutSourceMatchId: number;
  sourceLessRatingsMatchingHardResetSignature: number;
  sourceLessRatingsOutsideHardResetSignature: number;
} {
  let ratingsWithoutSourceMatchId = 0;
  let sourceLessRatingsMatchingHardResetSignature = 0;

  for (const rating of ratings) {
    if (!missingIdentifier(rating.sourceMatchId)) continue;
    ratingsWithoutSourceMatchId += 1;
    if (isSourceLessPickBanHardResetRating(rating)) {
      sourceLessRatingsMatchingHardResetSignature += 1;
    }
  }

  return {
    ratingsWithoutSourceMatchId,
    sourceLessRatingsMatchingHardResetSignature,
    sourceLessRatingsOutsideHardResetSignature:
      ratingsWithoutSourceMatchId -
      sourceLessRatingsMatchingHardResetSignature,
  };
}

export function assertSourceLessPickBanRatingsAreAuditable(
  ratings: PickBanRatingProvenance[],
  context: string
): void {
  const quality = classifySourceLessPickBanRatings(ratings);
  if (quality.sourceLessRatingsOutsideHardResetSignature === 0) return;

  throw new Error(
    `${context} contains ${quality.sourceLessRatingsOutsideHardResetSignature} source-less Elo rating row(s) outside the hard-reset signature (rating 1000 at January 1 00:00:00 UTC); target-series exclusion cannot be proven.`
  );
}
