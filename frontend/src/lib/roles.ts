import type { LevelKey } from "./levels";
import type { Focus, Role } from "./types";

export const ROLES: { key: LevelKey; label: string; description: string }[] = [
  { key: "engineer", label: "Engineer", description: "Writes code and reviews their own explanations." },
  { key: "senior", label: "Senior developer", description: "Reviews code; gets a quick technical summary." },
  { key: "intern", label: "Intern", description: "Learning the codebase; gets the how and why." },
  { key: "manager", label: "Manager", description: "Leads a team; sees impact, risk and plans." },
  { key: "client", label: "Client", description: "Sees reviewed work in business terms." },
  { key: "cmo", label: "CMO", description: "Sees the whole organisation: customers, campaigns, growth." },
];

export const roleLabel = (key: LevelKey) => ROLES.find((r) => r.key === key)?.label ?? key;

/** "a manager", "an engineer", "a CMO": acronyms keep their case. */
export function roleNoun(key: LevelKey) {
  const label = roleLabel(key);
  const word = label === label.toUpperCase() ? label : label.toLowerCase();
  return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
}

export const TECHNICAL_ROLES: Role[] = ["engineer", "senior", "intern"];
export const LEAD_ROLES: Role[] = ["cmo", "manager"];
export const isTechnical = (role: Role) => TECHNICAL_ROLES.includes(role);
export const isLead = (role: Role) => LEAD_ROLES.includes(role);

/** Each role's app: different tabs, because each role does different work. */
export function tabsFor(role: Role): { href: string; label: string }[] {
  if (role === "cmo")
    return [
      { href: "/app", label: "Overview" },
      { href: "/app/digest", label: "This week" },
      { href: "/app/updates", label: "Engineer updates" },
      { href: "/app/tasks", label: "Tasks" },
      { href: "/app/questions", label: "Questions" },
      { href: "/app/team", label: "Organisation" },
    ];
  if (role === "manager")
    return [
      { href: "/app", label: "Team activity" },
      { href: "/app/digest", label: "This week" },
      { href: "/app/updates", label: "Engineer updates" },
      { href: "/app/tasks", label: "Tasks" },
      { href: "/app/questions", label: "Questions" },
      { href: "/app/team", label: "My team" },
    ];
  if (role === "client")
    return [
      { href: "/app", label: "Updates" },
      { href: "/app/tasks", label: "Tasks" },
      { href: "/app/digest", label: "This week" },
      { href: "/app/questions", label: "Questions" },
    ];
  return [
    { href: "/app", label: "My work" },
    { href: "/app/questions", label: "Questions" },
  ];
}

/** A section page is open to a role only when it is one of that role's tabs. */
export const canOpen = (role: Role, href: string) => tabsFor(role).some((t) => t.href === href);

export const FOCUS_OPTIONS: { key: Focus; label: string }[] = [
  { key: "timelines", label: "Timelines" },
  { key: "cost", label: "Cost" },
  { key: "risk", label: "Risk" },
  { key: "how-it-works", label: "How it works" },
  { key: "user-impact", label: "What users notice" },
];
