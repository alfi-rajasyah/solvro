// Static content for the in-app "How to use Solvro" page (pages/Help.tsx):
// task-oriented Guides on top, the per-page Reference below
// (docs/archive/plans/feedback-round-lifecycle-spec.md, F6). Pure module, no
// React import, so the filter below stays unit-testable in the node-env
// Vitest config (same pattern as navCommands.ts). Keep every UI string quoted
// here identical to the label in the code it describes — when a feature's
// label changes, update its entry in the same change.
//
// Deliberately absent: the /tasks page (hidden from the sidebar by design),
// note visibility (no UI control), backend-only operations, and the customer
// page's placeholder tabs (Topology, Organization Structure, Documents).

export interface HelpEntry {
  title: string;
  /** Rendered as a bullet list. */
  points: string[];
}

export interface HelpShortcut {
  keys: string[];
  action: string;
}

export interface HelpTopic {
  /** Anchor id — /help#<id> deep-links to the topic. */
  id: string;
  title: string;
  icon: string;
  summary: string;
  /** Page the topic describes; rendered as an "Open …" link. */
  route?: string;
  /** Permission required to see the topic; "*" restricts to admin wildcard. */
  requires?: string;
  entries: HelpEntry[];
  shortcuts?: HelpShortcut[];
}

/** One walkthrough step inside a guide. */
export interface HelpGuideStep {
  title: string;
  /** Rendered as a bullet list. */
  points: string[];
}

export interface HelpGuideLink {
  label: string;
  /** In-app path; must be a route in App.tsx. */
  to: string;
}

/** A task-oriented walkthrough ("how do I …"). */
export interface HelpGuide {
  /** Anchor id — /help#<id> deep-links to the guide. Unique across guides and topics. */
  id: string;
  title: string;
  icon: string;
  summary: string;
  /** Permission required to see the guide; "*" restricts to admin wildcard. */
  requires?: string;
  steps: HelpGuideStep[];
  /** Reference-topic ids, rendered as "Read more" links to the topic. */
  related: string[];
  /** Pages the guide works in, rendered as "Open …" links. */
  links?: HelpGuideLink[];
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "getting-started",
    title: "Getting started",
    icon: "explore",
    summary:
      "Solvro is the workspace for TAMs and SAs: delivery (projects, tasks, daily notes, weekly customer updates) and the sales Pipeline in one place.",
    entries: [
      {
        title: "Sign in",
        points: [
          "Use your work Google account. Password sign-in sits under \"Admin sign-in (password)\".",
          "A first Google sign-in creates your account with the PENDING role, which has no access. An admin assigns your real role in Admin › Users.",
          "If you see \"This account has been deactivated\", ask an admin to reactivate it.",
        ],
      },
      {
        title: "Find your way around",
        points: [
          "The left sidebar lists every page you have access to, in groups: Workspace (Overview, Projects, Customers), Cadence (Daily Review, Weekly Sync), Sales (Pipeline), Insights (Utilization, Executive), and System (Settings, Admin). Groups with no page for you are hidden. Collapse it with the menu button at its top; on a phone, open it with the menu button in the top bar.",
          "Press ⌘K (Ctrl+K on Windows/Linux) or use search in the top bar (the search icon on a phone) to jump to a page, project, task, or customer, or to run an action such as \"New project\", \"New customer\", or \"Add task\" (on a project page). Type at least 2 characters to search; actions appear without typing.",
          "On a project page, the top bar reads \"Projects / <project name>\" with the project's status. Click \"Projects\" to go back to the list.",
          "Your avatar menu (top right) holds Settings and \"Sign out\".",
        ],
      },
      {
        title: "Notifications",
        points: [
          "The bell labelled \"Notifications\" in the top bar lists what happened on your projects and deals: assignments, comments, mentions, role changes, and handovers. Click one to open the project or deal it is about.",
          "\"All tasks in <project> are closed — mark the project Completed?\" reaches the project's TAM and every project member, including the person who closed the last task if they are the TAM or a member. It appears once an Active project has no open task left. Solvro never completes the project for you: open the project, choose \"Edit project\", and set Status to Completed.",
        ],
      },
      {
        title: "Appearance and install",
        points: [
          "Switch between light and dark with the sun/moon button in the top bar, or pick Light, Dark, or System in Settings.",
          "Solvro installs as an app. On Chrome or Android, use \"Install Solvro\" in the banner; on iPhone, use \"Add to Home Screen\" from Safari's share menu.",
        ],
      },
      {
        title: "Who can do what",
        points: [
          "Your role decides what you can change. \"Manage projects\" lets you create and edit projects, customers, sections, risks, notes, and weekly updates. \"Manage tasks\" lets you create, edit, move, and delete tasks.",
          "Pipeline access is a separate set of permissions: \"View pipeline\", \"Create opportunities\", \"Edit own opportunities\", \"Edit all opportunities\", \"Delete own opportunities\", and \"Delete all opportunities\".",
          "Without a permission, the matching buttons and pages do not appear. Ask an admin if you need more access.",
          "You see projects where you are the TAM or the Solution Architect, plus every project of a customer you own. Roles with \"See all projects\" see every project.",
          "By default: ADMIN has full access; TAM manages projects and tasks; SA views projects and works the Pipeline (creating opportunities, and editing and deleting only the ones they are the PIC for); SALES views the Pipeline and adds notes; STAKEHOLDER views the projects it is attached to, read-only; PENDING has no access until an admin assigns a role.",
          "Admins can change what each role may do in Admin › Roles. Only the PENDING role is reserved.",
        ],
      },
    ],
  },
  {
    id: "overview",
    title: "Overview",
    icon: "dashboard",
    route: "/overview",
    requires: "project:read",
    summary: "Your landing page: a snapshot of every project you can see.",
    entries: [
      {
        title: "What it shows",
        points: [
          "Three tiles: Overdue and Due this week open the matching Tasks view; Open risks opens the Daily Review.",
          "\"Projects needing attention\": up to 6 projects, overdue ones first, with overdue-task and open-risk counts. \"View all →\" opens the Projects page.",
          "\"Portfolio timeline\": a year calendar of your projects. Use the arrows to change the year.",
          "\"Recent notes\": project and operations notes from the last 7 days. Add notes on the Daily Review page.",
          "If you have Pipeline access, a \"Pipeline\" panel shows Pipeline Value, Active Deals, Won This Month, and On Hold, plus a bar of deals per stage. \"View pipeline →\" opens the board.",
          "Projects marked \"Administrative project\" are left out of the counters, the timeline, and the attention list.",
          "Tasks in projects whose Status is On hold or Cancelled never count as Overdue or Due this week. When on-hold tasks are left out, the Overdue tile says \"<n> in on-hold projects not counted\". They count again when the project is reactivated.",
        ],
      },
    ],
  },
  {
    id: "projects",
    title: "Projects",
    icon: "folder_managed",
    route: "/projects",
    requires: "project:read",
    summary: "Create projects, open one to plan and track it, and lock a baseline to measure slip.",
    entries: [
      {
        title: "Create or edit a project",
        points: [
          "Click \"New project\" on the Projects page. Name and Customer are required — create the customer first on the Customers page.",
          "Optionally pick a Solution Architect and a Technical Account Manager, and set the Status. The Technical Account Manager is the project's TAM and owner; a Solution Architect sees the project but is not an owner.",
          "Set a WIP limit per Kanban column if you want the board to warn when a column is too full. Leave a field empty for no limit.",
          "Tick \"Administrative project\" for internal work that should stay out of the Overview, Executive, and overdue roll-ups.",
          "Inside a project, use \"Edit project\" or \"Delete project\" at the top. Delete removes all of the project's tasks, sections, labels, notes, risks, and reviews, and cannot be undone.",
          "Filter the Projects page by customer with the \"Customer is …\" chip, or from a customer card's \"View projects →\".",
        ],
      },
      {
        title: "Filter by status",
        points: [
          "On the Projects page, add the \"Status\" filter beside \"Customer\" and pick one or more statuses (\"Status is any of\" Planning, Active, On hold, Completed, Cancelled). It combines with the Customer filter.",
          "The filter lives in the page address (?status=…), so a filtered list can be bookmarked or shared.",
          "When nothing matches, the page offers \"Clear filters\".",
        ],
      },
      {
        title: "Cancel a project",
        points: [
          "In \"Edit project\", set Status to Cancelled and save. If the project has open tasks, the dialog \"Cancel project and its open tasks?\" tells you how many open tasks will be marked Cancelled and how many completed tasks stay as they are.",
          "Confirm with \"Cancel project\", or back out with \"Keep project\". A project with no open tasks is cancelled without the dialog.",
          "Reactivating the project later does not reopen the cancelled tasks.",
        ],
      },
      {
        title: "Put a project on hold and bring it back",
        points: [
          "Set Status to On hold in \"Edit project\". Its tasks stop counting as overdue or due this week, on Overview and in task views, for as long as it stays on hold. The project's \"Needs attention\" panel still lists them, each marked \"On hold\" in place of its due date.",
          "When you move an on-hold project back to Active or Planning and some open tasks are now past due, the dialog \"Update the timeline?\" says how long the project was on hold. Set \"Days to shift open dates\" (it starts at the days on hold) and choose \"Shift open dates by N days\" to move the start and due dates of every open task and open epic. Completed and cancelled tasks and the baseline are left alone.",
          "Choose \"I'll update the timeline myself\" to save the status and open the Gantt (the List on a phone) to adjust dates by hand. \"Cancel\" leaves the project on hold.",
        ],
      },
      {
        title: "Project tabs",
        points: [
          "Overview: counters, the Progress S-Curve, tasks that need attention, status breakdown, top risks, and recent notes.",
          "List, Kanban, Gantt, and Timeline: four views of the same tasks — see \"Project views\".",
          "Epics: group top-level tasks into larger deliverables and track done/total progress. Open one to edit its status, owner, dates, description, and stories.",
          "Risks: the risk register. Services: the services and tools in scope.",
        ],
      },
      {
        title: "Context panel and baseline",
        points: [
          "Click \"Context\" to open the right panel with status, stakeholders, baseline, export, and documents.",
          "\"Lock baseline\" saves a snapshot of every task's dates. You can backdate it with \"Baseline as-of date\". \"Reset baseline\" overwrites or clears it.",
          "With a baseline, the Overview S-Curve shows planned vs. actual progress and \"Slip\", the Gantt can show ghost bars, and the Daily Review shows days ahead or behind.",
          "\"Export schedule\" (while the Gantt tab is open) downloads Excel or PDF. Use \"View\" to open the PDF in a new tab if a download hangs.",
        ],
      },
    ],
  },
  {
    id: "project-views",
    title: "Project views",
    icon: "view_kanban",
    requires: "project:read",
    summary: "List, Kanban, Gantt, and Timeline show the same tasks. A change in one view appears in all of them.",
    entries: [
      {
        title: "List",
        points: [
          "Tasks grouped by section. Use \"Add section\", \"Add task\", and \"Reorder sections\" in the toolbar.",
          "Drag a row by its handle to reorder it or move it to another section.",
          "Change the assignee, due date, priority, and status directly in the row. Click the priority flag to cycle Low → Medium → High; set Urgent from the task form.",
          "Each section's menu can rename, duplicate, or delete it. Deleting a section keeps its tasks.",
          "Click a row to open the task panel.",
        ],
      },
      {
        title: "Kanban",
        points: [
          "Columns To do, In progress, and Done. Drag cards between or within columns.",
          "Use \"Filter\" to show one assignee or priority. Use \"Add task\" or a column's \"Add task here\".",
          "A column count turns amber when it goes over its WIP limit.",
          "On a phone, swipe between columns and move a card with its \"Card options\" button and the \"Move to\" sheet.",
        ],
      },
      {
        title: "Gantt (desktop only)",
        points: [
          "Zoom with Day, Week, Month, and Quarter. Use Today and the arrows to move through time.",
          "Drag a bar to move a task, or drag its ends to change the dates. Drag rows in the left tree to reorder tasks and sections.",
          "Drag from a bar's dot onto another bar to create a dependency. Hover a dependency line and click ⊗ to delete it.",
          "\"Color by\" colors bars by Status, Section, or Priority. \"Baseline\" shows the locked baseline as ghost bars.",
          "A row's \"…\" menu (or right-click) can edit, duplicate, add a subtask, mark Critical Path, or delete. Weekends and Indonesian public holidays are shaded.",
        ],
      },
      {
        title: "Timeline",
        points: [
          "Top-level tasks as a vertical timeline, sorted by start date. Change a task's status with its one-click buttons. Click a title to edit the task.",
          "This is a phase-level read of the plan; the Gantt is the task-level view where you change dates.",
        ],
      },
    ],
  },
  {
    id: "tasks",
    title: "Tasks",
    icon: "task_alt",
    requires: "project:read",
    summary: "Open a task to edit it, split it into subtasks, and discuss it in comments.",
    entries: [
      {
        title: "Create a task",
        points: [
          "Use \"Add task\" in the List or Kanban, or \"+ Task\" in the Gantt. Only the title is required.",
          "Set priority, status, assignee, dates, section, parent task, labels, and description in the form. The due date must be on or after the start date.",
        ],
      },
      {
        title: "The task panel",
        points: [
          "Clicking a task in the List, Kanban, Overview, or search opens the panel on the right. Press Esc to close it.",
          "Click any field to change it: title, assignee, dates, priority, type, Critical Path, section, labels.",
          "Type switches between a normal task and a Milestone (a diamond on the Gantt).",
          "Critical Path is a manual flag for tasks whose slip moves the project end date.",
          "\"Task options\" can duplicate or delete the task. Deleting a task also deletes its subtasks.",
        ],
      },
      {
        title: "Subtasks, labels, and comments",
        points: [
          "Add subtasks at the bottom of the panel. Tick one to mark it done; drag to reorder. Subtasks go one level deep.",
          "Click a label to toggle it. \"Add label\" creates a new project label with a color.",
          "Write in \"Write a comment…\" and send to discuss the task. Comment counts show on Kanban cards.",
          "Link an iTop ticket from the task's \"iTop ticket\" field — see \"iTop tickets\".",
        ],
      },
    ],
  },
  {
    id: "risks",
    title: "Risks",
    icon: "warning",
    requires: "project:read",
    summary: "Track what could go wrong on a project, how likely it is, and what you will do about it.",
    entries: [
      {
        title: "Manage risks",
        points: [
          "Open a project's Risks tab and click \"Add risk\".",
          "Set Probability and Impact from 1 to 5. Score = Probability × Impact: up to 8 is Low, up to 15 is Medium, above 15 is High.",
          "Record a mitigation plan and a contingency plan, and move the status through Open, Mitigated, and Closed.",
          "Search, filter by category or status, and change probability, impact, or status directly in the table.",
          "Open risks also appear on the project Overview and in the Daily Review.",
        ],
      },
    ],
  },
  {
    id: "customers",
    title: "Customers",
    icon: "groups",
    route: "/customers",
    requires: "project:read",
    summary: "Every project belongs to a customer. The customer page gathers its projects, services, weekly updates, and tickets.",
    entries: [
      {
        title: "Create and manage customers",
        points: [
          "Click \"New customer\". Name and Description are required. Account Manager is free text; pick the Solution Architect from the user list.",
          "The TAM owns the customer. A Solution Architect, on a customer or a project, is not an owner. If you hand a customer to another TAM, you can lose access to it unless one of its projects is yours.",
          "Deleting a customer keeps its projects; they lose the customer link.",
        ],
      },
      {
        title: "Customer page",
        points: [
          "Overview: a profile-completion checklist, services, weekly-update history for the last 52 weeks, and the customer's projects.",
          "Services: which catalogue services the customer subscribes to, with their tools.",
          "Tickets: the customer's iTop tickets, when the customer is linked to an iTop organisation.",
        ],
      },
      {
        title: "Services and tools",
        points: [
          "Tick a service to include it; type a tool name and press Enter or \",\" to add it. Backspace removes the last tool.",
          "On a project's Services tab, \"Add all subscribed\" brings in every service the customer subscribes to.",
          "You can add a new service to the catalogue from the bottom of the list. Manage the full catalogue in Settings.",
        ],
      },
    ],
  },
  {
    id: "daily-review",
    title: "Daily Review",
    icon: "edit_note",
    route: "/daily-review",
    requires: "project:read",
    summary: "Your daily routine: walk through each customer's active projects, write a note, and mark them reviewed.",
    entries: [
      {
        title: "Daily notes",
        points: [
          "Projects are grouped by customer. Each project card shows schedule status, progress, overdue tasks, and open risks.",
          "Write what happened today in the note box and click \"Save note\" (or press ⌘/Ctrl+Enter).",
          "Nothing happened? Click \"Mark reviewed\" instead.",
          "Use the \"Operations\" card for customer issues outside any project. Operations notes need a title.",
          "You can edit only your own notes. Admins can delete any note.",
        ],
      },
      {
        title: "Navigate the week",
        points: [
          "Use the week arrows to move between weeks; the day strip shows how many customers have a note each day.",
          "\"Show week\" on a card shows the notes of the other days. Add a missed day with \"Add\".",
          "A customer group collapses on its own when every project is reviewed today and its weekly update is done.",
          "Projects without a customer sit under \"No customer\". Their notes work, but they have no weekly update.",
        ],
      },
      {
        title: "Weekly updates from here",
        points: [
          "Each customer has a weekly sync row with \"Mid-week sync\" and \"Reflection sync\" buttons — see \"Weekly Sync\".",
          "When iTop is connected, the \"iTop today\" strip shows new, resolved, and SLA-breached tickets. \"Add to note\" copies a ticket into today's operations note.",
        ],
      },
    ],
  },
  {
    id: "weekly-sync",
    title: "Weekly Sync",
    icon: "table_chart",
    route: "/weekly-sync",
    requires: "project:read",
    summary: "One update per customer per week: a mid-week check on Wednesday and a reflection on Friday, read together on Monday.",
    entries: [
      {
        title: "Write the updates",
        points: [
          "Open \"Mid-week sync\" or \"Reflection sync\" from the Daily Review, or click a customer's row on the Weekly Sync page.",
          "Mid-week: set Health (Green, Amber, Red), a one-line category, and highlights with a risk and an action. \"Draft from Mon–Wed notes\" builds highlights from your daily notes.",
          "Reflection: list achievements with outstanding issues, lessons learned, next-week focus, and any manager decision needed. \"Draft from this week\" builds a draft from your notes.",
          "The mid-week dialog saves with \"Save mid-week\". In the reflection dialog, \"Save draft\" keeps working and \"Mark done\" needs a health value and at least one achievement; a done week can be reopened as a draft.",
          "⌘/Ctrl+Enter runs the main button of either dialog.",
        ],
      },
      {
        title: "Read the tables",
        points: [
          "The page opens on the table you most likely need: last week's Reflection on Monday, this week's Mid-week Tuesday to Thursday, this week's Reflection from Friday.",
          "Customers with a manager decision are pinned first under \"Needs a manager decision\".",
          "\"Copy as table\" copies the table for pasting into email or a document.",
        ],
      },
    ],
  },
  {
    id: "itop",
    title: "iTop tickets",
    icon: "confirmation_number",
    requires: "project:read",
    summary: "When your admin connects iTop, Solvro shows each customer's tickets and lets you act on them. iTop stays the owner of every ticket.",
    entries: [
      {
        title: "Before you start",
        points: [
          "To act on tickets, save your own iTop personal token in Settings › iTop. Create it in iTop under My Account › Personal tokens.",
          "Without a token, tickets are read-only for you. Every change goes to iTop under your own name.",
          "An admin must also turn on \"Actions from Solvro\". If it is off, the ticket screens tell you so.",
        ],
      },
      {
        title: "Work with tickets",
        points: [
          "Open a customer's Tickets tab. Switch between Table and Board, and filter by Incidents or Requests. The Table view also filters by Ongoing, Resolved this week, and Mine.",
          "On the Board, drag a card to change its state: to Assigned to take it, to Pending (needs a reason), to Resolved (needs a resolution code and solution), or to Closed. A card moves only after iTop accepts the change.",
          "Click a ticket to open its panel: take actions, read and add public or private log entries, and \"Open in iTop ↗\".",
          "\"New ticket\" creates a user request or incident in iTop.",
          "\"Refresh from iTop\" fetches the latest tickets now.",
        ],
      },
      {
        title: "Time and task links",
        points: [
          "In a ticket panel, \"Start timer\" tracks time; \"Stop\" logs it to iTop. Only one timer runs at a time, and the running timer shows in the top bar.",
          "Link a task to a ticket from the task panel's \"iTop ticket\" field with its ref (e.g. R-004512), or \"Create in iTop\" from the task.",
        ],
      },
    ],
  },
  {
    id: "utilization",
    title: "Utilization",
    icon: "schedule",
    route: "/utilization",
    requires: "project:read",
    summary: "Hours logged per customer per day, read from iTop's time tracking.",
    entries: [
      {
        title: "Read your hours",
        points: [
          "\"Me\" shows your own week. Users with Executive access also get \"By TAM\" and \"By customer\".",
          "Move between weeks with the arrows. Solvro keeps the last 8 weeks of time entries.",
          "The tiles show \"Hours logged\" against your weekly capacity (the bar turns amber at capacity), \"Customers touched\", and hours \"Not tied to a customer\".",
          "Hours come from iTop. To change a number, edit the time entry in iTop, then click \"Refresh from iTop\".",
        ],
      },
    ],
  },
  {
    id: "pipeline",
    title: "Pipeline",
    icon: "monetization_on",
    route: "/pipeline",
    requires: "pipeline:view",
    summary: "The sales board: every opportunity from first assessment to a won deal, with its value, PIC, and next move.",
    entries: [
      {
        title: "Stages and status",
        points: [
          "Six stages, left to right: Assessment, Technical Clarification, PoC, RFP, Delivered Proposal, and Waiting Response.",
          "Won, Lost, Cancelled, Archived, and Hold are not stages. A deal that is closed or on hold keeps the stage it stalled in.",
          "Sub-status is \"In progress\" or \"Waiting Sales input\". Switch it with \"Waiting for Sales input\" and \"Input received\" (not offered in Waiting Response).",
          "A deal can carry one tag at a time: \"Hold\" or \"Delayed\". Use \"Hold\" / \"Release hold\" and \"Mark delayed\" / \"Clear delayed\".",
          "The outcome is \"Won\", \"Lost\", \"Cancelled\", or \"Archived\" and is set only by \"Close deal\" — see \"Opportunities\".",
          "A \"Client\" chip marks a deal in Waiting Response, where the next move is the client's; in every other stage it is the SA's.",
        ],
      },
      {
        title: "Views",
        points: [
          "Switch between Kanban, List, Swimlane, and Quarter. \"Active · N\" and \"Closed · N\" choose which deals the Kanban and List show.",
          "Kanban (Active): one column per stage; drag a card to move it, or click a card to open it. Its \"More actions\" menu has \"Open deal\" and the sub-status and tag toggles. The board scrolls sideways on every screen size.",
          "Kanban (Closed): read-only Won, Lost, Cancelled, and Archived columns, with tiles for Win rate and the Won, Lost, and Cancelled value.",
          "List: a table with Opportunity (title and customer), Stage, Outcome, Tag, Sub-status, Idle, Deal value, PIC, and dates; sort by a column header and click a row to open the deal. In Closed, it adds a \"Closed\" column.",
          "Swimlane: one row per PIC, plus an \"Unassigned\" row, with a column per stage. Quarter: Q1 to Q4 by request date, plus \"Other\". Both are read-only and always show active deals.",
          "The tiles above every view show Total Pipeline, Deadline ≤ 7d, Won this month, Active PICs, and Idle alerts. Click a stage in the funnel strip to scroll the Active Kanban to that column.",
        ],
      },
      {
        title: "Create and import",
        points: [
          "\"New opportunity\" needs the \"Create opportunities\" permission. Title and Customer are required; Customer is plain text, not a link to a Customer record.",
          "Optional fields: \"Deal value (IDR)\", \"Win probability (%)\" (50 by default), PIC, \"Request date\", Deadline, \"Product / solution\", \"Lead source\", and Description. The form starts at the Assessment stage with you as the PIC; change either, or choose \"No PIC\".",
          "\"Import\" (same permission) opens \"Import opportunities\": download the Excel template, upload an .xlsx or .csv file, check the preview, then \"Import N valid rows\". Only the six stage names are accepted, a file imports up to 500 rows at a time, and a row with the same title and customer as an existing deal is skipped.",
          "Admins can review every import run in Admin › Pipeline.",
        ],
      },
      {
        title: "Who can change a deal",
        points: [
          "Everyone with \"View pipeline\" can read the board and every deal, and add notes to a deal.",
          "\"Edit own opportunities\" and \"Delete own opportunities\" apply only to deals where you are the PIC. \"Edit all opportunities\" and \"Delete all opportunities\" apply to every deal.",
          "Edit rights cover dragging a deal between stages, the toggles, \"Close deal\", \"Reopen\", Edit, links, and creating a project from a won deal. Without them those controls do not appear.",
        ],
      },
    ],
  },
  {
    id: "opportunities",
    title: "Opportunities",
    icon: "handshake",
    requires: "pipeline:view",
    summary: "Open an opportunity to see its history, move it, close it, and hand a won deal to delivery.",
    entries: [
      {
        title: "Open an opportunity",
        points: [
          "Click a card or a List row, or choose \"Open deal\" from a card's menu. The page shows the stage, value, PIC, dates, and an Activity feed.",
          "\"Edit\" changes the fields and stays available after a deal is closed. \"Delete\" asks you to confirm in \"Delete opportunity\".",
        ],
      },
      {
        title: "Move between stages",
        points: [
          "Drag a card to another column, or pick a stage from the stage chip's menu on the deal page. A closed deal cannot be moved; reopen it first.",
          "Only one jump asks for a reason: Technical Clarification straight to RFP, skipping PoC. \"Move to RFP and skip PoC?\" needs a \"Reason for the skip\", which is saved in the activity log.",
        ],
      },
      {
        title: "Close and reopen",
        points: [
          "\"Close deal\" asks for the Outcome: Won, Lost, Cancelled, or Archived. Lost needs a \"Reason category\" (Price, Competitor, Technical, or Other); Cancelled needs one too (Budget withdrawn, Project cancelled, Lost contact, or Other). Won and Archived take none. A \"Note (optional)\" is saved in the activity log.",
          "Use Archived for a deal that was never really decided: a duplicate, a test entry, or imported junk. Archived deals stay out of win rate, the Created vs. won trend, PIC performance, and every pipeline value. \"Reopen\" brings one back.",
          "Confirm with \"Close as Won\", \"Close as Lost\", or \"Close as Cancelled\". The deal stays in its current stage, and any Hold or Delayed tag is cleared.",
          "\"Reopen\" brings a closed deal back to the board. It is not offered once a project has been created from the deal.",
        ],
      },
      {
        title: "Assign a PIC",
        points: [
          "A deal with no PIC shows \"Assign PIC\" on its page and sits in the Swimlane's \"Unassigned\" row. Until it has a PIC, users who only hold the \"own\" permissions cannot edit, move, link, or delete it.",
          "With \"Edit own opportunities\" you can assign a PIC (yourself or someone else) only while the deal has none. To change the PIC of an assigned deal, use \"Edit\" — that needs \"Edit all opportunities\", or \"Edit own opportunities\" on a deal you are the PIC of.",
        ],
      },
      {
        title: "Hand a won deal to delivery",
        points: [
          "After \"Close as Won\", \"Deal won — create the delivery project?\" offers \"Create project\" (or \"Dismiss\"). The \"Create project\" button stays on the deal page until a project exists; afterwards \"View project\" opens it.",
          "The project form is prefilled from the deal: the name, a description that notes the deal, the deal's PIC as Solution Architect, and the customer when its name matches a Customer exactly. You become the project's TAM unless you pick another.",
          "You need \"Manage projects\" and edit rights on the deal. The default SA role has no \"Manage projects\", so an SA cannot create the project: ask a TAM or an Admin with Pipeline edit rights, or ask an admin to grant \"Manage projects\" in Admin › Roles.",
        ],
      },
      {
        title: "Idle alerts",
        points: [
          "Solvro flags a deal that goes quiet. Days count Monday to Friday, without Indonesian public holidays.",
          "A deal tagged \"Hold\" never raises an idle alert. \"Release hold\" restarts its clock from the release. A deal tagged \"Delayed\" still goes idle.",
          "Adding a note restarts the deal's clock, whatever its sub-status: in \"Waiting Sales input\" the waiting time counts again from the note.",
          "\"Waiting Sales input\" warns after more than 2 working days (3 in PoC and Delivered Proposal) and turns critical after twice that. Otherwise a deal warns after more than 5 working days without activity (7 in PoC and Delivered Proposal).",
          "In Waiting Response a deal warns after 7 working days and turns critical after 14.",
          "The deal page shows \"SLA for this stage\" under its last activity, the List has an Idle column, and the \"Idle alerts\" tile counts the flagged deals.",
        ],
      },
      {
        title: "Notes and links",
        points: [
          "The Activity feed holds every note. Write in \"Add a note…\" and press \"Add note\"; anyone with \"View pipeline\" can, which is how Sales replies. Stage-skip reasons, close notes, and PIC changes land here too.",
          "\"Add link\" saves a labelled URL (for example a proposal) on the deal. It needs edit rights on the deal.",
        ],
      },
    ],
  },
  {
    id: "executive",
    title: "Executive",
    icon: "leaderboard",
    route: "/executive",
    requires: "report:executive",
    summary: "An org-wide, read-only roll-up of every TAM's projects.",
    entries: [
      {
        title: "What it shows",
        points: [
          "\"Overdue Projects\": every project past its committed end, with its TAM and how late it is.",
          "\"Portfolio Timelines\": every project as a Calendar or a List with progress bars.",
          "Administrative projects are left out.",
          "If you also have Pipeline access, a \"Pipeline analytics\" section adds a Conversion funnel, Top PIC by won value, PIC performance (active value, wins, win rate), Created vs. won over 12 months, a Workload heatmap, Close reasons by stage, and this year's Win rate.",
        ],
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    icon: "settings",
    route: "/settings",
    summary: "Your appearance, profile, iTop token, password, and the service catalogue.",
    entries: [
      {
        title: "Your account",
        points: [
          "Appearance: Light, Dark, or System (follows your device).",
          "Profile shows your username, email, and role. Only an admin can change them.",
          "Change password: at least 8 characters, different from the current one.",
          "iTop: save or remove your personal token (shown when iTop is connected).",
        ],
      },
      {
        title: "Service Catalogue",
        points: [
          "Only admins can add, edit, deactivate, and delete catalogue services; everyone else picks from the list on a customer or project.",
          "Deleting a service removes it from every customer and project that uses it.",
        ],
      },
    ],
  },
  {
    id: "admin",
    title: "Admin",
    icon: "admin_panel_settings",
    route: "/admin",
    requires: "*",
    summary: "Manage users, roles, sign-in, project ownership, the Pipeline import history, and the iTop connection.",
    entries: [
      {
        title: "Users and roles",
        points: [
          "Users: assign roles (new Google users arrive as \"Needs role\"), deactivate or reactivate, reset passwords, delete, or add a user.",
          "Deactivating a user who still holds open work opens \"Hand over <user>'s work\" instead of deactivating at once. See \"Offboard a teammate\" in the guides above.",
          "Roles: create custom roles and tick their permissions. The PENDING role is reserved; a role with users cannot be deleted. Pipeline access is granted here too, with the Pipeline permissions.",
        ],
      },
      {
        title: "Sign-in and ownership",
        points: [
          "Sign-in: connect Google sign-in with a client ID and the allowed email domains.",
          "Project Override: reassign the TAM of any project. The TAM is the project's owner; a Solution Architect is not an owner.",
          "Pipeline: a read-only history of every Excel/CSV import run on the Pipeline board, newest first.",
        ],
      },
      {
        title: "iTop",
        points: [
          "Enter the iTop URL and the application token, then \"Test connection\". The application token only reads.",
          "Set the refresh interval, weekly capacity per TAM, and the iTop server timezone (it must match iTop's own setting).",
          "Turn on \"Actions from Solvro\" to let users act on tickets with their personal tokens.",
          "Map customers to iTop organisations (\"Automatch by name\") and users to iTop persons (\"Match now\"). Use \"Sync now\" for an immediate sync.",
          "\"Webhook (optional)\": let iTop notify Solvro of ticket changes, so tickets update in seconds instead of at the next refresh.",
        ],
      },
    ],
  },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    icon: "keyboard",
    summary: "Work faster without the mouse.",
    entries: [],
    shortcuts: [
      { keys: ["⌘K", "Ctrl+K"], action: "Open or close search" },
      { keys: ["↑", "↓", "Enter"], action: "Move through and open search results or actions" },
      { keys: ["Esc"], action: "Close a dialog, the search, or the task or ticket panel" },
      { keys: ["⌘Enter", "Ctrl+Enter"], action: "Save a daily note, or run the main button of a sync dialog" },
      { keys: ["Enter"], action: "Add a subtask, a label, or a tool" },
    ],
  },
];

export const HELP_GUIDES: readonly HelpGuide[] = [
  {
    id: "guide-start-your-day",
    title: "Start your day",
    icon: "wb_sunny",
    requires: "project:read",
    summary: "See what needs you first, then write up yesterday's work.",
    links: [
      { label: "Open Overview", to: "/overview" },
      { label: "Open Daily Review", to: "/daily-review" },
    ],
    steps: [
      {
        title: "Check Overview",
        points: [
          "Read the tiles: Overdue, Due this week, and Open risks. Overdue and Due this week open the Tasks list for that view; Open risks opens the Daily Review.",
          "\"Projects needing attention\" lists the projects with overdue tasks or open risks first.",
          "Tasks in on-hold and cancelled projects are not counted as overdue; the Overdue tile says how many on-hold tasks it left out.",
        ],
      },
      {
        title: "Open your notifications",
        points: [
          "Click the \"Notifications\" bell in the top bar. Each entry opens the project, task, or deal it is about.",
          "\"All tasks in <project> are closed — mark the project Completed?\" is a prompt to finish a project; see \"Run a project\".",
        ],
      },
      {
        title: "Write the Daily Review",
        points: [
          "Open Daily Review, write what happened under each customer's project, and click \"Save note\".",
          "Nothing happened? Click \"Mark reviewed\" instead.",
        ],
      },
    ],
    related: ["overview", "daily-review", "getting-started"],
  },
  {
    id: "guide-run-a-project",
    title: "Run a project",
    icon: "folder_managed",
    requires: "project:read",
    summary: "Create a project, move it through its statuses, and know what hold and cancel do to its tasks.",
    links: [{ label: "Open Projects", to: "/projects" }],
    steps: [
      {
        title: "Create it",
        points: [
          "Click \"New project\" on the Projects page. Name and Customer are required.",
          "Pick the Technical Account Manager (the project's TAM and owner) and, optionally, a Solution Architect.",
        ],
      },
      {
        title: "Lock a baseline",
        points: [
          "Open the project's Context panel and click \"Lock baseline\" once the plan is agreed. It saves every task's dates so slip can be measured.",
        ],
      },
      {
        title: "Put it on hold",
        points: [
          "In \"Edit project\", set Status to On hold. Its tasks stop counting as overdue or due this week until it is reactivated.",
          "To bring it back, set Status to Active (or Planning). If open tasks are now past due, \"Update the timeline?\" opens: \"Shift open dates by N days\" moves every open task and epic by the number in \"Days to shift open dates\", or \"I'll update the timeline myself\" opens the Gantt so you can do it by hand.",
        ],
      },
      {
        title: "Finish it",
        points: [
          "When the last open task of an Active project is closed, the TAM and members get \"All tasks in <project> are closed — mark the project Completed?\". Solvro never completes the project for you: set Status to Completed in \"Edit project\".",
        ],
      },
      {
        title: "Cancel it",
        points: [
          "Set Status to Cancelled. The dialog \"Cancel project and its open tasks?\" says how many open tasks become Cancelled; completed tasks stay as they are.",
          "Confirm with \"Cancel project\" or back out with \"Keep project\". Reactivating the project later does not reopen the cancelled tasks.",
        ],
      },
      {
        title: "Find projects by status",
        points: [
          "On the Projects page, add the \"Status\" filter beside \"Customer\" (\"is any of\") to see, for example, only Active and On hold projects. \"Clear filters\" resets the list.",
        ],
      },
    ],
    related: ["projects", "customers", "overview"],
  },
  {
    id: "guide-keep-tasks-moving",
    title: "Keep tasks moving",
    icon: "task_alt",
    requires: "project:read",
    summary: "Plan and update tasks in the List, Kanban, or Gantt view, and know when a project has run out of work.",
    steps: [
      {
        title: "Pick a view",
        points: [
          "List, Kanban, Gantt, and Timeline show the same tasks; a change in one appears in all of them.",
          "Change status, assignee, and dates in place, or click a task to open its panel.",
        ],
      },
      {
        title: "Link what depends on what",
        points: [
          "In the Gantt, drag from a bar's dot onto another bar to create a dependency.",
          "Drag a bar to move a task, or drag its ends to change the dates.",
        ],
      },
      {
        title: "Close the last task",
        points: [
          "When you close the last open task of an Active project, the TAM and project members (including you, if you are the TAM or a member) are asked \"All tasks in <project> are closed — mark the project Completed?\". Closing tasks while the project is Planning or On hold sends nothing.",
        ],
      },
    ],
    related: ["project-views", "tasks", "projects"],
  },
  {
    id: "guide-handle-a-risk",
    title: "Handle a risk",
    icon: "warning",
    requires: "project:read",
    summary: "Record a risk, score it, and track the mitigation until it is closed.",
    steps: [
      {
        title: "Add it",
        points: [
          "Open the project's Risks tab and click \"Add risk\".",
          "Set Probability and Impact from 1 to 5. Score = Probability × Impact: up to 8 is Low, up to 15 is Medium, above 15 is High.",
        ],
      },
      {
        title: "Plan the response",
        points: [
          "Write a mitigation plan and a contingency plan.",
          "Move the status from Open to Mitigated, and to Closed when it is over.",
        ],
      },
      {
        title: "Keep it visible",
        points: [
          "Open risks appear on the project Overview and in the Daily Review, so they stay in front of you.",
        ],
      },
    ],
    related: ["risks", "daily-review"],
  },
  {
    id: "guide-prepare-weekly-sync",
    title: "Prepare the Weekly Sync",
    icon: "table_chart",
    requires: "project:read",
    summary: "Write each customer's mid-week and reflection updates, then read them together.",
    links: [{ label: "Open Weekly Sync", to: "/weekly-sync" }],
    steps: [
      {
        title: "Mid-week (Wednesday)",
        points: [
          "Open \"Mid-week sync\" from the Daily Review or click the customer's row on Weekly Sync.",
          "Set Health, a one-line category, and highlights; \"Draft from Mon–Wed notes\" builds them from your daily notes. Save with \"Save mid-week\".",
        ],
      },
      {
        title: "Reflection (Friday)",
        points: [
          "List achievements, lessons learned, next-week focus, and any manager decision needed. \"Draft from this week\" starts you off.",
          "\"Save draft\" keeps working; \"Mark done\" needs a health value and at least one achievement.",
        ],
      },
      {
        title: "Read it",
        points: [
          "Weekly Sync opens on the table you most likely need. Customers with a manager decision are pinned under \"Needs a manager decision\". \"Copy as table\" copies it for email.",
        ],
      },
    ],
    related: ["weekly-sync", "daily-review"],
  },
  {
    id: "guide-work-a-deal",
    title: "Work a deal",
    icon: "handshake",
    requires: "pipeline:view",
    summary: "Move an opportunity through the stages, know when Hold and Delayed apply, and hand a won deal to delivery.",
    links: [{ label: "Open Pipeline", to: "/pipeline" }],
    steps: [
      {
        title: "Create and move it",
        points: [
          "\"New opportunity\" needs the \"Create opportunities\" permission. Title and Customer are required.",
          "Drag the card to the next stage, or pick a stage from the stage chip on the deal page.",
        ],
      },
      {
        title: "Hold, Delayed, or idle",
        points: [
          "A deal carries one tag at a time. \"Hold\" pauses a deal: a deal on Hold never raises an idle alert, and \"Release hold\" restarts its clock from the release.",
          "\"Mark delayed\" tags a deal as Delayed; a Delayed deal still goes idle like any other.",
          "A deal that is neither on Hold nor closed is flagged idle when it goes quiet for longer than its stage allows; the List has an Idle column and the \"Idle alerts\" tile counts them.",
        ],
      },
      {
        title: "Close it",
        points: [
          "\"Close deal\" asks for the Outcome: Won, Lost, Cancelled, or Archived. Lost and Cancelled need a reason category. Archive a duplicate or test deal: it stays out of win rate and the pipeline numbers.",
          "Closing clears any Hold or Delayed tag.",
        ],
      },
      {
        title: "Hand a won deal to delivery",
        points: [
          "After \"Close as Won\", \"Deal won — create the delivery project?\" offers \"Create project\". The form is prefilled from the deal. You need \"Manage projects\" and edit rights on the deal.",
        ],
      },
    ],
    related: ["pipeline", "opportunities"],
  },
  {
    id: "guide-track-hours",
    title: "Track hours and tickets",
    icon: "schedule",
    requires: "project:read",
    summary: "Act on iTop tickets under your own name and read the hours they produce on Utilization.",
    links: [{ label: "Open Utilization", to: "/utilization" }],
    steps: [
      {
        title: "Connect your token",
        points: [
          "Save your own iTop personal token in Settings › iTop. Without it, tickets are read-only for you.",
        ],
      },
      {
        title: "Work a ticket",
        points: [
          "Open a customer's Tickets tab, click a ticket, and use \"Start timer\" and \"Stop\" to log time to iTop.",
        ],
      },
      {
        title: "Read the hours",
        points: [
          "Utilization shows hours per customer per day, read from iTop. To change a number, edit the time entry in iTop, then click \"Refresh from iTop\".",
        ],
      },
    ],
    related: ["itop", "utilization", "settings"],
  },
  {
    id: "guide-offboard-teammate",
    title: "Offboard a teammate",
    icon: "person_remove",
    requires: "*",
    summary: "Admin only. Hand a leaver's work to other people before deactivating their account.",
    links: [{ label: "Open Admin", to: "/admin" }],
    steps: [
      {
        title: "Start the deactivation",
        points: [
          "In Admin › Users, click \"Deactivate\" on the user. If they hold no open work, they are deactivated at once.",
          "Otherwise \"Hand over <user>'s work\" opens, with a section for each kind of work they hold: Projects, Customers, and Pipeline.",
        ],
      },
      {
        title: "Projects",
        points: [
          "For each project, \"Tasks and epics go to\" picks who takes the open tasks and epics (or Unassigned). \"Apply to all\" sets the same person on every project.",
          "Where the leaver is the TAM, \"New TAM\" is required. Where they are the SA, \"New SA\" can be left as \"No SA\".",
          "\"Handover note (internal)\" is optional and is saved as an internal project note, so it never appears in an export.",
        ],
      },
      {
        title: "Customers and Pipeline",
        points: [
          "Each customer they own gets an owner picker (\"No owner\" is allowed).",
          "If they are PIC of open deals, one picker, \"PIC for <n> open deals\", reassigns them all.",
        ],
      },
      {
        title: "Confirm",
        points: [
          "\"Hand over and deactivate\" stays disabled until every required TAM is chosen. Task statuses do not change.",
          "Notifications go out only for some of what moves: a person who receives open tasks or epics is told \"<admin> handed you N tasks and M epics in <project>\" (for example \"<admin> handed you 1 epic in <project>\"), someone made the new TAM or SA of a project is told about their new role (that notice replaces the handover one for the same project), and the new PIC of a deal is told the deal was assigned to them. A new customer owner gets no notification, and neither does the admin doing the handover.",
          "If anything fails, nothing is changed and the user stays active.",
        ],
      },
    ],
    related: ["admin"],
  },
];

/**
 * Topics visible to a user, narrowed by a free-text query. The permission
 * check is injected (`has`) so this module stays free of React/auth imports.
 */
export function filterHelpTopics(
  has: (permission: string) => boolean,
  query: string,
): HelpTopic[] {
  const q = query.trim().toLowerCase();
  return HELP_TOPICS.filter((t) => {
    if (t.requires && !has(t.requires)) return false;
    if (q === "") return true;
    const haystack = [
      t.title,
      t.summary,
      ...t.entries.flatMap((e) => [e.title, ...e.points]),
      ...(t.shortcuts ?? []).map((s) => s.action),
    ];
    return haystack.some((s) => s.toLowerCase().includes(q));
  });
}

/** Guides visible to a user (same permission rule as topics), narrowed by the query. */
export function filterHelpGuides(
  has: (permission: string) => boolean,
  query: string,
): HelpGuide[] {
  const q = query.trim().toLowerCase();
  return HELP_GUIDES.filter((g) => {
    if (g.requires && !has(g.requires)) return false;
    if (q === "") return true;
    const haystack = [g.title, g.summary, ...g.steps.flatMap((st) => [st.title, ...st.points])];
    return haystack.some((x) => x.toLowerCase().includes(q));
  });
}
