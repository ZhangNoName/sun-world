export const FormatPercent = (value: number, precision: number = 0) => {
  return `${(value * 100).toFixed(precision)}%`
}
