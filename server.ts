import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";

import multer from "multer";
import { unlink } from "fs/promises";
import { runAgent } from "./server/agent.js";
import { ingestData } from "./server/ingest.js";

dotenv.config();

const upload = multer({ dest: "uploads/" });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Slitch AI Agentic RAG Route
  app.post("/api/chat", async (req, res) => {
    const { messages } = req.body;
    const lastMessage = messages[messages.length - 1];

    try {
      // Use Agentic RAG if Pinecone + Ollama are configured
      if (
        process.env.PINECONE_API_KEY &&
        process.env.PINECONE_INDEX &&
        (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_CHAT_MODEL)
      ) {
        const result = await runAgent({ message: lastMessage.content });
        return res.json({ content: result.output });
      }

      // Fallback
      return res.status(400).json({
        error:
          "RAG system not configured. Set PINECONE_API_KEY, PINECONE_INDEX, and Ollama settings.",
      });
    } catch (error) {
      console.error("Agent Error:", error);
      res.status(500).json({ error: "Failed to process request with Slitch Agent." });
    }
  });

  // Data Ingestion Route
  app.post("/api/ingest", upload.single("file"), async (req, res) => {
    try {
      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded." });
      }

      await ingestData(file.path);
      await unlink(file.path).catch(() => undefined);

      res.json({ success: true, message: "Documentation ingested successfully." });
    } catch (error: any) {
      console.error("Ingestion Error:", error);
      res.status(500).json({ error: error.message || "Failed to ingest data." });
    }
  });

  // API Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
