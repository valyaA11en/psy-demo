import { NotificationChannel, Prisma } from "@prisma/client";

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  dedupKey: string;
  payloadJson?: Prisma.InputJsonValue | null;
  channel?: NotificationChannel;
}
