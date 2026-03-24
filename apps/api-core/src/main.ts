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
  const webAppOrigin = configService.get<string>("WEB_APP_ORIGIN", "http://localhost:3000");
  const swaggerEnabled = configService.get<string>("SWAGGER_ENABLED", "true") === "true";

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
    origin: [webAppOrigin],
    credentials: true,
  });

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Consultations API Core")
      .setDescription("Core API for consultations with a psychologist platform")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  await app.listen(port);
  console.log(`API core listening on http://localhost:${port}`);
}

void bootstrap();
