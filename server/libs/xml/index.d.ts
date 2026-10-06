declare function xml(
  input: unknown,
  options?: boolean | string | { indent?: boolean | string; stream?: boolean; declaration?: boolean | { encoding?: string; standalone?: string } }
): string

export = xml
