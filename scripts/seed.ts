import path from "node:path";
import { openDatabase } from "./scripts-safe/connection";
import { runMigrations } from "./scripts-safe/migrator";
import { seedSampleData } from "./scripts-safe/seed";

function main(): void {
  const connection = openDatabase();
  try {
    runMigrations(connection.sqlite, path.resolve(process.cwd(), "migrations"));
    seedSampleData(connection.sqlite);
    console.log("Deterministic sample data is ready.");
  } finally {
    connection.close();
  }
}

main();
