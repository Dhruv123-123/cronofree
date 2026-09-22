import type { Nutrients } from "@/lib/nutrients";

export type ISODate = string; // YYYY-MM-DD in local time

/** Every synced row carries these. `deletedAt` is a tombstone. */
export interface Base {
  id: string;
  updatedAt: number;
  deletedAt?: number | null;
}

/* ───────────────────────────── Nutrition ───────────────────────────── */
export interface Serving {
  id: string;
  label: string; // "1 cup", "1 medium", "1 slice"
  grams: number;
}

export type FoodSource = "custom" | "seed" | "off" | "usda" | "recipe";

export interface Food extends Base {
  name: string;
  brand?: string;
  source: FoodSource;
  sourceId?: string; // OFF barcode / USDA fdcId
  barcode?: string;
  per100: Nutrients; // per 100 g
  servings: Serving[];
  defaultServingId?: string;
  isLiquid?: boolean;
  category?: string;
  verified?: boolean;
  favorite?: boolean;
  useCount?: number;
  lastUsedAt?: number;
  recipeId?: string;
  /** search helper: lowercased name + brand */
  search: string;
}

export interface RecipeIngredient {
  foodId: string;
  name: string;
  grams: number;
  per100: Nutrients; // snapshot so recipes survive food deletion
}

export interface Recipe extends Base {
  name: string;
  ingredients: RecipeIngredient[];
  yieldServings: number;
  yieldGrams?: number; // cooked weight, optional; defaults to sum of ingredients
  notes?: string;
  foodId: string; // materialised Food row for logging
}

export type EntryKind = "food" | "quick" | "exercise";

export interface DiaryEntry extends Base {
  date: ISODate;
  mealId: string;
  kind: EntryKind;
  foodId?: string;
  name: string;
  brand?: string;
  grams: number;
  servingLabel?: string;
  servingQty?: number;
  nutrients: Nutrients; // totals for this entry
  time?: string; // HH:MM
  note?: string;
  order: number;
}

export interface SavedMealItem {
  foodId?: string;
  name: string;
  grams: number;
  servingLabel?: string;
  servingQty?: number;
  nutrients: Nutrients;
}

export interface SavedMeal extends Base {
  name: string;
  items: SavedMealItem[];
  useCount?: number;
}

export interface WaterLog extends Base {
  date: ISODate;
  ml: number;
}

export interface Fast extends Base {
  startAt: number;
  endAt?: number | null;
  targetHours: number;
}

/* ───────────────────────────── Body ───────────────────────────── */
export interface WeightEntry extends Base {
  date: ISODate;
  at: number;
  kg: number;
  bodyFatPct?: number;
  note?: string;
}

export type MeasurementKind = "waist" | "hips" | "chest" | "neck" | "leftArm" | "rightArm" | "leftThigh" | "rightThigh" | "shoulders" | "calf";

export interface Measurement extends Base {
  date: ISODate;
  kind: MeasurementKind;
  cm: number;
}

export type BiometricKind = "bloodPressure" | "restingHr" | "sleep" | "glucose" | "ketones" | "bodyFat" | "steps" | "mood" | "energy" | "hrv" | "temperature";

export interface Biometric extends Base {
  date: ISODate;
  at: number;
  kind: BiometricKind;
  value: number;
  value2?: number; // diastolic for blood pressure
  note?: string;
}

export interface Photo extends Base {
  date: ISODate;
  at: number;
  dataUrl: string; // compressed jpeg
  note?: string;
  workoutId?: string;
}

/* ───────────────────────────── Goals & profile ───────────────────────────── */
export interface MacroTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very";
export type GoalType = "lose" | "maintain" | "gain";
export type ExpenditureMode = "formula" | "adaptive" | "manual";

export interface Profile extends Base {
  name?: string;
  sex: "male" | "female";
  birthYear: number;
  heightCm: number;
  activity: ActivityLevel;
  goal: GoalType;
  /** signed kg per week, e.g. -0.5 */
  rateKgPerWeek: number;
  targetWeightKg?: number;
  expenditureMode: ExpenditureMode;
  manualTdee?: number;
  /** Adaptive mode: last accepted expenditure estimate, refreshed on check-in */
  expenditure?: number;
  expenditureUpdatedAt?: number;
  targets: MacroTargets;
  /** 0 = Sunday … 6 = Saturday. Partial override per weekday (training days etc.) */
  weekdayTargets?: Partial<Record<number, Partial<MacroTargets>>>;
  nutrientTargetOverrides?: Nutrients;
  trackedNutrients?: string[];
  /** percent of daily calories per meal id, e.g. { breakfast: 25, lunch: 35 } */
  mealSplit?: Record<string, number>;
  netCarbsTarget?: number;
  mealNames: string[];
  units: { weight: "kg" | "lb"; height: "cm" | "in"; volume: "ml" | "oz" };
  startOfWeek: 0 | 1;
  waterGoalMl: number;
  fastingDefaultHours: number;
  theme: "system" | "dark" | "light";
  onboarded: boolean;
}

export interface DayTargetOverride extends Base {
  date: ISODate;
  targets: Partial<MacroTargets>;
  note?: string;
  completed?: boolean;
}

/* ───────────────────────────── Train (LiftLog) ───────────────────────────── */
export type MuscleGroup = "chest" | "back" | "shoulders" | "arms" | "legs" | "core" | "other";
export type SchemeType = "heavy" | "failure" | "feel";

export interface Exercise extends Base {
  name: string;
  muscle: MuscleGroup;
  scheme: { type: SchemeType; repsMin: number; repsMax: number; sets: number };
  increment: number; // in the user's weight unit
  notes?: string;
  builtin?: boolean;
}

export interface ProgramDay {
  id: string;
  name: string;
  exerciseIds: string[];
}

export interface Program extends Base {
  name: string;
  level: "beginner" | "intermediate" | "advanced" | "custom";
  days: ProgramDay[];
  active?: boolean;
}

export interface WorkoutSet {
  weight: number;
  reps: number;
  rpe?: number | null;
  completed: boolean;
}

export interface WorkoutExercise {
  exerciseId: string;
  customName?: string;
  sets: WorkoutSet[];
}

export interface Workout extends Base {
  date: ISODate;
  startedAt?: number;
  finishedAt?: number;
  programId?: string;
  programDayId: string;
  programDayName: string;
  exercises: WorkoutExercise[];
  sessionNotes?: string;
  bodyWeightKg?: number;
}

/** In-progress workout. Local only, never synced. */
export interface DraftSet {
  weight: string;
  reps: string;
  rpe: string;
  completed: boolean;
}
export interface DraftExercise {
  exerciseId: string;
  customName?: string;
  sets: DraftSet[];
}
export interface WorkoutDraft {
  date: ISODate;
  startedAt: number;
  programId?: string;
  programDayId: string;
  programDayName: string;
  exercises: DraftExercise[];
  sessionNotes: string;
  currentExerciseIdx: number;
  pendingPhotos: { id: string; dataUrl: string }[];
}

/* ───────────────────────────── Sync ───────────────────────────── */
export type Collection =
  | "foods" | "recipes" | "entries" | "savedMeals" | "water" | "fasts" | "weights" | "measurements"
  | "photos" | "profile" | "dayOverrides" | "exercises" | "programs" | "workouts" | "biometrics";

export interface Outbox {
  key: string; // `${collection}:${id}`
  collection: Collection;
  id: string;
  at: number;
}

export interface KV {
  key: string;
  value: unknown;
}
