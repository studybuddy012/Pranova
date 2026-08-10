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
// KEY = actual ESP32 machineId
//
// Example:
// D885D1ABC31C -> WebSocket
// ABC123456789 -> WebSocket
//
// One machine can NEVER receive
// another machine's connection.
//

const machineConnections = new Map();


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


      let authenticated = false;

      let listenerId = null;

      let machineId = null;


      // ====================================
      // AUTHENTICATION TIMEOUT
      // ====================================

      const authTimeout =
        setTimeout(
          () => {

            if (!authenticated) {

              console.log(
                "❌ Machine authentication timeout"
              );

              ws.close();

            }

          },
          10000
        );


      // ====================================
      // MACHINE MESSAGE
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

              // --------------------------------
              // LISTENER ID
              // --------------------------------

              listenerId =
                data.listenerId ||
                null;


              // --------------------------------
              // ACTUAL ESP32 MACHINE ID
              // --------------------------------

              const requestedMachineId =
                data.machineId ||
                null;


              if (!listenerId) {

                console.log(
                  "❌ listenerId missing"
                );

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


              if (!requestedMachineId) {

                console.log(
                  "❌ machineId missing"
                );

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
              // VERIFY RPI LISTENER
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
              // IMPORTANT:
              // ACTUAL MACHINE ID
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
                  `⚠️ Existing connection found for machine ${machineId}`
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
              // REGISTER MACHINE
              // =================================

              const machine =
                registerMachine(
                  machineId
                );


              console.log(
                "✅ Machine authenticated"
              );


              console.log(
                "📊 Machine registered:",
                machine
              );


              // =================================
              // GENERATE PAIRING CODE
              // =================================

              let pairing;


              try {

                pairing =
                  await createMachinePairingCode(
                    machineId
                  );


                console.log(
                  "🔐 Pairing:",
                  pairing
                );

              } catch (error) {

                console.error(
                  `⚠️ Pairing code generation failed [${machineId}]:`,
                  error.message
                );

                pairing = {

                  machineId,

                  paired: false,

                  pairingCode: null,

                  error:
                    "Pairing code generation failed",

                };

              }


              // =================================
              // AUTH SUCCESS
              // =================================

              ws.send(
                JSON.stringify({

                  type:
                    "auth_success",

                  message:
                    "Machine authenticated successfully",

                  machineId:
                    machineId,

                  listenerId:
                    listenerId,

                  paired:
                    pairing.paired,

                  pairingCode:
                    pairing.pairingCode ||
                    null,

                  pairingCodeCreatedAt:
                    pairing.pairingCodeCreatedAt ||
                    null,

                })
              );


              // =================================
              // SEND PAIRING CODE SEPARATELY
              // =================================

              if (
                pairing.pairingCode
              ) {

                ws.send(
                  JSON.stringify({

                    type:
                      "pairing_code",

                    machineId:
                      machineId,

                    pairingCode:
                      pairing.pairingCode,

                    pairingCodeCreatedAt:
                      pairing.pairingCodeCreatedAt,

                    expiresIn:
                      pairing.expiresIn,

                  })
                );


                console.log(
                  `🔐 Pairing code sent to ${machineId}: ${pairing.pairingCode}`
                );

              } else if (
                pairing.paired
              ) {

                ws.send(
                  JSON.stringify({

                    type:
                      "pairing_status",

                    machineId:
                      machineId,

                    paired:
                      true,

                    message:
                      "Machine is already paired",

                  })
                );

              }


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


              // --------------------------------
              // FORCE SERVER MACHINE ID
              // --------------------------------
              //
              // Never trust machineId coming
              // from the client after auth.
              //

              const stateData = {

                ...data,

                machineId:
                  machineId,

                listenerId:
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


              // --------------------------------
              // FORCE AUTHENTICATED MACHINE ID
              // --------------------------------

              const ackData = {

                ...data,

                machineId:
                  machineId,

                listenerId:
                  machineId,

              };


              const state =
                await markCommandAck(
                  ackData
                );


              console.log(
                "📊 Machine ACK updated:",
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
      // DISCONNECT
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


          // --------------------------------
          // ONLY REMOVE ACTIVE CONNECTION
          // --------------------------------

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

  if (!machineId) {

    console.log(
      "❌ Cannot send command: machineId missing"
    );

    return false;

  }


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
    // SECURITY:
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
// CHECK SPECIFIC MACHINE CONNECTION
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
// GET CONNECTED MACHINE IDS
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
