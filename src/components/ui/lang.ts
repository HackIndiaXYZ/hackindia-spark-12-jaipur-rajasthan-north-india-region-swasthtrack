/**
 * `lang` attribute for a snippet of UI copy. The document is `lang="hi"`, but a
 * lot of English text sits inside Hindi-first components (and the other way
 * round); screen readers pick the wrong voice unless the snippet says which
 * language it is in.
 */
export function langOf(text: string): "hi" | "en" {
  return /[ऀ-ॿ]/.test(text) ? "hi" : "en";
}
