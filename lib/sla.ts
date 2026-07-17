import { env } from "@/lib/env";

export type WorkingDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type BusinessHours = {
  start: string;
  end: string;
  workingDays: WorkingDay[];
  publicHolidays: string[];
  timezone?: string;
};

export type SlaPolicyLike = {
  id: string;
  workspaceId: string;
  clientId: string | null;
  supportAgreementId: string | null;
  priority: string | null;
  categoryId: string | null;
  active: boolean;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  businessHoursStart: string;
  businessHoursEnd: string;
  workingDays: string[] | WorkingDay[];
  publicHolidays: string[];
  pauseConditions: string[];
};

export type SlaState = "HEALTHY" | "AT_RISK" | "DUE_SOON" | "BREACHED" | "PAUSED" | "RESOLVED";

export type SlaTargets = {
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  pausedMinutes: number;
  schedule: BusinessHours;
};

const dayLookup: Record<string, WorkingDay> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

export function parseWorkingDays(input: Array<string | WorkingDay> | string): WorkingDay[] {
  const values = Array.isArray(input) ? input : input.split(",").map((value) => value.trim());
  const days = values
    .map((value) => (typeof value === "number" ? value : dayLookup[value.toLowerCase()]))
    .filter((value): value is WorkingDay => Number.isInteger(value));
  return Array.from(new Set(days)).sort((left, right) => left - right) as WorkingDay[];
}

export function parseClock(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  return {
    hours: Number.isFinite(hours) ? hours : 0,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
}

export function minutesFromClock(value: string) {
  const { hours, minutes } = parseClock(value);
  return hours * 60 + minutes;
}

export function clockFromMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.max(0, totalMinutes % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function createBusinessHours(schedule?: Partial<BusinessHours>): BusinessHours {
  return {
    start: schedule?.start ?? env.DEFAULT_BUSINESS_START_TIME,
    end: schedule?.end ?? env.DEFAULT_BUSINESS_END_TIME,
    workingDays: schedule?.workingDays ?? parseWorkingDays(env.DEFAULT_WORKING_DAYS),
    publicHolidays: schedule?.publicHolidays ?? [],
    timezone: schedule?.timezone,
  };
}

export function isHoliday(date: Date, holidays: string[]) {
  return holidays.includes(date.toISOString().slice(0, 10));
}

export function isBusinessDay(date: Date, schedule: BusinessHours) {
  return schedule.workingDays.includes(date.getDay() as WorkingDay) && !isHoliday(date, schedule.publicHolidays);
}

export function isWithinBusinessHours(date: Date, schedule: BusinessHours) {
  if (!isBusinessDay(date, schedule)) return false;
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= minutesFromClock(schedule.start) && minutes < minutesFromClock(schedule.end);
}

export function nextBusinessStart(date: Date, schedule: BusinessHours) {
  const candidate = new Date(date);
  candidate.setSeconds(0, 0);

  while (!isBusinessDay(candidate, schedule)) {
    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(0, 0, 0, 0);
  }

  const startMinutes = minutesFromClock(schedule.start);
  const currentMinutes = candidate.getHours() * 60 + candidate.getMinutes();
  if (currentMinutes >= startMinutes) return candidate;

  candidate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  return candidate;
}

export function addBusinessMinutes(startAt: Date, minutes: number, schedule: BusinessHours) {
  let remaining = Math.max(0, minutes);
  let cursor = nextBusinessStart(startAt, schedule);

  while (remaining > 0) {
    if (!isWithinBusinessHours(cursor, schedule)) {
      cursor = nextBusinessStart(cursor, schedule);
      continue;
    }

    const endMinutes = minutesFromClock(schedule.end);
    const cursorMinutes = cursor.getHours() * 60 + cursor.getMinutes();
    const available = endMinutes - cursorMinutes;
    const consumed = Math.min(available, remaining);

    cursor = new Date(cursor.getTime() + consumed * 60_000);
    remaining -= consumed;

    if (remaining > 0) {
      cursor = new Date(cursor);
      cursor.setHours(Math.floor(minutesFromClock(schedule.start) / 60), minutesFromClock(schedule.start) % 60, 0, 0);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return cursor;
}

export function calculateSlaTargets({
  openedAt,
  firstResponseMinutes,
  resolutionMinutes,
  schedule,
  pausedMinutes = 0,
}: {
  openedAt: Date;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  schedule?: Partial<BusinessHours>;
  pausedMinutes?: number;
}): SlaTargets {
  const businessHours = createBusinessHours(schedule);
  return {
    firstResponseDueAt: addBusinessMinutes(openedAt, Math.max(0, firstResponseMinutes - pausedMinutes), businessHours),
    resolutionDueAt: addBusinessMinutes(openedAt, Math.max(0, resolutionMinutes - pausedMinutes), businessHours),
    pausedMinutes,
    schedule: businessHours,
  };
}

export function businessHoursFromPolicy(policy: {
  businessHoursStart: string;
  businessHoursEnd: string;
  workingDays: string[] | WorkingDay[];
  publicHolidays: string[];
  timezone?: string | null;
}) {
  return createBusinessHours({
    start: policy.businessHoursStart,
    end: policy.businessHoursEnd,
    workingDays: parseWorkingDays(policy.workingDays),
    publicHolidays: policy.publicHolidays,
    timezone: policy.timezone ?? undefined,
  });
}

export function computeTicketSlaSnapshot({
  openedAt,
  pausedMinutes = 0,
  firstResponseMinutes,
  resolutionMinutes,
  policy,
}: {
  openedAt: Date;
  pausedMinutes?: number;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  policy: {
    businessHoursStart: string;
    businessHoursEnd: string;
    workingDays: string[] | WorkingDay[];
    publicHolidays: string[];
    timezone?: string | null;
  };
}) {
  return calculateSlaTargets({
    openedAt,
    pausedMinutes,
    firstResponseMinutes,
    resolutionMinutes,
    schedule: businessHoursFromPolicy(policy),
  });
}

export function slaCountdownState({
  now,
  firstResponseDueAt,
  resolutionDueAt,
  firstResponseAt,
  resolvedAt,
  pausedAt,
}: {
  now: Date;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstResponseAt?: Date | null;
  resolvedAt?: Date | null;
  pausedAt?: Date | null;
}): SlaState {
  if (resolvedAt) return "RESOLVED";
  if (pausedAt) return "PAUSED";

  const target = firstResponseAt ? resolutionDueAt : firstResponseDueAt ?? resolutionDueAt;
  if (!target) return "HEALTHY";

  const remaining = target.getTime() - now.getTime();
  if (remaining <= 0) return "BREACHED";

  const totalWindow = Math.max(1, target.getTime() - (firstResponseAt ? firstResponseAt.getTime() : now.getTime() - 60_000));
  const ratio = remaining / totalWindow;

  if (ratio <= 0.1) return "DUE_SOON";
  if (ratio <= 0.25) return "AT_RISK";
  return "HEALTHY";
}

export function slaPercentRemaining(target: Date | null, now: Date, startedAt: Date) {
  if (!target) return 100;
  const total = Math.max(1, target.getTime() - startedAt.getTime());
  const remaining = Math.max(0, target.getTime() - now.getTime());
  return Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));
}

export function selectSlaPolicy<T extends SlaPolicyLike>(
  policies: T[],
  ticket: {
    workspaceId: string;
    clientId: string | null;
    supportAgreementId: string | null;
    priority: string;
    categoryId: string | null;
  },
) {
  const activePolicies = policies.filter((policy) => policy.active && policy.workspaceId === ticket.workspaceId);
  const scored = activePolicies.map((policy) => {
    let score = 0;
    if (!policy.clientId || policy.clientId === ticket.clientId) score += policy.clientId ? 4 : 1;
    if (!policy.supportAgreementId || policy.supportAgreementId === ticket.supportAgreementId) score += policy.supportAgreementId ? 3 : 1;
    if (!policy.priority || policy.priority === ticket.priority) score += policy.priority ? 3 : 1;
    if (!policy.categoryId || policy.categoryId === ticket.categoryId) score += policy.categoryId ? 2 : 1;
    return { policy, score };
  });

  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.policy ?? null;
}

export function pauseSlaMinutes(pausedSince: Date | null, resumedAt: Date, currentPausedMinutes = 0) {
  if (!pausedSince) return currentPausedMinutes;
  return currentPausedMinutes + Math.max(0, Math.floor((resumedAt.getTime() - pausedSince.getTime()) / 60_000));
}
