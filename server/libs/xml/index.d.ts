export interface XmlOptions {
  indent?: boolean | string
  stream?: boolean
  declaration?: boolean | { encoding?: string; standalone?: string }
}

declare function xml(input: unknown, options?: boolean | string | XmlOptions): string

export default xml
export = xml
