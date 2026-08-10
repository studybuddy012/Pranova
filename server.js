require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");

// ========================================
// MACHINE SOCKET
// ========================================

const machineSocket =
  require("./services/machineSocket");

console.log(
  "🔍 Machine Socket exports:",
  Object.keys(machineSocket)
);

const {
  setupMachineSocket,
} = machineSocket;


// ========================================
// VALIDATE SOCKET MODULE
// ========================================

if (
  typeof setupMachineSocket !==
  "function"
) {

  console.error(
    "❌ setupMachineSocket was not found in ./services/machineSocket"
  );

  console.error(
    "Available exports:",
    Object.keys(machineSocket)
  );

  process.exit(1);
}


// ========================================
// OTHER SERVICES
// ========================================

const verifyToken =
  require("./middleware/auth");

const machineRoutes =
  require("./routes/machine");

const jobsRoutes =
  require("./routes/jobs");


// ========================================
// APP
// ========================================

const app =
  express();

const PORT =
  process.env.PORT || 5000;


// ========================================
// MIDDLEWARE
// ========================================

app.use(
  cors()
);

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

console.log(
  "🔌 Initializing machine WebSocket..."
);

setupMachineSocket(
  server
);

console.log(
  "✅ Machine WebSocket initialized"
);


// ========================================
// START SERVER
// ========================================

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "========================================"
    );

    console.log(
      "🚀 PRANOVA AlphaCut Server"
    );

    console.log(
      `🌐 Port: ${PORT}`
    );

    console.log(
      "🔥 Firebase Admin connected"
    );

    console.log(
      "🔌 Machine WebSocket ready"
    );

    console.log(
      "========================================"
    );

  }
);


// ========================================
// SERVER ERROR
// ========================================

server.on(
  "error",
  (error) => {

    console.error(
      "❌ HTTP server error:",
      error
    );

  }
);


// ========================================
// PROCESS ERROR
// ========================================

process.on(
  "uncaughtException",
  (error) => {

    console.error(
      "❌ Uncaught exception:",
      error
    );

  }
);

process.on(
  "unhandledRejection",
  (error) => {

    console.error(
      "❌ Unhandled rejection:",
      error
    );

  }
);
