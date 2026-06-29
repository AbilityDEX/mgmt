import { CronExpressionParser } from 'cron-parser'

export const INSPECTION_TIMEZONE = 'Europe/London'
const DEFAULT_INSPECTION_TIME = '09:00'

type LocalDateTimeParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

type LocalDateTimeInput = LocalDateTimeParts & {
  millisecond?: number
}

const londonPartsFormatter = new Intl.DateTimeFormat('en-GB-u-ca-gregory', {
  timeZone: INSPECTION_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const londonWeekdayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: INSPECTION_TIMEZONE,
  weekday: 'short',
})

const londonDateTimeDisplayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: INSPECTION_TIMEZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: false,
})

const londonDateDisplayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: INSPECTION_TIMEZONE,
  dateStyle: 'medium',
})

const londonTimeDisplayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: INSPECTION_TIMEZONE,
  timeStyle: 'short',
  hour12: false,
})

function extractLocalParts(date: Date): LocalDateTimeParts {
  const values = londonPartsFormatter.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(values.find((value) => value.type === type)?.value ?? '0')

  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  }
}

function getTimeZoneOffsetMs(date: Date) {
  const parts = extractLocalParts(date)
  const localizedUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0
  )

  const instantUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    0
  )

  return localizedUtc - instantUtc
}

function toLocalDateTimeInput(date: Date): LocalDateTimeInput {
  const parts = extractLocalParts(date)
  return {
    ...parts,
    millisecond: date.getUTCMilliseconds(),
  }
}

function matchesLocalDateTime(date: Date, input: LocalDateTimeInput) {
  const parts = extractLocalParts(date)
  return (
    parts.year === input.year &&
    parts.month === input.month &&
    parts.day === input.day &&
    parts.hour === input.hour &&
    parts.minute === input.minute &&
    parts.second === input.second
  )
}

export function normalizeInspectionTimezone(_: string | null | undefined) {
  return INSPECTION_TIMEZONE
}

export function parseInspectionTime(value: string | null | undefined) {
  const [rawHour, rawMinute] = (value?.trim() || DEFAULT_INSPECTION_TIME).split(':')
  const parsedHour = Number(rawHour)
  const parsedMinute = Number(rawMinute)

  return {
    hour: Number.isFinite(parsedHour) ? Math.min(Math.max(parsedHour, 0), 23) : 9,
    minute: Number.isFinite(parsedMinute) ? Math.min(Math.max(parsedMinute, 0), 59) : 0,
  }
}

export function londonDateTimeToUtc(input: LocalDateTimeInput) {
  const utcGuess = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    input.second,
    input.millisecond ?? 0
  )

  const firstPass = utcGuess - getTimeZoneOffsetMs(new Date(utcGuess))
  const firstDate = new Date(firstPass)
  if (matchesLocalDateTime(firstDate, input)) {
    return firstDate
  }

  const secondPass = utcGuess - getTimeZoneOffsetMs(firstDate)
  const secondDate = new Date(secondPass)
  if (matchesLocalDateTime(secondDate, input)) {
    return secondDate
  }

  for (let minuteOffset = -180; minuteOffset <= 180; minuteOffset += 1) {
    const candidate = new Date(firstPass + minuteOffset * 60_000)
    if (matchesLocalDateTime(candidate, input)) {
      return candidate
    }
  }

  return firstDate
}

export function getLondonDateTimeParts(date: Date) {
  return extractLocalParts(date)
}

export function getLondonDateKey(date: Date) {
  const parts = extractLocalParts(date)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function combineLondonDateAndTime(date: Date, timeValue: string | null | undefined) {
  const parts = extractLocalParts(date)
  const time = parseInspectionTime(timeValue)

  return londonDateTimeToUtc({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: time.hour,
    minute: time.minute,
    second: 0,
    millisecond: 0,
  })
}

export function startOfLondonDay(date: Date) {
  const parts = extractLocalParts(date)
  return londonDateTimeToUtc({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  })
}

export function endOfLondonDay(date: Date) {
  const parts = extractLocalParts(date)
  return londonDateTimeToUtc({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 23,
    minute: 59,
    second: 59,
    millisecond: 999,
  })
}

export function endOfLondonWeek(date: Date) {
  const parts = extractLocalParts(date)
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0))
  const weekday = londonWeekdayFormatter.format(localDate)
  const dayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  }
  const currentDay = dayMap[weekday] ?? 1
  return endOfLondonDay(addLondonDays(date, 7 - currentDay))
}

export function addLondonDays(date: Date, dayCount: number) {
  const local = toLocalDateTimeInput(date)
  const cursor = new Date(
    Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, local.millisecond ?? 0)
  )
  cursor.setUTCDate(cursor.getUTCDate() + dayCount)

  return londonDateTimeToUtc({
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
    day: cursor.getUTCDate(),
    hour: cursor.getUTCHours(),
    minute: cursor.getUTCMinutes(),
    second: cursor.getUTCSeconds(),
    millisecond: cursor.getUTCMilliseconds(),
  })
}

export function addLondonMonths(date: Date, monthCount: number) {
  const local = toLocalDateTimeInput(date)
  const cursor = new Date(
    Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, local.millisecond ?? 0)
  )
  cursor.setUTCMonth(cursor.getUTCMonth() + monthCount)

  return londonDateTimeToUtc({
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
    day: cursor.getUTCDate(),
    hour: cursor.getUTCHours(),
    minute: cursor.getUTCMinutes(),
    second: cursor.getUTCSeconds(),
    millisecond: cursor.getUTCMilliseconds(),
  })
}

export function calculateNextInspectionDueAt(params: {
  frequency: 'Daily' | 'Weekly' | 'Fortnightly' | 'Monthly' | 'Quarterly' | 'Six Monthly' | 'Annually' | 'Custom'
  intervalValue?: number
  customCron?: string | null
  fromDate: Date
  inspectionTime?: string | null
}) {
  const intervalValue = Math.max(1, params.intervalValue ?? 1)
  const baseStart = startOfLondonDay(params.fromDate)
  const inspectionTime = params.inspectionTime ?? DEFAULT_INSPECTION_TIME

  switch (params.frequency) {
    case 'Daily':
      return combineLondonDateAndTime(addLondonDays(baseStart, intervalValue), inspectionTime)
    case 'Weekly':
      return combineLondonDateAndTime(addLondonDays(baseStart, 7 * intervalValue), inspectionTime)
    case 'Fortnightly':
      return combineLondonDateAndTime(addLondonDays(baseStart, 14 * intervalValue), inspectionTime)
    case 'Monthly':
      return combineLondonDateAndTime(addLondonMonths(baseStart, intervalValue), inspectionTime)
    case 'Quarterly':
      return combineLondonDateAndTime(addLondonMonths(baseStart, 3 * intervalValue), inspectionTime)
    case 'Six Monthly':
      return combineLondonDateAndTime(addLondonMonths(baseStart, 6 * intervalValue), inspectionTime)
    case 'Annually':
      return combineLondonDateAndTime(addLondonMonths(baseStart, 12 * intervalValue), inspectionTime)
    case 'Custom': {
      if (!params.customCron?.trim()) {
        return combineLondonDateAndTime(addLondonDays(baseStart, intervalValue), inspectionTime)
      }

      const parsed = CronExpressionParser.parse(params.customCron, {
        currentDate: baseStart,
        tz: INSPECTION_TIMEZONE,
      })

      return combineLondonDateAndTime(parsed.next().toDate(), inspectionTime)
    }
    default:
      return combineLondonDateAndTime(addLondonDays(baseStart, 1), inspectionTime)
  }
}

export function formatInspectionDateTime(value: string | Date | null | undefined) {
  if (!value) return 'N/A'
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? 'N/A' : londonDateTimeDisplayFormatter.format(date)
}

export function formatInspectionDate(value: string | Date | null | undefined) {
  if (!value) return 'N/A'
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? 'N/A' : londonDateDisplayFormatter.format(date)
}

export function formatInspectionTime(value: string | Date | null | undefined) {
  if (!value) return 'N/A'
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? 'N/A' : londonTimeDisplayFormatter.format(date)
}