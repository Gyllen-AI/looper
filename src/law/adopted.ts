import { readAdopted } from "../adopt/store.ts";
import { checkFor } from "../adopt/shapes.ts";
import type { Check } from "./engine.ts";

export function checksAdoptedIn(root: string): readonly Check[] {
  return readAdopted(root).map(checkFor);
}
