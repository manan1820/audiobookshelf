export interface FfprobeStream {
  index: number
  codec_name?: string
  codec_long_name?: string
  profile?: string
  codec_type: string
  codec_time_base?: string
  width?: number | string
  height?: number | string
  pix_fmt?: string
  sample_rate?: number | string
  channels?: number
  channel_layout?: string
  time_base?: string
  bit_rate?: number | string
  avg_frame_rate?: string
  r_frame_rate?: string
  color_range?: string
  color_space?: string
  color_transfer?: string
  color_primaries?: string
  is_avc?: string | boolean
  disposition?: Record<string, unknown>
  tags?: Record<string, string>
  [key: string]: unknown
}

export interface FfprobeFormat {
  filename?: string
  nb_streams?: number
  nb_programs?: number
  format_name?: string
  format_long_name?: string
  name?: string
  start_time?: string | number
  duration?: string | number
  size?: string | number
  bit_rate?: string | number
  probe_score?: number
  tags?: Record<string, string>
  [key: string]: unknown
}

export interface FfprobeChapter {
  id?: number | string
  time_base?: string
  start?: number | string
  start_time?: string | number
  end?: number | string
  end_time?: string | number
  title?: string
  'TAG:title'?: string
  tags?: {
    title?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface FfprobeRawData {
  streams: FfprobeStream[]
  format: FfprobeFormat
  chapters?: FfprobeChapter[]
  error?: {
    string: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface FfprobeFunction {
  (filepath: string): Promise<FfprobeRawData>
  FFPROBE_PATH?: string
}

declare const ffprobe: FfprobeFunction
export default ffprobe
