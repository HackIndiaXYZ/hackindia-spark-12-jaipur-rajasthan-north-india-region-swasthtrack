"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, History, Plus, Search, Sparkles, Trash2, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Field, NumberInput, Select, TextInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { consumedAtFor, isCatalogueId, type Confidence } from "@/components/food/food-math";
import { PhotoPicker } from "@/components/vision/photo-picker";
import { loggedUnit } from "@/lib/food/catalogue";
import { todayIST } from "@/lib/health-rules";
import { cn, getExactFoodEmoji } from "@/lib/utils";
import { analyseFoodPhoto, isFoodModelLoaded, loadFoodModel, type FoodAnalysis } from "@/lib/vision/food-model";
import { decodePhoto, previewDataUrl, thumbnailDataUrl } from "@/lib/vision/image";
import {
  getAllActiveFoods,
  getFoodPortions,
  logFood,
  searchFoodItems,
  type FoodItem,
  type FoodPortion,
} from "@/services/patient-service";
import { matchFoodPhoto, rememberFoodPhoto, type FoodMatchResponse, type FoodPhotoFood, type FoodSuggestionItem, type LearnedMatch } from "@/services/food-photo-service";
import { getPersonalizedQuickFoods, type PersonalizedQuickFoodItem } from "@/services/quick-food-service";

type FoodPhotoDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  mealType: string;
  /** IST day the meal is saved onto. */
  logDate: string;
  /** Exact instant the meal was eaten (ISO); when given it wins over logDate's typical meal time. */
  consumedAt?: string;
  onLogged: () => void;
};

/** A Hindi explanation for whatever stopped the photo from being analysed. */
function describeFailure(err: unknown): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "इंटरनेट नहीं है। खाना पहचानने वाला मॉडल पहली बार डाउनलोड होना ज़रूरी है; इंटरनेट चालू करके फिर कोशिश करें।";
  }
  const message = err instanceof Error ? err.message : "";
  if (/[ऀ-ॿ]/.test(message)) return message;
  if (/HTTP|fetch|network|load|wasm|tflite|model|labels/i.test(message)) {
    return "खाना पहचानने वाला मॉडल लोड नहीं हो पाया। इंटरनेट जाँचकर दोबारा कोशिश करें; तब तक खाना खोजकर दर्ज कर सकते हैं।";
  }
  if (/canvas|image|decode/i.test(message)) return "फोटो खोली नहीं जा सकी। दूसरी फोटो लें।";
  return "फोटो पहचानी नहीं जा सकी। दोबारा कोशिश करें या खोजकर दर्ज करें।";
}

const isDataImage = (url: string | null | undefined): url is string => typeof url === "string" && url.startsWith("data:image/");

type Step = "pick" | "analysing" | "choose" | "saving";

/** One food the person has agreed is on the plate, with how much. */
type Picked = {
  key: string;
  food: FoodItem;
  portions: FoodPortion[];
  portionId: string;
  quantity: string;
  /** kcal for one portion/unit when the catalogue has none. */
  manualKcal: string;
};

function estimate(p: Picked): { kcal: number; grams: number; confidence: Confidence } | null {
  const qty = parseFloat(p.quantity);
  if (!Number.isFinite(qty) || qty <= 0 || qty > 20) return null;
  const portion = p.portions.find((x) => x.id === p.portionId) ?? p.portions[0] ?? null;
  const grams = (portion ? portion.standardized_grams : p.food.reference_weight_g || 100) * qty;
  if (p.food.calories_per_100g == null) {
    const manual = parseFloat(p.manualKcal);
    if (!Number.isFinite(manual) || manual < 0 || manual > 5000) return null;
    return { kcal: Math.round(manual * qty), grams, confidence: "Low" };
  }
  return { kcal: Math.round((p.food.calories_per_100g / 100) * grams), grams, confidence: portion ? "Medium" : "Low" };
}

/**
 * Photo of a meal -> the foods on the plate, logged in one go.
 *
 * The photo is analysed on the phone (the food model never sends it anywhere).
 * Suggestions come in three kinds, best first: meals the family confirmed before
 * that look like this photo, catalogue foods the classifier recognised, and the
 * foods this person usually eats at this meal. Every suggestion is a tap to add;
 * portions and quantities stay editable; and once saved, the photo is remembered
 * so the next similar plate is recognised straight away.
 */
export function FoodPhotoDialog(props: FoodPhotoDialogProps) {
  // Mounted only while open, so every opening starts fresh.
  return props.isOpen ? <FoodPhotoDialogBody {...props} /> : null;
}

function FoodPhotoDialogBody({ isOpen, onClose, patientId, mealType, logDate, consumedAt, onLogged }: FoodPhotoDialogProps) {
  const toast = useToast();
  const [step, setStep] = useState<Step>("pick");
  const [stage, setStage] = useState<string>("");
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState("");
  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(null);
  const [match, setMatch] = useState<FoodMatchResponse | null>(null);
  const [matchError, setMatchError] = useState("");
  const [usual, setUsual] = useState<PersonalizedQuickFoodItem[]>([]);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FoodItem[]>([]);
  const [error, setError] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest list, for checks that run after an await (a double tap must not add a food twice).
  const pickedRef = useRef<Picked[]>([]);
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);
  const keySeq = useRef(0);

  useEffect(() => {
    let active = true;
    getPersonalizedQuickFoods(patientId, mealType, 8)
      .then((list) => {
        if (active) setUsual(list);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [patientId, mealType]);

  // Typing is debounced so the catalogue is matched once per pause, not per key.
  function handleQuery(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = value.trim();
    if (!q) {
      setHits([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      searchFoodItems(q, 8)
        .then((r) => setHits([...r.exactMatches, ...r.suggestions].slice(0, 8)))
        .catch(() => setHits([]));
    }, 250);
  }

  async function handlePhoto(file: File) {
    setError("");
    setStep("analysing");
    try {
      setStage(isFoodModelLoaded() ? "फोटो तैयार हो रही है…" : "पहली बार: खाना पहचानने वाला मॉडल डाउनलोड हो रहा है (लगभग 15 MB, एक ही बार)…");
      const canvas = await decodePhoto(file, 1280);
      setPhoto(canvas);
      setPreview(previewDataUrl(canvas, 800));
      await loadFoodModel((s) => {
        if (s === "model") setStage("मॉडल लोड हो रहा है…");
        if (s === "ready") setStage("खाना पहचान रहे हैं…");
      });
      setStage("खाना पहचान रहे हैं…");
      const result = await analyseFoodPhoto(canvas, 8);
      setAnalysis(result);
      setStage("पिछले खाने से मिला रहे हैं…");
      try {
        setMatch(await matchFoodPhoto(patientId, result.embedding, result.predictions));
      } catch (err) {
        setMatch({ learned: [], suggestions: [] });
        setMatchError(err instanceof Error ? err.message : "सुझाव नहीं मिल सके");
      }
      setStep("choose");
    } catch (err) {
      setError(describeFailure(err));
      setStep("pick");
    }
  }

  async function addFood(food: FoodItem, preset?: { quantity?: number; unit?: string; caloriesPerUnit?: number | null }) {
    if (pickedRef.current.some((p) => p.food.id === food.id)) {
      toast.info(`${food.name} पहले से सूची में है`);
      return;
    }
    const portions = isCatalogueId(food.id) ? await getFoodPortions(food.id).catch(() => [] as FoodPortion[]) : [];
    const byUnit = preset?.unit ? portions.find((p) => loggedUnit(p.portion_name) === preset.unit) : undefined;
    const manual = food.calories_per_100g == null && preset?.caloriesPerUnit != null ? String(Math.round(preset.caloriesPerUnit)) : "";
    keySeq.current += 1;
    const entry: Picked = { key: `${food.id}-${keySeq.current}`, food, portions, portionId: byUnit?.id ?? portions[0]?.id ?? "", quantity: String(preset?.quantity ?? 1), manualKcal: manual };
    // Checked again inside the update: two taps may have been waiting on the portions together.
    setPicked((list) => (list.some((p) => p.food.id === food.id) ? list : [...list, entry]));
  }

  async function addSuggestion(s: FoodSuggestionItem) {
    const all = await getAllActiveFoods().catch(() => [] as FoodItem[]);
    const food = all.find((f) => f.id === s.id);
    if (!food) {
      toast.error("यह भोजन सूची में नहीं मिला");
      return;
    }
    await addFood(food);
  }

  async function addLearned(m: LearnedMatch) {
    const all = await getAllActiveFoods().catch(() => [] as FoodItem[]);
    for (const f of m.foods) await addFromPhotoFood(f, all);
  }

  async function addFromPhotoFood(f: FoodPhotoFood, all: FoodItem[]) {
    const food = f.food_item_id ? all.find((x) => x.id === f.food_item_id) : undefined;
    if (food) {
      await addFood(food, { quantity: f.quantity, unit: f.unit, caloriesPerUnit: f.quantity > 0 ? f.calories / f.quantity : f.calories });
      return;
    }
    // A typed food from an earlier photo: carry its name and calories as a one-off item.
    const perUnit = f.quantity > 0 ? f.calories / f.quantity : f.calories;
    await addFood(
      {
        id: `photo-${f.name}`,
        name: f.name,
        name_hi: null,
        category: "indian_preparation",
        subcategory: null,
        reference_weight_g: 100,
        reference_unit: f.unit || "serving",
        calories_per_100g: null,
        protein_g_100g: 0,
        carbs_g_100g: 0,
        fat_g_100g: 0,
        fibre_g_100g: 0,
        sodium_mg_100g: null,
        source_type: "user_entered",
        source_name: "Meal photo",
        source_note: "पिछली फोटो से",
        is_verified: false,
        is_custom: true,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { quantity: f.quantity, unit: f.unit, caloriesPerUnit: perUnit },
    );
  }

  async function addUsual(q: PersonalizedQuickFoodItem) {
    let food: FoodItem | undefined;
    try {
      food = (await searchFoodItems(q.name)).exactMatches[0];
    } catch {
      food = undefined;
    }
    await addFood(
      food ?? {
        id: `quick-${q.canonicalKey}`,
        name: q.name,
        name_hi: q.name_hi,
        category: q.category,
        subcategory: "quick_food",
        reference_weight_g: 100,
        reference_unit: "serving",
        calories_per_100g: q.caloriesKnown ? q.defaultCal : null,
        protein_g_100g: 0,
        carbs_g_100g: 0,
        fat_g_100g: 0,
        fibre_g_100g: 0,
        sodium_mg_100g: null,
        source_type: "user_entered",
        source_name: "Quick food (your past entries)",
        source_note: "आपके पिछले रिकॉर्ड का औसत",
        is_verified: false,
        is_custom: false,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    );
  }

  function update(key: string, patch: Partial<Picked>) {
    setPicked((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  const estimates = picked.map((p) => ({ p, e: estimate(p) }));
  const allValid = picked.length > 0 && estimates.every((x) => x.e !== null);
  const totalKcal = estimates.reduce((n, x) => n + (x.e?.kcal ?? 0), 0);

  async function save() {
    if (!allValid || !photo || !analysis) return;
    setStep("saving");
    setError("");
    const saved: FoodPhotoFood[] = [];
    try {
      for (const { p, e } of estimates) {
        if (!e) continue;
        const qty = parseFloat(p.quantity);
        const portion = p.portions.find((x) => x.id === p.portionId) ?? p.portions[0] ?? null;
        const per100 = (n: number | null | undefined) => ((n ?? 0) / 100) * e.grams;
        const unit = portion ? loggedUnit(portion.portion_name) : p.food.reference_unit;
        await logFood({
          patient_id: patientId,
          food_item_id: isCatalogueId(p.food.id) ? p.food.id : null,
          meal_type: mealType,
          food_name: p.food.name_hi ? `${p.food.name} (${p.food.name_hi})` : p.food.name,
          quantity: qty,
          unit,
          standardized_grams: Math.round(e.grams),
          calories: e.kcal,
          protein_g: Math.round(per100(p.food.protein_g_100g)),
          carbs_g: Math.round(per100(p.food.carbs_g_100g)),
          fat_g: Math.round(per100(p.food.fat_g_100g)),
          fibre_g: Math.round(per100(p.food.fibre_g_100g)),
          sodium_mg: p.food.sodium_mg_100g ? Math.round(per100(p.food.sodium_mg_100g)) : null,
          oil_quantity: "None",
          oil_calories: 0,
          calorie_confidence: e.confidence,
          source_type: p.food.calories_per_100g == null ? "user_entered" : p.food.source_type,
          source_note: "Logged from a meal photo",
          consumed_at: consumedAt ?? consumedAtFor(logDate, mealType, todayIST()),
          notes: null,
        });
        saved.push({ food_item_id: isCatalogueId(p.food.id) ? p.food.id : null, name: p.food.name, quantity: qty, unit, calories: e.kcal });
        // Off the list as soon as it is in the database, so a retry after a failure logs only the rest.
        setPicked((list) => list.filter((x) => x.key !== p.key));
      }
      // Remember the plate so the next photo of it is recognised at once.
      try {
        await rememberFoodPhoto({ patientId, mealType, foods: saved, embedding: analysis.embedding, thumbnail: thumbnailDataUrl(photo, 64) });
        toast.success(`${saved.length} चीज़ें दर्ज हुईं · ~${totalKcal} kcal`, "यह खाना याद रख लिया: अगली बार फोटो से तुरंत पहचान जाएगा।");
      } catch {
        toast.success(`${saved.length} चीज़ें दर्ज हुईं · ~${totalKcal} kcal`, "फोटो याद नहीं रखी जा सकी (खाना दर्ज हो गया है)।");
      }
      onLogged();
      onClose();
    } catch (err) {
      const reason = err instanceof Error && /[ऀ-ॿ]/.test(err.message) ? err.message : "भोजन दर्ज नहीं हो पाया। इंटरनेट जाँचकर दोबारा कोशिश करें।";
      setError(saved.length > 0 ? `${saved.length} चीज़ें दर्ज हो गईं; बाकी नहीं हो पाईं। ${reason}` : reason);
      setStep("choose");
      if (saved.length > 0) onLogged();
    }
  }

  const footer =
    step === "choose" ? (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={() => setStep("pick")}>
          <Camera aria-hidden className="h-4 w-4" />
          <span lang="hi">दूसरी फोटो</span>
        </Button>
        <Button variant="primary" disabled={!allValid} onClick={() => void save()}>
          <Utensils aria-hidden className="h-4 w-4" />
          <span lang="hi">{picked.length > 0 ? `${picked.length} चीज़ें दर्ज करें (~${totalKcal} kcal)` : "पहले खाना चुनें"}</span>
        </Button>
      </div>
    ) : undefined;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log a meal from a photo" hindiTitle="खाने की फोटो से दर्ज करें" size="lg" footer={footer} closeOnBackdrop={step === "pick"}>
      <div className="space-y-5">
        {error ? (
          <p role="alert" className="rounded-card border border-critical-line bg-critical-soft p-3 text-sm font-medium text-critical">
            {error}
          </p>
        ) : null}

        {step === "pick" ? (
          <>
            <p lang="hi" className="text-sm text-ink-muted">
              थाली या प्लेट की फोटो ऊपर से लें, पूरा खाना दिखे। ऐप फोटो देखकर खाना सुझाएगा; आप चुनकर मात्रा तय करें।
            </p>
            <PhotoPicker onPhoto={(f) => void handlePhoto(f)} captureLabel="खाने की फोटो लें" hint="फोटो फ़ोन पर ही पहचानी जाती है। दर्ज करने पर सिर्फ़ खाने की सूची और एक छोटा थंबनेल याद रखा जाता है, पूरी फोटो नहीं।" />
          </>
        ) : null}

        {step === "analysing" ? (
          <div role="status" aria-live="polite" className="tile flex items-center gap-3 rounded-card p-4">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- the person's own photo, just taken
              <img src={preview} alt="" className="h-16 w-16 shrink-0 rounded-control object-cover" />
            ) : null}
            <p lang="hi" className="text-sm text-ink">
              {stage}
            </p>
          </div>
        ) : null}

        {(step === "choose" || step === "saving") && match ? (
          <>
            <div className="flex items-start gap-3">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- the person's own photo, just taken
                <img src={preview} alt="आपकी खाने की फोटो" className="h-24 w-24 shrink-0 rounded-card object-cover ring-1 ring-line" />
              ) : null}
              <div className="min-w-0 text-sm text-ink-muted">
                <p lang="hi">नीचे के सुझावों में से जो थाली में है उसे टैप करें, मात्रा जाँचें और दर्ज करें।</p>
                {matchError ? (
                  <p lang="hi" className="mt-1 text-xs text-attention">
                    सुझाव नहीं मिल सके ({matchError}); खोजकर जोड़ें।
                  </p>
                ) : null}
              </div>
            </div>

            {match.learned.length > 0 ? (
              <section aria-labelledby="learned-heading" className="space-y-2">
                <h3 id="learned-heading" className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <History aria-hidden className="h-4 w-4 text-brand" />
                  <span lang="hi">पहले जैसा खाना</span>
                  <span className="text-xs font-normal text-ink-subtle">आपकी पिछली फोटो से</span>
                </h3>
                <ul className="space-y-2">
                  {match.learned.map((m) => (
                    <li key={m.exampleId} className="tile flex items-center gap-3 rounded-card p-3">
                      {isDataImage(m.thumbnail) ? (
                        // eslint-disable-next-line @next/next/no-img-element -- stored 64px thumbnail
                        <img src={m.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded-control object-cover" />
                      ) : (
                        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-control bg-food-soft text-food">
                          <Utensils className="h-5 w-5" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{m.foods.map((f) => f.name).join(", ")}</p>
                        <p className="text-xs text-ink-muted">
                          <Badge variant={m.similarity >= 0.85 ? "positive" : "info"}>{Math.round(m.similarity * 100)}% मेल</Badge>{" "}
                          {m.foods.reduce((n, f) => n + f.calories, 0)} kcal
                        </p>
                      </div>
                      <Button variant="primary" size="sm" onClick={() => void addLearned(m)}>
                        <Check aria-hidden className="h-4 w-4" />
                        <span lang="hi">यही है</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {match.suggestions.some((s) => s.foods.length > 0) ? (
              <section aria-labelledby="seen-heading" className="space-y-2">
                <h3 id="seen-heading" className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <Sparkles aria-hidden className="h-4 w-4 text-brand" />
                  <span lang="hi">फोटो में ऐसा लग रहा है</span>
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {match.suggestions.flatMap((s) =>
                    s.foods.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => void addSuggestion(f)}
                          className={cn(
                            "pressable inline-flex min-h-control cursor-pointer items-center gap-1.5 rounded-field border px-3 text-sm font-medium",
                            picked.some((p) => p.food.id === f.id) ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-surface text-ink hover:border-gold-line",
                          )}
                        >
                          <span aria-hidden>{f.emoji ?? getExactFoodEmoji(f.name, f.category)}</span>
                          <span className="max-w-48 truncate">
                            {f.name}
                            {f.name_hi ? <span lang="hi" className="ml-1 text-ink-muted">({f.name_hi})</span> : null}
                          </span>
                          <Plus aria-hidden className="h-3.5 w-3.5 text-ink-subtle" />
                        </button>
                      </li>
                    )),
                  )}
                </ul>
              </section>
            ) : (
              <p lang="hi" className="rounded-card border border-line bg-surface-sunken p-3 text-xs text-ink-muted">
                फोटो से कोई पक्का भोजन नहीं पहचाना गया। नीचे से चुनें या खोजें; दर्ज करने के बाद ऐप इस थाली को याद रख लेगा।
              </p>
            )}

            {usual.length > 0 ? (
              <section aria-labelledby="usual-heading" className="space-y-2">
                <h3 id="usual-heading" className="text-sm font-semibold text-ink">
                  <span lang="hi">इस समय का आपका नियमित भोजन</span>
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {usual.map((q) => (
                    <li key={q.canonicalKey}>
                      <button
                        type="button"
                        onClick={() => void addUsual(q)}
                        className="pressable inline-flex min-h-control cursor-pointer items-center gap-1.5 rounded-field border border-line bg-surface px-3 text-sm font-medium text-ink hover:border-gold-line"
                      >
                        <span aria-hidden>{getExactFoodEmoji(q.name, q.category)}</span>
                        <span className="max-w-40 truncate">{q.name}</span>
                        <Plus aria-hidden className="h-3.5 w-3.5 text-ink-subtle" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="space-y-2">
              <Field label="कुछ और खोजें (Search)" labelHidden>
                <div className="relative">
                  <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
                  <TextInput inputMode="search" autoComplete="off" placeholder="कुछ और खोजें, जैसे रोटी, दाल, सलाद" value={query} onChange={(e) => handleQuery(e.target.value)} className="pl-10" />
                </div>
              </Field>
              {hits.length > 0 ? (
                <ul className="divide-y divide-line rounded-card border border-line bg-surface">
                  {hits.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => {
                          void addFood(f);
                          handleQuery("");
                        }}
                        className="flex min-h-control w-full cursor-pointer items-center gap-2 px-3 text-left text-sm text-ink hover:bg-surface-sunken"
                      >
                        <span aria-hidden>{f.emoji ?? getExactFoodEmoji(f.name, f.category)}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {f.name}
                          {f.name_hi ? <span lang="hi" className="ml-1 text-ink-muted">({f.name_hi})</span> : null}
                        </span>
                        <Plus aria-hidden className="h-4 w-4 text-ink-subtle" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section aria-labelledby="picked-heading" className="space-y-2 border-t border-line pt-4">
              <h3 id="picked-heading" className="flex items-center justify-between text-sm font-semibold text-ink">
                <span lang="hi">थाली में क्या है ({picked.length})</span>
                {picked.length > 0 ? <span className="tabular text-xs font-normal text-ink-muted">कुल ~{totalKcal} kcal</span> : null}
              </h3>
              {picked.length === 0 ? (
                <p lang="hi" className="text-xs text-ink-subtle">
                  ऊपर के सुझावों से या खोजकर खाना जोड़ें।
                </p>
              ) : (
                <ul className="space-y-2">
                  {estimates.map(({ p, e }) => (
                    <li key={p.key} className="tile space-y-2 rounded-card p-3">
                      <div className="flex items-center gap-2">
                        <span aria-hidden className="text-lg">{p.food.emoji ?? getExactFoodEmoji(p.food.name, p.food.category)}</span>
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                          {p.food.name}
                          {p.food.name_hi ? <span lang="hi" className="ml-1 font-normal text-ink-muted">({p.food.name_hi})</span> : null}
                        </p>
                        <span className="tabular shrink-0 text-xs font-semibold text-brand-ink">{e ? `~${e.kcal} kcal` : "—"}</span>
                        <IconButton variant="ghost" size="sm" aria-label={`${p.food.name} हटाएँ`} onClick={() => setPicked((list) => list.filter((x) => x.key !== p.key))}>
                          <Trash2 aria-hidden className="h-4 w-4" />
                        </IconButton>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="मात्रा की इकाई">
                          {p.portions.length > 0 ? (
                            <Select value={p.portionId} onChange={(ev) => update(p.key, { portionId: ev.target.value })}>
                              {p.portions.map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.portion_name_hi || x.portion_name} (~{x.standardized_grams}g)
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <Select value="default" disabled onChange={() => {}}>
                              <option value="default">{p.food.reference_unit} ({p.food.reference_weight_g || 100} g)</option>
                            </Select>
                          )}
                        </Field>
                        <Field label="कितनी?" error={p.quantity && !estimate({ ...p, manualKcal: p.manualKcal || "1" }) ? "0 से 20 के बीच" : undefined}>
                          <NumberInput allowDecimal maxLength={5} value={p.quantity} onChange={(ev) => update(p.key, { quantity: ev.target.value })} />
                        </Field>
                      </div>
                      {p.food.calories_per_100g == null ? (
                        <Field label="एक मात्रा की कैलोरी (kcal)" hint="इसकी कैलोरी सूची में नहीं है; अंदाज़े से लिखें" required>
                          <NumberInput allowDecimal maxLength={5} placeholder="जैसे 120" value={p.manualKcal} onChange={(ev) => update(p.key, { manualKcal: ev.target.value })} />
                        </Field>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}

        {step === "saving" ? (
          <p role="status" lang="hi" className="text-sm text-ink-muted">
            दर्ज हो रहा है…
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
