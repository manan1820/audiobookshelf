export interface FfprobeFunction {
  (file: string): Promise<Record<string, unknown>>
  FFPROBE_PATH?: string
}

declare const ffprobe: FfprobeFunction
export default ffprobe
export = ffprobe
