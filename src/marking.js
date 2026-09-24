export const MARKING_STYLES = Object.freeze({
  leve: Object.freeze({
    label: "Leve",
    liveCardRate: 0.005,
    directRedRate: 0.006,
    quickYellowRate: 0.03,
    quickRedRate: 0.0004,
    tackleMultiplier: 0.72,
    energyDrain: 0.34,
    opponentChanceAdjustment: 0.012,
    opponentExpectedGoalsAdjustment: 0.12
  }),
  moderada: Object.freeze({
    label: "Moderada",
    liveCardRate: 0.01,
    directRedRate: 0.012,
    quickYellowRate: 0.075,
    quickRedRate: 0.0015,
    tackleMultiplier: 1,
    energyDrain: 0.4,
    opponentChanceAdjustment: 0,
    opponentExpectedGoalsAdjustment: 0
  }),
  pesada: Object.freeze({
    label: "Pesada",
    liveCardRate: 0.022,
    directRedRate: 0.028,
    quickYellowRate: 0.13,
    quickRedRate: 0.005,
    tackleMultiplier: 1.45,
    energyDrain: 0.48,
    opponentChanceAdjustment: -0.03,
    opponentExpectedGoalsAdjustment: -0.22
  })
});

export function markingStyle(club) {
  return MARKING_STYLES[club?.markingIntensity] || MARKING_STYLES.moderada;
}
