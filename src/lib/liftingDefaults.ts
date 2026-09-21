import type { Exercise, Program, ProgramDay } from "@/db/types";

export const MUSCLE_GROUPS = ["chest", "back", "shoulders", "arms", "legs", "core", "other"] as const;

type Row = [id: string, name: string, muscle: Exercise["muscle"], type: Exercise["scheme"]["type"], repsMin: number, repsMax: number, sets: number, increment: number, notes?: string];

const ROWS: Row[] = [
  ["bench", "Barbell Bench Press", "chest", "heavy", 3, 5, 3, 5],
  ["incline_db", "Incline Dumbbell Bench", "chest", "failure", 6, 12, 2, 5, "Weight per arm"],
  ["flys", "Cable Flys", "chest", "failure", 8, 15, 3, 2.5, "Weight per arm"],
  ["push_up", "Push-up", "chest", "failure", 8, 20, 3, 0, "Weight = added load (0 for bodyweight)"],
  ["cs_row", "Chest Supported Row", "back", "failure", 6, 10, 2, 5],
  ["lat_pulldown", "Lat Pulldown", "back", "failure", 6, 10, 2, 5],
  ["single_arm_pulldown", "Single Arm Pulldown / Pullover", "back", "failure", 6, 12, 2, 2.5],
  ["pull_up", "Pull-up", "back", "failure", 4, 10, 3, 2.5, "Weight = added load"],
  ["barbell_row", "Barbell Row", "back", "heavy", 5, 8, 3, 5],
  ["deadlift", "Deadlift", "back", "heavy", 3, 5, 2, 10],
  ["squat", "Barbell Back Squat", "legs", "heavy", 3, 5, 3, 5],
  ["front_squat", "Front Squat", "legs", "heavy", 3, 6, 3, 5],
  ["rdl", "Romanian Deadlift", "legs", "failure", 6, 10, 2, 5],
  ["leg_press", "Leg Press", "legs", "failure", 8, 12, 3, 10],
  ["leg_ext", "Leg Extension", "legs", "failure", 8, 15, 2, 5],
  ["hammy_curl", "Hamstring Curl", "legs", "failure", 8, 12, 2, 5],
  ["lunge", "Walking Lunge", "legs", "failure", 8, 12, 2, 5, "Weight per hand"],
  ["calf_raise", "Calf Raise", "legs", "failure", 10, 15, 3, 10],
  ["accessory", "Adductors / Abductors", "legs", "feel", 10, 20, 1, 5, "To feel"],
  ["db_press", "Dumbbell Shoulder Press", "shoulders", "failure", 6, 10, 2, 5, "Weight per arm"],
  ["ohp", "Overhead Press", "shoulders", "heavy", 3, 6, 3, 2.5],
  ["shrugs", "Dumbbell Shrugs", "shoulders", "failure", 8, 12, 2, 5],
  ["lat_raises", "Lateral Raises", "shoulders", "failure", 10, 20, 3, 2.5, "Light, strict"],
  ["rear_delt", "Rear Delt Flys", "shoulders", "failure", 12, 20, 2, 2.5, "Light, high reps"],
  ["face_pull", "Face Pull", "shoulders", "failure", 12, 20, 3, 2.5],
  ["dips", "Weighted Dips", "arms", "failure", 5, 10, 2, 5],
  ["tricep_push", "Tricep Pushdown", "arms", "failure", 8, 12, 2, 5, "Flat bar, not rope"],
  ["skullcrusher", "Skullcrusher", "arms", "failure", 8, 12, 3, 2.5],
  ["biceps", "Biceps Curl", "arms", "failure", 8, 12, 3, 2.5],
  ["hammer_curl", "Hammer Curl", "arms", "failure", 8, 12, 3, 2.5],
  ["plank", "Plank", "core", "feel", 30, 90, 3, 0, "Reps = seconds"],
  ["cable_crunch", "Cable Crunch", "core", "failure", 10, 20, 3, 5],
  ["hanging_leg_raise", "Hanging Leg Raise", "core", "failure", 8, 15, 3, 0],
];

export function buildDefaultExercises(): Exercise[] {
  return ROWS.map(([id, name, muscle, type, repsMin, repsMax, sets, increment, notes]) => ({
    id: `ex_${id}`,
    name,
    muscle,
    scheme: { type, repsMin, repsMax, sets },
    increment,
    notes: notes ?? "",
    builtin: true,
    updatedAt: 0,
  }));
}

const ex = (id: string) => `ex_${id}`;
const day = (id: string, name: string, ids: string[]): ProgramDay => ({ id: `day_${id}`, name, exerciseIds: ids.map(ex) });

export interface ProgramTemplate {
  id: string;
  name: string;
  level: Program["level"];
  description: string;
  days: ProgramDay[];
}

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    id: "tpl_ppl_lite",
    name: "Chest/Back · Legs · Shoulders/Arms",
    level: "intermediate",
    description: "3-day split with heavy compounds first, then failure-range accessories. The original LiftLog program.",
    days: [
      day("chest_back", "Chest / Back", ["bench", "incline_db", "flys", "cs_row", "lat_pulldown", "single_arm_pulldown"]),
      day("legs", "Legs", ["squat", "rdl", "leg_ext", "hammy_curl", "calf_raise", "accessory"]),
      day("shoulders_arms", "Shoulders & Arms", ["db_press", "shrugs", "lat_raises", "rear_delt", "dips", "tricep_push", "biceps"]),
    ],
  },
  {
    id: "tpl_beginner",
    name: "Beginner Full Body",
    level: "beginner",
    description: "3 full-body days built around simple, repeatable compounds and linear progression.",
    days: [
      day("fb_a", "Full Body A", ["squat", "bench", "cs_row", "lat_raises", "biceps"]),
      day("fb_b", "Full Body B", ["deadlift", "ohp", "lat_pulldown", "leg_ext", "tricep_push"]),
      day("fb_c", "Full Body C", ["front_squat", "incline_db", "single_arm_pulldown", "hammy_curl", "rear_delt"]),
    ],
  },
  {
    id: "tpl_upper_lower",
    name: "Upper / Lower",
    level: "intermediate",
    description: "4-day upper/lower split with more weekly volume and repeated movement patterns.",
    days: [
      day("upper1", "Upper 1", ["bench", "cs_row", "incline_db", "lat_pulldown", "tricep_push", "biceps"]),
      day("lower1", "Lower 1", ["squat", "rdl", "leg_ext", "hammy_curl", "calf_raise"]),
      day("upper2", "Upper 2", ["ohp", "pull_up", "dips", "lat_raises", "rear_delt", "hammer_curl"]),
      day("lower2", "Lower 2", ["deadlift", "front_squat", "lunge", "hammy_curl", "cable_crunch"]),
    ],
  },
  {
    id: "tpl_ppl",
    name: "Push / Pull / Legs",
    level: "advanced",
    description: "Higher-volume 5-day split for specialisation across push, pull, legs and arms.",
    days: [
      day("push", "Push", ["bench", "incline_db", "db_press", "lat_raises", "tricep_push", "skullcrusher"]),
      day("pull", "Pull", ["deadlift", "cs_row", "lat_pulldown", "single_arm_pulldown", "rear_delt", "biceps"]),
      day("legs2", "Legs", ["squat", "rdl", "leg_press", "leg_ext", "hammy_curl", "calf_raise"]),
      day("chest_back2", "Chest / Back", ["bench", "incline_db", "flys", "barbell_row", "pull_up"]),
      day("sh_arms", "Shoulders / Arms", ["ohp", "shrugs", "lat_raises", "face_pull", "dips", "hammer_curl"]),
    ],
  },
];

export function programFromTemplate(t: ProgramTemplate, suffix: string): Program {
  return {
    id: `prog_${t.id}_${suffix}`,
    name: t.name,
    level: t.level,
    days: t.days.map((d) => ({ ...d, id: `${d.id}_${suffix}`, exerciseIds: [...d.exerciseIds] })),
    active: false,
    updatedAt: 0,
  };
}
