import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { Frequency, ImportedTask, Priority, TaskDTO } from "./task.types";
import {
  isFrequency,
  isImportedTask,
  isPriority,
  isRepeatDayOfMonth,
  isRepeatWeekday,
  normalizeImportedTask,
} from "./task.validation";

type TaskRecord = {
  id: number;
  title: string;
  notes: string;
  priority: string;
  frequency: string;
  repeatWeekday: string | null;
  repeatDayOfMonth: number | null;
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  category: string | null;
};

function optStr(val: unknown, max: number): string | null {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val !== "string") return null;
  const s = val.trim();
  return s.length ? s.slice(0, max) : null;
}

function optRepeatDayOfMonth(val: unknown): number | null {
  if (val === undefined || val === null) return null;
  if (isRepeatDayOfMonth(val)) return val;
  if (typeof val === "string" && val) {
    const n = Number.parseInt(val, 10);
    if (Number.isInteger(n) && n >= 1 && n <= 31) return n;
  }
  return null;
}

function isIsoDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function startOfKolkataDay(d: Date): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value ?? 1970);
  const m = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? 1);
  return new Date(Date.UTC(y, m - 1, day));
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(task: TaskRecord): TaskDTO {
    return {
      id: task.id,
      title: task.title,
      notes: task.notes,
      priority: task.priority as Priority,
      frequency: task.frequency as Frequency,
      startDate: task.startDate.toISOString().slice(0, 10),
      endDate: task.endDate ? task.endDate.toISOString().slice(0, 10) : null,
      repeatWeekday: task.repeatWeekday,
      repeatDayOfMonth: task.repeatDayOfMonth,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      category: task.category,
    };
  }

  async findAllForUser(userId: string): Promise<TaskDTO[]> {
    const rows = await this.prisma.taskSeries.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((t: TaskRecord) => this.toDto(t));
  }

  async createForUser(
    userId: string,
    body: Record<string, unknown>
  ): Promise<TaskDTO> {
    const title =
      typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    if (!title) {
      throw new BadRequestException("title is required");
    }
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 2000) : "";
    const priority = isPriority(body.priority) ? body.priority : "medium";
    const frequency = isFrequency(body.frequency) ? body.frequency : "daily";
    const repeatWeekday = isRepeatWeekday(body.repeatWeekday)
      ? body.repeatWeekday
      : null;
    const repeatDayOfMonth = optRepeatDayOfMonth(body.repeatDayOfMonth);
    const startDate = startOfKolkataDay(new Date());

    const saved = await this.prisma.taskSeries.create({
      data: {
        title,
        notes,
        priority,
        frequency,
        repeatWeekday,
        repeatDayOfMonth,
        startDate,
        endDate: null,
        userId,
        category: optStr(body.category, 120),
      },
    });
    return this.toDto(saved as TaskRecord);
  }

  async updateForUser(
    userId: string,
    id: number,
    body: Record<string, unknown>
  ): Promise<TaskDTO | null> {
    const existing = await this.prisma.taskSeries.findFirst({
      where: { id, userId },
    });
    if (!existing) return null;

    const data: {
      title?: string;
      notes?: string;
      priority?: string;
      frequency?: string;
      repeatWeekday?: string | null;
      repeatDayOfMonth?: number | null;
      category?: string | null;
    } = {};

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        throw new BadRequestException("title invalid");
      }
      data.title = body.title.trim().slice(0, 200);
    }
    if (body.notes !== undefined) {
      data.notes =
        typeof body.notes === "string" ? body.notes.slice(0, 2000) : "";
    }
    if (body.priority !== undefined) {
      if (!isPriority(body.priority)) {
        throw new BadRequestException("priority invalid");
      }
      data.priority = body.priority;
    }
    if (body.frequency !== undefined) {
      if (!isFrequency(body.frequency)) {
        throw new BadRequestException("frequency invalid");
      }
      data.frequency = body.frequency;
    }
    if (body.repeatWeekday !== undefined) {
      data.repeatWeekday = isRepeatWeekday(body.repeatWeekday)
        ? body.repeatWeekday
        : null;
    }

    if (body.repeatDayOfMonth !== undefined) {
      data.repeatDayOfMonth = optRepeatDayOfMonth(body.repeatDayOfMonth);
    }
    if (body.category !== undefined) {
      data.category = optStr(body.category, 120);
    }

    if (Object.keys(data).length === 0) {
      return this.toDto(existing as TaskRecord);
    }

    const saved = await this.prisma.taskSeries.update({
      where: { id },
      data,
    });
    return this.toDto(saved as TaskRecord);
  }

  async removeForUser(
    userId: string,
    id: number,
    endDateIso?: string
  ): Promise<boolean> {
    const existing = await this.prisma.taskSeries.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) return false;

    let endDate: Date;
    if (endDateIso !== undefined) {
      if (!isIsoDate(endDateIso)) {
        throw new BadRequestException("endDate must be YYYY-MM-DD");
      }
      endDate = new Date(`${endDateIso}T00:00:00.000Z`);
    } else {
      endDate = startOfKolkataDay(new Date());
    }

    await this.prisma.taskSeries.update({
      where: { id },
      data: { endDate },
    });
    return true;
  }

  async replaceAllFromImportForUser(
    userId: string,
    tasks: ImportedTask[]
  ): Promise<TaskDTO[]> {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.taskSeries.deleteMany({ where: { userId } });
      for (const t of tasks) {
        const created = new Date(t.createdAt);
        const createdAt = Number.isNaN(created.getTime())
          ? new Date()
          : created;
        const startDate = startOfKolkataDay(createdAt);
        await tx.taskSeries.create({
          data: {
            title: t.title.slice(0, 200),
            notes: (t.notes || "").slice(0, 2000),
            priority: t.priority,
            frequency: t.frequency,
            repeatWeekday: t.repeatWeekday,
            repeatDayOfMonth: t.repeatDayOfMonth,
            createdAt,
            updatedAt: new Date(t.updatedAt),
            startDate,
            endDate: t.endDate ? new Date(`${t.endDate}T00:00:00.000Z`) : null,
            userId,
            category: t.category,
          },
        });
      }
    });
    return this.findAllForUser(userId);
  }

  async findCompletionTaskIdsForDate(
    userId: string,
    date: string
  ): Promise<{ taskIds: number[] }> {
    if (!isIsoDate(date)) {
      throw new BadRequestException("date must be YYYY-MM-DD");
    }
    const rows = await this.prisma.taskCompletion.findMany({
      where: {
        date: new Date(`${date}T12:00:00.000Z`),
        taskSeries: { userId },
      },
      select: { taskId: true },
    });
    return { taskIds: rows.map((r: { taskId: number }) => r.taskId) };
  }

  async setCompletionForDate(
    userId: string,
    taskId: number,
    date: string,
    completed: boolean
  ): Promise<boolean> {
    if (!isIsoDate(date)) {
      throw new BadRequestException("date must be YYYY-MM-DD");
    }
    const existing = await this.prisma.taskSeries.findFirst({
      where: { id: taskId, userId },
      select: { id: true },
    });
    if (!existing) return false;

    const day = new Date(`${date}T12:00:00.000Z`);
    if (completed) {
      await this.prisma.taskCompletion.upsert({
        where: {
          taskId_date: {
            taskId,
            date: day,
          },
        },
        update: {
          completedAt: new Date(),
        },
        create: {
          taskId,
          date: day,
        },
      });
      return true;
    }

    await this.prisma.taskCompletion.deleteMany({
      where: {
        taskId,
        date: day,
      },
    });
    return true;
  }

  filterImportedTasks(raw: unknown[]): ImportedTask[] {
    return raw
      .filter(isImportedTask)
      .map((o) => normalizeImportedTask(o as Record<string, unknown>));
  }
}
