/**
 * Deliberately small future boundary. PulseOne remains a separate product;
 * this adapter accepts only approved attendance summaries, never telemetry.
 */
export type AttendanceSummaryForExternalSystems = {
  employeeId: string;
  attendanceDate: string;
  workedMinutes: number;
  workMode: string;
};

export function toAttendanceSummary(input: AttendanceSummaryForExternalSystems) {
  return { ...input, source: "sourcehub-attendance", version: "1" };
}
