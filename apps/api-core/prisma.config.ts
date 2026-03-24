import { loadEnvFile } from "node:process";
import { defineConfig } from "prisma/config";

loadEnvFile();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
