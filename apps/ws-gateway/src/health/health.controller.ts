import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return {
      status: "ok",
      service: "ws-gateway",
      timestamp: new Date().toISOString(),
    };
  }
}
