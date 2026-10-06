interface DateAndTime {
  format(date: Date, format: string, utc?: boolean): string
  parse(dateString: string, format: string, utc?: boolean): Date
  isValid(dateString: string, format: string): boolean
  transform(dateString: string, fromFormat: string, toFormat: string, utc?: boolean): string
  addYears(date: Date, years: number): Date
  addMonths(date: Date, months: number): Date
  addDays(date: Date, days: number): Date
  addHours(date: Date, hours: number): Date
  addMinutes(date: Date, minutes: number): Date
  addSeconds(date: Date, seconds: number): Date
  addMilliseconds(date: Date, milliseconds: number): Date
  subtract(date1: Date, date2: Date): {
    toMilliseconds(): number
    toSeconds(): number
    toMinutes(): number
    toHours(): number
    toDays(): number
  }
  isLeapYear(year: number): boolean
  isSameDay(date1: Date, date2: Date): boolean
}

declare const dateAndTime: DateAndTime
export default dateAndTime
export = dateAndTime
