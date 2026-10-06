function isClass(func: unknown): func is new (...args: unknown[]) => unknown {
  return typeof func === 'function' && /^class\s/.test(func.toString())
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'object' && value !== null) {
    const symbols = Object.getOwnPropertySymbols(value).reduce<Record<string, unknown>>((acc, sym) => {
      acc[sym.toString()] = (value as Record<symbol, unknown>)[sym]
      return acc
    }, {})

    return { ...(value as Record<string, unknown>), ...symbols }
  }

  if (isClass(value)) {
    return `${value.name}`
  }

  return value
}

function stringifySequelizeQuery(findOptions: unknown): string {
  return JSON.stringify(findOptions, replacer)
}

export = stringifySequelizeQuery
