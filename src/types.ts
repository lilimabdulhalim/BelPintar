export interface ScheduleItem {
  id: number;
  day: string;
  time: string;
  period_number: number;
  teacher_prefix: string;
  teacher_name: string;
  subject: string;
  class_name: string;
  is_active: number;
}

export const DAYS = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu"
];
