import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { errorHandler } from "./middleware/errorHandler";
import authRouter from "./routes/auth";
import brandingRouter from "./routes/branding";
import superAdminStatsRouter from "./routes/super-admin/stats";
import { themesRouter, subThemesRouter, subSubThemesRouter } from "./routes/super-admin/themes";
import superAdminQuestionsRouter from "./routes/super-admin/questions";
import superAdminClientsRouter from "./routes/super-admin/clients";
import superAdminSettingsRouter from "./routes/super-admin/settings";
import superAdminTestsRouter from "./routes/super-admin/tests";
import superAdminMessagesRouter from "./routes/super-admin/messages";
import superAdminResponsesRouter from "./routes/super-admin/responses";
import adminDashboardRouter from "./routes/admin/dashboard";
import adminTestsRouter from "./routes/admin/tests";
import adminEmployeesRouter from "./routes/admin/employees";
import adminSettingsRouter from "./routes/admin/settings";
import adminMessagesRouter from "./routes/admin/messages";
import adminNotificationsRouter from "./routes/admin/notifications";
import adminRetakeRequestsRouter from "./routes/admin/retakeRequests";
import participantRouter from "./routes/participant/index";

dotenv.config();

const app = express();
const allowedOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || true;

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/branding", brandingRouter);
app.use("/api/super-admin/stats", superAdminStatsRouter);
app.use("/api/super-admin/themes", themesRouter);
app.use("/api/super-admin/sub-themes", subThemesRouter);
app.use("/api/super-admin/sub-sub-themes", subSubThemesRouter);
app.use("/api/super-admin/questions", superAdminQuestionsRouter);
app.use("/api/super-admin/clients", superAdminClientsRouter);
app.use("/api/super-admin/platform-settings", superAdminSettingsRouter);
app.use("/api/super-admin/tests", superAdminTestsRouter);
app.use("/api/super-admin/messages", superAdminMessagesRouter);
app.use("/api/super-admin/responses", superAdminResponsesRouter);
app.use("/api/admin/dashboard", adminDashboardRouter);
app.use("/api/admin/tests", adminTestsRouter);
app.use("/api/admin/employees", adminEmployeesRouter);
app.use("/api/admin/settings", adminSettingsRouter);
app.use("/api/admin/messages", adminMessagesRouter);
app.use("/api/admin/notifications", adminNotificationsRouter);
app.use("/api/admin/retake-requests", adminRetakeRequestsRouter);
app.use("/api/participant", participantRouter);

app.use(errorHandler);

export default app;
