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
  app.enableCors({
    origin: [
      "http://127.0.0.1:5173",
      "http://localhost:5173",
      "http://127.0.0.1:5174",
      "http://localhost:5174",
      "http://127.0.0.1:5175",
      "http://localhost:5175",
    ],
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
