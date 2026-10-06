import type { Id, Timestamp } from "../domain/types.js";

export interface PersonalProfile {
  id: Id;
  displayName: string;
  timezone: string;
  locale: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface HouseholdMember {
  id: Id;
  name: string;
  label?: string;
  createdAt: Timestamp;
}

export type ReminderPriority = "low" | "normal" | "high";

export interface Reminder {
  id: Id;
  title: string;
  dueAt: Timestamp;
  priority: ReminderPriority;
  notes?: string;
  completed: boolean;
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

export interface Appointment {
  id: Id;
  title: string;
  startAt: Timestamp;
  endAt?: Timestamp;
  location?: string;
  notes?: string;
  createdAt: Timestamp;
}

export interface PersonalSnapshot {
  profile: PersonalProfile;
  household: HouseholdMember[];
  reminders: Reminder[];
  appointments: Appointment[];
}
