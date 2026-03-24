/**
 * VPDM daily operational checklist (from Daily Task .xlsx — VPDM sheet).
 */

export const VPDM_TRACKS = [
  "Amazon Client Followup",
  "Amazon New client Free",
  "Amazon Audit Client",
  "Flipkart Client Followup",
  "Flipkart New client Free",
  "Flipkart Audit Client",
] as const;

export type VpdmTrack = (typeof VPDM_TRACKS)[number];

/** Rows matching the “No” column (1–23) on the VPDM daily sheet */
export const VPDM_TASK_ROWS: readonly {
  row: number;
  title: string;
  section: string;
}[] = [
  { row: 1, title: "Amazon & Flipkart Team ➡️", section: "Role" },
  { row: 2, title: "HR Team", section: "Role" },
  { row: 3, title: "Invoice Client add and Generate", section: "Office" },
  { row: 4, title: "Exsting Client Meeting", section: "Office" },
  { row: 5, title: "Amazon & Flipkart R&D Meeting", section: "Office" },
  { row: 6, title: "Meta Ads R&D Meeting", section: "Office" },
  { row: 7, title: "Amzon, Flipkart & Meta New Learning", section: "Learning" },
  { row: 8, title: "Invoice Tool", section: "Tools" },
  { row: 9, title: "EMP Management Tools", section: "Tools" },
  { row: 10, title: "Account Tool", section: "Tools" },
  { row: 11, title: "AiAdKing", section: "Tools" },
  { row: 12, title: "Jira Tools", section: "Tools" },
  { row: 13, title: "Rent/Light etc office Xpense", section: "Operational" },
  { row: 14, title: "Salary Payment", section: "Operational" },
  { row: 15, title: "Office Hisab", section: "Operational" },
  { row: 16, title: "Client Fees Structure", section: "Operational" },
  { row: 17, title: "Client Account Audit / QC", section: "Operational" },
  { row: 18, title: "Amazon", section: "IT" },
  { row: 19, title: "Flipkart", section: "IT" },
  { row: 20, title: "Meta", section: "IT" },
  { row: 21, title: "Marketing Book 30 Mins", section: "Others" },
  { row: 22, title: "Daily Newspaper 30 Mins", section: "Others" },
  { row: 23, title: "Other Books 30mins", section: "Others" },
];

export const VPDM_SECTIONS = [
  "Role",
  "Office",
  "Learning",
  "Tools",
  "Operational",
  "IT",
  "Others",
] as const;

export const VPDM_CLIENT_HINTS = [
  "Revolution (hardik)",
  "D&I Enterprise (hardike)",
  "Little Fingers India (hardike)",
  "LuminFit",
  "Jinpri (hardik)",
  "iZibra (hardike)",
  "Camex Wellness (hardika)",
  "Sellastic (hardika)",
  "Aastha Engineering (hardika)",
  "JABA'S (hardikd)",
  "Firdox (hardikd)",
  "Prishva (hardikd)",
  "Belluxuryind (hardikd)",
  "Country Cook (hardikd)",
  "Truvic Solution (hardik.vpdm2)",
  "Divue (hardik.vpdm2)",
  "Vaidue (hardik.vpdm2)",
  "E-Solutions (hardik.vpdm2)",
  "Vanue Glams (hardike)",
  "ANCS Acupressure followup",
  "Grinish followup",
  "IT Team Task",
  "Porclean meeting",
] as const;
