import { randomUUID } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT", 4000);
  const webAppOrigins = parseAllowlist(
    configService.get<string>(
      "WEB_APP_ORIGINS",
      configService.get<string>("WEB_APP_ORIGIN", "http://localhost:3000"),
    ),
  );
  const swaggerEnabled = configService.get<string>("SWAGGER_ENABLED", "false") === "true";

  app.setGlobalPrefix("api/v1");
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    (req as any).requestId = req.headers["x-request-id"] || randomUUID();
    res.setHeader("x-request-id", String((req as any).requestId));
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.enableCors({
    origin: webAppOrigins,
    credentials: true,
  });

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("API платформы консультаций с психологом")
      .setDescription("Основной API для платформы онлайн-консультаций с психологом")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  await app.listen(port);
  console.log(`API core запущен на http://localhost:${port}`);
}

function parseAllowlist(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

void bootstrap();
