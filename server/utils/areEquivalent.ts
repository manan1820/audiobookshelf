/**
 * Compares two items (values or references) for nested equivalency, meaning that
 * at root and at each key or index they are equivalent as follows:
 * - If a value type, values are either hard equal (===) or are both NaN
 *     (different than JS where NaN !== NaN)
 * - If functions, they are the same function instance or have the same value
 *     when converted to string via `toString()`
 * - If Date objects, both have the same getTime() or are both NaN (invalid)
 * - If arrays, both are same length, and all contained values areEquivalent
 *     recursively - only contents by numeric key are checked
 * - If other object types, enumerable keys are the same (the keys themselves)
 *     and values at every key areEquivalent recursively
 * @param value1 First item to compare
 * @param value2 Other item to compare
 * @param numToString Whether to coerce numbers to strings
 * @param stack Used internally to track circular refs - don't set it
 */
function areEquivalent(
  value1: unknown,
  value2: unknown,
  numToString = false,
  stack: unknown[] = []
): boolean {
  if (numToString) {
    if (value1 !== null && typeof value1 === 'number' && !isNaN(value1)) value1 = String(value1)
    if (value2 !== null && typeof value2 === 'number' && !isNaN(value2)) value2 = String(value2)
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
    return isNaN(value1 as number) && isNaN(value2 as number)
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
    return asNum1 === asNum2 || (isNaN(asNum1) && isNaN(asNum2))
  }

  // At this point, it's a reference type and could be circular
  if (stack.includes(value1)) {
    throw new Error('areEquivalent value1 is circular')
  }

  // breadcrumb
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
    return true
  }

  // Final case: object
  if (typeof value1 !== 'object' || value1 === null || typeof value2 !== 'object' || value2 === null) {
    return false
  }

  const obj1 = value1 as { [key: string]: unknown }
  const obj2 = value2 as { [key: string]: unknown }

  const keys1 = Object.keys(obj1)
  const keys2 = Object.keys(obj2)
  const numKeys = keys1.length

  if (keys2.length !== numKeys) {
    return false
  }

  if (numKeys === 0) {
    return true
  }

  keys1.sort()
  keys2.sort()

  for (let i = 0; i < numKeys; i++) {
    const key1 = keys1[i]
    const key2 = keys2[i]
    if (key1 === undefined || key2 === undefined || key1 !== key2) {
      return false
    }
  }

  for (let i = 0; i < numKeys; i++) {
    const key = keys1[i]
    if (key === undefined) {
      return false
    }
    if (!areEquivalent(obj1[key], obj2[key], numToString, stack)) {
      return false
    }
  }

  stack.pop()
  return true
}

export = areEquivalent
