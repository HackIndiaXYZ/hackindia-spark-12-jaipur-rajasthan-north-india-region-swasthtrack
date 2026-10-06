/**
 * The learned-meal-photo store and the photo matcher, from the browser's side.
 *
 * A confirmed photo is stored as an example (embedding + foods + a 64 px thumbnail)
 * through the normal query gateway, under the patient; matching runs on the
 * server (/api/vision/food) over the patient's examples and the food catalogue.
 */
import { authFetch } from "@/lib/db/auth-fetch";
import type { FoodPhotoFood } from "@/lib/db/database.types";
import type { FoodMatchResponse } from "@/app/api/vision/food/route";
import { packEmbedding, type FoodPrediction } from "@/lib/vision/food-model";
import { getDbClient, invalidatePatientCache } from "./patient-service";

export type { FoodMatchResponse, FoodSuggestionItem, LearnedMatch } from "@/app/api/vision/food/route";
export type { FoodPhotoFood };

export interface FoodPhotoExample {
  id: string;
  patient_id: string;
  meal_type: string | null;
  foods: FoodPhotoFood[];
  thumbnail: string | null;
  created_at: string;
}

/** Asks the server what this photo probably shows. */
export async function matchFoodPhoto(patientId: string, embedding: Float32Array, predictions: FoodPrediction[]): Promise<FoodMatchResponse> {
  const res = await authFetch("/api/vision/food", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientId, embedding: packEmbedding(embedding), labels: predictions.slice(0, 8) }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `फोटो मिलान नहीं हो पाया (HTTP ${res.status})`);
  }
  return (await res.json()) as FoodMatchResponse;
}

/** Remembers a confirmed photo so the next similar one is recognised. */
export async function rememberFoodPhoto(input: {
  patientId: string;
  mealType: string;
  foods: FoodPhotoFood[];
  embedding: Float32Array;
  thumbnail: string | null;
}): Promise<void> {
  const { error } = await getDbClient()
    .from("food_photo_examples")
    .insert({
      patient_id: input.patientId,
      meal_type: input.mealType,
      foods: input.foods,
      embedding: packEmbedding(input.embedding),
      thumbnail: input.thumbnail,
    });
  if (error) throw new Error(error.message || "फोटो याद नहीं रखी जा सकी");
  invalidatePatientCache(input.patientId);
}

/** The learned photos of a patient, newest first (for the review list in settings). */
export async function listFoodPhotoExamples(patientId: string, limit = 60): Promise<FoodPhotoExample[]> {
  const { data, error } = await getDbClient()
    .from("food_photo_examples")
    .select("id,patient_id,meal_type,foods,thumbnail,created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message || "सीखी हुई फोटो नहीं मिलीं");
  return (data ?? []) as FoodPhotoExample[];
}

export async function forgetFoodPhoto(id: string): Promise<void> {
  const { error } = await getDbClient().from("food_photo_examples").delete().eq("id", id);
  if (error) throw new Error(error.message || "हटाया नहीं जा सका");
}
