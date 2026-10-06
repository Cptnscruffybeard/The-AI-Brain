import { describe, expect, it } from "vitest";
import { PersonalBrain } from "../src/personal/personal-brain.js";

describe("PersonalBrain", () => {
  it("creates an isolated personal workspace", () => {
    const a = new PersonalBrain("A");
    const b = new PersonalBrain("B");
    a.rememberPreference("coffee in the morning", { tags: ["coffee"] });
    expect(a.brain.memory.retrieve(a.projectId, "coffee")).toHaveLength(1);
    expect(b.brain.memory.retrieve(b.projectId, "coffee")).toHaveLength(0);
  });

  it("stores household members and emits an audit event", () => {
    const brain = new PersonalBrain("A");
    const member = brain.addHouseholdMember("Alex", "child");
    expect(brain.household.get(member.id)?.name).toBe("Alex");
    expect(brain.brain.store.events.some(e => e.type === "household.member_added")).toBe(true);
  });

  it("orders and completes reminders", () => {
    const brain = new PersonalBrain("A");
    const later = brain.addReminder("Later", "2030-01-02T10:00:00Z");
    const sooner = brain.addReminder("Sooner", "2030-01-01T10:00:00Z", { priority: "high" });
    expect(brain.upcomingReminders("2029-12-31T00:00:00Z").map(x => x.id)).toEqual([sooner.id, later.id]);
    brain.completeReminder(sooner.id);
    expect(brain.upcomingReminders("2029-12-31T00:00:00Z").map(x => x.id)).toEqual([later.id]);
  });

  it("rejects invalid appointment ranges", () => {
    const brain = new PersonalBrain("A");
    expect(() =>
      brain.addAppointment("Bad", "2030-01-02T10:00:00Z", {
        endAt: "2030-01-02T09:00:00Z"
      })
    ).toThrow();
  });

  it("keeps appointments chronologically ordered", () => {
    const brain = new PersonalBrain("A");
    brain.addAppointment("Later", "2030-01-02T10:00:00Z");
    brain.addAppointment("Sooner", "2030-01-01T10:00:00Z");
    expect(brain.upcomingAppointments("2029-12-31T00:00:00Z").map(x => x.title)).toEqual(["Sooner", "Later"]);
  });

  it("supports a shared core when adapting the Brain into AIB", () => {
    const core = new PersonalBrain("A");
    const adapted = new PersonalBrain("A", { brain: core.brain });
    expect(adapted.brain).toBe(core.brain);
    expect(adapted.projectId).not.toBe(core.projectId);
  });
});
