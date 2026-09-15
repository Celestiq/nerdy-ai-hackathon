import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { api } from "./routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

const app = express();
app.use(express.json());
app.use("/api", api);
app.use(express.static(PUBLIC_DIR));

const PORT = Number(process.env.PORT ?? 5173);
app.listen(PORT, () => {
  console.log(`nerdy-ai listening on http://localhost:${PORT}`);
  console.log(`  child client:  http://localhost:${PORT}/child/`);
  console.log(`  tutor view:    http://localhost:${PORT}/tutor/`);
});
