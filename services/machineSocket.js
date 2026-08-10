const WebSocket = require("ws");

const {
  getAuth,
} = require("firebase-admin/auth");

const {
  firebaseApp,
} = require("./firebase");

const {
  verifyMachine,
} = require("./machineAuth");

const {
  registerMachine,
  disconnectMachine,
  markCommandAck,
  updateMachineState,
  createMachinePairingCode,
  checkMachineOwnership,
} = require("./machineService");


// ========================================
// FIREBASE AUTH
// ========================================

const firebaseAuth =
  getAuth(firebaseApp);


// ========================================
// MACHINE CONNECTIONS
// ========================================
//
// KEY = ACTUAL ESP32 MACHINE ID
//
// D885D1ABC31C -> RPi WebSocket
//
// ========================================

const machineConnections =
  new Map();


// ========================================
// WEBSITE CONNECTIONS
// ========================================
//
// KEY = MACHINE ID
//
// Multiple website tabs/users can watch
// a machine, so value is a Set.
//
// D885D1ABC31C
//      ↓
// Set(
//   websiteSocket1,
//   websiteSocket2
// )
//
// ========================================

const websiteConnections =
  new Map();


// ========================================
// HELPER
// ========================================

function sendJson(
  ws,
  data
) {

  if (
    !ws ||
    ws.readyState !==
      WebSocket.OPEN
  ) {

    return false;

  }

  try {

    ws.send(
      JSON.stringify(data)
    );

    return true;

  } catch (error) {

    console.error(
      "❌ WebSocket send failed:",
      error.message
    );

    return false;

  }

}


// ========================================
// BROADCAST TO WEBSITE
// ========================================

function broadcastToWebsite(
  machineId,
  data
) {

  const clients =
    websiteConnections.get(
      machineId
    );


  if (!clients) {

    return 0;

  }


  let sentCount = 0;


  for (
    const ws of clients
  ) {

    if (
      ws.readyState ===
      WebSocket.OPEN
    ) {

      try {

        ws.send(
          JSON.stringify({

            ...data,

            machineId,

          })
        );

        sentCount++;

      } catch (error) {

        console.error(
          `❌ Website broadcast failed [${machineId}]:`,
          error.message
        );

      }

    }

  }


  return sentCount;

}


// ========================================
// ADD WEBSITE CONNECTION
// ========================================

function addWebsiteConnection(
  machineId,
  ws
) {

  let clients =
    websiteConnections.get(
      machineId
    );


  if (!clients) {

    clients =
      new Set();

    websiteConnections.set(
      machineId,
      clients
    );

  }


  clients.add(
    ws
  );


  console.log(
    `🌐 Website connected to machine: ${machineId}`
  );

  console.log(
    `🌐 Website viewers: ${clients.size}`
  );

}


// ========================================
// REMOVE WEBSITE CONNECTION
// ========================================

function removeWebsiteConnection(
  machineId,
  ws
) {

  const clients =
    websiteConnections.get(
      machineId
    );


  if (!clients) {

    return;

  }


  clients.delete(
    ws
  );


  if (
    clients.size ===
    0
  ) {

    websiteConnections.delete(
      machineId
    );

  }


  console.log(
    `🌐 Website disconnected from machine: ${machineId}`
  );

}


// ========================================
// SETUP MACHINE WEBSOCKET
// ========================================

function setupMachineSocket(
  server
) {

  const wss =
    new WebSocket.Server({

      server,

      path:
        "/machine",

    });


  wss.on(
    "connection",
    (ws) => {

      console.log(
        "🔌 Incoming WebSocket connection"
      );


      // ==================================
      // CONNECTION TYPE
      // ==================================

      let connectionType =
        null;


      // machine | website
      let authenticated =
        false;


      let listenerId =
        null;


      let machineId =
        null;


      let websiteUserId =
        null;


      // ==================================
      // AUTH TIMEOUT
      // ==================================

      const authTimeout =
        setTimeout(
          () => {

            if (
              !authenticated
            ) {

              console.log(
                "❌ WebSocket authentication timeout"
              );


              try {

                ws.close();

              } catch (_) {}

            }

          },
          10000
        );


      // ==================================
      // MESSAGE
      // ==================================

      ws.on(
        "message",
        async (message) => {

          try {

            const data =
              JSON.parse(
                message.toString()
              );


            console.log(
              "📡 WebSocket message:",
              data.type
            );


            // =================================
            // MACHINE / RPI AUTHENTICATION
            // =================================

            if (
              data.type ===
              "listener"
            ) {

              // -----------------------------
              // Prevent re-authentication
              // -----------------------------

              if (
                authenticated
              ) {

                return;

              }


              connectionType =
                "machine";


              listenerId =
                data.listenerId ||
                null;


              const requestedMachineId =
                data.machineId ||
                null;


              // -----------------------------
              // LISTENER ID
              // -----------------------------

              if (
                !listenerId
              ) {

                sendJson(
                  ws,
                  {

                    type:
                      "auth_error",

                    message:
                      "listenerId is required",

                  }
                );

                ws.close();

                return;

              }


              // -----------------------------
              // MACHINE ID
              // -----------------------------

              if (
                !requestedMachineId
              ) {

                sendJson(
                  ws,
                  {

                    type:
                      "auth_error",

                    message:
                      "ESP32 machineId is required",

                  }
                );

                ws.close();

                return;

              }


              // -----------------------------
              // VERIFY RPI
              // -----------------------------

              const valid =
                verifyMachine(
                  listenerId,
                  data.secret
                );


              if (!valid) {

                console.log(
                  "❌ Machine authentication failed:",
                  listenerId
                );


                sendJson(
                  ws,
                  {

                    type:
                      "auth_error",

                    message:
                      "Machine authentication failed",

                  }
                );

                ws.close();

                return;

              }


              // =================================
              // AUTHENTICATED
              // =================================

              authenticated =
                true;


              clearTimeout(
                authTimeout
              );


              // =================================
              // SERVER-OWNED MACHINE ID
              // =================================

              machineId =
                requestedMachineId;


              console.log(
                "🔐 Listener authenticated:",
                listenerId
              );


              console.log(
                "🆔 ESP32 Machine ID:",
                machineId
              );


              // =================================
              // DUPLICATE MACHINE CONNECTION
              // =================================

              const existingConnection =
                machineConnections.get(
                  machineId
                );


              if (
                existingConnection &&
                existingConnection !== ws
              ) {

                console.log(
                  `⚠️ Existing connection found for ${machineId}`
                );


                try {

                  existingConnection.close();

                } catch (error) {

                  console.error(
                    "❌ Failed to close old connection:",
                    error.message
                  );

                }

              }


              // =================================
              // REGISTER MACHINE
              // =================================

              machineConnections.set(
                machineId,
                ws
              );


              // =================================
              // RUNTIME MACHINE
              // =================================

              registerMachine(
                machineId
              );


              console.log(
                "✅ Machine registered:",
                machineId
              );


              // =================================
              // PAIRING CODE
              // =================================

              let pairing =
                null;


              try {

                pairing =
                  await createMachinePairingCode(
                    machineId
                  );


                console.log(
                  "🔐 Pairing information:",
                  pairing
                );

              } catch (error) {

                console.error(
                  "⚠️ Pairing code generation failed:",
                  error.message
                );

              }


              // =================================
              // AUTH RESPONSE
              // =================================

              sendJson(
                ws,
                {

                  type:
                    "auth_success",

                  message:
                    "Machine authenticated successfully",

                  machineId,

                  listenerId,

                  paired:
                    pairing
                      ? pairing.paired
                      : false,

                  pairingCode:
                    pairing
                      ? pairing.pairingCode
                      : null,

                  pairingCodeCreatedAt:
                    pairing
                      ? pairing.pairingCodeCreatedAt
                      : null,

                  expiresIn:
                    pairing
                      ? pairing.expiresIn
                      : 0,

                }
              );


              console.log(
                "📤 Machine auth success sent"
              );


              return;

            }


            // =================================
            // WEBSITE AUTHENTICATION
            // =================================
            //
            // Website sends:
            //
            // {
            //   type: "website_auth",
            //   machineId: "...",
            //   token: "Firebase ID token"
            // }
            //
            // =================================

            if (
              data.type ===
              "website_auth"
            ) {

              // -----------------------------
              // Prevent re-authentication
              // -----------------------------

              if (
                authenticated
              ) {

                return;

              }


              connectionType =
                "website";


              const requestedMachineId =
                data.machineId ||
                null;


              const token =
                data.token ||
                null;


              // -----------------------------
              // MACHINE ID
              // -----------------------------

              if (
                !requestedMachineId
              ) {

                sendJson(
                  ws,
                  {

                    type:
                      "auth_error",

                    message:
                      "machineId is required",

                  }
                );

                ws.close();

                return;

              }


              // -----------------------------
              // TOKEN
              // -----------------------------

              if (!token) {

                sendJson(
                  ws,
                  {

                    type:
                      "auth_error",

                    message:
                      "Firebase authentication token is required",

                  }
                );

                ws.close();

                return;

              }


              // =================================
              // VERIFY FIREBASE TOKEN
              // =================================

              let decodedToken;


              try {

                decodedToken =
                  await firebaseAuth.verifyIdToken(
                    token
                  );

              } catch (error) {

                console.log(
                  "❌ Website Firebase authentication failed:",
                  error.message
                );


                sendJson(
                  ws,
                  {

                    type:
                      "auth_error",

                    message:
                      "Invalid Firebase authentication token",

                  }
                );

                ws.close();

                return;

              }


              const uid =
                decodedToken.uid;


              // =================================
              // CHECK MACHINE OWNERSHIP
              // =================================

              const owner =
                await checkMachineOwnership(
                  requestedMachineId,
                  uid
                );


              if (!owner) {

                console.log(
                  `🚫 Website machine access denied: ${uid} → ${requestedMachineId}`
                );


                sendJson(
                  ws,
                  {

                    type:
                      "auth_error",

                    message:
                      "You do not have access to this machine",

                  }
                );

                ws.close();

                return;

              }


              // =================================
              // AUTHENTICATED WEBSITE
              // =================================

              authenticated =
                true;


              clearTimeout(
                authTimeout
              );


              machineId =
                requestedMachineId;


              websiteUserId =
                uid;


              addWebsiteConnection(
                machineId,
                ws
              );


              // =================================
              // WEBSITE AUTH SUCCESS
              // =================================

              sendJson(
                ws,
                {

                  type:
                    "website_auth_success",

                  message:
                    "Website authenticated successfully",

                  machineId,

                }
              );


              // =================================
              // SEND CURRENT MACHINE RUNTIME
              // =================================

              const machineConnection =
                machineConnections.get(
                  machineId
                );


              if (
                machineConnection &&
                machineConnection.readyState ===
                  WebSocket.OPEN
              ) {

                sendJson(
                  ws,
                  {

                    type:
                      "machine_connection",

                    machineId,

                    connected:
                      true,

                  }
                );

              } else {

                sendJson(
                  ws,
                  {

                    type:
                      "machine_connection",

                    machineId,

                    connected:
                      false,

                  }
                );

              }


              console.log(
                `✅ Website authenticated: ${uid} → ${machineId}`
              );


              return;

            }


            // =================================
            // BLOCK UNAUTHENTICATED
            // =================================

            if (
              !authenticated
            ) {

              console.log(
                "⚠️ Unauthenticated message rejected"
              );

              return;

            }


            // =================================
            // MACHINE STATE
            // =================================

            if (
              data.type ===
              "machine_state" &&
              connectionType ===
                "machine"
            ) {

              console.log(
                `📊 Machine state received: ${machineId}`
              );


              // Server owns identity
              const stateData = {

                ...data,

                listenerId:
                  machineId,

                machineId:
                  machineId,

              };


              const state =
                await updateMachineState(
                  stateData
                );


              console.log(
                "🟢 Machine state updated:",
                state
              );


              // =================================
              // BROADCAST TO WEBSITE
              // =================================

              broadcastToWebsite(
                machineId,
                {

                  type:
                    "machine_state",

                  listenerId:
                    machineId,

                  state:
                    stateData.state ||
                    {},

                  timestamp:
                    stateData.timestamp ||
                    new Date().toISOString(),

                }
              );


              return;

            }


            // =================================
            // MACHINE LOG
            // =================================

            if (
              data.type ===
              "machine_log" &&
              connectionType ===
                "machine"
            ) {

              console.log(
                `📝 Machine log [${machineId}]:`,
                data.message ||
                data.log
              );


              broadcastToWebsite(
                machineId,
                {

                  type:
                    "machine_log",

                  message:
                    data.message ||
                    data.log ||
                    "",

                  timestamp:
                    data.timestamp ||
                    new Date().toISOString(),

                }
              );


              return;

            }


            // =================================
            // COMMAND ACK
            // =================================

            if (
              data.type ===
              "command_ack" &&
              connectionType ===
                "machine"
            ) {

              console.log(
                `✅ Command ACK from ${machineId}:`,
                data
              );


              // Server owns identity
              const ackData = {

                ...data,

                listenerId:
                  machineId,

                machineId:
                  machineId,

              };


              const state =
                await markCommandAck(
                  ackData
                );


              console.log(
                "📊 Command ACK updated:",
                state
              );


              // =================================
              // BROADCAST ACK
              // =================================

              broadcastToWebsite(
                machineId,
                {

                  type:
                    "command_ack",

                  command:
                    data.command,

                  success:
                    data.success,

                  executed:
                    data.executed,

                  error:
                    data.error ||
                    null,

                  timestamp:
                    data.timestamp ||
                    new Date().toISOString(),

                }
              );


              return;

            }


            // =================================
            // MACHINE DISCONNECT EVENT
            // =================================

            if (
              data.type ===
              "machine_disconnect" &&
              connectionType ===
                "machine"
            ) {

              broadcastToWebsite(
                machineId,
                {

                  type:
                    "machine_connection",

                  connected:
                    false,

                }
              );


              return;

            }


            // =================================
            // UNKNOWN MESSAGE
            // =================================

            console.log(
              `⚠️ Unknown message from ${connectionType}:`,
              data.type
            );

          } catch (error) {

            console.error(
              "❌ Invalid WebSocket message:",
              error.message
            );

          }

        }
      );


      // ====================================
      // CLOSE
      // ====================================

      ws.on(
        "close",
        async () => {

          clearTimeout(
            authTimeout
          );


          if (!authenticated) {

            console.log(
              "🔌 Unauthenticated WebSocket closed"
            );

            return;

          }


          // ==================================
          // WEBSITE DISCONNECT
          // ==================================

          if (
            connectionType ===
            "website"
          ) {

            removeWebsiteConnection(
              machineId,
              ws
            );


            console.log(
              `🌐 Website session ended: ${websiteUserId} → ${machineId}`
            );


            return;

          }


          // ==================================
          // MACHINE DISCONNECT
          // ==================================

          if (
            connectionType ===
            "machine"
          ) {

            console.log(
              `🔌 Machine disconnected: ${machineId}`
            );


            // Only remove if this is
            // still the active socket.

            if (
              machineConnections.get(
                machineId
              ) === ws
            ) {

              machineConnections.delete(
                machineId
              );


              try {

                await disconnectMachine(
                  machineId
                );

              } catch (error) {

                console.error(
                  `❌ Failed to update disconnect state [${machineId}]:`,
                  error.message
                );

              }


              // =================================
              // INFORM WEBSITE
              // =================================

              broadcastToWebsite(
                machineId,
                {

                  type:
                    "machine_connection",

                  connected:
                    false,

                  timestamp:
                    new Date().toISOString(),

                }
              );

            }

          }

        }
      );


      // ====================================
      // ERROR
      // ====================================

      ws.on(
        "error",
        (error) => {

          console.error(
            `❌ WebSocket error [${machineId || "unknown"}]:`,
            error.message
          );

        }
      );

    }
  );


  return wss;

}


// ========================================
// SEND TO SPECIFIC MACHINE
// ========================================

function sendToMachine(
  machineId,
  data
) {

  const ws =
    machineConnections.get(
      machineId
    );


  if (!ws) {

    console.log(
      `❌ Machine not connected: ${machineId}`
    );

    return false;

  }


  if (
    ws.readyState !==
    WebSocket.OPEN
  ) {

    console.log(
      `❌ Machine WebSocket not open: ${machineId}`
    );


    if (
      machineConnections.get(
        machineId
      ) === ws
    ) {

      machineConnections.delete(
        machineId
      );

    }


    return false;

  }


  try {

    const payload = {

      ...data,

      machineId:
        machineId,

    };


    ws.send(
      JSON.stringify(
        payload
      )
    );


    console.log(
      `📤 Data sent to machine: ${machineId}`,
      payload
    );


    return true;

  } catch (error) {

    console.error(
      `❌ Failed to send data to ${machineId}:`,
      error.message
    );


    return false;

  }

}


// ========================================
// CHECK MACHINE CONNECTION
// ========================================

function isMachineConnected(
  machineId
) {

  const ws =
    machineConnections.get(
      machineId
    );


  return (
    ws !== undefined &&
    ws.readyState ===
      WebSocket.OPEN
  );

}


// ========================================
// GET CONNECTED MACHINES
// ========================================

function getConnectedMachines() {

  return Array.from(
    machineConnections.keys()
  );

}


// ========================================
// GET CONNECTION COUNT
// ========================================

function getConnectionCount() {

  return machineConnections.size;

}


// ========================================
// GET WEBSITE CONNECTION COUNT
// ========================================

function getWebsiteConnectionCount(
  machineId
) {

  const clients =
    websiteConnections.get(
      machineId
    );


  if (!clients) {

    return 0;

  }


  return clients.size;

}


// ========================================
// DISCONNECT SPECIFIC MACHINE
// ========================================

function disconnectMachineSocket(
  machineId
) {

  const ws =
    machineConnections.get(
      machineId
    );


  if (!ws) {

    return false;

  }


  try {

    ws.close();

  } catch (error) {

    console.error(
      `❌ Failed to close ${machineId}:`,
      error.message
    );

  }


  if (
    machineConnections.get(
      machineId
    ) === ws
  ) {

    machineConnections.delete(
      machineId
    );

  }


  return true;

}


// ========================================
// EXPORTS
// ========================================

module.exports = {

  setupMachineSocket,

  sendToMachine,

  isMachineConnected,

  getConnectedMachines,

  getConnectionCount,

  getWebsiteConnectionCount,

  disconnectMachineSocket,

};
