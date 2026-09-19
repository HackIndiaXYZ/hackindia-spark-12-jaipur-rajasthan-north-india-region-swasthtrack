"use client";

import { useState } from "react";
import { Trash2, Edit, AlertCircle, Copy, Check, Calendar, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select, TextInput } from "@/components/ui/form-field";
import { deleteFoodLog, updateFoodLog, copyPreviousMeal, type FoodLogEntry } from "@/services/patient-service";
import { getExactFoodEmoji } from "@/lib/utils";

type FoodLogListProps = {
  logs: FoodLogEntry[];
  patientId: string;
  selectedDate: string;
  onRefresh: () => void;
  onDateChange: (date: string) => void;
  dailyCalorieTarget: number;
};

const MEAL_ORDER = [
  "Breakfast",
  "Mid-morning",
  "Lunch",
  "Evening snack",
  "Dinner",
  "Bedtime",
  "Other"
];

const MEAL_LABELS_HI: Record<string, string> = {
  "Breakfast": "नाश्ता (Breakfast)",
  "Mid-morning": "बीच का स्नैक (Mid-morning)",
  "Lunch": "दोपहर का खाना (Lunch)",
  "Evening snack": "शाम का स्नैक (Evening snack)",
  "Dinner": "रात का खाना (Dinner)",
  "Bedtime": "सोने से पहले (Bedtime)",
  "Other": "अन्य (Other)"
};

export function FoodLogList({
  logs,
  patientId,
  selectedDate,
  onRefresh,
  onDateChange,
  dailyCalorieTarget
}: FoodLogListProps) {
  const [editingItem, setEditingItem] = useState<FoodLogEntry | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editOil, setEditOil] = useState("None");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isCopying, setIsCopying] = useState(false);

  // Group logs by meal type
  const groupedLogs = MEAL_ORDER.reduce((acc, meal) => {
    const mealLogs = logs.filter(l => l.meal_type === meal);
    if (mealLogs.length > 0) {
      acc[meal] = mealLogs;
    }
    return acc;
  }, {} as Record<string, FoodLogEntry[]>);

  // Remaining logs that might not match standard order
  const customMeals = logs.filter(l => !MEAL_ORDER.includes(l.meal_type));
  if (customMeals.length > 0) {
    groupedLogs["Other"] = [...(groupedLogs["Other"] || []), ...customMeals];
  }

  // Calculate day totals
  const totalCalories = logs.reduce((sum, item) => sum + item.calories, 0);
  const totalProtein = logs.reduce((sum, item) => sum + (item.protein_g || 0), 0);
  const overTarget = totalCalories - dailyCalorieTarget;

  // Date handlers (IST Safe)
  const adjustDate = (days: number) => {
    if (!selectedDate) return;
    const [y, m, d] = selectedDate.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d + days);
    const nextY = dateObj.getFullYear();
    const nextM = String(dateObj.getMonth() + 1).padStart(2, "0");
    const nextD = String(dateObj.getDate()).padStart(2, "0");
    onDateChange(`${nextY}-${nextM}-${nextD}`);
  };

  const handleEditClick = (item: FoodLogEntry) => {
    setEditingItem(item);
    setEditQty(String(item.quantity));
    setEditOil(item.oil_quantity || "None");
    setErrorMsg("");
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setErrorMsg("");

    const newQty = parseFloat(editQty);
    if (isNaN(newQty) || newQty <= 0) {
      setErrorMsg("मात्रा 0 से अधिक होनी चाहिए।");
      return;
    }

    try {
      // Calculate updated calories based on ratio
      const ratio = newQty / editingItem.quantity;
      const baseFoodCals = (editingItem.calories - (editingItem.oil_calories || 0)) * ratio;
      
      let newOilCals = 0;
      if (editOil === "1/2 tsp") newOilCals = 22;
      else if (editOil === "1 tsp") newOilCals = 45;
      else if (editOil === "2 tsp") newOilCals = 90;
      else if (editOil === "1 tbsp") newOilCals = 120;

      const finalCals = Math.round(baseFoodCals + newOilCals);

      await updateFoodLog(editingItem.id, {
        quantity: newQty,
        oil_quantity: editOil,
        oil_calories: newOilCals,
        calories: finalCals,
        protein_g: editingItem.protein_g ? Math.round(editingItem.protein_g * ratio) : 0,
        carbs_g: editingItem.carbs_g ? Math.round(editingItem.carbs_g * ratio) : 0,
        fat_g: editingItem.fat_g ? Math.round(editingItem.fat_g * ratio) : 0,
        calorie_confidence: editOil === "Unknown" ? "Low" : editingItem.calorie_confidence,
        notes: editOil === "Unknown" ? "तेल की मात्रा पता नहीं है, इसलिए calorie estimate कम accurate हो सकता है।" : null
      });

      setEditingItem(null);
      setSuccessMsg("बदलाव सुरक्षित हो गए हैं!");
      onRefresh();
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "बदलाव सहेजने में विफल।");
    }
  };

  const handleDeleteClick = async (id: string) => {
    if (confirm("क्या आप इस भोजन प्रविष्टि को हटाना चाहते हैं? (Remove log?)")) {
      try {
        await deleteFoodLog(id);
        setSuccessMsg("भोजन सूची से हटा दिया गया है।");
        onRefresh();
        setTimeout(() => setSuccessMsg(""), 3000);
      } catch {
        setErrorMsg("हटाने में विफलता आई।");
      }
    }
  };

  // Copy yesterday's specific meal slot to today
  const handleCopyMeal = async (mealSlot: string) => {
    setIsCopying(true);
    setErrorMsg("");
    setSuccessMsg("");
    
    // Get yesterday's date
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    const yesterdayStr = d.toISOString().split("T")[0];
    
    try {
      const success = await copyPreviousMeal(patientId, yesterdayStr, selectedDate, mealSlot);
      if (success) {
        setSuccessMsg(`कल का ${mealSlot} आज की सूची में कॉपी हो गया!`);
        onRefresh();
      } else {
        setErrorMsg(`कल के ${mealSlot} में कोई भोजन प्रविष्टि नहीं मिली।`);
      }
    } catch {
      setErrorMsg("कॉपी करने में विफलता आई।");
    } finally {
      setIsCopying(false);
      setTimeout(() => {
        setSuccessMsg("");
        setErrorMsg("");
      }, 4000);
    }
  };

  return (
    <Card className="border-line">
      {/* Date Navigation Bar */}
      <div className="bg-surface-sunken border-b border-line px-3 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => adjustDate(-1)}
            className="p-2 h-8 w-8 sm:h-9 sm:w-9 rounded-control shrink-0"
          >
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5 text-ink-muted" />
          </Button>
          <div className="flex items-center gap-1.5 font-semibold text-ink text-xs sm:text-base min-w-0 text-center justify-center">
            <Calendar className="h-4 w-4 text-brand shrink-0" />
            <span className="truncate">{selectedDate === new Date().toISOString().split("T")[0] ? "आज (Today)" : selectedDate}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => adjustDate(1)}
            className="p-2 h-8 w-8 sm:h-9 sm:w-9 rounded-control shrink-0"
          >
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-ink-muted" />
          </Button>
        </div>

        {/* Dynamic target calorie indicator */}
        <div className="text-right">
          <span className="text-xs text-ink-subtle font-semibold block">आज का कैलोरी उपयोग (Calorie Budget)</span>
          <span className="text-lg font-bold text-ink">
            {totalCalories} / {dailyCalorieTarget} kcal
          </span>
          <span className="text-xs font-semibold text-brand block mt-0.5">
            Total Protein: {totalProtein} g
          </span>
          {logs.length > 0 && (
            <span className="text-xs font-semibold block mt-0.5">
              {overTarget > 0 ? (
                <span className="text-critical">
                  +{overTarget} kcal over target (आज calorie target से ऊपर रहा। कल portions/oil पर ध्यान दें।)
                </span>
              ) : (
                <span className="text-positive">
                  Remaining: {Math.abs(overTarget)} kcal
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Status indicators */}
        {errorMsg && (
          <div className="rounded-card border border-critical-line bg-critical-soft p-3 text-sm font-semibold text-critical">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="rounded-card border border-positive-line bg-positive-soft p-3 text-sm font-semibold text-positive flex gap-2 items-center">
            <Check className="h-4 w-4 text-positive" />
            {successMsg}
          </div>
        )}

        {/* Render meal groups */}
        {logs.length > 0 ? (
          <div className="space-y-6">
            {Object.entries(groupedLogs).map(([mealName, mealItems]) => {
              const mealTotal = mealItems.reduce((sum, i) => sum + i.calories, 0);
              return (
                <div key={mealName} className="rounded-card border border-line bg-surface overflow-hidden shadow-xs">
                  {/* Meal Group Header */}
                  <div className="bg-surface-sunken/70 border-b border-line px-4 py-3 flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-ink text-sm">
                        {MEAL_LABELS_HI[mealName] || mealName}
                      </h4>
                      <span className="text-2xs text-ink-subtle font-semibold block mt-0.5">
                        {mealItems.length} items logged
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Copy Previous breakfast/lunch shortcut */}
                      <button
                        type="button"
                        onClick={() => handleCopyMeal(mealName)}
                        disabled={isCopying}
                        className="text-xs font-semibold text-brand-ink bg-brand-soft hover:bg-brand-soft/80 border border-brand-line/50 px-2.5 py-1 rounded-control flex items-center gap-1 transition-all disabled:opacity-50"
                        title="कल के इस भोजन को आज दोहराएं"
                      >
                        <Copy className="h-3 w-3" />
                        कल का कॉपी करें
                      </button>
                      <span className="font-semibold text-ink text-sm">
                        ~{mealTotal} kcal
                      </span>
                    </div>
                  </div>

                  {/* Meal Group Items */}
                  <div className="divide-y divide-line">
                    {mealItems.map((item) => {
                      const loggedTime = new Date(item.consumed_at).getTime();
                      const currentTime = new Date().getTime();
                      const canEdit = (currentTime - loggedTime) < (2 * 60 * 60 * 1000);

                      return (
                        <div key={item.id} className="p-4 hover:bg-surface-sunken/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-colors">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xl shrink-0">{getExactFoodEmoji(item.food_name)}</span>
                              <span className="font-semibold text-ink">{item.food_name}</span>
                              <Badge variant={item.calorie_confidence === "High" ? "green" : item.calorie_confidence === "Medium" ? "blue" : "amber"}>
                                {item.calorie_confidence} confidence
                              </Badge>
                              <span className="text-xs text-ink-subtle font-semibold bg-surface-sunken px-1.5 py-0.5 rounded">
                                🕐 {new Date(item.consumed_at).toLocaleTimeString("hi-IN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <div className="text-xs text-ink-subtle font-medium space-x-2">
                              <span>मात्रा (Quantity): {item.quantity} {item.unit}</span>
                              {item.standardized_grams && <span>({item.standardized_grams}g)</span>}
                              {item.oil_quantity && item.oil_quantity !== "None" && (
                                <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded font-semibold border border-amber-100">
                                  🍳 तेल: {item.oil_quantity} (+{item.oil_calories} kcal)
                                </span>
                              )}
                            </div>
                            {item.notes && (
                              <p className="text-xs text-amber-700 font-medium italic flex items-center gap-1 bg-amber-50/40 p-1.5 rounded border border-amber-100/50">
                                <AlertCircle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                                {item.notes}
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center justify-between sm:justify-end gap-4">
                            <span className="font-bold text-ink text-base">
                              ~{item.calories} kcal
                            </span>
                            <div className="flex gap-1.5 items-center">
                              {canEdit ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => handleEditClick(item)}
                                    className="p-2 h-11 w-11 text-ink-subtle hover:text-info hover:bg-info-soft rounded-control transition-colors"
                                    title="बदलाव करें (Edit entry)"
                                  >
                                    <Edit className="h-6 w-6" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => handleDeleteClick(item.id)}
                                    className="p-2 h-11 w-11 text-ink-subtle hover:text-critical hover:bg-critical-soft rounded-control transition-colors"
                                    title="हटाएं (Delete entry)"
                                  >
                                    <Trash2 className="h-6 w-6" />
                                  </Button>
                                </>
                              ) : (
                                <span 
                                  className="p-2 text-ink-subtle flex items-center justify-center cursor-help" 
                                  title="2 घंटे बीत चुके हैं, अब इसे बदला या हटाया नहीं जा सकता (Locked after 2 hours)"
                                >
                                  <Lock className="h-6 w-6 text-ink-subtle" />
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-card border-2 border-dashed border-line bg-surface-sunken/50 p-10 text-center">
            <p className="text-ink-subtle font-medium text-sm">
              आज अभी तक कोई भोजन प्रविष्टि नहीं की गई है। (No meals logged today)
            </p>
            <p className="text-ink-subtle text-xs mt-1">
              दवाइयों और स्वास्थ्य के अनुकूल भोजन लॉग करने के लिए ऊपर दिए गए सर्च फॉर्म का उपयोग करें।
            </p>
          </div>
        )}
      </div>

      {/* Structured Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-xs p-4">
          <div className="bg-surface rounded-sheet w-full max-w-md overflow-hidden shadow-e4 border border-line flex flex-col">
            <div className="bg-brand px-6 py-4 text-ink-inverse">
              <h3 className="font-semibold text-lg">प्रविष्टि संपादित करें (Edit Logged Food)</h3>
              <p className="text-ink-inverse/80 text-xs mt-0.5">{editingItem.food_name}</p>
            </div>

            <div className="p-6 space-y-4">
              {errorMsg && (
                <div className="rounded-card border border-critical-line bg-critical-soft p-3 text-xs font-semibold text-critical">
                  {errorMsg}
                </div>
              )}

              <Field label="Quantity (मात्रा multiplier)">
                <TextInput
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  required
                />
              </Field>

              <Field label="Cooking Oil Quantity (तेल उपयोग)">
                <Select value={editOil} onChange={(e) => setEditOil(e.target.value)}>
                  <option value="None">बिना तेल (None)</option>
                  <option value="1/2 tsp">½ चम्मच (+22 cal)</option>
                  <option value="1 tsp">1 चम्मच (+45 cal)</option>
                  <option value="2 tsp">2 चम्मच (+90 cal)</option>
                  <option value="1 tbsp">1 बड़ा चम्मच (+120 cal)</option>
                  <option value="Unknown">पता नहीं (Unknown)</option>
                </Select>
              </Field>
            </div>

            <div className="bg-surface-sunken px-6 py-4 flex justify-end gap-2 border-t border-line">
              <Button type="button" variant="ghost" onClick={() => setEditingItem(null)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={handleSaveEdit}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
