// Guest-user persistence. Everything lives on the device — accounts and the
// leaderboard come later; nothing here blocks on a login.

import type { Axis } from "./challenges";
import { AXES } from "./challenges";

export interface QuizRecord {
  challengeId: string;
  overall: number;
  axes: Partial<Record<Axis, number>>;
  at: string;
}

export interface Profile {
  interests: string[]; // tags from the challenge bank
  role: string; // free text, optional
}

export interface SavedState {
  history: QuizRecord[];
  profile: Profile;
  /** count of completed (not skipped) quizzes, drives the every-10 chart */
  completed: number;
}

const KEY = "articulate_v1";

export const EMPTY: SavedState = {
  history: [],
  profile: { interests: [], role: "" },
  completed: 0,
};

export function loadState(): SavedState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedState;
      return { ...EMPTY, ...parsed, profile: { ...EMPTY.profile, ...parsed.profile } };
    }
  } catch {}
  return { ...EMPTY };
}

export function saveState(s: SavedState) {
  try {
    // History is capped; aggregates are recent-weighted anyway.
    localStorage.setItem(KEY, JSON.stringify({ ...s, history: s.history.slice(-200) }));
  } catch {}
}

/** Recent-weighted per-axis aggregate (last 20 scores per axis). Not
 * cumulative: improvement shows up, history doesn't drag. */
export function aggregates(history: QuizRecord[]): Record<Axis, number | null> {
  const out = {} as Record<Axis, number | null>;
  for (const axis of AXES) {
    const scores = history
      .map((h) => h.axes[axis])
      .filter((v): v is number => typeof v === "number")
      .slice(-20);
    if (!scores.length) {
      out[axis] = null;
      continue;
    }
    // Newer scores weigh more.
    let sum = 0;
    let wsum = 0;
    scores.forEach((v, i) => {
      const w = 1 + i / scores.length;
      sum += v * w;
      wsum += w;
    });
    out[axis] = Math.round(sum / wsum);
  }
  return out;
}

export function weakestAxis(history: QuizRecord[]): Axis | null {
  const agg = aggregates(history);
  let weakest: Axis | null = null;
  let low = Infinity;
  for (const axis of AXES) {
    const v = agg[axis];
    if (v !== null && v < low) {
      low = v;
      weakest = axis;
    }
  }
  return weakest;
}
