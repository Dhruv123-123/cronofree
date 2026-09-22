/** Compendium of Physical Activities MET values (2011/2024 editions), the same source MyFitnessPal and Cronometer use. */
export interface Activity { id: string; name: string; met: number; group: string }

const A = (id: string, name: string, met: number, group: string): Activity => ({ id, name, met, group });

export const ACTIVITIES: Activity[] = [
  A("walk_slow", "Walking, slow (2 mph)", 2.8, "Walking"), A("walk_mod", "Walking, moderate (3 mph)", 3.5, "Walking"), A("walk_brisk", "Walking, brisk (3.5–4 mph)", 4.3, "Walking"), A("walk_fast", "Walking, very brisk (4.5 mph)", 7.0, "Walking"), A("hike", "Hiking, cross-country", 6.0, "Walking"), A("hike_pack", "Hiking with a pack, hills", 7.8, "Walking"),
  A("run_5", "Running, 5 mph (12 min/mile)", 8.3, "Running"), A("run_6", "Running, 6 mph (10 min/mile)", 9.8, "Running"), A("run_7", "Running, 7 mph (8.5 min/mile)", 11.0, "Running"), A("run_8", "Running, 8 mph (7.5 min/mile)", 11.8, "Running"), A("run_10", "Running, 10 mph (6 min/mile)", 14.5, "Running"), A("run_trail", "Trail running", 9.0, "Running"), A("jog", "Jogging, general", 7.0, "Running"),
  A("bike_light", "Cycling, leisure (10–12 mph)", 6.8, "Cycling"), A("bike_mod", "Cycling, moderate (12–14 mph)", 8.0, "Cycling"), A("bike_vig", "Cycling, vigorous (14–16 mph)", 10.0, "Cycling"), A("bike_race", "Cycling, racing (16–19 mph)", 12.0, "Cycling"), A("bike_mtb", "Mountain biking", 8.5, "Cycling"), A("spin", "Indoor cycling / spin class", 8.5, "Cycling"), A("bike_commute", "Cycling to work, self-selected pace", 6.8, "Cycling"),
  A("swim_free_light", "Swimming, freestyle, light", 5.8, "Swimming"), A("swim_free_mod", "Swimming, freestyle, moderate", 8.3, "Swimming"), A("swim_free_vig", "Swimming, freestyle, fast", 9.8, "Swimming"), A("swim_breast", "Swimming, breaststroke", 5.3, "Swimming"), A("swim_back", "Swimming, backstroke", 4.8, "Swimming"), A("swim_leisure", "Swimming, leisurely", 6.0, "Swimming"),
  A("lift_light", "Weight lifting, light to moderate", 3.5, "Gym"), A("lift_vig", "Weight lifting, vigorous (heavy compounds)", 6.0, "Gym"), A("circuit", "Circuit training", 8.0, "Gym"), A("hiit", "HIIT / interval training", 8.0, "Gym"), A("crossfit", "CrossFit-style WOD", 8.0, "Gym"), A("elliptical", "Elliptical trainer, moderate", 5.0, "Gym"), A("rower_mod", "Rowing machine, moderate", 7.0, "Gym"), A("rower_vig", "Rowing machine, vigorous", 8.5, "Gym"), A("stair", "Stair climber", 9.0, "Gym"), A("jump_rope", "Jumping rope, moderate", 11.8, "Gym"), A("calisthenics", "Calisthenics (push-ups, pull-ups), vigorous", 8.0, "Gym"), A("calisthenics_light", "Calisthenics, light", 3.8, "Gym"), A("kettlebell", "Kettlebell swings / circuit", 9.8, "Gym"), A("stretch", "Stretching, mobility", 2.3, "Gym"),
  A("yoga_hatha", "Yoga, hatha", 2.5, "Mind & body"), A("yoga_power", "Yoga, power / vinyasa", 4.0, "Mind & body"), A("pilates", "Pilates", 3.0, "Mind & body"), A("tai_chi", "Tai chi", 3.0, "Mind & body"),
  A("soccer", "Soccer, casual", 7.0, "Sports"), A("soccer_comp", "Soccer, competitive", 10.0, "Sports"), A("basketball", "Basketball, game", 8.0, "Sports"), A("basketball_shoot", "Basketball, shooting around", 4.5, "Sports"), A("tennis_singles", "Tennis, singles", 8.0, "Sports"), A("tennis_doubles", "Tennis, doubles", 6.0, "Sports"), A("badminton", "Badminton", 5.5, "Sports"), A("pickleball", "Pickleball", 4.1, "Sports"), A("volleyball", "Volleyball", 4.0, "Sports"), A("golf_walk", "Golf, walking and carrying clubs", 4.3, "Sports"), A("boxing_bag", "Boxing, punching bag", 5.5, "Sports"), A("boxing_spar", "Boxing, sparring", 7.8, "Sports"), A("martial_arts", "Martial arts (judo, karate, BJJ)", 10.3, "Sports"), A("climbing", "Rock climbing", 7.5, "Sports"), A("skiing", "Skiing, downhill, moderate", 5.3, "Sports"), A("skate", "Skateboarding / inline skating", 7.0, "Sports"), A("dance", "Dancing, general", 5.0, "Sports"), A("table_tennis", "Table tennis", 4.0, "Sports"), A("cricket", "Cricket, batting/bowling", 4.8, "Sports"), A("hockey", "Field / ice hockey", 8.0, "Sports"),
  A("house", "Housework, general", 3.3, "Daily life"), A("garden", "Gardening, general", 3.8, "Daily life"), A("mow", "Mowing the lawn, push mower", 5.5, "Daily life"), A("shovel", "Shovelling snow", 5.3, "Daily life"), A("moving", "Moving furniture / carrying boxes", 5.8, "Daily life"), A("stairs", "Climbing stairs", 8.8, "Daily life"), A("standing_work", "Standing work, light", 2.0, "Daily life"), A("play_kids", "Playing with kids, active", 3.5, "Daily life"),
];

/** Gross calories for an activity: MET × kg × hours (Compendium convention). */
export function kcalBurned(met: number, kg: number, minutes: number): number {
  return Math.round(met * kg * (minutes / 60));
}

export function searchActivities(q: string): Activity[] {
  const t = q.trim().toLowerCase();
  if (!t) return ACTIVITIES;
  return ACTIVITIES.filter((a) => a.name.toLowerCase().includes(t) || a.group.toLowerCase().includes(t));
}
