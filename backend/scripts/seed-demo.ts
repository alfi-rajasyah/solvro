// Wipes every data table and loads a small, human-readable demo workspace:
// four customers, six projects (one per status), sections, epics, labels,
// tasks with subtasks and dependencies, risks, daily notes, operations
// notes, weekly updates, a project member, and an activity log with
// notifications derived from the task and deal data. Dates are relative to the day the script runs,
// so the Gantt, overdue flags, and Daily Review always look current.
//
// DESTRUCTIVE — dev/demo databases only. Keeps roles, the auth_config and
// itop_config singletons (settings preserved), and the migration history;
// everything else, users included, is truncated. That includes the Pipeline
// tables (opportunities, opportunity_activities, opportunity_links,
// pipeline_import_logs): the wipe empties them and this script seeds nine
// demo deals back (one per stage, a won deal handed off to a demo project, a
// lost deal, an unassigned deal) owned by a demo SA, so run it only where the
// pipeline data is disposable. Refuses to run unless DEMO_SEED_CONFIRM=wipe
// is set and NODE_ENV is not "production".
//
//   docker compose exec -e DEMO_SEED_CONFIRM=wipe backend npx tsx scripts/seed-demo.ts
//
// Every demo account uses the password "password123". iTop tickets and
// time entries are not seeded — they only come from a real iTop sync.

import {
  PrismaClient,
  type PipelineOutcome,
  type PipelineOutcomeReason,
  type PipelineStage,
  type PipelineStatusTag,
  type PipelineSubStatus,
  type Priority,
  type ProjectStatus,
  type RiskCategory,
  type RiskStatus,
  type TaskStatus,
} from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "password123";
const KEEP_TABLES = new Set(["_prisma_migrations", "roles", "auth_config", "itop_config"]);

// ---------------------------------------------------------------- dates ---

const TODAY = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
const DAY_MS = 86_400_000;

/** UTC midnight `offset` days from today — the app's date contract. */
function day(offset: number): Date {
  return new Date(TODAY.getTime() + offset * DAY_MS);
}

/** A timestamp on day `offset` at `hour` UTC — for events that need a time of day. */
function at(offset: number, hour: number): Date {
  return new Date(day(offset).getTime() + hour * 3_600_000);
}

/** Offset (in days) of the ISO Monday `weeksAgo` weeks before this week's. */
function mondayOffset(weeksAgo: number): number {
  const dow = (TODAY.getUTCDay() + 6) % 7; // Monday = 0
  return -dow - weeksAgo * 7;
}

/** The last `n` weekdays up to and including today, as day offsets (oldest first). */
function recentWeekdays(n: number): number[] {
  const out: number[] = [];
  for (let off = 0; out.length < n; off--) {
    const dow = day(off).getUTCDay();
    if (dow !== 0 && dow !== 6) out.unshift(off);
  }
  return out;
}

// ---------------------------------------------------------------- specs ---

type UserKey = "admin" | "maya" | "rizky" | "dewi" | "agus" | "budi" | "sari" | "andi";

interface SubtaskSpec {
  title: string;
  status: TaskStatus;
  assignee?: UserKey;
  start?: number;
  due?: number;
}

interface TaskSpec {
  key: string;
  title: string;
  section: string;
  status: TaskStatus;
  priority?: Priority;
  start?: number;
  due?: number;
  assignee?: UserKey;
  epic?: string;
  labels?: string[];
  milestone?: boolean;
  critical?: boolean;
  /** Days the task slipped since the baseline was locked (baseline = actual - slip). */
  slip?: number;
  description?: string;
  subtasks?: SubtaskSpec[];
  comments?: Array<[UserKey, number, string]>; // author, day offset, body
}

interface EpicSpec {
  title: string;
  status: TaskStatus;
  color: string;
  owner?: UserKey;
  start?: number;
  due?: number;
  description?: string;
}

interface RiskSpec {
  description: string;
  category: RiskCategory;
  probability: number;
  impact: number;
  status: RiskStatus;
  mitigationPlan?: string;
  contingencyPlan?: string;
}

interface ProjectSpec {
  name: string;
  description: string;
  customer: string;
  tam: UserKey;
  /** The Solution Architect who sold the deal — a visibility arm, not an owner. */
  sa?: UserKey;
  /** Members (TAM-level access without ownership), added by the TAM. */
  members?: UserKey[];
  status: ProjectStatus;
  service: [string, string[]];
  /** Day offset the baseline was locked, when the project has one. */
  baselineLocked?: number;
  sections: Array<[string, string]>; // name, color
  epics?: EpicSpec[];
  labels?: Array<[string, string]>; // name, color
  tasks: TaskSpec[];
  deps?: Array<[string, string, ("HARD" | "SOFT")?]>;
  risks?: RiskSpec[];
  notes?: Array<[number, string]>; // day offset, body (authored by the TAM)
}

const USERS: Record<UserKey, { username: string; email: string; role: string }> = {
  admin: { username: "admin", email: "admin@demo.solvro.local", role: "ADMIN" },
  maya: { username: "maya.putri", email: "maya.putri@demo.solvro.local", role: "TAM" },
  rizky: { username: "rizky.pratama", email: "rizky.pratama@demo.solvro.local", role: "TAM" },
  dewi: { username: "dewi.lestari", email: "dewi.lestari@demo.solvro.local", role: "TAM" },
  agus: { username: "agus.setiawan", email: "agus.setiawan@demo.solvro.local", role: "TAM" },
  budi: { username: "budi.santoso", email: "budi.santoso@demo.solvro.local", role: "STAKEHOLDER" },
  sari: { username: "sari.wijaya", email: "sari.wijaya@demo.solvro.local", role: "SA" },
  andi: { username: "andi.kurniawan", email: "andi.kurniawan@demo.solvro.local", role: "SALES" },
};

const SERVICES: Array<[string, string]> = [
  ["Backup & Disaster Recovery", "Managed backup, offsite replication, and restore testing."],
  ["Managed Firewall", "Perimeter firewall operations, rule changes, and firmware upgrades."],
  ["Cloud Migration", "Landing zone design and workload migration to public cloud."],
  ["SIEM & SOC", "Log collection, detection rules, and 24x7 security monitoring."],
  ["Microsoft 365", "Tenant setup, mailbox migration, Teams and SharePoint adoption."],
  ["Managed Network", "LAN and Wi-Fi design, rollout, and monitoring."],
];

const CUSTOMERS: Array<{
  name: string;
  tam: UserKey;
  accountManager: string;
  solutionArchitect: string;
  description: string;
  services: Array<[string, string[]]>;
}> = [
  {
    name: "PT Nusantara Logistik",
    tam: "maya",
    accountManager: "Andi Wijaya",
    solutionArchitect: "Sarah Tan",
    description:
      "Freight and warehousing company with 14 depots across Java. Head office IT runs a small VMware cluster; they buy backup and firewall as managed services.",
    services: [
      ["Backup & Disaster Recovery", ["Veeam"]],
      ["Managed Firewall", ["FortiGate"]],
    ],
  },
  {
    name: "Bank Arta Sejahtera",
    tam: "rizky",
    accountManager: "Linda Kusuma",
    solutionArchitect: "Hendra Gunawan",
    description:
      "Regional bank regulated by OJK. Moving non-core workloads to Azure this year and building a security monitoring capability.",
    services: [
      ["Cloud Migration", ["Azure"]],
      ["SIEM & SOC", ["Wazuh"]],
    ],
  },
  {
    name: "Klinik Sehat Bersama",
    tam: "dewi",
    accountManager: "Andi Wijaya",
    solutionArchitect: "Sarah Tan",
    description:
      "Healthcare group with a head office and 9 clinics in Greater Jakarta. Replacing an on-premises Exchange server with Microsoft 365.",
    services: [["Microsoft 365", ["Microsoft 365 E3", "Intune"]]],
  },
  {
    name: "Kopi Senja",
    tam: "maya",
    accountManager: "Linda Kusuma",
    solutionArchitect: "Hendra Gunawan",
    description:
      "Coffee chain with 6 stores in Bandung. Needs reliable store Wi-Fi for the POS and a guest network for customers.",
    services: [["Managed Network", ["Ubiquiti UniFi"]]],
  },
];

const PROJECTS: ProjectSpec[] = [
  {
    name: "Nusantara — Veeam Backup Rollout",
    description:
      "Replace ad-hoc NAS copies with Veeam backup for all production VMs, add an offsite copy to the Surabaya data centre, and hand over runbooks to the customer's IT team.",
    customer: "PT Nusantara Logistik",
    tam: "maya",
    sa: "sari",
    members: ["agus"],
    status: "ACTIVE",
    service: ["Backup & Disaster Recovery", ["Veeam"]],
    baselineLocked: -22,
    sections: [
      ["Discovery", "#60a5fa"],
      ["Build", "#34d399"],
      ["Migration", "#f59e0b"],
      ["Handover", "#a78bfa"],
    ],
    epics: [
      {
        title: "Backup platform",
        status: "IN_PROGRESS",
        color: "#3b82f6",
        owner: "agus",
        start: -34,
        due: 19,
        description: "Veeam server, repository, and backup jobs for every production VM.",
      },
      {
        title: "Offsite replication",
        status: "TODO",
        color: "#f97316",
        owner: "maya",
        start: -10,
        due: 14,
        description: "Second copy of every backup in the Surabaya DC over a dedicated link.",
      },
      {
        title: "Runbooks & handover",
        status: "TODO",
        color: "#a855f7",
        owner: "maya",
        start: 10,
        due: 30,
      },
    ],
    labels: [
      ["customer-action", "#ef4444"],
      ["onsite", "#0ea5e9"],
      ["documentation", "#8b5cf6"],
    ],
    tasks: [
      { key: "kickoff", title: "Kick-off meeting with Nusantara IT", section: "Discovery", status: "DONE", start: -35, due: -35, assignee: "maya", milestone: true },
      {
        key: "inventory",
        title: "Inventory servers and agree backup scope",
        section: "Discovery",
        status: "DONE",
        start: -34,
        due: -28,
        assignee: "agus",
        epic: "Backup platform",
        subtasks: [
          { title: "Export VM list from vCenter", status: "DONE", assignee: "agus" },
          { title: "Confirm retention policy with customer (30 daily, 12 monthly)", status: "DONE", assignee: "maya" },
        ],
      },
      { key: "sizing", title: "Size the backup repository", section: "Discovery", status: "DONE", start: -27, due: -24, assignee: "agus", epic: "Backup platform", critical: true },
      {
        key: "install",
        title: "Install Veeam Backup & Replication server",
        section: "Build",
        status: "DONE",
        start: -21,
        due: -17,
        assignee: "agus",
        epic: "Backup platform",
        labels: ["onsite"],
        critical: true,
        slip: 2,
        comments: [["agus", -17, "Server racked and licensed. Repository is 48 TB usable after RAID."]],
      },
      {
        key: "jobs",
        title: "Configure backup jobs for production VMs",
        section: "Build",
        status: "IN_PROGRESS",
        priority: "HIGH",
        start: -14,
        due: 3,
        assignee: "agus",
        epic: "Backup platform",
        critical: true,
        slip: 4,
        description: "One job per application tier. Nightly incrementals, weekly synthetic full.",
        subtasks: [
          { title: "ERP cluster jobs", status: "DONE", assignee: "agus" },
          { title: "File server jobs", status: "IN_PROGRESS", assignee: "agus" },
          { title: "Mail server jobs", status: "TODO", assignee: "agus" },
        ],
        comments: [
          ["agus", -6, "ERP jobs green for 5 nights in a row. File server job fails on the scans share — path too long."],
          ["maya", -5, "Asked Nusantara IT to shorten the folder names on the scans share. They will do it this week."],
        ],
      },
      {
        key: "fwrule",
        title: "Customer to open firewall rule for the offsite link",
        section: "Build",
        status: "IN_PROGRESS",
        priority: "HIGH",
        start: -10,
        due: -3,
        assignee: "maya",
        epic: "Offsite replication",
        labels: ["customer-action"],
        comments: [["maya", -2, "Change request is with their network team. Chased again today; promised by Monday."]],
      },
      { key: "offsite", title: "Set up offsite copy to the Surabaya DC", section: "Migration", status: "TODO", start: 4, due: 14, assignee: "agus", epic: "Offsite replication", critical: true },
      { key: "restore", title: "Run the first full restore test", section: "Migration", status: "TODO", priority: "HIGH", start: 15, due: 18, assignee: "agus", epic: "Backup platform", critical: true },
      { key: "signoff", title: "Restore test sign-off", section: "Migration", status: "TODO", start: 19, due: 19, assignee: "maya", epic: "Backup platform", milestone: true, critical: true },
      { key: "runbook", title: "Write the operations runbook", section: "Handover", status: "TODO", start: 10, due: 25, assignee: "maya", epic: "Runbooks & handover", labels: ["documentation"] },
      { key: "training", title: "Train the Nusantara IT team", section: "Handover", status: "TODO", start: 28, due: 30, assignee: "maya", epic: "Runbooks & handover", labels: ["onsite"] },
      { key: "golive", title: "Go-live and handover", section: "Handover", status: "TODO", priority: "HIGH", start: 40, due: 40, assignee: "maya", milestone: true, critical: true },
    ],
    deps: [
      ["inventory", "sizing"],
      ["sizing", "install"],
      ["install", "jobs"],
      ["jobs", "offsite"],
      ["fwrule", "offsite"],
      ["offsite", "restore"],
      ["restore", "signoff"],
      ["signoff", "golive"],
      ["runbook", "training", "SOFT"],
      ["training", "golive"],
    ],
    risks: [
      {
        description: "Customer firewall change for the offsite link is late and blocks replication.",
        category: "EXTERNAL",
        probability: 4,
        impact: 3,
        status: "OPEN",
        mitigationPlan: "Chase the change request twice a week; escalate to their IT manager after Monday.",
        contingencyPlan: "Ship an encrypted USB seed copy to Surabaya and replicate increments only.",
      },
      {
        description: "Backup repository fills up faster than sized if file server growth continues.",
        category: "TECHNICAL",
        probability: 2,
        impact: 3,
        status: "OPEN",
        mitigationPlan: "Weekly capacity check; enable deduplication on the file server job.",
      },
    ],
    notes: [
      [-7, "Weekly call with Nusantara IT. ERP jobs running nightly. They are OK with the new restore test date."],
      [-4, "File server job still failing on long paths. Customer will rename folders; no impact on the go-live date yet."],
      [-2, "Firewall change for the offsite link not done. Chased Pak Andi by phone. Raised the risk to 4x3."],
      [0, "Reviewed the plan with Agus: offsite copy can start next week only if the firewall rule lands by Monday."],
    ],
  },
  {
    name: "Bank Arta — Azure Landing Zone",
    description:
      "Build an OJK-compliant Azure landing zone (hub-and-spoke network, identity controls, policy baseline) and move the first internal workload onto it.",
    customer: "Bank Arta Sejahtera",
    tam: "rizky",
    status: "ACTIVE",
    service: ["Cloud Migration", ["Azure"]],
    sections: [
      ["Design", "#60a5fa"],
      ["Build", "#34d399"],
      ["Security review", "#f43f5e"],
      ["Pilot", "#a78bfa"],
    ],
    epics: [
      { title: "Network foundation", status: "IN_PROGRESS", color: "#0ea5e9", owner: "agus", start: -30, due: 55 },
      { title: "Identity & access", status: "IN_PROGRESS", color: "#22c55e", owner: "rizky", start: -10, due: 15 },
      { title: "Governance & compliance", status: "IN_PROGRESS", color: "#eab308", owner: "rizky", start: -50, due: 40 },
    ],
    labels: [
      ["security", "#dc2626"],
      ["blocked", "#f97316"],
      ["documentation", "#8b5cf6"],
    ],
    tasks: [
      { key: "workshop", title: "Landing zone design workshop", section: "Design", status: "DONE", start: -50, due: -48, assignee: "rizky", epic: "Governance & compliance" },
      {
        key: "hld",
        title: "Write the high-level design document",
        section: "Design",
        status: "DONE",
        start: -47,
        due: -35,
        assignee: "rizky",
        epic: "Governance & compliance",
        labels: ["documentation"],
        comments: [["budi", -36, "Reviewed v0.9 — please add the data residency section before CAB."]],
      },
      { key: "cab", title: "Design approved by Bank Arta CAB", section: "Design", status: "DONE", start: -33, due: -33, assignee: "rizky", milestone: true },
      { key: "vnet", title: "Deploy hub-and-spoke virtual network", section: "Build", status: "DONE", start: -30, due: -20, assignee: "agus", epic: "Network foundation", critical: true },
      {
        key: "expressroute",
        title: "Provision ExpressRoute circuit to the Jakarta DC",
        section: "Build",
        status: "IN_PROGRESS",
        priority: "URGENT",
        start: -20,
        due: -5,
        assignee: "agus",
        epic: "Network foundation",
        labels: ["blocked"],
        critical: true,
        comments: [
          ["agus", -6, "Telco has not delivered the cross-connect. New ETA from the provider is next Thursday."],
          ["rizky", -1, "Escalated to the provider's account manager. Site-to-site VPN is up as a stopgap."],
        ],
      },
      {
        key: "conditional",
        title: "Configure Conditional Access policies",
        section: "Build",
        status: "IN_PROGRESS",
        start: -10,
        due: 5,
        assignee: "rizky",
        epic: "Identity & access",
        labels: ["security"],
        subtasks: [
          { title: "Require MFA for all admins", status: "DONE", assignee: "rizky" },
          { title: "Block legacy authentication", status: "IN_PROGRESS", assignee: "rizky" },
          { title: "Create break-glass accounts", status: "TODO", assignee: "rizky" },
        ],
      },
      { key: "pim", title: "Roll out Privileged Identity Management", section: "Build", status: "TODO", start: 6, due: 15, assignee: "rizky", epic: "Identity & access", labels: ["security"] },
      { key: "policy", title: "Apply the Azure Policy baseline (ISO 27001)", section: "Build", status: "IN_PROGRESS", start: -5, due: 10, assignee: "agus", epic: "Governance & compliance" },
      { key: "pentest", title: "Third-party penetration test", section: "Security review", status: "TODO", priority: "HIGH", start: 20, due: 30, assignee: "rizky", labels: ["security"] },
      { key: "ojk", title: "Prepare the OJK compliance evidence pack", section: "Security review", status: "TODO", start: 25, due: 40, assignee: "rizky", epic: "Governance & compliance", labels: ["documentation"] },
      { key: "pilot", title: "Migrate pilot workload: internal HR app", section: "Pilot", status: "TODO", start: 35, due: 55, assignee: "agus", epic: "Network foundation" },
      { key: "lz-live", title: "Landing zone go-live", section: "Pilot", status: "TODO", priority: "HIGH", start: 60, due: 60, assignee: "rizky", milestone: true, critical: true },
    ],
    deps: [
      ["workshop", "hld"],
      ["hld", "cab"],
      ["cab", "vnet"],
      ["vnet", "expressroute"],
      ["expressroute", "pilot"],
      ["conditional", "pim"],
      ["pim", "pentest", "SOFT"],
      ["policy", "pentest"],
      ["pentest", "ojk"],
      ["ojk", "lz-live"],
      ["pilot", "lz-live"],
    ],
    risks: [
      {
        description: "Telco delay on the ExpressRoute cross-connect pushes the pilot migration.",
        category: "EXTERNAL",
        probability: 4,
        impact: 4,
        status: "OPEN",
        mitigationPlan: "Run the pilot over the site-to-site VPN if the circuit is not live 2 weeks before the pilot starts.",
        contingencyPlan: "Move the go-live one sprint later; the CAB has agreed to this in principle.",
      },
      {
        description: "Only one engineer at the bank knows the legacy AD setup.",
        category: "ORGANIZATIONAL",
        probability: 3,
        impact: 3,
        status: "OPEN",
        mitigationPlan: "Record walkthrough sessions and document the AD trust design.",
      },
      {
        description: "Budget for the external penetration test not yet approved.",
        category: "FINANCIAL",
        probability: 2,
        impact: 3,
        status: "MITIGATED",
        mitigationPlan: "Approved by the bank's CISO on the last steering call; PO in progress.",
      },
    ],
    notes: [
      [-6, "ExpressRoute still not delivered. Agreed with the bank to bring up a site-to-site VPN as a stopgap."],
      [-3, "Conditional Access: MFA for admins enforced. Legacy auth block scheduled for the weekend change window."],
      [-1, "Provider escalation done. Steering committee informed that go-live may move by one sprint."],
    ],
  },
  {
    name: "Bank Arta — SIEM Onboarding",
    description:
      "Onboard the bank's firewalls and Active Directory into the Wazuh SIEM and hand detection use cases over to the SOC.",
    customer: "Bank Arta Sejahtera",
    tam: "rizky",
    status: "PLANNING",
    service: ["SIEM & SOC", ["Wazuh"]],
    sections: [
      ["Scoping", "#60a5fa"],
      ["Onboarding", "#34d399"],
    ],
    epics: [{ title: "Log sources", status: "TODO", color: "#14b8a6", owner: "rizky", start: 20, due: 55 }],
    tasks: [
      { key: "sources", title: "Collect the log source list", section: "Scoping", status: "TODO", start: 20, due: 27, assignee: "rizky", epic: "Log sources" },
      { key: "usecases", title: "Agree detection use cases with the SOC", section: "Scoping", status: "TODO", start: 28, due: 35, assignee: "rizky" },
      { key: "fwlogs", title: "Onboard firewall logs", section: "Onboarding", status: "TODO", start: 40, due: 50, assignee: "agus", epic: "Log sources" },
      { key: "adlogs", title: "Onboard Active Directory logs", section: "Onboarding", status: "TODO", start: 45, due: 55, assignee: "agus", epic: "Log sources" },
      { key: "tune", title: "Tune alert rules to cut false positives", section: "Onboarding", status: "TODO", start: 60, due: 80, assignee: "agus" },
      { key: "handover", title: "SOC handover", section: "Onboarding", status: "TODO", start: 90, due: 90, assignee: "rizky", milestone: true },
    ],
    deps: [
      ["sources", "usecases"],
      ["usecases", "fwlogs"],
      ["usecases", "adlogs"],
      ["fwlogs", "tune"],
      ["adlogs", "tune"],
      ["tune", "handover"],
    ],
  },
  {
    name: "Klinik Sehat — Microsoft 365 Migration",
    description:
      "Move 237 mailboxes from on-premises Exchange to Microsoft 365, move shared drives to SharePoint, and roll out Teams to every clinic.",
    customer: "Klinik Sehat Bersama",
    tam: "dewi",
    status: "ACTIVE",
    service: ["Microsoft 365", ["Microsoft 365 E3", "Intune"]],
    sections: [
      ["Preparation", "#60a5fa"],
      ["Migration waves", "#34d399"],
      ["Close-out", "#a78bfa"],
    ],
    epics: [
      { title: "Mailbox migration", status: "DONE", color: "#2563eb", owner: "dewi", start: -54, due: -20 },
      { title: "Teams & SharePoint", status: "IN_PROGRESS", color: "#7c3aed", owner: "dewi", start: -25, due: 2 },
    ],
    labels: [
      ["training", "#10b981"],
      ["customer-action", "#ef4444"],
    ],
    tasks: [
      { key: "tenant", title: "Set up the tenant and verify domains", section: "Preparation", status: "DONE", start: -60, due: -55, assignee: "agus" },
      { key: "pilotmb", title: "Migrate pilot mailboxes (IT team, 12 users)", section: "Preparation", status: "DONE", start: -54, due: -50, assignee: "agus", epic: "Mailbox migration" },
      { key: "wave1", title: "Wave 1: head office (85 mailboxes)", section: "Migration waves", status: "DONE", start: -45, due: -38, assignee: "agus", epic: "Mailbox migration" },
      {
        key: "wave2",
        title: "Wave 2: clinics (140 mailboxes)",
        section: "Migration waves",
        status: "DONE",
        start: -30,
        due: -20,
        assignee: "agus",
        epic: "Mailbox migration",
        subtasks: [
          { title: "Clinic Menteng", status: "DONE", assignee: "agus" },
          { title: "Clinic Kemang", status: "DONE", assignee: "agus" },
          { title: "Clinic Bekasi", status: "DONE", assignee: "agus" },
        ],
      },
      { key: "sharepoint", title: "Move shared drives to SharePoint", section: "Migration waves", status: "DONE", start: -25, due: -10, assignee: "dewi", epic: "Teams & SharePoint" },
      {
        key: "teams",
        title: "Teams rollout and training sessions",
        section: "Migration waves",
        status: "IN_PROGRESS",
        start: -7,
        due: 2,
        assignee: "dewi",
        epic: "Teams & SharePoint",
        labels: ["training"],
        comments: [["dewi", -1, "7 of 9 clinics trained. Bekasi and Depok sessions booked for next week."]],
      },
      { key: "decom", title: "Decommission the old Exchange server", section: "Close-out", status: "TODO", priority: "HIGH", start: 3, due: 5, assignee: "agus", critical: true },
      { key: "closeout", title: "Close-out report and sign-off", section: "Close-out", status: "TODO", start: 7, due: 7, assignee: "dewi", milestone: true, critical: true },
    ],
    deps: [
      ["tenant", "pilotmb"],
      ["pilotmb", "wave1"],
      ["wave1", "wave2"],
      ["wave2", "decom"],
      ["teams", "closeout"],
      ["decom", "closeout"],
    ],
    risks: [
      {
        description: "Clinic staff keep using WhatsApp groups instead of Teams.",
        category: "ORGANIZATIONAL",
        probability: 2,
        impact: 2,
        status: "MITIGATED",
        mitigationPlan: "Clinic managers named as Teams champions; short video guides sent to every clinic.",
      },
    ],
    notes: [
      [-5, "Wave 2 fully complete, no open tickets. Starting Teams training at the clinics this week."],
      [-1, "Training going well. Customer asked for an extra session for night-shift nurses — added to next week."],
    ],
  },
  {
    name: "Kopi Senja — Store Wi-Fi Refresh",
    description:
      "Replace consumer Wi-Fi routers in 6 stores with managed access points, split POS and guest traffic, and add a voucher-based guest portal.",
    customer: "Kopi Senja",
    tam: "maya",
    status: "ON_HOLD",
    service: ["Managed Network", ["Ubiquiti UniFi"]],
    sections: [
      ["Survey", "#60a5fa"],
      ["Rollout", "#34d399"],
    ],
    labels: [["blocked", "#f97316"]],
    tasks: [
      { key: "survey", title: "Site survey of all 6 stores", section: "Survey", status: "DONE", start: -20, due: -14, assignee: "agus" },
      {
        key: "order",
        title: "Order access points and switches",
        section: "Survey",
        status: "IN_PROGRESS",
        start: -12,
        due: -2,
        assignee: "maya",
        labels: ["blocked"],
        comments: [["maya", -3, "Distributor is out of stock until next month. Project on hold until the hardware ships."]],
      },
      { key: "stores13", title: "Install access points in stores 1–3", section: "Rollout", status: "TODO", start: 20, due: 27, assignee: "agus" },
      { key: "stores46", title: "Install access points in stores 4–6", section: "Rollout", status: "TODO", start: 28, due: 35, assignee: "agus" },
      { key: "portal", title: "Set up the guest portal with voucher login", section: "Rollout", status: "TODO", start: 36, due: 45, assignee: "agus" },
    ],
    deps: [
      ["survey", "order"],
      ["order", "stores13"],
      ["stores13", "stores46"],
      ["stores46", "portal"],
    ],
    risks: [
      {
        description: "Access point shipment delayed by the distributor.",
        category: "EXTERNAL",
        probability: 5,
        impact: 3,
        status: "OPEN",
        mitigationPlan: "Asked two other distributors for stock; customer approved a 10% price difference.",
      },
    ],
    notes: [[-3, "Put the project on hold: hardware out of stock. Customer informed and OK with the delay."]],
  },
  {
    name: "Nusantara — Firewall Upgrade FY25",
    description: "Replace end-of-life firewalls at head office and 3 depots with FortiGate appliances.",
    customer: "PT Nusantara Logistik",
    tam: "maya",
    status: "COMPLETED",
    service: ["Managed Firewall", ["FortiGate"]],
    sections: [["Delivery", "#34d399"]],
    tasks: [
      { key: "design", title: "Rule base review and design", section: "Delivery", status: "DONE", start: -150, due: -140, assignee: "agus" },
      { key: "ho", title: "Cut over the head office firewall", section: "Delivery", status: "DONE", start: -130, due: -128, assignee: "agus" },
      { key: "depots", title: "Cut over 3 depot firewalls", section: "Delivery", status: "DONE", start: -120, due: -105, assignee: "agus" },
      { key: "docs", title: "As-built documentation", section: "Delivery", status: "DONE", start: -104, due: -95, assignee: "maya" },
      { key: "done", title: "Customer acceptance", section: "Delivery", status: "DONE", start: -90, due: -90, assignee: "maya", milestone: true },
    ],
    deps: [
      ["design", "ho"],
      ["ho", "depots"],
      ["depots", "docs"],
      ["docs", "done"],
    ],
  },
];

const CUSTOMER_NOTES: Array<[string, UserKey, number, string, string]> = [
  ["PT Nusantara Logistik", "maya", -6, "Ransomware alert on the file server", "Antivirus flagged a suspicious macro on a shared folder. Isolated the laptop that wrote it; no encryption happened. Advised the customer to block macros from the internet via GPO."],
  ["Bank Arta Sejahtera", "rizky", -3, "Quarterly service review booked", "QSR set for the last Thursday of the month. Agenda: landing zone progress, SIEM scope, renewal of the support contract."],
  ["Klinik Sehat Bersama", "dewi", -2, "Licence true-up", "Customer hired 11 new nurses. Ordered 11 extra Microsoft 365 E3 licences; they appear on next month's invoice."],
  ["Kopi Senja", "maya", -1, "POS outage at store 2", "POS lost connection for 40 minutes after the ISP router rebooted. Not related to the Wi-Fi project. Opened a ticket with the ISP."],
];

// ------------------------------------------------------------------ run ---


// ------------------------------------------------------------- pipeline ---

interface DealSpec {
  title: string;
  customerName: string;
  /** Rupiah. */
  value: number;
  stage: PipelineStage;
  stageOrder: number;
  pic?: UserKey; // omitted = unassigned, claimable with "Assign PIC"
  requestDate: number; // day offset
  deadline?: number;
  winProbability: number;
  leadSource: string;
  productSolution: string;
  description: string;
  subStatus?: PipelineSubStatus;
  waitingInputSince?: number;
  statusTag?: PipelineStatusTag;
  outcome?: { result: PipelineOutcome; closedAt: number; reason?: PipelineOutcomeReason; reasonText?: string; project?: string };
  /** Day offset, author, note; `mention` tags a user in the note. */
  notes: Array<{ day: number; by: UserKey; note: string; mention?: UserKey }>;
  links?: Array<[string, string]>;
}

const DEALS: DealSpec[] = [
  {
    title: "Kopi Senja — Store Wi-Fi refresh (6 stores)",
    customerName: "Kopi Senja",
    value: 180_000_000,
    stage: "ASSESSMENT",
    stageOrder: 0,
    pic: "sari",
    requestDate: -5,
    deadline: 40,
    winProbability: 40,
    leadSource: "Existing customer",
    productSolution: "Ubiquiti UniFi access points, cloud gateway, guest portal",
    description: "Replace consumer routers in six stores with managed UniFi; POS on its own VLAN, captive portal for guests.",
    subStatus: "PROGRESS",
    notes: [
      { day: -5, by: "andi", note: "Store manager asked for a quote after the Bandung outage. Six sites, ~40 devices each." },
      { day: -2, by: "sari", note: "Site survey booked for the flagship store next Tuesday." },
    ],
  },
  {
    title: "Sekolah Harapan — Lab Wi-Fi and firewall",
    customerName: "Sekolah Harapan",
    value: 95_000_000,
    stage: "ASSESSMENT",
    stageOrder: 1,
    requestDate: -1,
    winProbability: 30,
    leadSource: "Inbound (website)",
    productSolution: "FortiGate 60F, 12 access points",
    description: "Two computer labs and the teachers' room. Budget not confirmed; waiting for a PIC.",
    notes: [{ day: -1, by: "andi", note: "Inbound form. Principal wants content filtering for students." }],
  },
  {
    title: "PT Nusantara Logistik — Warehouse CCTV & access control",
    customerName: "PT Nusantara Logistik",
    value: 650_000_000,
    stage: "TECHNICAL_CLARIFICATION",
    stageOrder: 0,
    pic: "sari",
    requestDate: -18,
    deadline: 25,
    winProbability: 55,
    leadSource: "Existing customer",
    productSolution: "Hikvision IP cameras, NVR, HID door controllers",
    description: "Surabaya warehouse: 48 cameras, 12 doors, integration with the existing badge system.",
    subStatus: "WAITING_SALES_INPUT",
    waitingInputSince: -3,
    notes: [
      { day: -12, by: "sari", note: "Walked the warehouse with the ops manager; camera count confirmed at 48." },
      { day: -3, by: "sari", note: "Need the badge system vendor and model before I can size the controllers.", mention: "andi" },
    ],
    links: [["Site photos", "https://example.com/nusantara/warehouse-photos"]],
  },
  {
    title: "Bank Arta — Endpoint detection & response (1,200 seats)",
    customerName: "Bank Arta Sejahtera",
    value: 1_850_000_000,
    stage: "POC",
    stageOrder: 0,
    pic: "sari",
    requestDate: -40,
    deadline: 20,
    winProbability: 60,
    leadSource: "Account plan",
    productSolution: "CrowdStrike Falcon, 3-year subscription",
    description: "Proof of concept on 50 endpoints in the Jakarta HQ; bank security team compares against the incumbent.",
    statusTag: "DELAYED",
    notes: [
      { day: -30, by: "sari", note: "PoC scope agreed: 50 endpoints, 3 weeks, success criteria signed by the CISO office." },
      { day: -6, by: "sari", note: "PoC start slipped two weeks — the bank's change board meets monthly." },
    ],
    links: [["PoC success criteria", "https://example.com/bank-arta/edr-poc-criteria"]],
  },
  {
    title: "Klinik Sehat — Patient portal hosting",
    customerName: "Klinik Sehat Bersama",
    value: 420_000_000,
    stage: "RFP",
    stageOrder: 0,
    pic: "sari",
    requestDate: -25,
    deadline: 12,
    winProbability: 50,
    leadSource: "Tender",
    productSolution: "Azure App Service, Azure SQL, WAF; managed service 24 months",
    description: "Formal RFP for hosting the new patient portal, with data residency in Indonesia.",
    notes: [
      { day: -20, by: "andi", note: "RFP received. Submission deadline is firm." },
      { day: -8, by: "sari", note: "Clarification questions sent on data residency and backup RPO." },
    ],
    links: [["RFP document", "https://example.com/klinik-sehat/rfp-portal-hosting.pdf"]],
  },
  {
    title: "Universitas Mandiri — Campus core switch replacement",
    customerName: "Universitas Mandiri",
    value: 2_300_000_000,
    stage: "DELIVER_PROPOSAL",
    stageOrder: 0,
    pic: "sari",
    requestDate: -55,
    deadline: 7,
    winProbability: 65,
    leadSource: "Partner referral",
    productSolution: "Cisco Catalyst 9500 core pair, 24 distribution switches, 3-year SmartNet",
    description: "End-of-life core; proposal covers hardware, migration weekend and a year of managed network.",
    notes: [
      { day: -40, by: "sari", note: "BoM validated with the distributor; lead time 8 weeks." },
      { day: -4, by: "sari", note: "Proposal draft with the pricing team; presenting to the IT director on Thursday." },
    ],
  },
  {
    title: "Hotel Laguna Bali — Guest Wi-Fi managed service",
    customerName: "Hotel Laguna Bali",
    value: 540_000_000,
    stage: "WAITING_RESPONSE",
    stageOrder: 0,
    pic: "sari",
    requestDate: -70,
    deadline: 30,
    winProbability: 45,
    leadSource: "Event",
    productSolution: "Aruba Instant On, managed service 36 months",
    description: "Proposal delivered; the hotel group has paused procurement until the new GM starts.",
    statusTag: "HOLD",
    notes: [
      { day: -35, by: "sari", note: "Proposal delivered and presented to the owner's representative." },
      { day: -14, by: "andi", note: "Procurement on hold until the new GM joins next month. Keep warm." },
    ],
  },
  {
    title: "Bank Arta — Azure Landing Zone",
    customerName: "Bank Arta Sejahtera",
    value: 1_200_000_000,
    stage: "WAITING_RESPONSE",
    stageOrder: 1,
    pic: "sari",
    requestDate: -130,
    deadline: -65,
    winProbability: 100,
    leadSource: "Account plan",
    productSolution: "Azure landing zone build, ExpressRoute, governance baseline",
    description: "Won. Handed off to delivery as the Azure Landing Zone project.",
    outcome: { result: "WON", closedAt: -60, project: "Bank Arta — Azure Landing Zone" },
    notes: [
      { day: -75, by: "sari", note: "Final pricing accepted by the bank's procurement." },
      { day: -60, by: "sari", note: "PO received. Handing off to Rizky's delivery team." },
    ],
  },
  {
    title: "Toko Makmur — Retail POS network (14 stores)",
    customerName: "Toko Makmur",
    value: 310_000_000,
    stage: "DELIVER_PROPOSAL",
    stageOrder: 1,
    pic: "sari",
    requestDate: -90,
    deadline: -30,
    winProbability: 0,
    leadSource: "Cold outreach",
    productSolution: "MikroTik routers, TP-Link Omada access points",
    description: "Lost on price to a local integrator.",
    outcome: { result: "LOST", closedAt: -20, reason: "PRICE", reasonText: "Local integrator quoted 35% lower with consumer-grade hardware." },
    notes: [{ day: -20, by: "andi", note: "Customer went with the cheaper quote. Door open for the next refresh." }],
  },
];

async function wipe() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const toTruncate = tables.map((t) => t.tablename).filter((t) => !KEEP_TABLES.has(t));
  // The singletons reference users, so TRUNCATE ... CASCADE empties them
  // too (Postgres cascades by constraint, not by data). Snapshot them and
  // write them back without the now-dangling updatedById. The snapshot,
  // TRUNCATE and restore share one transaction so a crash part-way rolls
  // everything back instead of losing the sign-in settings or the sealed
  // iTop token.
  await prisma.$transaction(
    async (tx) => {
      const authConfig = await tx.authConfig.findMany();
      const itopConfig = await tx.itopConfig.findMany();
      await tx.$executeRawUnsafe(
        `TRUNCATE TABLE ${toTruncate.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
      );
      await tx.authConfig.createMany({ data: authConfig.map((r) => ({ ...r, updatedById: null })) });
      await tx.itopConfig.createMany({ data: itopConfig.map((r) => ({ ...r, updatedById: null })) });
    },
    { timeout: 60_000 },
  );
  console.log(`Wiped ${toTruncate.length} tables (auth and iTop settings kept).`);
}

async function main() {
  if (process.env.DEMO_SEED_CONFIRM !== "wipe") {
    throw new Error("Refusing to wipe the database: set DEMO_SEED_CONFIRM=wipe to confirm.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run with NODE_ENV=production.");
  }

  const roles = new Map((await prisma.role.findMany()).map((r) => [r.roleName, r.id]));
  for (const name of ["ADMIN", "TAM", "STAKEHOLDER", "SA", "SALES"]) {
    if (!roles.has(name)) throw new Error(`Role ${name} missing — run \`npm run db:seed\` first.`);
  }

  await wipe();

  // Users. The e2e smoke pre-flight logs in as the QA fixture admin, so it
  // is recreated alongside the demo accounts.
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = {} as Record<UserKey, number>;
  for (const [key, u] of Object.entries(USERS) as Array<[UserKey, (typeof USERS)[UserKey]]>) {
    const row = await prisma.user.create({
      data: { username: u.username, email: u.email, passwordHash: hash, roleId: roles.get(u.role)! },
    });
    users[key] = row.id;
  }
  await prisma.user.create({
    data: {
      username: "qa",
      email: "qa@solvro.test",
      passwordHash: await bcrypt.hash("QaTest1234!", 10),
      roleId: roles.get("ADMIN")!,
    },
  });

  // Service catalogue and customers.
  const services = new Map<string, number>();
  for (const [name, description] of SERVICES) {
    services.set(name, (await prisma.service.create({ data: { name, description } })).id);
  }
  const customers = new Map<string, number>();
  for (const c of CUSTOMERS) {
    const row = await prisma.customer.create({
      data: {
        name: c.name,
        accountManager: c.accountManager,
        solutionArchitect: c.solutionArchitect,
        description: c.description,
        tamId: users[c.tam],
        services: {
          create: c.services.map(([name, tools]) => ({ serviceId: services.get(name)!, tools })),
        },
      },
    });
    customers.set(c.name, row.id);
  }

  // Projects with their sections, epics, labels, tasks, and dependencies.
  const projects = new Map<string, number>();
  let taskCount = 0;
  for (const p of PROJECTS) {
    const project = await prisma.project.create({
      data: {
        name: p.name,
        description: p.description,
        status: p.status,
        tamId: users[p.tam],
        saId: p.sa ? users[p.sa] : null,
        customerId: customers.get(p.customer)!,
        baselineLockedAt: p.baselineLocked !== undefined ? day(p.baselineLocked) : null,
        baselineLockedById: p.baselineLocked !== undefined ? users[p.tam] : null,
        services: { create: { serviceId: services.get(p.service[0])!, tools: p.service[1] } },
      },
    });
    projects.set(p.name, project.id);

    const sections = new Map<string, number>();
    for (const [i, [name, color]] of p.sections.entries()) {
      sections.set(name, (await prisma.section.create({ data: { projectId: project.id, name, color, position: i } })).id);
    }
    const epics = new Map<string, number>();
    for (const [i, e] of (p.epics ?? []).entries()) {
      const row = await prisma.epic.create({
        data: {
          projectId: project.id,
          title: e.title,
          description: e.description,
          status: e.status,
          color: e.color,
          ownerId: e.owner ? users[e.owner] : null,
          startDate: e.start !== undefined ? day(e.start) : null,
          dueDate: e.due !== undefined ? day(e.due) : null,
          position: i,
        },
      });
      epics.set(e.title, row.id);
    }
    const labels = new Map<string, number>();
    for (const [name, color] of p.labels ?? []) {
      labels.set(name, (await prisma.label.create({ data: { projectId: project.id, name, color } })).id);
    }

    const taskIds = new Map<string, number>();
    for (const [i, t] of p.tasks.entries()) {
      const startDate = t.start !== undefined ? day(t.start) : null;
      const dueDate = t.due !== undefined ? day(t.due) : null;
      const hasBaseline = p.baselineLocked !== undefined;
      const slip = t.slip ?? 0;
      const task = await prisma.task.create({
        data: {
          projectId: project.id,
          sectionId: sections.get(t.section)!,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority ?? "MEDIUM",
          startDate,
          dueDate,
          isMilestone: t.milestone ?? false,
          isCriticalPath: t.critical ?? false,
          baselineStartDate: hasBaseline && t.start !== undefined ? day(t.start - slip) : null,
          baselineDueDate: hasBaseline && t.due !== undefined ? day(t.due - slip) : null,
          assignedToId: t.assignee ? users[t.assignee] : null,
          epicId: t.epic ? epics.get(t.epic)! : null,
          position: i,
          labels: { connect: (t.labels ?? []).map((name) => ({ id: labels.get(name)! })) },
        },
      });
      taskIds.set(t.key, task.id);
      taskCount++;

      // Subtasks: never carry an epic (they inherit the parent's for display).
      for (const [j, s] of (t.subtasks ?? []).entries()) {
        await prisma.task.create({
          data: {
            projectId: project.id,
            sectionId: sections.get(t.section)!,
            parentTaskId: task.id,
            title: s.title,
            status: s.status,
            startDate: s.start !== undefined ? day(s.start) : null,
            dueDate: s.due !== undefined ? day(s.due) : null,
            assignedToId: s.assignee ? users[s.assignee] : null,
            position: j,
          },
        });
        taskCount++;
      }
      for (const [author, offset, body] of t.comments ?? []) {
        await prisma.comment.create({
          data: { taskId: task.id, authorId: users[author], body, createdAt: new Date(day(offset).getTime() + 10 * 3_600_000) },
        });
      }
    }

    for (const [from, to, type] of p.deps ?? []) {
      await prisma.taskDependency.create({
        data: {
          projectId: project.id,
          predecessorTaskId: taskIds.get(from)!,
          successorTaskId: taskIds.get(to)!,
          type: type ?? "HARD",
        },
      });
    }
    for (const r of p.risks ?? []) {
      await prisma.risk.create({ data: { ...r, projectId: project.id } });
    }
    for (const [offset, body] of p.notes ?? []) {
      await prisma.projectNote.create({
        data: {
          projectId: project.id,
          authorId: users[p.tam],
          body,
          noteDate: day(offset),
          createdAt: new Date(day(offset).getTime() + 9 * 3_600_000),
        },
      });
    }

    // Members, with their "added" events.
    for (const m of p.members ?? []) {
      await prisma.projectMember.create({ data: { projectId: project.id, userId: users[m], addedById: users[p.tam] } });
      await prisma.activityEvent.create({
        data: {
          projectId: project.id,
          actorId: users[p.tam],
          entityType: "member",
          entityId: users[m],
          action: "added",
          entityLabel: USERS[m].username,
          createdAt: at(-14, 10),
        },
      });
    }

    // Activity log derived from the task data: the TAM created each top-level
    // task on its start day (assigned ones notify the assignee), the assignee
    // moved it to "In progress" on that day and to "Done" on its due day.
    for (const t of p.tasks) {
      const taskId = taskIds.get(t.key)!;
      const start = t.start ?? -30;
      const assignee = t.assignee ? { id: users[t.assignee], username: USERS[t.assignee].username } : null;
      const created = await prisma.activityEvent.create({
        data: {
          projectId: project.id,
          actorId: users[p.tam],
          entityType: "task",
          entityId: taskId,
          action: "created",
          entityLabel: t.title,
          changes: assignee ? { assignee: { from: null, to: assignee } } : {},
          createdAt: at(Math.min(start, -1), 9),
        },
      });
      if (assignee && t.assignee !== p.tam) {
        await prisma.notification.create({
          data: {
            userId: assignee.id,
            activityEventId: created.id,
            reason: "assigned",
            readAt: start < -7 ? at(start, 12) : null,
            createdAt: at(Math.min(start, -1), 9),
          },
        });
      }
      if (t.status !== "TODO") {
        await prisma.activityEvent.create({
          data: {
            projectId: project.id,
            actorId: assignee?.id ?? users[p.tam],
            entityType: "task",
            entityId: taskId,
            action: "updated",
            entityLabel: t.title,
            changes: { status: { from: "TODO", to: "IN_PROGRESS" } },
            createdAt: at(Math.min(start, 0), 10),
          },
        });
      }
      if (t.status === "DONE") {
        await prisma.activityEvent.create({
          data: {
            projectId: project.id,
            actorId: assignee?.id ?? users[p.tam],
            entityType: "task",
            entityId: taskId,
            action: "updated",
            entityLabel: t.title,
            changes: { status: { from: "IN_PROGRESS", to: "DONE" } },
            createdAt: at(Math.min(t.due ?? start, 0), 16),
          },
        });
      }
    }
  }

  // Operations notes (issues outside any project).
  for (const [customer, author, offset, title, body] of CUSTOMER_NOTES) {
    await prisma.customerNote.create({
      data: { customerId: customers.get(customer)!, authorId: users[author], noteDate: day(offset), title, body },
    });
  }

  // Weekly updates: last week DONE for every customer, this week DRAFT for two.
  const lastWeek = mondayOffset(1);
  for (const c of CUSTOMERS) {
    await prisma.weeklyUpdate.create({
      data: {
        customerId: customers.get(c.name)!,
        authorId: users[c.tam],
        weekStart: day(lastWeek),
        category: "Project delivery",
        health: c.name === "Kopi Senja" || c.name === "Bank Arta Sejahtera" ? "AMBER" : "GREEN",
        status: "DONE",
        doneAt: day(lastWeek + 4),
        midweekSavedAt: day(lastWeek + 2),
        highlights: {
          create: [
            {
              position: 0,
              title: `Progress update for ${c.name}`,
              detail: "Work on plan for the week; no new blockers raised by the customer.",
              risk: c.name === "Kopi Senja" ? "Hardware shortage at the distributor." : null,
              action: c.name === "Kopi Senja" ? "Ask two other distributors for stock." : null,
            },
          ],
        },
        achievements: {
          create: [
            {
              position: 0,
              title: "Weekly status call held",
              detail: "Customer confirmed priorities for the coming week.",
              lessonLearned: "Send the agenda a day early — the customer came better prepared.",
              nextWeekFocus: "Close the open customer actions before the next call.",
            },
          ],
        },
      },
    });
  }
  const thisWeek = mondayOffset(0);
  await prisma.weeklyUpdate.create({
    data: {
      customerId: customers.get("PT Nusantara Logistik")!,
      authorId: users.maya,
      weekStart: day(thisWeek),
      category: "Project delivery",
      health: "AMBER",
      status: "DRAFT",
      midweekSavedAt: day(Math.min(thisWeek + 2, 0)),
      highlights: {
        create: [
          {
            position: 0,
            title: "ERP backups stable",
            detail: "ERP cluster backed up nightly with no failures for 5 nights.",
          },
          {
            position: 1,
            title: "Offsite link blocked by the customer",
            detail: "Firewall change request still open on the customer side.",
            risk: "Offsite copy and restore test slip if the rule is not in place by Monday.",
            action: "Escalate to the customer's IT manager on Monday morning.",
          },
        ],
      },
    },
  });
  await prisma.weeklyUpdate.create({
    data: {
      customerId: customers.get("Bank Arta Sejahtera")!,
      authorId: users.rizky,
      weekStart: day(thisWeek),
      category: "Project delivery",
      health: "RED",
      status: "DRAFT",
      midweekSavedAt: day(Math.min(thisWeek + 2, 0)),
      highlights: {
        create: [
          {
            position: 0,
            title: "ExpressRoute circuit late",
            detail: "Provider missed the second delivery date.",
            risk: "Pilot migration and go-live move by one sprint.",
            action: "Provider escalation; VPN stopgap in place.",
          },
        ],
      },
    },
  });

  // Pipeline deals — the SA owns them; Sales adds notes.
  for (const d of DEALS) {
    const lastNote = d.notes.reduce((m, n) => Math.max(m, n.day), -365);
    const closed = d.outcome;
    const deal = await prisma.opportunity.create({
      data: {
        title: d.title,
        customerName: d.customerName,
        dealValue: BigInt(d.value),
        stage: d.stage,
        stageOrder: d.stageOrder,
        picId: d.pic ? users[d.pic] : null,
        requestDate: day(d.requestDate),
        deadline: d.deadline !== undefined ? day(d.deadline) : null,
        winProbability: d.winProbability,
        leadSource: d.leadSource,
        productSolution: d.productSolution,
        description: d.description,
        subStatus: d.subStatus ?? null,
        waitingInputSince: d.waitingInputSince !== undefined ? day(d.waitingInputSince) : null,
        statusTag: d.statusTag ?? null,
        outcome: closed?.result ?? null,
        outcomeReasonCategory: closed?.reason ?? null,
        outcomeReason: closed?.reasonText ?? null,
        closedAt: closed ? day(closed.closedAt) : null,
        wonAt: closed?.result === "WON" ? day(closed.closedAt) : null,
        projectId: closed?.project ? projects.get(closed.project)! : null,
        lastActivityAt: day(lastNote),
        createdAt: day(d.requestDate),
        activities: {
          create: d.notes.map((n) => ({
            userId: users[n.by],
            note: n.note,
            mentionedUserIds: n.mention ? [users[n.mention]] : [],
            createdAt: day(n.day),
          })),
        },
        links: { create: (d.links ?? []).map(([label, url]) => ({ label, url })) },
      },
    });
    const dealActor = d.pic ? users[d.pic] : users.andi;
    const pic = d.pic ? { id: users[d.pic], username: USERS[d.pic].username } : null;
    await prisma.activityEvent.create({
      data: {
        opportunityId: deal.id,
        actorId: dealActor,
        entityType: "opportunity",
        action: "created",
        entityLabel: d.title,
        changes: { stage: "ASSESSMENT", dealValue: d.value, ...(pic ? { pic } : {}) },
        createdAt: at(Math.min(d.requestDate, -1), 9),
      },
    });
    if (d.stage !== "ASSESSMENT") {
      await prisma.activityEvent.create({
        data: {
          opportunityId: deal.id,
          actorId: dealActor,
          entityType: "opportunity",
          action: "moved",
          entityLabel: d.title,
          changes: { stage: { from: "ASSESSMENT", to: d.stage } },
          createdAt: at(Math.min(d.requestDate + 7, lastNote), 11),
        },
      });
    }
    for (const n of d.notes) {
      const noteEvent = await prisma.activityEvent.create({
        data: {
          opportunityId: deal.id,
          actorId: users[n.by],
          entityType: "opportunity_note",
          action: "created",
          entityLabel: d.title,
          createdAt: at(n.day, 14),
        },
      });
      if (n.mention) {
        await prisma.notification.create({
          data: { userId: users[n.mention], activityEventId: noteEvent.id, reason: "mentioned", createdAt: at(n.day, 14) },
        });
      }
    }
    if (closed) {
      await prisma.activityEvent.create({
        data: {
          opportunityId: deal.id,
          actorId: dealActor,
          entityType: "opportunity",
          action: "closed",
          entityLabel: d.title,
          changes: { outcome: closed.result, ...(closed.reason ? { reasonCategory: closed.reason } : {}) },
          createdAt: at(closed.closedAt, 15),
        },
      });
      if (closed.project) {
        await prisma.activityEvent.create({
          data: {
            opportunityId: deal.id,
            actorId: dealActor,
            entityType: "opportunity",
            action: "handed_off",
            entityLabel: d.title,
            changes: { project: { id: projects.get(closed.project)!, name: closed.project } },
            createdAt: at(closed.closedAt, 16),
          },
        });
      }
    }
  }

  // "Reviewed today" marks on the Daily Review.
  const [yesterday] = recentWeekdays(2);
  await prisma.projectReview.createMany({
    data: [
      { projectId: projects.get("Nusantara — Veeam Backup Rollout")!, userId: users.maya, reviewDate: day(0) },
      { projectId: projects.get("Bank Arta — Azure Landing Zone")!, userId: users.rizky, reviewDate: day(yesterday) },
    ],
  });

  console.log(
    `Demo data loaded: ${Object.keys(USERS).length + 1} users, ${CUSTOMERS.length} customers, ${PROJECTS.length} projects, ${taskCount} tasks, ${DEALS.length} pipeline deals.`,
  );
  console.log(`Log in as admin@demo.solvro.local (or any *@demo.solvro.local demo user) with password "${DEMO_PASSWORD}".`);
  console.log("Pipeline: sari.wijaya@demo.solvro.local is the SA (PIC of every assigned deal), andi.kurniawan@demo.solvro.local is Sales.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
