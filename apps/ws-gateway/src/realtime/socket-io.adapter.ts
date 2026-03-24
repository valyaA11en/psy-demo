import { IoAdapter } from "@nestjs/platform-socket.io";
import { ConfigService } from "@nestjs/config";
import type { INestApplicationContext } from "@nestjs/common";
import type { ServerOptions } from "socket.io";

export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly configService: ConfigService,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const path = this.configService.get<string>("WS_PATH", "/ws/socket.io");
    const origins = this.configService
      .get<string>("WEB_APP_ORIGINS", "http://localhost:3000")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return super.createIOServer(port, {
      ...options,
      path,
      cors: {
        origin: origins,
        credentials: true,
      },
      transports: ["websocket"],
    });
  }
}
