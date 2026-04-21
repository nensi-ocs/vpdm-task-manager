import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { PrismaService } from "../prisma/prisma.service";

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function cleanStr(v: unknown, maxLen: number): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  return s.slice(0, maxLen);
}

function normalizeHeaderKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseLeadDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Prisma Date maps to midnight UTC in SQL DATE; keep date-only.
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === "string") {
    const s = value.trim();
    // Accept yyyy-mm-dd
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      const y = Number(m[1]);
      const mm = Number(m[2]) - 1;
      const d = Number(m[3]);
      const dt = new Date(Date.UTC(y, mm, d));
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
    // Accept ISO date-time strings (e.g. Meta export "2026-04-16T04:23:59-05:00")
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) {
      return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    }
  }
  return null;
}

function normalizeSheetDisplayName(raw: unknown): string {
  const base = (typeof raw === "string" ? raw : "").trim();
  if (!base) return "";
  // Some exports name the sheet like a filename; strip common extensions for UI cleanliness.
  return base.replace(/\.(xlsx|xlsm|xls|csv)$/i, "").trim().slice(0, 200);
}

function normalizeFileBaseName(originalName: unknown): string {
  const raw = (typeof originalName === "string" ? originalName : "").trim();
  if (!raw) return "";
  const noPath = raw.split(/[/\\]/).pop() ?? raw;
  return normalizeSheetDisplayName(noPath);
}

function normalizeAdsPlatformAnswer(raw: unknown): string | null {
  const s = cleanStr(raw, 60);
  if (!s) return null;
  // Meta/other lead forms sometimes encode answers like "amazon_ads_" → make it readable.
  return s.replace(/_+$/g, "").replace(/_+/g, " ").trim().slice(0, 60) || null;
}

function stableRowKey(payload: Record<string, unknown>): string {
  const parts = [
    cleanStr(payload.email, 200) ?? "",
    cleanStr(payload.phone_number ?? payload.phoneNumber, 60) ?? "",
    cleanStr(payload.full_name ?? payload.fullName, 200) ?? "",
    cleanStr(payload.company_name ?? payload.companyName, 200) ?? "",
    cleanStr(payload.form_name ?? payload.formName, 200) ?? "",
    cleanStr(payload.platform, 60) ?? "",
    cleanStr(payload.ad_platform ?? payload.adPlatform, 60) ?? "",
    normalizeAdsPlatformAnswer(
      payload.which_platform_do_you_want_to_run_ads_on ??
        payload.which_platform_do_you_want_to_run_ads_on_
    ) ?? "",
    payload.Date instanceof Date ? payload.Date.toISOString() : asString(payload.Date),
    payload.date instanceof Date ? payload.date.toISOString() : asString(payload.date),
    asString(payload.created_time),
  ];
  const raw = parts.join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

function pickNormalized(row: Record<string, unknown>) {
  const email = cleanStr(row.email, 200);
  const fullName = cleanStr(row.full_name ?? row.fullName ?? row.name, 200);
  const phoneNumber = cleanStr(row.phone_number ?? row.phoneNumber ?? row.phone, 60);
  const companyName = cleanStr(row.company_name ?? row.companyName ?? row.company, 200);
  const platform = cleanStr(row.platform, 60);
  const adPlatformAnswer = normalizeAdsPlatformAnswer(
    row.which_platform_do_you_want_to_run_ads_on ?? row.which_platform_do_you_want_to_run_ads_on_
  );
  const adPlatform =
    adPlatformAnswer ?? cleanStr(row.ad_platform ?? row.adPlatform, 60) ?? platform;
  const formName = cleanStr(row.form_name ?? row.formName, 200);

  const leadStatus = cleanStr(row.lead_status ?? row["Lead Status"] ?? row.leadStatus, 120);
  const reason = cleanStr(row.reason ?? row.Reason, 300);
  const callDone = cleanStr(row.call_done ?? row["Call Done"] ?? row.callDone, 120);
  const comment = cleanStr(row.comment ?? row.Comment, 5000);
  const followUpRequired = cleanStr(
    row.follow_up_required ?? row["Follow up Required"] ?? row.followUpRequired,
    120
  );
  const converted = cleanStr(row.converted ?? row.Converted, 120);

  const leadDate =
    parseLeadDate(row.created_time ?? row.Date ?? row.date) ??
    (row.Date instanceof Date ? row.Date : null) ??
    (row.date instanceof Date ? row.date : null);

  return {
    leadDate,
    email,
    fullName,
    phoneNumber,
    companyName,
    platform,
    adPlatform,
    formName,
    leadStatus,
    reason,
    callDone,
    comment,
    followUpRequired,
    converted,
  };
}

function toSourceDto(row: {
  id: string;
  name: string;
  type: string;
  spreadsheetId: string | null;
  sheetName: string | null;
  headerRow: number;
  autoSyncEnabled: boolean;
  autoSyncEveryMinutes: number;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    spreadsheetId: row.spreadsheetId,
    sheetName: row.sheetName,
    headerRow: row.headerRow,
    autoSyncEnabled: row.autoSyncEnabled,
    autoSyncEveryMinutes: row.autoSyncEveryMinutes,
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    lastSyncError: row.lastSyncError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toLeadDto(row: {
  id: string;
  leadSourceId: string;
  rowKey: string;
  data: Prisma.JsonValue;
  leadDate: Date | null;
  email: string | null;
  fullName: string | null;
  phoneNumber: string | null;
  companyName: string | null;
  platform: string | null;
  adPlatform: string | null;
  formName: string | null;
  leadStatus: string | null;
  reason: string | null;
  callDone: string | null;
  comment: string | null;
  followUpRequired: string | null;
  converted: string | null;
  syncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    leadSourceId: row.leadSourceId,
    rowKey: row.rowKey,
    data: row.data,
    leadDate: row.leadDate ? row.leadDate.toISOString().slice(0, 10) : null,
    email: row.email,
    fullName: row.fullName,
    phoneNumber: row.phoneNumber,
    companyName: row.companyName,
    platform: row.platform,
    adPlatform: row.adPlatform,
    formName: row.formName,
    leadStatus: row.leadStatus,
    reason: row.reason,
    callDone: row.callDone,
    comment: row.comment,
    followUpRequired: row.followUpRequired,
    converted: row.converted,
    syncedAt: row.syncedAt ? row.syncedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): any {
    return this.prisma as any;
  }

  private rethrowIfMissingTables(e: unknown): never {
    // When migrations haven't been applied yet, Postgres reports missing tables.
    // Prisma surfaces it as a KnownRequestError with a message like:
    // "The table `public.lead_sources` does not exist in the current database."
    const msg =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Database error";
    const missing =
      msg.includes("public.lead_sources") ||
      msg.includes("public.leads") ||
      msg.includes("does not exist in the current database");
    if (missing) {
      throw new ServiceUnavailableException(
        "Leads tables are not present in the database yet. Apply the Leads migration (create `lead_sources` and `leads` tables) and restart the API."
      );
    }
    throw e as Error;
  }

  async listSources(userId: string) {
    try {
      const rows = await this.db.leadSource.findMany({
        where: { userId },
        orderBy: [{ updatedAt: "desc" }],
      });
      return rows.map((r: any) => toSourceDto(r));
    } catch (e) {
      this.rethrowIfMissingTables(e);
    }
  }

  async listAdPlatforms(userId: string, sourceId: string | null) {
    try {
      const rows = await this.db.lead.findMany({
        where: sourceId
          ? { leadSourceId: sourceId, leadSource: { userId } }
          : { leadSource: { userId } },
        select: { adPlatform: true, platform: true },
      });
      const map = new Map<string, string>();
      for (const r of rows) {
        const raw = (r.adPlatform ?? r.platform ?? "").trim();
        if (!raw) continue;
        const key = raw.toLowerCase();
        if (!map.has(key)) map.set(key, raw);
      }
      return [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, v]) => v);
    } catch (e) {
      this.rethrowIfMissingTables(e);
    }
  }

  async listLeads(
    userId: string,
    opts: {
      sourceId?: string;
      q?: string;
      status?: string;
      adPlatform?: string;
      converted?: string;
      page: number;
      pageSize: number;
    }
  ) {
    const where: any = {
      leadSource: { userId },
    };
    if (opts.sourceId) where.leadSourceId = opts.sourceId;
    if (opts.status) where.leadStatus = opts.status;
    if (opts.adPlatform) {
      // Filter should match what UI displays (adPlatform falls back to platform).
      where.OR = [
        ...(where.OR ?? []),
        { adPlatform: { equals: opts.adPlatform, mode: "insensitive" } },
        { platform: { equals: opts.adPlatform, mode: "insensitive" } },
      ];
    }

    const conv = (opts.converted ?? "").trim();
    if (conv === "__unset__") {
      where.AND = [
        ...(where.AND ?? []),
        { OR: [{ converted: null }, { converted: "" }] },
      ];
    } else if (conv === "Yes") {
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { converted: { equals: "yes", mode: "insensitive" } },
            { converted: { equals: "y", mode: "insensitive" } },
            { converted: { equals: "true", mode: "insensitive" } },
          ],
        },
      ];
    } else if (conv === "No") {
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { converted: { equals: "no", mode: "insensitive" } },
            { converted: { equals: "n", mode: "insensitive" } },
            { converted: { equals: "false", mode: "insensitive" } },
          ],
        },
      ];
    } else if (conv) {
      where.converted = { equals: conv, mode: "insensitive" };
    }

    const searchTokens = (opts.q ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map((t) => t.slice(0, 200))
      .slice(0, 25);
    if (searchTokens.length > 0) {
      const searchOr = searchTokens.flatMap((token) => [
        { email: { contains: token, mode: "insensitive" } },
        { fullName: { contains: token, mode: "insensitive" } },
        { phoneNumber: { contains: token, mode: "insensitive" } },
        { companyName: { contains: token, mode: "insensitive" } },
      ]);
      where.OR = [...(where.OR ?? []), ...searchOr];
    }

    const skip = (opts.page - 1) * opts.pageSize;
    const take = opts.pageSize;

    try {
      const [total, rows] = await Promise.all([
        this.db.lead.count({ where }),
        this.db.lead.findMany({
          where,
          orderBy: [{ leadDate: "desc" }, { createdAt: "desc" }],
          skip,
          take,
        }),
      ]);

      return {
        page: opts.page,
        pageSize: opts.pageSize,
        total,
        items: rows.map((r: any) => toLeadDto(r)),
      };
    } catch (e) {
      this.rethrowIfMissingTables(e);
    }
  }

  async importXlsxForUser(
    userId: string,
    file: { buffer: Buffer | Uint8Array; originalname?: string }
  ) {
    const wb = new ExcelJS.Workbook();
    const buf = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
    await wb.xlsx.load(buf as any);
    const imported: { sourceId: string; name: string; leads: number }[] = [];

    const fileBase = normalizeFileBaseName(file.originalname);
    const hasMultipleSheets = wb.worksheets.length > 1;

    for (const ws of wb.worksheets) {
      const sheetName = normalizeSheetDisplayName(ws.name) || "Leads";
      const name = fileBase
        ? hasMultipleSheets
          ? `${fileBase} - ${sheetName}`.slice(0, 200)
          : fileBase
        : sheetName;
      if (!name) continue;

      // Create/ensure a source per worksheet
      // NOTE: Do NOT use upsert here. Some environments may not have the (user_id, name)
      // unique constraint yet (migration not applied), and Postgres will reject ON CONFLICT.
      let source = await this.db.leadSource.findFirst({
        where: { userId, name },
      });
      if (!source) {
        try {
          source = await this.db.leadSource.create({
            data: { userId, name },
          });
        } catch (e) {
          // If a unique constraint exists and a concurrent request created it, re-read.
          source = await this.db.leadSource.findFirst({ where: { userId, name } });
          if (!source) throw e;
        }
      }

      const headerRow = ws.getRow(1);
      const headerValues = headerRow.values as unknown[];
      const headers: string[] = [];
      for (let c = 1; c < headerValues.length; c++) {
        const raw = headerValues[c];
        const h = typeof raw === "string" ? raw.trim() : "";
        headers.push(h || `col_${c}`);
      }

      let leadCount = 0;
      const now = new Date();

      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const values = row.values as unknown[];
        const obj: Record<string, unknown> = {};
        for (let c = 1; c <= headers.length; c++) {
          const keyRaw = headers[c - 1] ?? `col_${c}`;
          const key = normalizeHeaderKey(keyRaw) || `col_${c}`;
          obj[key] = values[c] ?? null;
        }

        // Skip completely empty rows
        const hasAny = Object.values(obj).some((v) => {
          if (v === null || v === undefined) return false;
          if (typeof v === "string") return v.trim() !== "";
          return true;
        });
        if (!hasAny) continue;

        const rowKey = stableRowKey(obj) || `row_${r}`;
        const norm = pickNormalized(obj);

        const existing = await this.db.lead.findUnique({
          where: { leadSourceId_rowKey: { leadSourceId: source.id, rowKey } },
          select: { id: true, leadDate: true },
        });

        if (!existing) {
          await this.db.lead.create({
            data: {
              leadSourceId: source.id,
              rowKey,
              data: obj as Prisma.InputJsonValue,
              ...norm,
              syncedAt: now,
            },
          });
        } else {
          // Re-import should NOT overwrite user-managed fields (status/notes/etc) or leadDate.
          // Only refresh raw data + best-effort identity fields.
          await this.db.lead.update({
            where: { id: existing.id },
            data: {
              data: obj as Prisma.InputJsonValue,
              email: norm.email,
              fullName: norm.fullName,
              phoneNumber: norm.phoneNumber,
              companyName: norm.companyName,
              platform: norm.platform,
              adPlatform: norm.adPlatform,
              formName: norm.formName,
              // Preserve leadDate once set; if it was missing, fill it from the import.
              leadDate: existing.leadDate ? undefined : norm.leadDate,
              syncedAt: now,
            },
          });
        }
        leadCount++;
      }

      imported.push({ sourceId: source.id, name: source.name, leads: leadCount });
    }

    return { imported };
  }

  async updateForUser(userId: string, id: string, body: Record<string, unknown>) {
    const patch: {
      leadStatus?: string | null;
      reason?: string | null;
      callDone?: string | null;
      comment?: string | null;
      followUpRequired?: string | null;
      converted?: string | null;
    } = {};

    const setMaybe = (
      key: keyof typeof patch,
      value: unknown,
      maxLen: number
    ): void => {
      if (value === undefined) return;
      if (value === null || value === "") {
        patch[key] = null;
        return;
      }
      if (typeof value !== "string") {
        throw new BadRequestException(`${String(key)} must be a string`);
      }
      patch[key] = value.trim().slice(0, maxLen) || null;
    };

    setMaybe("reason", body.reason, 300);
    setMaybe("callDone", body.callDone ?? body.call_done, 120);
    setMaybe("comment", body.comment, 5000);
    setMaybe("followUpRequired", body.followUpRequired ?? body.follow_up_required, 120);
    setMaybe("converted", body.converted, 120);
    setMaybe("leadStatus", body.leadStatus ?? body.lead_status, 120);

    if (Object.keys(patch).length === 0) {
      const existing = await this.db.lead.findFirst({
        where: { id, leadSource: { userId } },
      });
      return existing ? toLeadDto(existing) : null;
    }

    const res = await this.db.lead.updateMany({
      where: { id, leadSource: { userId } },
      data: patch,
    });
    if (res.count === 0) return null;

    const fresh = await this.db.lead.findUnique({ where: { id } });
    return fresh ? toLeadDto(fresh) : null;
  }

  async deleteForUser(userId: string, id: string) {
    try {
      const res = await this.db.lead.deleteMany({
        where: { id, leadSource: { userId } },
      });
      return res.count > 0;
    } catch (e) {
      this.rethrowIfMissingTables(e);
    }
  }

}

