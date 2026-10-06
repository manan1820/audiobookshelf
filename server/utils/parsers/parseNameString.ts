import parseFullName from './parseFullName'

interface NameParts {
  first_name: string
  last_name: string
}

export interface ParseNameResult {
  names: string[]
}

function parseName(name: string): NameParts {
  const parts = parseFullName(name) as { first?: string; middle?: string; last?: string }
  let firstName = parts.first || ''
  if (firstName && parts.middle) {
    firstName += ' ' + parts.middle
  }

  return {
    first_name: firstName,
    last_name: parts.last || ''
  }
}

function checkIsALastName(name: string): boolean {
  if (!name.includes(' ')) return true

  const parsed = parseFullName(name) as { first?: string }
  if (!parsed.first) return true

  return false
}

/**
 * Handle name already in First Last format and return Last, First
 */
export function nameToLastFirst(firstLast: string): string {
  const nameObj = parseName(firstLast)
  if (!nameObj.last_name) return nameObj.first_name
  if (!nameObj.first_name) return nameObj.last_name
  return `${nameObj.last_name}, ${nameObj.first_name}`
}

/**
 * Parses a name string into an array of names
 */
export function parse(nameString: string | null | undefined): ParseNameResult | null {
  if (!nameString) return null

  let splitNames: string[] = []
  const isCommaSeparated = nameString.includes(',')

  if (nameString.includes('&')) {
    nameString.split('&').forEach((asa) => (splitNames = splitNames.concat(asa.split(','))))
  } else if (nameString.includes(' and ')) {
    nameString.split(' and ').forEach((asa) => (splitNames = splitNames.concat(asa.split(','))))
  } else if (nameString.includes(';')) {
    nameString.split(';').forEach((asa) => (splitNames = splitNames.concat(asa.split(','))))
  } else {
    splitNames = nameString.split(',')
  }
  if (splitNames.length) splitNames = splitNames.map((a) => a.trim())

  if (/[\u4e00-\u9fff\u3040-\u30ff\u31f0-\u31ff]/.test(splitNames[0])) {
    return {
      names: splitNames
    }
  }

  let names: NameParts[] = []

  if (splitNames.length === 1) {
    names.push(parseName(nameString))
  } else {
    const firstChunkIsALastName = !isCommaSeparated ? false : checkIsALastName(splitNames[0])
    const isEvenNum = splitNames.length % 2 === 0

    if (!isEvenNum && firstChunkIsALastName) {
      splitNames = splitNames.slice(0, splitNames.length - 1)
    }

    if (firstChunkIsALastName) {
      const num = splitNames.length / 2
      for (let i = 0; i < num; i++) {
        const last = splitNames.shift() || ''
        const first = splitNames.shift() || ''
        names.push({
          first_name: first,
          last_name: last
        })
      }
    } else {
      splitNames.forEach((segment) => {
        names.push(parseName(segment))
      })
    }
  }

  names = names.filter((n) => n.first_name || n.last_name)

  const namesArray = [...new Set(names.map((a) => (a.first_name ? `${a.first_name} ${a.last_name}` : a.last_name)))]

  return {
    names: namesArray
  }
}
