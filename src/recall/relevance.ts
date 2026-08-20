import type { Note } from "./store.ts";

const STOP: ReadonlySet<string> = new Set([
  "that", "this", "with", "from", "what", "when", "have", "does", "into", "than",
  "then", "them", "they", "their", "there", "here", "will", "would", "should",
  "about", "which", "where", "been", "were", "also", "just", "like", "some",
  "only", "over", "under", "after", "before", "because", "while", "your", "very",
  "much", "more", "most", "each", "every", "onto", "upon", "being", "still",
  "again", "same", "other", "another", "those", "these", "make", "made", "done",
  "doing", "need", "needs", "want", "wants", "please", "could", "cannot",
  "really", "thing", "things", "something", "anything", "looper",
]);

const A_WORD = /[a-z0-9_]{4,}/g;

export function wordsOf(text: string): ReadonlySet<string> {
  const found = new Set<string>();
  const matched = text.toLowerCase().match(A_WORD);
  if (matched === null) return found;
  for (const word of matched) {
    if (!STOP.has(word)) found.add(word);
  }
  return found;
}

export function pathWords(paths: readonly string[]): ReadonlySet<string> {
  return wordsOf(paths.map((path) => path.replace(/[/._-]+/g, " ")).join(" "));
}

export function asked(prompt: string, paths: readonly string[]): ReadonlySet<string> {
  return new Set([...wordsOf(prompt), ...pathWords(paths)]);
}

const SUMMARY_WEIGHT = 2;

export type Relevance = { readonly words: number; readonly score: number };

export function relevance(note: Note, wanted: ReadonlySet<string>): Relevance {
  const summary = wordsOf(note.summary);
  const body = wordsOf(note.body);
  let words = 0;
  let score = 0;
  for (const word of wanted) {
    if (summary.has(word)) {
      words += 1;
      score += SUMMARY_WEIGHT;
    } else if (body.has(word)) {
      words += 1;
      score += 1;
    }
  }
  return { words, score };
}

export const NAMED_AT_ONCE = 3;

export const WORDS_IN_COMMON = 2;

export function mostRelevant(notes: readonly Note[], wanted: ReadonlySet<string>): readonly Note[] {
  return notes
    .map((note) => ({ note, held: relevance(note, wanted) }))
    .filter((one) => one.held.words >= WORDS_IN_COMMON)
    .sort((left, right) => right.held.score - left.held.score)
    .slice(0, NAMED_AT_ONCE)
    .map((one) => one.note);
}
