import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { RedisEventsSubscriber } from "./redis-events.subscriber";
import { RealtimeGateway } from "./realtime.gateway";
import { WsAuthService } from "./ws-auth.service";

@Module({
  imports: [JwtModule.register({})],
  providers: [WsAuthService, RealtimeGateway, RedisEventsSubscriber],
})
export class RealtimeModule {}
