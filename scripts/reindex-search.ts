import path from "node:path";
import { openDatabase } from "./scripts-safe/connection";
import { runMigrations } from "./scripts-safe/migrator";
import { repairSearchProjection } from "../src/infrastructure/search/projection-repair";
function main() {
  const connection = openDatabase();
  try {
    runMigrations(connection.sqlite, path.resolve(process.cwd(), "migrations"));
    const report = repairSearchProjection(connection.sqlite);
    console.log(`Search projection repaired: ${report.documents} documents.`);
  } finally {
    connection.close();
  }
}
main();
