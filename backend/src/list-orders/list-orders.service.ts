import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const LIST_KEY_PATTERN = /^[a-z0-9-]{1,60}$/;
const MAX_ITEMS = 10000;
const MAX_ID_LENGTH = 200;

function toIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

@Injectable()
export class ListOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(userId: string): Promise<Record<string, string[]>> {
    const rows = await this.prisma.userListOrder.findMany({ where: { userId } });
    const result: Record<string, string[]> = {};
    for (const row of rows) result[row.listKey] = toIds(row.itemIds);
    return result;
  }

  async saveForUser(userId: string, listKey: string, body: Record<string, unknown>) {
    if (!LIST_KEY_PATTERN.test(listKey)) {
      throw new BadRequestException("Invalid list key");
    }
    const raw = body.itemIds;
    if (
      !Array.isArray(raw) ||
      raw.length > MAX_ITEMS ||
      raw.some((v) => typeof v !== "string" || v.length === 0 || v.length > MAX_ID_LENGTH)
    ) {
      throw new BadRequestException("itemIds must be a list of ids");
    }
    const itemIds = Array.from(new Set(raw as string[]));
    await this.prisma.userListOrder.upsert({
      where: { userId_listKey: { userId, listKey } },
      create: { id: randomUUID(), userId, listKey, itemIds },
      update: { itemIds },
    });
    return { listKey, itemIds };
  }
}
