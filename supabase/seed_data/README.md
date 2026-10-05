# Seed data (legacy)

These CSVs are **no longer read by anything**. The food catalogue now lives in
[`src/data/food-catalogue.json`](../../src/data/food-catalogue.json) and is built by
`scripts/food/build-catalogue.mjs` (see [`docs/food-catalogue.md`](../../docs/food-catalogue.md)).

| File | Why it was replaced |
| :--- | :--- |
| `calories_raw.csv` | A Western Kaggle dataset: 2,225 rows, mostly foods nobody in India eats, with wrong values (tea at 1 kcal, "Chai Tea" at 0 kcal), and a mix of per-100 g, per-100 ml and per-serving numbers. |
| `papa_food_master.csv` | The hand-picked priority list. Every item on it is found by search in the new catalogue. Several of its calorie figures were per piece or per serving rather than per 100 g (gulab jamun 150, jalebi 150, besan ladoo 130), so they cannot be compared with per-100 g values. |
| `papa_household_portions.csv` | Replaced by the household portions stored with each food in the new catalogue (katori, roti, piece, cup, glass). |

They are kept only so the history of the old data is not lost. Do not re-import them.
