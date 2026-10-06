const SupportedImageTypes = ['png', 'jpg', 'jpeg', 'webp'] as const
const SupportedAudioTypes = [
  'm4b',
  'mp3',
  'm4a',
  'flac',
  'opus',
  'ogg',
  'oga',
  'mp4',
  'aac',
  'wma',
  'aiff',
  'aif',
  'wav',
  'webm',
  'webma',
  'mka',
  'awb',
  'caf',
  'mpg',
  'mpeg'
] as const
const SupportedEbookTypes = ['epub', 'pdf', 'mobi', 'azw3', 'cbr', 'cbz'] as const
const TextFileTypes = ['txt', 'nfo'] as const
const MetadataFileTypes = ['opf', 'abs', 'xml', 'json'] as const

const globals = {
  SupportedImageTypes,
  SupportedAudioTypes,
  SupportedEbookTypes,
  TextFileTypes,
  MetadataFileTypes
}

export = globals
