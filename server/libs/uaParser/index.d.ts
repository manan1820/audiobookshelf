import type { UserAgentParsed } from '../../types'

declare function uaParser(userAgentString?: string | string[]): UserAgentParsed

export default uaParser
export = uaParser
