import { ParsedFullName } from '../../types'

type ParsedNameField = keyof Omit<ParsedFullName, 'error'>

function parseFullName(
  nameToParse: unknown,
  partToReturn?: string | null,
  fixCase?: boolean | number,
  stopOnError?: boolean | number,
  useLongLists?: boolean | number
): ParsedFullName | string | string[] {
  let i: number
  let j: number
  let l: number
  let m: number
  let n: string[]
  let part: string
  let comma: string | null
  let titleList: string[]
  let suffixList: string[]
  let prefixList: string[]
  let partToCheck: string
  let partsFoundCount: number
  let remainingCommas: number
  const nameParts: string[] = []
  const nameCommas: (string | null)[] = [null]
  let partsFound: string[] = []
  const conjunctionList = ['&', 'and', 'et', 'e', 'of', 'the', 'und', 'y']
  let parsedName: ParsedFullName = {
    title: '',
    first: '',
    middle: '',
    last: '',
    nick: '',
    suffix: '',
    error: []
  }

  // Validate inputs, or set to defaults
  let normalizedPart = partToReturn ? partToReturn.toLowerCase() : 'all'
  if (!['title', 'first', 'middle', 'last', 'nick', 'suffix', 'error'].includes(normalizedPart)) {
    normalizedPart = 'all'
  }

  let fixCaseNum: number
  if (fixCase === false) fixCaseNum = 0
  else if (fixCase === true) fixCaseNum = 1
  else if (typeof fixCase === 'number' && (fixCase === 0 || fixCase === 1)) fixCaseNum = fixCase
  else fixCaseNum = -1

  const shouldStopOnError = stopOnError === true || stopOnError === 1 ? 1 : 0
  const useLong = useLongLists === true || useLongLists === 1 ? 1 : 0

  function handleError(errorMessage: string): void {
    if (shouldStopOnError) {
      throw new Error(errorMessage)
    } else {
      parsedName.error.push('Error: ' + errorMessage)
    }
  }

  function fixParsedNameCase(fixedCaseName: ParsedFullName, fixCaseNow: number): ParsedFullName {
    const forceCaseList = [
      'e', 'y', 'av', 'af', 'da', 'dal', 'de', 'del', 'der', 'di',
      'la', 'le', 'van', 'der', 'den', 'vel', 'von', 'II', 'III', 'IV', 'J.D.', 'LL.M.',
      'M.D.', 'D.O.', 'D.C.', 'Ph.D.'
    ]
    let forceCaseListIndex: number
    let namePartLabels: ParsedNameField[] = []
    let namePartWords: string[]
    if (fixCaseNow) {
      namePartLabels = (Object.keys(parsedName) as (keyof ParsedFullName)[]).filter(
        (v): v is ParsedNameField => v !== 'error'
      )
      for (i = 0, l = namePartLabels.length; i < l; i++) {
        const fieldKey = namePartLabels[i]
        if (fixedCaseName[fieldKey]) {
          namePartWords = (fixedCaseName[fieldKey] + '').split(' ')
          for (j = 0, m = namePartWords.length; j < m; j++) {
            forceCaseListIndex = forceCaseList
              .map((v) => v.toLowerCase())
              .indexOf(namePartWords[j].toLowerCase())
            if (forceCaseListIndex > -1) {
              namePartWords[j] = forceCaseList[forceCaseListIndex]
            } else if (namePartWords[j].length === 1) {
              namePartWords[j] = namePartWords[j].toUpperCase()
            } else if (
              namePartWords[j].length > 2 &&
              namePartWords[j].slice(0, 1) === namePartWords[j].slice(0, 1).toUpperCase() &&
              namePartWords[j].slice(1, 2) === namePartWords[j].slice(1, 2).toLowerCase() &&
              namePartWords[j].slice(2) === namePartWords[j].slice(2).toUpperCase()
            ) {
              namePartWords[j] = namePartWords[j].slice(0, 3) + namePartWords[j].slice(3).toLowerCase()
            } else if (
              namePartLabels[i] === 'suffix' &&
              namePartWords[j].slice(-1) !== '.' &&
              suffixList.indexOf(namePartWords[j].toLowerCase()) === -1
            ) {
              if (namePartWords[j] === namePartWords[j].toLowerCase()) {
                namePartWords[j] = namePartWords[j].toUpperCase()
              }
            } else {
              namePartWords[j] = namePartWords[j].slice(0, 1).toUpperCase() + namePartWords[j].slice(1).toLowerCase()
            }
          }
          fixedCaseName[fieldKey] = namePartWords.join(' ')
        }
      }
    }
    return fixedCaseName
  }

  if (!nameToParse || typeof nameToParse !== 'string') {
    handleError('No input')
    parsedName = fixParsedNameCase(parsedName, fixCaseNum)
    return normalizedPart === 'all' ? parsedName : parsedName[normalizedPart as keyof ParsedFullName]
  } else {
    nameToParse = nameToParse.trim()
  }

  const nameStr = nameToParse as string
  if (fixCaseNum === -1) {
    fixCaseNum = nameStr === nameStr.toUpperCase() || nameStr === nameStr.toLowerCase() ? 1 : 0
  }

  if (useLong) {
    suffixList = [
      'esq', 'esquire', 'jr', 'jnr', 'sr', 'snr', '2', 'ii', 'iii', 'iv',
      'v', 'clu', 'chfc', 'cfp', 'md', 'phd', 'j.d.', 'll.m.', 'm.d.', 'd.o.', 'd.c.',
      'p.c.', 'ph.d.'
    ]
    prefixList = [
      'a', 'ab', 'antune', 'ap', 'abu', 'al', 'alm', 'alt', 'bab', 'bäck',
      'bar', 'bath', 'bat', 'beau', 'beck', 'ben', 'berg', 'bet', 'bin', 'bint', 'birch',
      'björk', 'björn', 'bjur', 'da', 'dahl', 'dal', 'de', 'degli', 'dele', 'del',
      'della', 'der', 'di', 'dos', 'du', 'e', 'ek', 'el', 'escob', 'esch', 'fleisch',
      'fitz', 'fors', 'gott', 'griff', 'haj', 'haug', 'holm', 'ibn', 'kauf', 'kil',
      'koop', 'kvarn', 'la', 'le', 'lind', 'lönn', 'lund', 'mac', 'mhic', 'mic', 'mir',
      'na', 'naka', 'neder', 'nic', 'ni', 'nin', 'nord', 'norr', 'ny', 'o', 'ua', "ui'",
      'öfver', 'ost', 'över', 'öz', 'papa', 'pour', 'quarn', 'skog', 'skoog', 'sten',
      'stor', 'ström', 'söder', 'ter', 'tre', 'türk', 'van', 'väst', 'väster',
      'vest', 'von'
    ]
    titleList = [
      'mr', 'mrs', 'ms', 'miss', 'dr', 'herr', 'monsieur', 'hr', 'frau',
      'a v m', 'admiraal', 'admiral', 'air cdre', 'air commodore', 'air marshal',
      'air vice marshal', 'alderman', 'alhaji', 'ambassador', 'baron', 'barones',
      'brig', 'brig gen', 'brig general', 'brigadier', 'brigadier general',
      'brother', 'canon', 'capt', 'captain', 'cardinal', 'cdr', 'chief', 'cik', 'cmdr',
      'coach', 'col', 'col dr', 'colonel', 'commandant', 'commander', 'commissioner',
      'commodore', 'comte', 'comtessa', 'congressman', 'conseiller', 'consul',
      'conte', 'contessa', 'corporal', 'councillor', 'count', 'countess',
      'crown prince', 'crown princess', 'dame', 'datin', 'dato', 'datuk',
      'datuk seri', 'deacon', 'deaconess', 'dean', 'dhr', 'dipl ing', 'doctor',
      'dott', 'dott sa', 'dr ing', 'dra', 'drs', 'embajador', 'embajadora', 'en',
      'encik', 'eng', 'eur ing', 'exma sra', 'exmo sr', 'f o', 'father',
      'first lieutient', 'first officer', 'flt lieut', 'flying officer', 'fr',
      'fraulein', 'fru', 'gen', 'generaal', 'general', 'governor', 'graaf',
      'gravin', 'group captain', 'grp capt', 'h e dr', 'h h', 'h m', 'h r h', 'hajah',
      'haji', 'hajim', 'her highness', 'her majesty', 'high chief',
      'his highness', 'his holiness', 'his majesty', 'hon', 'hra', 'ing', 'ir',
      'jonkheer', 'judge', 'justice', 'khun ying', 'kolonel', 'lady', 'lcda', 'lic',
      'lieut', 'lieut cdr', 'lieut col', 'lieut gen', 'lord', 'm', 'm l', 'm r',
      'madame', 'mademoiselle', 'maj gen', 'major', 'master', 'mevrouw',
      'mlle', 'mme', 'monsignor', 'mstr', 'nti', 'pastor',
      'president', 'prince', 'princess', 'princesse', 'prinses', 'prof', 'prof dr',
      'prof sir', 'professor', 'puan', 'puan sri', 'rabbi', 'rear admiral', 'rev',
      'rev canon', 'rev dr', 'rev mother', 'reverend', 'rva', 'senator', 'sergeant',
      'sheikh', 'sheikha', 'sig', 'sig na', 'sig ra', 'sir', 'sister', 'sqn ldr', 'sr',
      'sr d', 'sra', 'srta', 'sultan', 'tan sri', 'tan sri dato', 'tengku', 'teuku',
      'than puying', 'the hon dr', 'the hon justice', 'the hon miss', 'the hon mr',
      'the hon mrs', 'the hon ms', 'the hon sir', 'the very rev', 'toh puan', 'tun',
      'vice admiral', 'viscount', 'viscountess', 'wg cdr', 'ind', 'misc', 'mx'
    ]
  } else {
    suffixList = [
      'esq', 'esquire', 'jr', 'jnr', 'sr', 'snr', '2', 'ii', 'iii', 'iv',
      'md', 'phd', 'j.d.', 'll.m.', 'm.d.', 'd.o.', 'd.c.', 'p.c.', 'ph.d.'
    ]
    prefixList = [
      'ab', 'bar', 'bin', 'da', 'dal', 'de', 'de la', 'del', 'della', 'der',
      'di', 'du', 'ibn', "l'", 'la', 'le', 'san', 'st', 'st.', 'ste', 'ter', 'van',
      'van de', 'van der', 'van den', 'vel', 'ver', 'vere', 'von'
    ]
    titleList = [
      'dr', 'miss', 'mr', 'mrs', 'ms', 'prof', 'sir', 'frau', 'herr', 'hr',
      'monsieur', 'captain', 'doctor', 'judge', 'officer', 'professor', 'ind', 'misc',
      'mx'
    ]
  }

  let remainingName = nameStr
  const regex = /\s(?:[‘’']([^‘’']+)[‘’']|[“”"]([^“”"]+)[“”"]|\[([^\]]+)\]|\(([^\)]+)\)),?\s/g
  const partFound = (' ' + remainingName + ' ').match(regex)
  if (partFound) partsFound = partsFound.concat(partFound)
  partsFoundCount = partsFound.length
  if (partsFoundCount === 1) {
    parsedName.nick = partsFound[0].slice(2).slice(0, -2)
    if (parsedName.nick.slice(-1) === ',') {
      parsedName.nick = parsedName.nick.slice(0, -1)
    }
    remainingName = (' ' + remainingName + ' ').replace(partsFound[0], ' ').trim()
    partsFound = []
  } else if (partsFoundCount > 1) {
    handleError(partsFoundCount + ' nicknames found')
    for (i = 0; i < partsFoundCount; i++) {
      remainingName = (' ' + remainingName + ' ').replace(partsFound[i], ' ').trim()
      partsFound[i] = partsFound[i].slice(2).slice(0, -2)
      if (partsFound[i].slice(-1) === ',') {
        partsFound[i] = partsFound[i].slice(0, -1)
      }
    }
    parsedName.nick = partsFound.join(', ')
    partsFound = []
  }
  if (!remainingName.trim().length) {
    parsedName = fixParsedNameCase(parsedName, fixCaseNum)
    return normalizedPart === 'all' ? parsedName : parsedName[normalizedPart as keyof ParsedFullName]
  }

  for (i = 0, n = remainingName.split(' '), l = n.length; i < l; i++) {
    part = n[i]
    comma = null
    if (part.slice(-1) === ',') {
      comma = ','
      part = part.slice(0, -1)
    }
    nameParts.push(part)
    nameCommas.push(comma)
  }

  for (l = nameParts.length, i = l - 1; i > 0; i--) {
    partToCheck = nameParts[i].slice(-1) === '.' ? nameParts[i].slice(0, -1).toLowerCase() : nameParts[i].toLowerCase()
    if (suffixList.indexOf(partToCheck) > -1 || suffixList.indexOf(partToCheck + '.') > -1) {
      partsFound = nameParts.splice(i, 1).concat(partsFound)
      if (nameCommas[i] === ',') {
        nameCommas.splice(i + 1, 1)
      } else {
        nameCommas.splice(i, 1)
      }
    }
  }
  partsFoundCount = partsFound.length
  if (partsFoundCount === 1) {
    parsedName.suffix = partsFound[0]
    partsFound = []
  } else if (partsFoundCount > 1) {
    handleError(partsFoundCount + ' suffixes found')
    parsedName.suffix = partsFound.join(', ')
    partsFound = []
  }
  if (!nameParts.length) {
    parsedName = fixParsedNameCase(parsedName, fixCaseNum)
    return normalizedPart === 'all' ? parsedName : parsedName[normalizedPart as keyof ParsedFullName]
  }

  for (l = nameParts.length, i = l - 1; i >= 0; i--) {
    partToCheck = nameParts[i].slice(-1) === '.' ? nameParts[i].slice(0, -1).toLowerCase() : nameParts[i].toLowerCase()
    if (titleList.indexOf(partToCheck) > -1 || titleList.indexOf(partToCheck + '.') > -1) {
      partsFound = nameParts.splice(i, 1).concat(partsFound)
      if (nameCommas[i] === ',') {
        nameCommas.splice(i + 1, 1)
      } else {
        nameCommas.splice(i, 1)
      }
    }
  }
  partsFoundCount = partsFound.length
  if (partsFoundCount === 1) {
    parsedName.title = partsFound[0]
    partsFound = []
  } else if (partsFoundCount > 1) {
    handleError(partsFoundCount + ' titles found')
    parsedName.title = partsFound.join(', ')
    partsFound = []
  }
  if (!nameParts.length) {
    parsedName = fixParsedNameCase(parsedName, fixCaseNum)
    return normalizedPart === 'all' ? parsedName : parsedName[normalizedPart as keyof ParsedFullName]
  }

  if (nameParts.length > 1) {
    for (i = nameParts.length - 2; i >= 0; i--) {
      if (prefixList.indexOf(nameParts[i].toLowerCase()) > -1) {
        nameParts[i] = nameParts[i] + ' ' + nameParts[i + 1]
        nameParts.splice(i + 1, 1)
        nameCommas.splice(i + 1, 1)
      }
    }
  }

  if (nameParts.length > 2) {
    for (i = nameParts.length - 3; i >= 0; i--) {
      if (conjunctionList.indexOf(nameParts[i + 1].toLowerCase()) > -1) {
        nameParts[i] = nameParts[i] + ' ' + nameParts[i + 1] + ' ' + nameParts[i + 2]
        nameParts.splice(i + 1, 2)
        nameCommas.splice(i + 1, 2)
        i--
      }
    }
  }

  nameCommas.pop()
  const firstComma = nameCommas.indexOf(',')
  remainingCommas = nameCommas.filter((v) => v !== null).length
  if (firstComma > 1 || remainingCommas > 1) {
    for (i = nameParts.length - 1; i >= 2; i--) {
      if (nameCommas[i] === ',') {
        partsFound = nameParts.splice(i, 1).concat(partsFound)
        nameCommas.splice(i, 1)
        remainingCommas--
      } else {
        break
      }
    }
  }
  if (partsFound.length) {
    if (parsedName.suffix) {
      partsFound = [parsedName.suffix].concat(partsFound)
    }
    parsedName.suffix = partsFound.join(', ')
    partsFound = []
  }

  if (remainingCommas > 0) {
    if (remainingCommas > 1) {
      handleError(remainingCommas - 1 + ' extra commas found')
    }
    if (nameCommas.indexOf(',')) {
      parsedName.last = nameParts.splice(0, nameCommas.indexOf(',')).join(' ')
      nameCommas.splice(0, nameCommas.indexOf(','))
    }
  } else {
    parsedName.last = nameParts.pop() || ''
  }
  if (!nameParts.length) {
    parsedName = fixParsedNameCase(parsedName, fixCaseNum)
    return normalizedPart === 'all' ? parsedName : parsedName[normalizedPart as keyof ParsedFullName]
  }

  parsedName.first = nameParts.shift() || ''
  if (!nameParts.length) {
    parsedName = fixParsedNameCase(parsedName, fixCaseNum)
    return normalizedPart === 'all' ? parsedName : parsedName[normalizedPart as keyof ParsedFullName]
  }

  if (nameParts.length > 2) {
    handleError(nameParts.length + ' middle names')
  }
  parsedName.middle = nameParts.join(' ')

  parsedName = fixParsedNameCase(parsedName, fixCaseNum)
  return normalizedPart === 'all' ? parsedName : parsedName[normalizedPart as keyof ParsedFullName]
}

export = parseFullName
