interface ParsedFullNameResult {
  title: string
  first: string
  middle: string
  last: string
  nick: string
  suffix: string
  error: string[]
  [key: string]: string | string[]
}

function parseFullName(
  nameToParse?: string | null,
  partToReturn?: 'all',
  fixCase?: boolean | number,
  stopOnError?: boolean | number,
  useLongLists?: boolean | number
): ParsedFullNameResult
function parseFullName(
  nameToParse?: string | null,
  partToReturn?: string,
  fixCase?: boolean | number,
  stopOnError?: boolean | number,
  useLongLists?: boolean | number
): ParsedFullNameResult | string | string[]
function parseFullName(
  nameToParse?: string | null,
  partToReturn = 'all',
  fixCase: boolean | number = -1,
  stopOnError: boolean | number = 0,
  useLongLists: boolean | number = 0
): ParsedFullNameResult | string | string[] {
  let i: number, j: number, l: number, m: number
  let part: string | undefined, comma: string | null
  let titleList: string[] = []
  let suffixList: string[] = []
  let prefixList: string[] = []
  let partToCheck: string
  let partsFoundCount: number
  let firstComma: number, remainingCommas: number
  let nameParts: string[] = []
  const nameCommas: (string | null)[] = [null]
  let partsFound: string[] = []
  const conjunctionList = ['&', 'and', 'et', 'e', 'of', 'the', 'und', 'y']
  let parsedName: ParsedFullNameResult = {
    title: '',
    first: '',
    middle: '',
    last: '',
    nick: '',
    suffix: '',
    error: []
  }

  // Validate inputs, or set to defaults
  partToReturn =
    partToReturn && ['title', 'first', 'middle', 'last', 'nick', 'suffix', 'error'].indexOf(partToReturn.toLowerCase()) > -1
      ? partToReturn.toLowerCase()
      : 'all'

  let fixCaseNum = -1
  if (fixCase === false) fixCaseNum = 0
  else if (fixCase === true) fixCaseNum = 1
  else if (typeof fixCase === 'number' && (fixCase === 0 || fixCase === 1)) fixCaseNum = fixCase

  const stopOnErrorNum = stopOnError === true || stopOnError === 1 ? 1 : 0
  const useLongListsNum = useLongLists === true || useLongLists === 1 ? 1 : 0

  function handleError(errorMessage: string): void {
    if (stopOnErrorNum) {
      throw new Error(errorMessage)
    } else {
      parsedName.error.push('Error: ' + errorMessage)
    }
  }

  function fixParsedNameCase(fixedCaseName: ParsedFullNameResult, fixCaseNow: number): ParsedFullNameResult {
    const forceCaseList = [
      'e',
      'y',
      'av',
      'af',
      'da',
      'dal',
      'de',
      'del',
      'der',
      'di',
      'la',
      'le',
      'van',
      'der',
      'den',
      'vel',
      'von',
      'II',
      'III',
      'IV',
      'J.D.',
      'LL.M.',
      'M.D.',
      'D.O.',
      'D.C.',
      'Ph.D.'
    ]

    if (fixCaseNow) {
      const namePartLabels = Object.keys(parsedName).filter((v) => v !== 'error')
      for (i = 0, l = namePartLabels.length; i < l; i++) {
        const label = namePartLabels[i]
        if (!label) continue
        const val = fixedCaseName[label]
        if (typeof val === 'string' && val) {
          const namePartWords = (val + '').split(' ')
          for (j = 0, m = namePartWords.length; j < m; j++) {
            const word = namePartWords[j]
            if (!word) continue
            const forceCaseListIndex = forceCaseList.map((v) => v.toLowerCase()).indexOf(word.toLowerCase())
            if (forceCaseListIndex > -1) {
              namePartWords[j] = forceCaseList[forceCaseListIndex] || word
            } else if (word.length === 1) {
              namePartWords[j] = word.toUpperCase()
            } else if (
              word.length > 2 &&
              word.slice(0, 1) === word.slice(0, 1).toUpperCase() &&
              word.slice(1, 2) === word.slice(1, 2).toLowerCase() &&
              word.slice(2) === word.slice(2).toUpperCase()
            ) {
              namePartWords[j] = word.slice(0, 3) + word.slice(3).toLowerCase()
            } else if (label === 'suffix' && word.slice(-1) !== '.' && suffixList.indexOf(word.toLowerCase()) === 0) {
              if (word === word.toLowerCase()) {
                namePartWords[j] = word.toUpperCase()
              }
            } else {
              namePartWords[j] = word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase()
            }
          }
          fixedCaseName[label] = namePartWords.join(' ')
        }
      }
    }
    return fixedCaseName
  }

  // If no input name, or input name is not a string, abort
  if (!nameToParse || typeof nameToParse !== 'string') {
    handleError('No input')
    parsedName = fixParsedNameCase(parsedName, fixCaseNum)
    return partToReturn === 'all' ? parsedName : parsedName[partToReturn] || ''
  } else {
    nameToParse = nameToParse.trim()
  }

  // Auto-detect fixCase: fix if nameToParse is all upper or all lowercase
  if (fixCaseNum === -1) {
    fixCaseNum = nameToParse === nameToParse.toUpperCase() || nameToParse === nameToParse.toLowerCase() ? 1 : 0
  }

  if (useLongListsNum) {
    suffixList = [
      'esq',
      'esquire',
      'jr',
      'jnr',
      'sr',
      'snr',
      '2',
      'ii',
      'iii',
      'iv',
      'v',
      'clu',
      'chfc',
      'cfp',
      'md',
      'phd',
      'j.d.',
      'll.m.',
      'm.d.',
      'd.o.',
      'd.c.',
      'p.c.',
      'ph.d.'
    ]
    prefixList = [
      'a',
      'ab',
      'antune',
      'ap',
      'abu',
      'al',
      'alm',
      'alt',
      'bab',
      'bäck',
      'bar',
      'bath',
      'bat',
      'beau',
      'beck',
      'ben',
      'berg',
      'bet',
      'bin',
      'bint',
      'birch',
      'björk',
      'björn',
      'bjur',
      'da',
      'dahl',
      'dal',
      'de',
      'degli',
      'dele',
      'del',
      'della',
      'der',
      'di',
      'dos',
      'du',
      'e',
      'ek',
      'el',
      'escob',
      'esch',
      'fleisch',
      'fitz',
      'fors',
      'gott',
      'griff',
      'haj',
      'haug',
      'holm',
      'ibn',
      'kauf',
      'kil',
      'koop',
      'kvarn',
      'la',
      'le',
      'lind',
      'lönn',
      'lund',
      'mac',
      'mhic',
      'mic',
      'mir',
      'na',
      'naka',
      'neder',
      'nic',
      'ni',
      'nin',
      'nord',
      'norr',
      'ny',
      'o',
      'ua',
      "ui'",
      'öfver',
      'ost',
      'över',
      'öz',
      'papa',
      'pour',
      'quarn',
      'skog',
      'skoog',
      'sten',
      'stor',
      'ström',
      'söder',
      'ter',
      'tre',
      'türk',
      'van',
      'väst',
      'väster',
      'vest',
      'von'
    ]
    titleList = [
      'mr',
      'mrs',
      'ms',
      'miss',
      'dr',
      'herr',
      'monsieur',
      'hr',
      'frau',
      'a v m',
      'admiraal',
      'admiral',
      'air cdre',
      'air commodore',
      'air marshal',
      'air vice marshal',
      'alderman',
      'alhaji',
      'ambassador',
      'baron',
      'barones',
      'brig',
      'brig gen',
      'brig general',
      'brigadier',
      'brigadier general',
      'brother',
      'canon',
      'capt',
      'captain',
      'cardinal',
      'cdr',
      'chief',
      'cik',
      'cmdr',
      'coach',
      'col',
      'col dr',
      'colonel',
      'commandant',
      'commander',
      'commissioner',
      'commodore',
      'comte',
      'comtessa',
      'congressman',
      'conseiller',
      'consul',
      'conte',
      'contessa',
      'corporal',
      'councillor',
      'count',
      'countess',
      'crown prince',
      'crown princess',
      'dame',
      'datin',
      'dato',
      'datuk',
      'datuk seri',
      'deacon',
      'deaconess',
      'dean',
      'dhr',
      'dipl ing',
      'doctor',
      'dott',
      'dott sa',
      'dr',
      'dr ing',
      'dra',
      'drs',
      'embajador',
      'embajadora',
      'en',
      'encik',
      'eng',
      'eur ing',
      'exma sra',
      'exmo sr',
      'f o',
      'father',
      'first lieutient',
      'first officer',
      'flt lieut',
      'flying officer',
      'fr',
      'frau',
      'fraulein',
      'fru',
      'gen',
      'generaal',
      'general',
      'governor',
      'graaf',
      'gravin',
      'group captain',
      'grp capt',
      'h e dr',
      'h h',
      'h m',
      'h r h',
      'hajah',
      'haji',
      'hajim',
      'her highness',
      'her majesty',
      'herr',
      'high chief',
      'his highness',
      'his holiness',
      'his majesty',
      'hon',
      'hr',
      'hra',
      'ing',
      'ir',
      'jonkheer',
      'judge',
      'justice',
      'khun ying',
      'kolonel',
      'lady',
      'lcda',
      'lic',
      'lieut',
      'lieut cdr',
      'lieut col',
      'lieut gen',
      'lord',
      'm',
      'm l',
      'm r',
      'madame',
      'mademoiselle',
      'maj gen',
      'major',
      'master',
      'mevrouw',
      'miss',
      'mlle',
      'mme',
      'monsieur',
      'monsignor',
      'mr',
      'mrs',
      'ms',
      'mstr',
      'nti',
      'pastor',
      'president',
      'prince',
      'princess',
      'princesse',
      'prinses',
      'prof',
      'prof dr',
      'prof sir',
      'professor',
      'puan',
      'puan sri',
      'rabbi',
      'rear admiral',
      'rev',
      'rev canon',
      'rev dr',
      'rev mother',
      'reverend',
      'rva',
      'senator',
      'sergeant',
      'sheikh',
      'sheikha',
      'sig',
      'sig na',
      'sig ra',
      'sir',
      'sister',
      'sqn ldr',
      'sr',
      'sr d',
      'sra',
      'srta',
      'sultan',
      'tan sri',
      'tan sri dato',
      'tengku',
      'teuku',
      'than puying',
      'the hon dr',
      'the hon justice',
      'the hon miss',
      'the hon mr',
      'the hon mrs',
      'the hon ms',
      'the hon sir',
      'the very rev',
      'toh puan',
      'tun',
      'vice admiral',
      'viscount',
      'viscountess',
      'wg cdr',
      'ind',
      'misc',
      'mx'
    ]
  } else {
    suffixList = [
      'esq',
      'esquire',
      'jr',
      'jnr',
      'sr',
      'snr',
      '2',
      'ii',
      'iii',
      'iv',
      'md',
      'phd',
      'j.d.',
      'll.m.',
      'm.d.',
      'd.o.',
      'd.c.',
      'p.c.',
      'ph.d.'
    ]
    prefixList = [
      'ab',
      'bar',
      'bin',
      'da',
      'dal',
      'de',
      'de la',
      'del',
      'della',
      'der',
      'di',
      'du',
      'ibn',
      "l'",
      'la',
      'le',
      'san',
      'st',
      'st.',
      'ste',
      'ter',
      'van',
      'van de',
      'van der',
      'van den',
      'vel',
      'ver',
      'vere',
      'von'
    ]
    titleList = [
      'dr',
      'miss',
      'mr',
      'mrs',
      'ms',
      'prof',
      'sir',
      'frau',
      'herr',
      'hr',
      'monsieur',
      'captain',
      'doctor',
      'judge',
      'officer',
      'professor',
      'ind',
      'misc',
      'mx'
    ]
  }

  // Nickname
  const regex = /\s(?:[‘’']([^‘’']+)[‘’']|[“”"]([^“”"]+)[“”"]|\[([^\]]+)\]|\(([^)]+)\)),?\s/g
  const partFound = (' ' + nameToParse + ' ').match(regex)
  if (partFound) partsFound = partsFound.concat(partFound)
  partsFoundCount = partsFound.length
  if (partsFoundCount === 1) {
    const firstPart = partsFound[0] || ''
    parsedName.nick = firstPart.slice(2).slice(0, -2)
    if (parsedName.nick.slice(-1) === ',') {
      parsedName.nick = parsedName.nick.slice(0, -1)
    }
    nameToParse = (' ' + nameToParse + ' ').replace(firstPart, ' ').trim()
    partsFound = []
  } else if (partsFoundCount > 1) {
    handleError(partsFoundCount + ' nicknames found')
    for (i = 0; i < partsFoundCount; i++) {
      const p = partsFound[i] || ''
      nameToParse = (' ' + nameToParse + ' ').replace(p, ' ').trim()
      let nickPart = p.slice(2).slice(0, -2)
      if (nickPart.slice(-1) === ',') {
        nickPart = nickPart.slice(0, -1)
      }
      partsFound[i] = nickPart
    }
    parsedName.nick = partsFound.join(', ')
    partsFound = []
  }
  if (!nameToParse.trim().length) {
    parsedName = fixParsedNameCase(parsedName, fixCaseNum)
    return partToReturn === 'all' ? parsedName : parsedName[partToReturn] || ''
  }

  const parts = nameToParse.split(' ')
  for (i = 0, l = parts.length; i < l; i++) {
    part = parts[i] || ''
    comma = null
    if (part.slice(-1) === ',') {
      comma = ','
      part = part.slice(0, -1)
    }
    nameParts.push(part)
    nameCommas.push(comma)
  }

  // Suffix
  for (l = nameParts.length, i = l - 1; i > 0; i--) {
    const curPart = nameParts[i] || ''
    partToCheck = curPart.slice(-1) === '.' ? curPart.slice(0, -1).toLowerCase() : curPart.toLowerCase()
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
    parsedName.suffix = partsFound[0] || ''
    partsFound = []
  } else if (partsFoundCount > 1) {
    handleError(partsFoundCount + ' suffixes found')
    parsedName.suffix = partsFound.join(', ')
    partsFound = []
  }
  if (!nameParts.length) {
    parsedName = fixParsedNameCase(parsedName, fixCaseNum)
    return partToReturn === 'all' ? parsedName : parsedName[partToReturn] || ''
  }

  // Title
  for (l = nameParts.length, i = l - 1; i >= 0; i--) {
    const curPart = nameParts[i] || ''
    partToCheck = curPart.slice(-1) === '.' ? curPart.slice(0, -1).toLowerCase() : curPart.toLowerCase()
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
    parsedName.title = partsFound[0] || ''
    partsFound = []
  } else if (partsFoundCount > 1) {
    handleError(partsFoundCount + ' titles found')
    parsedName.title = partsFound.join(', ')
    partsFound = []
  }
  if (!nameParts.length) {
    parsedName = fixParsedNameCase(parsedName, fixCaseNum)
    return partToReturn === 'all' ? parsedName : parsedName[partToReturn] || ''
  }

  // Join name prefixes
  if (nameParts.length > 1) {
    for (i = nameParts.length - 2; i >= 0; i--) {
      const curPart = nameParts[i] || ''
      if (prefixList.indexOf(curPart.toLowerCase()) > -1) {
        nameParts[i] = curPart + ' ' + (nameParts[i + 1] || '')
        nameParts.splice(i + 1, 1)
        nameCommas.splice(i + 1, 1)
      }
    }
  }

  // Join conjunctions
  if (nameParts.length > 2) {
    for (i = nameParts.length - 3; i >= 0; i--) {
      const nextPart = nameParts[i + 1] || ''
      if (conjunctionList.indexOf(nextPart.toLowerCase()) > -1) {
        nameParts[i] = (nameParts[i] || '') + ' ' + nextPart + ' ' + (nameParts[i + 2] || '')
        nameParts.splice(i + 1, 2)
        nameCommas.splice(i + 1, 2)
        i--
      }
    }
  }

  // Suffix: remove and store items after extra commas
  nameCommas.pop()
  firstComma = nameCommas.indexOf(',')
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

  // Last name
  if (remainingCommas > 0) {
    if (remainingCommas > 1) {
      handleError(remainingCommas - 1 + ' extra commas found')
    }
    const commaIdx = nameCommas.indexOf(',')
    if (commaIdx > -1) {
      parsedName.last = nameParts.splice(0, commaIdx).join(' ')
      nameCommas.splice(0, commaIdx)
    }
  } else {
    parsedName.last = nameParts.pop() || ''
  }
  if (!nameParts.length) {
    parsedName = fixParsedNameCase(parsedName, fixCaseNum)
    return partToReturn === 'all' ? parsedName : parsedName[partToReturn] || ''
  }

  // First name
  parsedName.first = nameParts.shift() || ''
  if (!nameParts.length) {
    parsedName = fixParsedNameCase(parsedName, fixCaseNum)
    return partToReturn === 'all' ? parsedName : parsedName[partToReturn] || ''
  }

  // Middle name
  if (nameParts.length > 2) {
    handleError(nameParts.length + ' middle names')
  }
  parsedName.middle = nameParts.join(' ')

  parsedName = fixParsedNameCase(parsedName, fixCaseNum)
  return partToReturn === 'all' ? parsedName : parsedName[partToReturn] || ''
}

export = parseFullName
