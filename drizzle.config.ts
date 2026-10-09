import { defineConfig } from "drizzle-kit";

const driver = (process.env.DATABASE_DRIVER ?? "sqlite").toLowerCase();
const databaseUrl =
  process.env.DATABASE_URL ??
  (driver === "postgres"
    ? "postgres://localhost:5432/gym_ai"
    : "file:./data/leads.db");

export default driver === "postgres"
  ? defineConfig({
      schema: "./lib/db/pg-schema.ts",
      out: "./drizzle/postgres",
      dialect: "postgresql",
      dbCredentials: { url: databaseUrl },
    })
  : defineConfig({
      schema: "./lib/db/schema.ts",
      out: "./drizzle/sqlite",
      dialect: "sqlite",
      dbCredentials: { url: databaseUrl },
    });
