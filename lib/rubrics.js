// Rubric points used by the auto-grader (lib/ai.js).
// Keyed by the question_id the frontends send with each upload, with a
// question-text fallback so older answers (uploaded before question_id was
// stored) can still be graded when someone hits "Transcribe" in admin.

export const RUBRICS = [
  // ---- Operations (Developer) ----
  {
    id: "ops-1-notion-questions",
    text: "Have you gone through the full Notion? What questions do you have about the business, and what are you curious about?",
    points: [
      "Asks specific, informed questions about the business",
      "Shows evidence of having actually gone through the Notion",
      "Demonstrates curiosity beyond surface level",
      "Questions are relevant to the operations role",
    ],
  },
  {
    id: "ops-2-business-flow",
    text: "Can you summarize how the business operates, especially operations? Who would you be working alongside, and who owns each task?",
    points: [
      "Describes the cleaning schedule/shifts and how cleaning happens",
      "Identifies who owns which operational tasks",
      "Explains where receptionists fit into operations",
      "Mentions the contractors involved",
      "Explains how guests find the business and the check-in process",
      "Describes how issues and complaints are reported and escalated",
    ],
  },
  {
    id: "ops-3-cleaning-investment",
    text: "Why do you think we invest so much time and effort into cleaning and maintenance? How does that connect to our business outcomes?",
    points: [
      "Links cleaning/maintenance effort to better guest reviews",
      "Connects better reviews to more bookings",
      "Frames it around guest experience, not just tidiness",
      "Gives concrete business reasoning rather than generic statements",
    ],
  },
  {
    id: "ops-4-improvements",
    text: "After going through our operations structure, what do you think can be improved? Do you have any suggestions to save us time or money?",
    points: [
      "Offers concrete, operations-grounded suggestions",
      "Suggestions target saving time or money",
      "Shows understanding of the current structure before proposing changes",
      "Ideas are realistic for a hotel operation",
    ],
  },
  {
    id: "ops-5-maintenance",
    text: "How do maintenance issues get resolved?",
    points: [
      "Describes the reporting path for maintenance issues",
      "Identifies who owns the fix",
      "Mentions timelines or follow-up",
      "Mentions escalation when something is unresolved",
    ],
  },
  {
    id: "ops-6-receptionist-assessment",
    text: "How do we assess receptionists? What should we be evaluating them on?",
    points: [
      "Mentions empathy and guest handling",
      "Mentions communication and clarity of voice",
      "Mentions following protocols/process",
      "Mentions outcomes (reviews, complaints, bookings) or other sensible criteria",
    ],
  },
  {
    id: "ops-7-more-context",
    text: "What do you think you need more context on to get on top of all the tasks and work better?",
    points: [
      "Recognizes real gaps in their current understanding",
      "Asks for specific context, tools, or resources",
      "Shows self-awareness and initiative to get up to speed",
      "Wants to understand task ownership and workflow",
    ],
  },
  {
    id: "ops-8-guest-channels",
    text: "Where do receptionists communicate with guests?",
    points: [
      "Mentions in-person / front desk",
      "Mentions phone calls",
      "Mentions messaging channels (WhatsApp/SMS/OTA chat)",
      "Mentions email or other channels",
    ],
  },

  // ---- Remote Hotel Receptionist ----
  {
    id: "q1-difficult-clients",
    text: "With all your experiences, how do you handle difficult clients or angry customers/callers?",
    points: [
      "Gives a clear step-by-step approach to handling difficult/angry customers",
      "Provides a concrete example from experience",
      "Focuses on de-escalation and staying calm",
      "Mentions ensuring customer satisfaction / follow-through",
      "Explains what they do when they don't know the answer right away",
      "Communicates with empathy toward emotional customers",
    ],
  },
  {
    id: "q2-say-no",
    text: "Can you describe a situation where you had to say “no” to a customer? How did you manage their reaction?",
    points: [
      "Explains how to say no clearly and professionally",
      "Offers alternatives when the original request isn't possible",
      "Handles pushback or threats to complain without escalating",
      "Keeps the conversation professional while still being helpful",
    ],
  },
  {
    id: "q3-feedback",
    text: "How do you respond to feedback? And is there one piece of feedback that’s stuck with you throughout your career?",
    points: [
      "Gives a specific example of feedback received and what changed",
      "Shows openness to feedback even when they don't fully agree",
      "Explains how they make improvement consistent, not temporary",
      "Takes ownership when they make a mistake",
    ],
  },
  {
    id: "q4-prioritize",
    text: "How do you prioritize tasks when everything feels urgent?",
    points: [
      "Explains how they decide what to do first in a busy shift",
      "Handles multitasking without missing details",
      "Mentions tools or methods for staying organized",
      "Gives an example of competing urgent tasks",
      "Balances speed against accuracy",
    ],
  },
];

function normalize(text) {
  return String(text || "")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("’", "'")
    .replaceAll("‘", "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const RUBRIC_BY_ID = new Map(RUBRICS.map((r) => [r.id, r]));
export const RUBRIC_BY_TEXT = new Map(RUBRICS.map((r) => [normalize(r.text), r]));

export function findRubric({ questionId, questionText }) {
  if (questionId && RUBRIC_BY_ID.has(questionId)) return RUBRIC_BY_ID.get(questionId);
  return RUBRIC_BY_TEXT.get(normalize(questionText)) || null;
}
