import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type FollowupRow = {
  id: string;
  track: string;
  clientName: string;
  owner: string | null;
  createdAt: Date;
};

function toDto(row: FollowupRow) {
  return {
    id: row.id,
    track: row.track,
    clientName: row.clientName,
    owner: row.owner,
    createdAt: row.createdAt.toISOString(),
  };
}

function isIsoDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

@Injectable()
export class FollowupClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(userId: string) {
    const rows = await this.prisma.followupClient.findMany({
      where: { userId },
      orderBy: [{ track: "asc" }, { clientName: "asc" }],
    });
    return rows.map((r: FollowupRow) => toDto(r));
  }

  async createForUser(userId: string, body: Record<string, unknown>) {
    const track = typeof body.track === "string" ? body.track.trim().slice(0, 120) : "";
    const clientName =
      typeof body.clientName === "string" ? body.clientName.trim().slice(0, 200) : "";
    const ownerRaw = typeof body.owner === "string" ? body.owner.trim().slice(0, 120) : "";
    const owner = ownerRaw || null;
    if (!track || !clientName) {
      throw new BadRequestException("track and clientName are required");
    }
    try {
      const saved = await this.prisma.followupClient.create({
        data: { id: randomUUID(), track, clientName, owner, userId },
      });
      return toDto(saved as FollowupRow);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException("Client already exists in this track");
      }
      throw e;
    }
  }

  async updateForUser(userId: string, id: string, body: Record<string, unknown>) {
    const patch: { track?: string; clientName?: string; owner?: string | null } = {};
    if (body.track !== undefined) {
      const track =
        typeof body.track === "string" ? body.track.trim().slice(0, 120) : "";
      if (!track) throw new BadRequestException("track is required");
      patch.track = track;
    }
    if (body.clientName !== undefined) {
      const clientName =
        typeof body.clientName === "string"
          ? body.clientName.trim().slice(0, 200)
          : "";
      if (!clientName) throw new BadRequestException("clientName is required");
      patch.clientName = clientName;
    }
    if (body.owner !== undefined) {
      const ownerRaw =
        typeof body.owner === "string" ? body.owner.trim().slice(0, 120) : "";
      patch.owner = ownerRaw || null;
    }
    if (Object.keys(patch).length === 0) {
      const existing = await this.prisma.followupClient.findFirst({
        where: { id, userId },
      });
      return existing ? toDto(existing as FollowupRow) : null;
    }
    try {
      const res = await this.prisma.followupClient.updateMany({
        where: { id, userId },
        data: patch,
      });
      if (res.count === 0) return null;
      const fresh = await this.prisma.followupClient.findUnique({ where: { id } });
      return fresh ? toDto(fresh as FollowupRow) : null;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException("Client already exists in this track");
      }
      throw e;
    }
  }

  async removeForUser(userId: string, id: string) {
    const res = await this.prisma.followupClient.deleteMany({ where: { id, userId } });
    return res.count > 0;
  }

  async findCompletionClientIdsForDate(
    userId: string,
    date: string
  ): Promise<{ clientIds: string[] }> {
    if (!isIsoDate(date)) {
      throw new BadRequestException("date must be YYYY-MM-DD");
    }
    const rows = await this.prisma.followupCompletion.findMany({
      where: {
        date: new Date(`${date}T12:00:00.000Z`),
        followupClient: { userId },
      },
      select: { followupClientId: true },
    });
    return { clientIds: rows.map((r) => r.followupClientId) };
  }

  async setCompletionForDate(
    userId: string,
    followupClientId: string,
    date: string,
    completed: boolean
  ): Promise<boolean> {
    if (!isIsoDate(date)) {
      throw new BadRequestException("date must be YYYY-MM-DD");
    }
    const existing = await this.prisma.followupClient.findFirst({
      where: { id: followupClientId, userId },
      select: { id: true },
    });
    if (!existing) return false;

    const day = new Date(`${date}T12:00:00.000Z`);
    if (completed) {
      await this.prisma.followupCompletion.upsert({
        where: {
          followupClientId_date: {
            followupClientId,
            date: day,
          },
        },
        update: {
          completedAt: new Date(),
        },
        create: {
          followupClientId,
          date: day,
        },
      });
      return true;
    }

    await this.prisma.followupCompletion.deleteMany({
      where: {
        followupClientId,
        date: day,
      },
    });
    return true;
  }
}
