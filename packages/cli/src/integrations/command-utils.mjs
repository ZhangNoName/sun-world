export function fixedCommand(argumentsList, { redactValueFlags = [] } = {}) {
  const values = [...argumentsList]
  return {
    argumentsList: values,
    previewArgumentsList: redactArgumentValues(values, redactValueFlags),
  }
}

export function boundedInteger(value, fallback, minimum, maximum) {
  const number = value == null ? fallback : Number(value)
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`Expected an integer between ${minimum} and ${maximum}.`)
  }
  return String(number)
}

function redactArgumentValues(argumentsList, valueFlags) {
  const sensitiveFlags = new Set(valueFlags)
  const result = []
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]
    result.push(argument)
    if (sensitiveFlags.has(argument) && index + 1 < argumentsList.length) {
      result.push(`<${argument.slice(2)}>`)
      index += 1
    }
  }
  return result
}
