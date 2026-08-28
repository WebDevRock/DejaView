import path from "node:path";
import { openDatabase } from "./scripts-safe/connection";
import { runMigrations } from "./scripts-safe/migrator";

function main(): void {
  const connection = openDatabase();
  try {
    const result = runMigrations(
      connection.sqlite,
      path.resolve(process.cwd(), "migrations"),
    );
    console.log(
      result.applied.length === 0
        ? "Database is up to date."
        : `Applied: ${result.applied.join(", ")}`,
    );
  } finally {
    connection.close();
  }
}

main();
