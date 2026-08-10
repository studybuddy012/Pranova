require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");

const {
  setupMachineSocket,
  sendToMachine,
  isMachineConnected,
} = require("./services/machineSocket");

const verifyToken =
  require("./middleware/auth");

const machineRoutes =
  require("./routes/machine");

const jobsRoutes =
  require("./routes/jobs");


// ========================================
// APP
// ========================================

const app = express();

const PORT =
  process.env.PORT || 5000;


// ========================================
// MIDDLEWARE
// ========================================

app.use(cors());

app.use(
  express.json()
);


// ========================================
// API ROUTES
// ========================================

app.use(
  "/api/jobs",
  jobsRoutes
);

app.use(
  "/api/machine",
  machineRoutes
);


// ========================================
// ROOT
// ========================================

app.get(
  "/",
  (req, res) => {

    res.json({

      success: true,

      message:
        "PRANOVA AlphaCut Server is running",

    });

  }
);


// ========================================
// HEALTH CHECK
// ========================================

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      success: true,

      server:
        "online",

      firebase:
        "connected",

      timestamp:
        new Date().toISOString(),

    });

  }
);


// ========================================
// PROTECTED ROUTE
// ========================================

app.get(
  "/api/protected",
  verifyToken,
  (req, res) => {

    res.json({

      success: true,

      message:
        "Authentication successful",

      uid:
        req.user.uid,

      email:
        req.user.email || null,

    });

  }
);


// ========================================
// HTTP SERVER
// ========================================

const server =
  http.createServer(app);


// ========================================
// MACHINE WEBSOCKET
// ========================================

setupMachineSocket(
  server
);


// ========================================
// START SERVER
// ========================================

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🚀 PRANOVA Server running on port ${PORT}`
    );

    console.log(
      "🔥 Firebase Admin connected"
    );

    console.log(
      "🔌 Machine WebSocket ready"
    );

  }
);
