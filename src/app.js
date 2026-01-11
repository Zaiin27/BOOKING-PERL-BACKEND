import express from "express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import chalk from "chalk";
import errorMiddleware from "./middlewares/defaultError.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import supportRoutes from "./routes/supportRoutes.js";
import propertyRoutes from "./routes/propertyRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import siteSettingRoutes from "./routes/siteSettingRoutes.js";
import planRoutes from "./routes/planRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import bannerAdRoutes from "./routes/bannerAdRoutes.js";
import {
  stripeWebhook,
  stripeWebhookMiddleware,
} from "./controllers/stripeWebhookController.js";

const app = express();
app.post("/api/webhooks/stripe", stripeWebhookMiddleware, stripeWebhook);
// stripe listen --forward-to localhost:8001/api/webhooks/stripe
app.use(express.json({ limit: '100mb' }));
app.use(helmet());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: ["http://localhost:5181", "https://me.senew-tech.com", "https://booking-perl.vercel.app", "http://192.168.0.100:5181"],
    credentials: true,
  })
);

const colorByStatus = (status, message) => {
  if (status >= 500) return chalk.red(message); // Server error
  if (status >= 400) return chalk.yellow(message); // Client error
  if (status >= 300) return chalk.cyan(message); // Redirection
  if (status >= 200) return chalk.green(message); // Success
  return chalk.white(message); // Info / Others
};

app.use(
  morgan((tokens, req, res) => {
    const method = tokens.method(req, res);
    const url = tokens.url(req, res);
    const status = Number(tokens.status(req, res));
    const responseTime = tokens["response-time"](req, res);

    const rawMessage = `${method} ${url} ${status} - ${responseTime} ms`;
    return colorByStatus(status, rawMessage);
  })
);

const BASE_ROUTE = "/api/v1";
app.use(`${BASE_ROUTE}/site-settings`, siteSettingRoutes);
app.use(`${BASE_ROUTE}/auth`, authRoutes);
app.use(`${BASE_ROUTE}/user`, userRoutes);
app.use(`${BASE_ROUTE}/admin`, adminRoutes);
app.use(`${BASE_ROUTE}/support`, supportRoutes);
app.use(`${BASE_ROUTE}/properties`, propertyRoutes);
app.use(`${BASE_ROUTE}/bookings`, bookingRoutes);
app.use(`${BASE_ROUTE}/payments`, paymentRoutes);
app.use(`${BASE_ROUTE}/chat`, chatRoutes);
app.use(`${BASE_ROUTE}/plans`, planRoutes);
app.use(`${BASE_ROUTE}/subscriptions`, subscriptionRoutes);
app.use(`${BASE_ROUTE}/banner-ads`, bannerAdRoutes);

app.use(errorMiddleware);

export default app;
