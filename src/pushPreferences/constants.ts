export const QuietHoursDay = {
  Monday: 'mon',
  Tuesday: 'tue',
  Wednesday: 'wed',
  Thursday: 'thu',
  Friday: 'fri',
  Saturday: 'sat',
  Sunday: 'sun',
} as const;

export type QuietHoursDay = (typeof QuietHoursDay)[keyof typeof QuietHoursDay];

export const QUIET_HOURS_WEEK: QuietHoursDay[] = [
  QuietHoursDay.Sunday,
  QuietHoursDay.Monday,
  QuietHoursDay.Tuesday,
  QuietHoursDay.Wednesday,
  QuietHoursDay.Thursday,
  QuietHoursDay.Friday,
  QuietHoursDay.Saturday,
];

export const MINUTES_PER_HOUR = 60;
