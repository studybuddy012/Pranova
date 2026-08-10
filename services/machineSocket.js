const WebSocket = require("ws");

const {
  verifyMachine,
} = require("./machineAuth");

const {
  registerMachine,
  disconnectMachine,
  markCommandAck,
  updateMachineState,
  createMachinePairingCode,
} = require("./machineService");


// ========================================
// MULTI-MACHINE CONNECTION REGISTRY
// ========================================
//
// KEY = ACTUAL ESP32 MACHINE ID
//
// Example:
//
// D885D1ABC31C -> WebSocket
// ABC123456789 -> WebSocket
//
// One machine cannot receive
// another machine's command.
//

const machineConnections =
  new Map();


// ========================================
// SETUP MACHINE WEBSOCKET
// ========================================

function setupMachineSocket(server) {

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
        "🔌 Incoming machine connection"
      );


      let authenticated =
        false;

      let listenerId =
        null;

      let machineId =
        null;


      // ====================================
      // AUTH TIMEOUT
      // ====================================

      const authTimeout =
        setTimeout(
          () => {

            if (!authenticated) {

              console.log(
                "❌ Machine authentication timeout"
              );

              try {
                ws.close();
              } catch (_) {}

            }

          },
          10000
        );


      // ====================================
      // MESSAGE
      // ====================================

      ws.on(
        "message",
        async (message) => {

          try {

            const data =
              JSON.parse(
                message.toString()
              );


            console.log(
              "📡 Machine message:",
              data
            );


            // ==================================
            // AUTHENTICATION
            // ==================================

            if (
              data.type ===
              "listener"
            ) {

              listenerId =
                data.listenerId ||
                null;


              const requestedMachineId =
                data.machineId ||
                null;


              // --------------------------------
              // LISTENER ID
              // --------------------------------

              if (!listenerId) {

                ws.send(
                  JSON.stringify({

                    type:
                      "auth_error",

                    message:
                      "listenerId is required",

                  })
                );

                ws.close();

                return;

              }


              // --------------------------------
              // MACHINE ID
              // --------------------------------

              if (!requestedMachineId) {

                ws.send(
                  JSON.stringify({

                    type:
                      "auth_error",

                    message:
                      "ESP32 machineId is required",

                  })
                );

                ws.close();

                return;

              }


              // --------------------------------
              // VERIFY LISTENER
              // --------------------------------

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


                ws.send(
                  JSON.stringify({

                    type:
                      "auth_error",

                    message:
                      "Machine authentication failed",

                  })
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
              // ACTUAL ESP32 ID
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
              // DUPLICATE CONNECTION
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
              // REGISTER CONNECTION
              // =================================

              machineConnections.set(
                machineId,
                ws
              );


              // =================================
              // REGISTER RUNTIME MACHINE
              // =================================

              const machine =
                registerMachine(
                  machineId
                );


              console.log(
                "✅ Machine registered:",
                machineId
              );


              // =================================
              // GENERATE PAIRING CODE
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
              // AUTH SUCCESS
              // =================================

              const authResponse = {

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

              };


              ws.send(
                JSON.stringify(
                  authResponse
                )
              );


              console.log(
                "📤 Auth success sent"
              );


              return;

            }


            // ==================================
            // BLOCK UNAUTHENTICATED
            // ==================================

            if (!authenticated) {

              console.log(
                "⚠️ Unauthenticated message rejected"
              );

              return;

            }


            // ==================================
            // MACHINE STATE
            // ==================================

            if (
              data.type ===
              "machine_state"
            ) {

              console.log(
                `📊 Machine state received: ${machineId}`
              );


              // Force server-owned IDs
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


              return;

            }


            // ==================================
            // COMMAND ACK
            // ==================================

            if (
              data.type ===
              "command_ack"
            ) {

              console.log(
                `✅ Command ACK from ${machineId}:`,
                data
              );


              // Server owns the machine identity.
              // Never trust client-supplied machine ID.

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


              return;

            }


            // ==================================
            // UNKNOWN MESSAGE
            // ==================================

            console.log(
              `⚠️ Unknown message from ${machineId}:`,
              data.type
            );

          } catch (error) {

            console.error(
              "❌ Invalid machine message:",
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
              "🔌 Unauthenticated connection closed"
            );

            return;

          }


          console.log(
            `🔌 Machine disconnected: ${machineId}`
          );


          // Only remove this socket if
          // it is still the active socket.

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

    // ======================================
    // SECURITY
    // SERVER OWNS TARGET MACHINE ID
    // ======================================

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

  disconnectMachineSocket,

};
