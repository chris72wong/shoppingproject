export const scenery = {
  studio: { label: "Studio", description: "Soft, neutral light", ambient: 1.7, key: 3, fill: 1.2, color: "#fff9ef", position: [3, 6, 4] },
  outdoors: { label: "Outdoors", description: "Cool daylight", ambient: 1.8, key: 3.4, fill: 1.4, color: "#e5f2ff", position: [-4, 7, 4] },
  indoors: { label: "Indoors", description: "Warm window light", ambient: 1.1, key: 2.5, fill: 0.7, color: "#ffdab0", position: [-4, 3, 3] },
  beach: { label: "Beach", description: "Bright, warm sunlight", ambient: 2, key: 4, fill: 1.5, color: "#fff0cf", position: [4, 8, 2] },
  forest: { label: "Forest", description: "Dappled, shaded light", ambient: 0.9, key: 2.2, fill: 0.8, color: "#dceaca", position: [-3, 7, -1] },
} as const;
export type Scenery = keyof typeof scenery;
export function isScenery(value: unknown): value is Scenery {
  return typeof value === "string" && Object.hasOwn(scenery, value);
}
