import helmet from "helmet";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { SocketIoAdapter } from "./realtime/socket-io.adapter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: false,
  });
  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT", 4001);

  app.use(helmet());
  app.enableCors({
    origin: allowlist(configService.get<string>("WEB_APP_ORIGINS", "http://localhost:3000")),
    credentials: true,
  });
  app.useWebSocketAdapter(new SocketIoAdapter(app, configService));
  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`WS gateway listening on http://localhost:${port}`);
}

function allowlist(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

void bootstrap();
