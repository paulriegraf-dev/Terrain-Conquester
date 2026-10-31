/**
 * Aus Partien von Menschen gelernt (scripts/replayLernen.ts, 18 Partien in auswertung/replays).
 * NICHT von Hand bearbeiten – neu erzeugen mit: npx tsx scripts/replayLernen.ts
 * Die KI nutzt eine Paarung erst ab AI_TUNING.replays.minGames Partien (Einheiten-Vorliebe, Fabrik-Reihenfolge).
 */
import type { UnitId } from '../data/units';

export interface ReplayPlan {
  games: number; wins: number; weight: number; opening: string[];
  factoriesAt3: number | null; firstResearch: number | null; superBrood: number | null;
  bias: Partial<Record<UnitId, number>>; keystones: string[];
}

export const REPLAY_PLANS: Readonly<Record<string, ReplayPlan>> = {
  "myriaden>technoclan": {
    "games": 2,
    "wins": 2,
    "weight": 2,
    "opening": [
      "foundry",
      "barracks",
      "barracks",
      "barracks",
      "barracks",
      "barracks"
    ],
    "factoriesAt3": 5,
    "firstResearch": 169.4,
    "superBrood": 342.9,
    "bias": {
      "drone": 1.4,
      "bomber": 0.8,
      "myrcannon": 1.32,
      "catapult": 0.8,
      "sphere": 0.86
    },
    "keystones": [
      "myrcannon-keystone",
      "catapult-keystone",
      "drone-keystone"
    ]
  },
  "myriaden>terraformer": {
    "games": 3,
    "wins": 2,
    "weight": 2.4,
    "opening": [
      "foundry",
      "barracks",
      "barracks",
      "workshop",
      "barracks",
      "barracks"
    ],
    "factoriesAt3": 4.3,
    "firstResearch": 98.1,
    "superBrood": 358.1,
    "bias": {
      "drone": 1.4,
      "bomber": 0.8,
      "myrcannon": 1.11,
      "catapult": 0.8,
      "sphere": 0.8
    },
    "keystones": [
      "catapult-keystone",
      "myrcannon-keystone"
    ]
  },
  "technoclan>myriaden": {
    "games": 3,
    "wins": 3,
    "weight": 3,
    "opening": [
      "foundry",
      "barracks",
      "workshop",
      "barracks",
      "barracks",
      "workshop"
    ],
    "factoriesAt3": 4.7,
    "firstResearch": 200.3,
    "superBrood": null,
    "bias": {
      "sniper": 1.15,
      "plasma": 0.89,
      "hoverscout": 1.4,
      "battery": 0.8,
      "gunner": 1.24,
      "colossus": 0.8
    },
    "keystones": []
  },
  "technoclan>terraformer": {
    "games": 1,
    "wins": 1,
    "weight": 1,
    "opening": [
      "workshop",
      "barracks",
      "barracks",
      "foundry",
      "workshop",
      "foundry"
    ],
    "factoriesAt3": 6,
    "firstResearch": 370.1,
    "superBrood": null,
    "bias": {
      "plasma": 0.8,
      "hoverscout": 1.17,
      "battery": 1.04,
      "gunner": 1.4,
      "colossus": 0.8
    },
    "keystones": [
      "gunner-keystone-a",
      "battery-keystone-b"
    ]
  },
  "terraformer>myriaden": {
    "games": 2,
    "wins": 2,
    "weight": 2,
    "opening": [
      "frosthall",
      "frosthall",
      "mudpit",
      "grove",
      "meadowhall",
      "meadowhall"
    ],
    "factoriesAt3": 5,
    "firstResearch": 187.4,
    "superBrood": null,
    "bias": {
      "wardMeadow": 1.29,
      "wardForest": 0.8,
      "wardMud": 1.04,
      "wardSnow": 1.26,
      "wardRubble": 0.82
    },
    "keystones": [
      "wardRubble-keystone"
    ]
  },
  "terraformer>technoclan": {
    "games": 7,
    "wins": 4,
    "weight": 5.2,
    "opening": [
      "meadowhall",
      "grove",
      "mudpit",
      "meadowhall",
      "quarry",
      "meadowhall"
    ],
    "factoriesAt3": 5,
    "firstResearch": 234.8,
    "superBrood": null,
    "bias": {
      "wardMeadow": 1.21,
      "wardForest": 0.91,
      "wardMud": 1.03,
      "wardSnow": 0.8,
      "wardRubble": 1.14
    },
    "keystones": [
      "wardMeadow-keystone",
      "wardMud-keystone",
      "wardRubble-keystone",
      "wardForest-keystone",
      "wardSnow-keystone"
    ]
  }
};
