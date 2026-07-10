import { PICK_BAN_INITIAL_RATING } from "./pick-ban-policy";
import { assertSourceLessPickBanRatingsAreAuditable } from "./pick-ban-rating-provenance";

export type PickBanRatingHistoryEntry = {
  id: number;
  rating: number;
  ratingDate: Date;
  sourceMatchId: number | null;
};

/**
 * Selects the latest row before a supplied cutoff from an ascending history,
 * while excluding every row produced by the target match. The source-match
 * check is required when the cutoff is a series completion timestamp because
 * ratings from earlier maps in that same series can otherwise appear eligible.
 */
export function ratingBeforePickBanCutoff(
  history: PickBanRatingHistoryEntry[] | undefined,
  targetMatchId: number,
  cutoffAt: Date
): number {
  if (!history || history.length === 0) return PICK_BAN_INITIAL_RATING;
  assertSourceLessPickBanRatingsAreAuditable(
    history,
    "Pick/ban rating history"
  );

  const cutoff = cutoffAt.getTime();
  let lower = 0;
  let upper = history.length - 1;
  let latestIndex = -1;

  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (history[middle].ratingDate.getTime() < cutoff) {
      latestIndex = middle;
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }

  const cutoffYear = cutoffAt.getUTCFullYear();
  for (let index = latestIndex; index >= 0; index -= 1) {
    const candidate = history[index];
    if (candidate.ratingDate.getUTCFullYear() !== cutoffYear) break;
    if (candidate.sourceMatchId === targetMatchId) continue;
    return candidate.rating;
  }

  return PICK_BAN_INITIAL_RATING;
}
