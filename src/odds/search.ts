// Deterministic coordinate search: try each parameter up and down, keep improvements, halve steps.
export const coordinateSearch = (start: number[], steps: number[], bounds: [number, number][], loss: (vector: number[]) => number, rounds = 12) => {
  let vector = [...start]
  const step = [...steps]
  let best = loss(vector), evaluations = 1
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < vector.length; i++) {
      for (const direction of [1, -1]) {
        let improved = true
        while (improved) {
          const candidate = [...vector]
          candidate[i] = Math.min(bounds[i][1], Math.max(bounds[i][0], candidate[i] + direction * step[i]))
          const value = candidate[i] === vector[i] ? Infinity : loss(candidate)
          evaluations++
          improved = value < best - 1e-7
          if (improved) { vector = candidate; best = value }
        }
      }
    }
    step.forEach((_, i) => { step[i] /= 2 })
  }
  return { vector, loss: best, evaluations }
}
