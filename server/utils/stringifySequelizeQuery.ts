function stringifySequelizeQuery(findOptions: unknown): string {
  function isClass(func: unknown): boolean {
    return typeof func === 'function' && /^class\s/.test(func.toString())
  }

  function replacer(_key: string, value: unknown): unknown {
    if (typeof value === 'object' && value !== null) {
      const record = value as { [key: symbol]: unknown; [key: string]: unknown }
      const symbols = Object.getOwnPropertySymbols(value).reduce<{ [key: string]: unknown }>((acc, sym) => {
        acc[sym.toString()] = record[sym]
        return acc
      }, {})

      return { ...record, ...symbols }
    }

    if (isClass(value)) {
      return `${(value as new (...args: unknown[]) => unknown).name}`
    }

    return value
  }

  return JSON.stringify(findOptions, replacer)
}

export = stringifySequelizeQuery
