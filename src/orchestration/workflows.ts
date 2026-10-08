import type {PlanStep} from "./planner.js";

/**
 * First-class vertical workflow: discover sources → verify claims →
 * promote verified knowledge into memory → produce a brief.
 *
 * Tasks are planned with least-privilege permissions so policy and
 * agent selection stay aligned with the research pipeline.
 */
export function researchToBriefWorkflow(topic:string):PlanStep[]{
  const clean=topic.trim()||"topic";
  return [
    {
      key:"discover",
      title:"Research discovery: "+clean,
      description:"Discover public sources about: "+clean+". Collect candidate facts without treating any source as authority.",
      type:"research",
      risk:"low",
      permissions:["read"],
      acceptanceCriteria:[
        "Sources were collected for the topic",
        "No source was treated as trusted authority"
      ]
    },
    {
      key:"verify",
      title:"Research verification: "+clean,
      description:"Cross-reference claims about "+clean+" across independent domains. Mark only corroborated statements as verified.",
      type:"research",
      dependsOn:["discover"],
      risk:"low",
      permissions:["read"],
      acceptanceCriteria:[
        "Claims were checked across independent domains",
        "Unverified claims remain marked unverified"
      ]
    },
    {
      key:"promote",
      title:"Promote verified knowledge: "+clean,
      description:"Promote only verified claims about "+clean+" into governed project memory with provenance.",
      type:"research",
      dependsOn:["verify"],
      risk:"medium",
      permissions:["read","write"],
      acceptanceCriteria:[
        "Verified claims were written to memory",
        "Unverified claims were not promoted"
      ]
    },
    {
      key:"brief",
      title:"Research brief: "+clean,
      description:"Produce a concise brief on "+clean+" from verified memory only. Separate facts, assumptions, and open questions.",
      type:"research",
      dependsOn:["promote"],
      risk:"low",
      permissions:["read"],
      acceptanceCriteria:[
        "Brief references verified knowledge",
        "Uncertainty is stated explicitly"
      ]
    }
  ];
}

export function codingReviewWorkflow(changeSummary:string):PlanStep[]{
  const clean=changeSummary.trim()||"change";
  return [
    {
      key:"inspect",
      title:"Inspect change: "+clean,
      description:"Read the relevant repository files for: "+clean,
      type:"coding",
      risk:"low",
      permissions:["read"],
      acceptanceCriteria:["Relevant files were inspected"]
    },
    {
      key:"diff",
      title:"Review diff: "+clean,
      description:"Review the repository diff related to: "+clean,
      type:"coding",
      dependsOn:["inspect"],
      risk:"low",
      permissions:["read"],
      acceptanceCriteria:["Diff was reviewed"]
    },
    {
      key:"assess",
      title:"Assess risk: "+clean,
      description:"Assess security, correctness, and regression risk for: "+clean,
      type:"security",
      dependsOn:["diff"],
      risk:"medium",
      permissions:["read"],
      acceptanceCriteria:["Risks and mitigations are listed"]
    }
  ];
}
