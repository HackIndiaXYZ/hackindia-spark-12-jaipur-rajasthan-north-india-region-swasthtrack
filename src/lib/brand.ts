/**
 * Brand colours that must be literal hex because they are read outside CSS:
 * the web app manifest and the `<meta name="theme-color">` tag. Keep them equal
 * to the tokens in src/app/globals.css:
 *   BRAND_COLOR  = --color-brand   (emerald, for meaning, never chrome)
 *   CANVAS_COLOR = --color-canvas  (warm ivory)
 *   THEME_COLOR  = the browser / installed-app toolbar. The frosted ivory header
 *                  runs right up under it, so it matches the canvas rather than
 *                  cutting a green band across the top of a gold-and-ivory UI.
 */
export const BRAND_COLOR = "#0a6a4a";
export const CANVAS_COLOR = "#faf6ea";
export const THEME_COLOR = CANVAS_COLOR;
