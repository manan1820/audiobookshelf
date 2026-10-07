export interface DateAndTime {
  format(dateObj: Date, formatString: string, utc?: boolean): string
  parse(dateStr: string, formatter: string, utc?: boolean): Date
  [key: string]: unknown
}

declare const dateAndTime: DateAndTime
export default dateAndTime
export = dateAndTime
