import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function clean(v: unknown, maxLen: number): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s.slice(0, maxLen);
}

function toDto(row: {
  id: string;
  name: string;
  brandName: string;
  categories: string;
  platform: string;
  location: string;
  monthSale: string;
  mobileNo: string;
  email: string;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    brandName: row.brandName,
    categories: row.categories,
    platform: row.platform,
    location: row.location,
    monthSale: row.monthSale,
    mobileNo: row.mobileNo,
    email: row.email,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ImportantClientLeadsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): any {
    return this.prisma as any;
  }

  private rethrowIfMissingTable(e: unknown): never {
    const msg =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Database error";
    if (msg.includes("public.important_client_leads") || msg.includes("does not exist")) {
      throw new ServiceUnavailableException(
        "Important Client Leads table is not present in the database yet. Apply the migration (create `important_client_leads`) and restart the API."
      );
    }
    throw e as Error;
  }

  async listForUser(userId: string) {
    try {
      const rows = await this.db.importantClientLead.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }],
      });
      return rows.map((r: any) => toDto(r));
    } catch (e) {
      this.rethrowIfMissingTable(e);
    }
  }

  async createForUser(userId: string, body: Record<string, unknown>) {
    const name = clean(body.name, 200);
    if (!name) throw new BadRequestException("Name is required");

    try {
      const saved = await this.db.importantClientLead.create({
        data: {
          id: randomUUID(),
          userId,
          name,
          brandName: clean(body.brandName ?? body.brand_name, 200),
          categories: clean(body.categories, 200),
          platform: clean(body.platform, 120),
          location: clean(body.location, 120),
          monthSale: clean(body.monthSale ?? body.month_sale, 120),
          mobileNo: clean(body.mobileNo ?? body.mobile_no, 60),
          email: clean(body.email, 200).toLowerCase(),
          comment: clean(body.comment, 5000),
        },
      });
      return toDto(saved);
    } catch (e) {
      this.rethrowIfMissingTable(e);
    }
  }

  async updateForUser(userId: string, id: string, body: Record<string, unknown>) {
    const patch: Record<string, string> = {};

    const maybeSet = (key: string, value: unknown, maxLen: number, lower = false) => {
      if (value === undefined) return;
      const v = clean(value, maxLen);
      patch[key] = lower ? v.toLowerCase() : v;
    };

    maybeSet("name", body.name, 200);
    maybeSet("brandName", body.brandName ?? body.brand_name, 200);
    maybeSet("categories", body.categories, 200);
    maybeSet("platform", body.platform, 120);
    maybeSet("location", body.location, 120);
    maybeSet("monthSale", body.monthSale ?? body.month_sale, 120);
    maybeSet("mobileNo", body.mobileNo ?? body.mobile_no, 60);
    maybeSet("email", body.email, 200, true);
    maybeSet("comment", body.comment, 5000);

    if (Object.keys(patch).length === 0) {
      try {
        const existing = await this.db.importantClientLead.findFirst({
          where: { id, userId },
        });
        return existing ? toDto(existing) : null;
      } catch (e) {
        this.rethrowIfMissingTable(e);
      }
    }

    try {
      const res = await this.db.importantClientLead.updateMany({
        where: { id, userId },
        data: patch,
      });
      if (res.count === 0) return null;
      const fresh = await this.db.importantClientLead.findUnique({ where: { id } });
      return fresh ? toDto(fresh) : null;
    } catch (e) {
      this.rethrowIfMissingTable(e);
    }
  }

  async removeForUser(userId: string, id: string): Promise<boolean> {
    try {
      const res = await this.db.importantClientLead.deleteMany({
        where: { id, userId },
      });
      return res.count > 0;
    } catch (e) {
      this.rethrowIfMissingTable(e);
    }
  }
}

