# Food catalogue

How the food data in SwasthTrack is built, where the numbers come from, how search
and emojis work, and how to change any of it.

## What is in it

`src/data/food-catalogue.json` is one file with every food the app knows. Each food has:

| Field | Meaning |
| :--- | :--- |
| `name`, `hi`, `alias` | English name, Hindi name, and the spellings people actually type ("daal", "dhal", "dahl", "ladies finger", "तड़का दाल") |
| `cat`, `region`, `diet` | Category, home state or region ("Kerala", "Pan-India"), and veg / egg / non-veg |
| `kcal`, `p`, `c`, `f`, `fib`, `na` | Energy, protein, available carbohydrate, fat, fibre (g) and sodium (mg) **per 100 g, or per 100 ml when `unit` is `ml`** |
| `portions` | Household amounts with grams: 1 katori, 1 roti, 1 idli, 1 cup, 1 glass, 1 piece |
| `emoji` | The emoji that shows this food |
| `src`, `conf`, `note` | Where the numbers come from, how sure we are (`high` / `medium` / `low`), and the recipe assumption (oil, salt, bone excluded ...) |
| `core` | Everyday staple, ranked first in search |

Size: **3,321 foods** (2,577 vegetarian, 94 with egg, 650 non-vegetarian), of which 730 are lab-measured
IFCT values (`conf: high`), 2,195 recipe-derived (`medium`) and 396 rough estimates (`low`).
Every state and union territory has dishes: Tamil Nadu 169, Maharashtra 161, West Bengal 145,
Kerala 142, Karnataka 111, Punjab 96, Gujarat 83, Andhra Pradesh 73, Uttar Pradesh 68,
Rajasthan 62 ... down to the small cuisines (Tripura 8, Mizoram 8, Arunachal Pradesh 8,
Puducherry 6, Andaman & Nicobar 6, Chandigarh 3), which are thin because little is published.
The other 1,700 or so are pan-Indian, regional-group (North / South India) or international.

Coverage: every state and union territory, raw ingredients (all of IFCT 2017: cereals, millets,
pulses, every Indian vegetable and fruit, fish, meat, eggs, milk), cooked sabzi / dal / roti /
rice / tiffin, regional specialities state by state, sweets, snacks and chaat, drinks (every kind
of chai and coffee), non-veg dishes, chutneys, pickles, soups, salads, fast food and packaged foods.

## Where the numbers come from

1. **IFCT 2017** (Indian Food Composition Tables, ICMR-NIN Hyderabad). Lab-measured values for
   542 raw foods, used untouched for every raw ingredient (`src` starts with `IFCT 2017`).
   Two known problems in the published table are fixed by the build (see below).
2. **Recipe-derived values** for cooked dishes: each dish is computed from its ingredients (IFCT
   values for the raw items, standard fat and dairy values for the rest) with a stated amount of
   oil and salt, so the energy always follows from the macros. `note` on every dish states the
   assumption (for example "home style, 1 tsp oil per katori", "restaurant style with butter and
   cream", "per 100 g edible weight, bone excluded").
3. **INDB** (Indian Nutrient Databank, 1,014 recipes) was used as a cross-check and for dish names,
   **not** copied: it has gross computing errors (potato bonda at 633 kcal per 100 g, bajra mathri
   at 785, soups with 4,000 to 12,000 mg sodium). Wherever it disagreed by more than 25 % the
   authors used the value they could defend and said so in `note`.
4. **Packaged foods** use typical label values.

Dishes that two authors wrote independently were merged; where their numbers differed the build
keeps the higher-confidence one, or averages them when confidence is equal.

### Two things worth knowing

* **IFCT fruit values are lower than the USDA numbers usually quoted online** (guava 32 vs 68
  kcal, papaya 24 vs 43, mango 42 to 59 vs 60). IFCT measures Indian varieties and does not count
  fibre as energy. The catalogue keeps IFCT because it is the national lab source; change a row in
  its part file if you prefer USDA.
* **Cooked dishes are estimates.** Oil and salt change a home dish a lot. Foods marked
  `conf: low` are regional dishes or recipes with no published figure; they are flagged in
  `note`. Always show these as "about".

### Fixes applied to IFCT

* Oils, ghee and vanaspati list **0 kcal** (energy was never computed for them): recomputed from
  their fat, giving 900.
* Chicken leg (skinless) lists 384 kcal against 192 from its own macros, and crab 82 against 54:
  recomputed. Lemon juice uses the USDA 22 kcal.
* The 28 numbered lab samples ("Brinjal, Variety 7", "Green Chilli, Variety 3") are dropped; the
  "All Varieties" row is kept.

## Search

`src/lib/food/search.ts` (no dependencies, runs in the browser and in scripts).

* Spelling-proof: `dal`, `daal`, `dhal`, `dahl`, `दाल` all find the same dishes; so do `paneer` /
  `panir`, `sabzi` / `sabji`, `wada` / `vada`. Hindi (Devanagari) and Hinglish both work.
* Small typos are forgiven ("pinapple" finds pineapple and offers "did you mean").
* Names of states work: `kerala fish`, `punjab`, `west bengal`.
* Whole sentences work: `2 roti aur dal`, `Chicken Curry (home-style, light oil)`.
* "No" means no: `tea with milk and sugar` finds milk chai, not "black tea (no milk, no sugar)".
* Dishes come before raw ingredients: `poha` is the plate of poha, not 354 kcal of dry flakes,
  unless you type `dry`, `raw`, `atta` or `flour`.
* Everyday foods (`core`) rank first, then plainer names.

## Emojis

Each food carries its own emoji (the pineapple is 🍍, the aloo gobi is 🥔). Where only the name is
known (the day's food log) `src/lib/food/emoji.ts` picks one with ordered keyword rules: how it is
served beats what it is made of ("pineapple juice" is a drink, "chicken biryani" is rice). Foods
with no emoji of their own (jackfruit, bael, arbi) get the closest-looking one.

## Rebuilding the catalogue

The catalogue is generated; do not edit `src/data/food-catalogue.json` by hand.

```bash
# 1. change a food in scripts/food/parts/*.json   (or add a new part file; format: scripts/food/catalogue-spec.mjs)
# 2. check the part you touched
node scripts/food/validate-catalogue.mjs scripts/food/parts/d2-dal.json --ifct scripts/food/ifct-2017.json
# 3. merge all parts into src/data/food-catalogue.json
npm run food:build
# 4. validate the result and run the regression checks (search, calories of common foods, emojis)
npm run food:validate && npm run food:check
```

`scripts/food/parts/` holds the 15 part files the catalogue is built from (cooked dishes by type
and by region, plus labels for the IFCT rows) and `scripts/food/ifct-2017.json` the IFCT table.

`validate-catalogue.mjs` rejects any food whose energy does not follow from its protein, carbs and
fat (Atwater 4/4/9), unknown categories or states, missing Hindi names, bad emojis and duplicate
slugs. `check-catalogue.mjs` encodes the bugs that were reported (tea at 1 kcal, "dal" not finding
"daal", pineapple shown as an apple) so they cannot come back.

The IFCT table in `scripts/food/ifct-2017.json` comes from the `@ifct2017/compositions` npm
package. The INDB working copy used for cross-checks is not stored in the repository.

## Database copy (optional)

Search, calories and emojis do **not** need the database. The copy in MySQL (`npm run food:import`) exists so a food can
be a favourite and be linked from a food log. See "Food catalogue" in
[`deployment.md`](deployment.md). Every food keeps the same id (UUID v5 of its slug) on every
import, so re-running is safe and favourites survive.

## Data sources and licensing

* IFCT 2017: Longvah T, Ananthan R, Bhaskarachary K, Venkaiah K. *Indian Food Composition Tables
  2017*. ICMR-National Institute of Nutrition, Hyderabad.
* INDB: the open-access Indian Nutrient Databank (Current Developments in Nutrition, 2024),
  used for cross-checks only. The repository does not declare a licence; if the app is ever
  distributed commercially, confirm its terms before relying on it.
