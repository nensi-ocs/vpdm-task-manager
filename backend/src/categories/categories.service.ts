import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type CategoryRow = {
  id: string;
  name: string;
  createdAt: Date;
};

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(userId: string) {
    const rows = await this.prisma.category.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });
    return rows.map((c: CategoryRow) => ({
      id: c.id,
      name: c.name,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async createForUser(userId: string, body: Record<string, unknown>) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) {
      throw new BadRequestException("Category name is required");
    }
    try {
      const saved = await this.prisma.category.create({
        data: { id: randomUUID(), name, userId },
      });
      return {
        id: saved.id,
        name: saved.name,
        createdAt: saved.createdAt.toISOString(),
      };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException("Category already exists");
      }
      throw e;
    }
  }

  async removeForUser(userId: string, id: string): Promise<boolean> {
    const res = await this.prisma.category.deleteMany({ where: { id, userId } });
    return res.count > 0;
  }

  async updateForUser(
    userId: string,
    id: string,
    body: Record<string, unknown>
  ) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) {
      throw new BadRequestException("Category name is required");
    }
    try {
      const saved = await this.prisma.category.updateMany({
        where: { id, userId },
        data: { name },
      });
      if (saved.count === 0) return null;
      const fresh = await this.prisma.category.findUnique({ where: { id } });
      if (!fresh) return null;
      return {
        id: fresh.id,
        name: fresh.name,
        createdAt: fresh.createdAt.toISOString(),
      };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException("Category already exists");
      }
      throw e;
    }
  }
}
