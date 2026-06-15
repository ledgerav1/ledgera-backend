import app from "./app";
import dotenv from "dotenv";
import path from "path";
import { startBackupCronJobs } from "./backup/backupService";
import { startRestoreTestCronJobs } from "./backup/restoreTestService";
import { startTokenRefreshCronJobs } from "./jobs/tokenRefresh";

dotenv.config({
  // Works whether we're running from project root or directly from dist/
  path: path.resolve(__dirname, "..", "..", ".env"),
});

startBackupCronJobs();
startRestoreTestCronJobs();
startTokenRefreshCronJobs();

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`✅ Ledgera backend running on port ${PORT}`);
});
