import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
    "http://127.0.0.1:5173",
    "http://localhost:5173",
  ];
  const envOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin: string) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: envOrigins.length > 0 ? envOrigins : defaultOrigins,
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
