import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Saved drag-and-drop orders can exceed the 100kb default for large lists.
  app.useBodyParser("json", { limit: "1mb" });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    })
  );
  const defaultOrigins = [
    "https://app.vpdm.in",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
  ];
  const envOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin: string) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    // Always allow the live site, even if the server .env still lists an old domain
    origin: Array.from(new Set([...defaultOrigins, ...envOrigins])),
    credentials: true,
  });
  app.setGlobalPrefix("api");

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, "127.0.0.1");
  console.log(`Daily task API (NestJS) listening on http://127.0.0.1:${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
