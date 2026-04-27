import express from "express";
import cors from "cors";
import apiRouter from "../src/lib/api-router";

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(
  cors({
    origin: [
      "https://architex.co.za",
      "https://architex-marketplace.vercel.app",
      /\.vercel\.app$/,
    ],
    credentials: true,
  })
);

// Mount the shared API router
app.use("/api", apiRouter);

export default app;
