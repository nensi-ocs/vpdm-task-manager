import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type PipelineStageKey =
  | "lead_generated"
  | "lead_qualified"
  | "initial_contact"
  | "proposal_shared"
  | "follow_up"
  | "deal_won"
  | "onboarding"
  | "deal_lost";

/** Linear “Next” path: 1→2→…→5→6 (won)→7. Step 6 branch “lost” uses mark-lost, not advance. */
const NEXT_STAGE: Partial<Record<PipelineStageKey, PipelineStageKey>> = {
  lead_generated: "lead_qualified",
  lead_qualified: "initial_contact",
  initial_contact: "proposal_shared",
  proposal_shared: "follow_up",
  follow_up: "deal_won",
  deal_won: "onboarding",
};

const STAGES: { key: PipelineStageKey; label: string; order: number }[] = [
  { key: "lead_generated", label: "Lead Generated", order: 1 },
  { key: "lead_qualified", label: "Lead Qualified", order: 2 },
  { key: "initial_contact", label: "Initial Contact / Discovery Call", order: 3 },
  { key: "proposal_shared", label: "Proposal / Pitch Shared", order: 4 },
  { key: "follow_up", label: "Follow-Up", order: 5 },
  { key: "deal_won", label: "Deal Won (Converted Client)", order: 6 },
  { key: "deal_lost", label: "Deal Lost", order: 6 },
  { key: "onboarding", label: "Onboarding", order: 7 },
];

const SOURCES = [
  "ads",
  "referral",
  "website",
  "whatsapp",
  "call",
  "other",
  "unknown",
] as const;
type PipelineSource = (typeof SOURCES)[number];

function normalizeSource(value: unknown): PipelineSource {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return "unknown";
  return (SOURCES as readonly string[]).includes(raw) ? (raw as PipelineSource) : "other";
}

function stageByKey(key: string) {
  return STAGES.find((s) => s.key === key);
}

function toDto(row: {
  id: string;
  clientName: string;
  source: string;
  stage: string;
  stageOrder: number;
  lostReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const s = stageByKey(row.stage);
  return {
    id: row.id,
    clientName: row.clientName,
    source: row.source,
    stage: row.stage,
    stageLabel: s?.label ?? row.stage,
    stageOrder: row.stageOrder,
    lostReason: row.lostReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Step order first; at step 6, Deal Won before Deal Lost; then client name. */
function sortPipelineClientsByStep<
  T extends { stage: string; stageOrder: number; clientName: string },
>(rows: T[]): T[] {
  const rank = (k: string) => (k === "deal_won" ? 0 : k === "deal_lost" ? 1 : 2);
  return [...rows].sort((a, b) => {
    if (a.stageOrder !== b.stageOrder) return a.stageOrder - b.stageOrder;
    const stageTie = rank(a.stage) - rank(b.stage);
    if (stageTie !== 0) return stageTie;
    return a.clientName.localeCompare(b.clientName);
  });
}

@Injectable()
export class PipelineClientsService {
  constructor(private readonly prisma: PrismaService) {}

  listStages() {
    return STAGES;
  }

  async findAllForUser(userId: string) {
    const rows = await this.prisma.pipelineClient.findMany({
      where: { userId },
    });
    return sortPipelineClientsByStep(rows.map((r) => toDto(r)));
  }

  async createForUser(userId: string, body: Record<string, unknown>) {
    const clientName =
      typeof body.clientName === "string" ? body.clientName.trim().slice(0, 200) : "";
    const source = normalizeSource((body as { source?: unknown }).source);
    if (!clientName) {
      throw new BadRequestException("clientName is required");
    }

    const first = STAGES[0];
    try {
      const saved = await this.prisma.pipelineClient.create({
        data: {
          clientName,
          source,
          stage: first.key,
          stageOrder: first.order,
          userId,
        },
      });
      return toDto(saved);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("Client already exists");
      }
      throw e;
    }
  }

  async updateForUser(userId: string, id: string, body: Record<string, unknown>) {
    const patch: { clientName?: string; source?: string } = {};

    if (body.clientName !== undefined) {
      const clientName =
        typeof body.clientName === "string" ? body.clientName.trim().slice(0, 200) : "";
      if (!clientName) throw new BadRequestException("clientName is required");
      patch.clientName = clientName;
    }
    if ((body as { source?: unknown }).source !== undefined) {
      patch.source = normalizeSource((body as { source?: unknown }).source);
    }

    if (Object.keys(patch).length === 0) {
      const existing = await this.prisma.pipelineClient.findFirst({
        where: { id, userId },
      });
      return existing ? toDto(existing) : null;
    }

    try {
      const res = await this.prisma.pipelineClient.updateMany({
        where: { id, userId },
        data: patch,
      });
      if (res.count === 0) return null;
      const fresh = await this.prisma.pipelineClient.findUnique({ where: { id } });
      return fresh ? toDto(fresh) : null;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("Client already exists");
      }
      throw e;
    }
  }

  async removeForUser(userId: string, id: string) {
    const res = await this.prisma.pipelineClient.deleteMany({ where: { id, userId } });
    return res.count > 0;
  }

  async advanceOneStep(userId: string, id: string) {
    const row = await this.prisma.pipelineClient.findFirst({ where: { id, userId } });
    if (!row) return null;

    if (!stageByKey(row.stage)) {
      throw new BadRequestException("Invalid stage stored for client");
    }

    const isTerminal = row.stage === "deal_lost" || row.stage === "onboarding";
    if (isTerminal) {
      throw new BadRequestException("Client is already in a terminal stage");
    }

    const nextKey = NEXT_STAGE[row.stage as PipelineStageKey];
    if (!nextKey) {
      throw new BadRequestException("No next stage available");
    }

    const next = stageByKey(nextKey);
    if (!next) {
      throw new BadRequestException("Invalid next stage configuration");
    }

    const updated = await this.prisma.pipelineClient.update({
      where: { id },
      data: {
        stage: next.key,
        stageOrder: next.order,
        lostReason: null,
      },
    });
    return toDto(updated);
  }

  async markLost(userId: string, id: string, reason: string | null) {
    const row = await this.prisma.pipelineClient.findFirst({ where: { id, userId } });
    if (!row) return null;
    const lost = stageByKey("deal_lost")!;
    const r = (reason ?? "").trim().slice(0, 300);
    if (!r) {
      throw new BadRequestException("lostReason is required");
    }
    const updated = await this.prisma.pipelineClient.update({
      where: { id },
      data: {
        stage: lost.key,
        stageOrder: lost.order,
        lostReason: r,
      },
    });
    return toDto(updated);
  }
}

