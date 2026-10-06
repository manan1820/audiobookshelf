/**
 * Compares two items (values or references) for nested equivalency.
 */
function areEquivalent(value1: unknown, value2: unknown, numToString = false, stack: unknown[] = []): boolean {
  if (numToString) {
    if (value1 !== null && value1 !== undefined && typeof value1 !== 'symbol' && !Number.isNaN(Number(value1))) {
      value1 = String(value1)
    }
    if (value2 !== null && value2 !== undefined && typeof value2 !== 'symbol' && !Number.isNaN(Number(value2))) {
      value2 = String(value2)
    }
  }

  // Numbers, strings, null, undefined, symbols, functions, booleans.
  // Also: objects (incl. arrays) that are actually the same instance
  if (value1 === value2) {
    return true
  }

  // Truthy check to handle value1=null, value2=Object
  if ((value1 && !value2) || (!value1 && value2)) {
    return false
  }

  const type1 = typeof value1

  // Ensure types match
  if (type1 !== typeof value2) {
    return false
  }

  // Special case for number: check for NaN on both sides
  if (type1 === 'number') {
    return Number.isNaN(value1) && Number.isNaN(value2)
  }

  // Special case for function: check for toString() equivalence
  if (type1 === 'function') {
    return (value1 as () => unknown).toString() === (value2 as () => unknown).toString()
  }

  // For these types, cannot still be equal at this point, so fast-fail
  if (
    type1 === 'bigint' ||
    type1 === 'boolean' ||
    type1 === 'string' ||
    type1 === 'symbol'
  ) {
    return false
  }

  // For dates, cast to number and ensure equal or both NaN
  if (value1 instanceof Date) {
    if (!(value2 instanceof Date)) {
      return false
    }
    const asNum1 = +value1
    const asNum2 = +value2
    return asNum1 === asNum2 || (Number.isNaN(asNum1) && Number.isNaN(asNum2))
  }

  // Circular reference check
  if (stack.includes(value1)) {
    throw new Error('areEquivalent value1 is circular')
  }

  stack.push(value1)

  // Handle arrays
  if (Array.isArray(value1)) {
    if (!Array.isArray(value2)) {
      return false
    }

    const length = value1.length

    if (length !== value2.length) {
      return false
    }

    for (let i = 0; i < length; i++) {
      if (!areEquivalent(value1[i], value2[i], numToString, stack)) {
        return false
      }
    }
    stack.pop()
    return true
  }

  // Object case
  if (typeof value1 === 'object' && value1 !== null && typeof value2 === 'object' && value2 !== null) {
    const obj1 = value1 as Record<string, unknown>
    const obj2 = value2 as Record<string, unknown>

    const keys1 = Object.keys(obj1)
    const keys2 = Object.keys(obj2)
    const numKeys = keys1.length

    if (keys2.length !== numKeys) {
      return false
    }

    if (numKeys === 0) {
      stack.pop()
      return true
    }

    keys1.sort()
    keys2.sort()

    for (let i = 0; i < numKeys; i++) {
      if (keys1[i] !== keys2[i]) {
        return false
      }
    }

    for (let i = 0; i < numKeys; i++) {
      if (!areEquivalent(obj1[keys1[i]], obj2[keys1[i]], numToString, stack)) {
        return false
      }
    }

    stack.pop()
    return true
  }

  stack.pop()
  return false
}

export = areEquivalent
