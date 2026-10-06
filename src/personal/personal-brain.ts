import { AIBrain } from "../brain.js";
import { id, now } from "../core/id.js";
import type { BrainRequest, Memory } from "../domain/types.js";
import type {
  Appointment,
  HouseholdMember,
  PersonalProfile,
  PersonalSnapshot,
  Reminder,
  ReminderPriority
} from "./types.js";

export class PersonalBrain {
  readonly brain: AIBrain;
  readonly projectId: string;
  readonly profile: PersonalProfile;
  readonly household = new Map<string, HouseholdMember>();
  readonly reminders = new Map<string, Reminder>();
  readonly appointments = new Map<string, Appointment>();

  constructor(
    displayName: string,
    options: { timezone?: string; locale?: string; brain?: AIBrain } = {}
  ) {
    this.brain = options.brain ?? new AIBrain();
    const timestamp = now();
    this.profile = {
      id: id(),
      displayName,
      timezone: options.timezone ?? "UTC",
      locale: options.locale ?? "en-US",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const project = this.brain.createProject(
      "AIB Personal",
      "Personal AI Brain workspace"
    );
    this.projectId = project.id;
    this.emit("personal.initialized", { profileId: this.profile.id });
  }

  rememberPreference(
    content: string,
    options: { tags?: string[]; confidence?: number; importance?: number; source?: string } = {}
  ) {
    const memory: Omit<Memory, "id" | "createdAt"> = {
      projectId: this.projectId,
      type: "preference",
      content,
      tags: options.tags ?? [],
      source: options.source ?? "user",
      confidence: options.confidence ?? 1,
      importance: options.importance ?? 5
    };
    return this.brain.remember(memory);
  }

  addHouseholdMember(name: string, label?: string) {
    const member: HouseholdMember = { id: id(), name, ...(label ? { label } : {}), createdAt: now() };
    this.household.set(member.id, member);
    this.emit("household.member_added", { memberId: member.id });
    return member;
  }

  addReminder(
    title: string,
    dueAt: string,
    options: { priority?: ReminderPriority; notes?: string } = {}
  ) {
    if (!Number.isFinite(Date.parse(dueAt))) throw new Error("Invalid reminder dueAt.");
    const reminder: Reminder = {
      id: id(),
      title,
      dueAt,
      priority: options.priority ?? "normal",
      ...(options.notes ? { notes: options.notes } : {}),
      completed: false,
      createdAt: now()
    };
    this.reminders.set(reminder.id, reminder);
    this.emit("reminder.created", { reminderId: reminder.id, dueAt });
    return reminder;
  }

  completeReminder(reminderId: string) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) throw new Error("Unknown reminder: " + reminderId);
    if (!reminder.completed) {
      reminder.completed = true;
      reminder.completedAt = now();
      this.emit("reminder.completed", { reminderId });
    }
    return reminder;
  }

  addAppointment(
    title: string,
    startAt: string,
    options: { endAt?: string; location?: string; notes?: string } = {}
  ) {
    if (!Number.isFinite(Date.parse(startAt))) throw new Error("Invalid appointment startAt.");
    if (options.endAt !== undefined && !Number.isFinite(Date.parse(options.endAt))) {
      throw new Error("Invalid appointment endAt.");
    }
    if (options.endAt !== undefined && Date.parse(options.endAt) < Date.parse(startAt)) {
      throw new Error("Appointment endAt cannot be before startAt.");
    }
    const appointment: Appointment = {
      id: id(),
      title,
      startAt,
      ...(options.endAt ? { endAt: options.endAt } : {}),
      ...(options.location ? { location: options.location } : {}),
      ...(options.notes ? { notes: options.notes } : {}),
      createdAt: now()
    };
    this.appointments.set(appointment.id, appointment);
    this.emit("appointment.created", { appointmentId: appointment.id, startAt });
    return appointment;
  }

  upcomingReminders(from = now(), limit = 20) {
    const cutoff = Date.parse(from);
    if (!Number.isFinite(cutoff)) throw new Error("Invalid reminder window.");
    return [...this.reminders.values()]
      .filter(item => !item.completed && Date.parse(item.dueAt) >= cutoff)
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
      .slice(0, limit);
  }

  upcomingAppointments(from = now(), limit = 20) {
    const cutoff = Date.parse(from);
    if (!Number.isFinite(cutoff)) throw new Error("Invalid appointment window.");
    return [...this.appointments.values()]
      .filter(item => Date.parse(item.startAt) >= cutoff)
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
      .slice(0, limit);
  }

  async ask(goal: string, options: Omit<BrainRequest, "projectId" | "goal"> = {}) {
    return this.brain.request({
      ...options,
      projectId: this.projectId,
      goal,
      permissions: options.permissions ?? ["read"]
    });
  }

  snapshot(): PersonalSnapshot {
    return {
      profile: { ...this.profile },
      household: [...this.household.values()],
      reminders: [...this.reminders.values()],
      appointments: [...this.appointments.values()]
    };
  }

  private emit(type: string, data: Record<string, unknown>) {
    this.brain.store.events.push({
      id: id(),
      type,
      timestamp: now(),
      projectId: this.projectId,
      actor: "personal-brain",
      data
    });
  }
}
