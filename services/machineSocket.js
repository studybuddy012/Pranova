const WebSocket = require("ws");

const {
  verifyMachine,
} = require("./machineAuth");

const {
  registerMachine,
  disconnectMachine,
  markCommandAck,
  updateMachineState,
} = require("./machineService");


// ========================================
// MULTI-MACHINE CONNECTION REGISTRY
// ========================================

const machineConnections = new Map();


// ========================================
// SETUP MACHINE WEBSOCKET
// ========================================

function setupMachineSocket(server) {

  const wss = new WebSocket.Server({
    server,
    path: "/machine",
  });


  wss.on("connection", (ws) => {

    console.log(
      "🔌 Incoming machine connection"
    );


    let authenticated = false;
    let machineId = null;


    // ====================================
    // AUTHENTICATION TIMEOUT
    // ====================================

    const authTimeout = setTimeout(() => {

      if (!authenticated) {

        console.log(
          "❌ Machine authentication timeout"
        );

        ws.close();

      }

    }, 10000);


    // ====================================
    // MACHINE MESSAGE
    // ====================================

    ws.on("message", async (message) => {

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
          data.type === "listener"
        ) {

          const valid =
            verifyMachine(
              data.listenerId,
              data.secret
            );


          if (!valid) {

            console.log(
              "❌ Machine authentication failed:",
              data.listenerId
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


          // ================================
          // AUTHENTICATED
          // ================================

          authenticated = true;

          clearTimeout(
            authTimeout
          );


          machineId =
            data.listenerId;


          // ================================
          // HANDLE DUPLICATE CONNECTION
          // ================================

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


          // ================================
          // REGISTER CONNECTION
          // ================================

          machineConnections.set(
            machineId,
            ws
          );


          // ================================
          // REGISTER MACHINE
          // ================================

          const machine =
            registerMachine(
              machineId
            );


          console.log(
            "✅ Machine authenticated:",
            machineId
          );


          console.log(
            "📊 Machine registered:",
            machine
          );


          // ================================
          // AUTH SUCCESS
          // ================================

          ws.send(
            JSON.stringify({

              type:
                "auth_success",

              message:
                "Machine authenticated successfully",

              machineId:
                machineId,

            })
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


          const state =
            await updateMachineState(
              data
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


          // Make sure the ACK belongs
          // to the authenticated socket.

          if (
            data.listenerId &&
            data.listenerId !== machineId
          ) {

            console.log(
              `⚠️ Invalid ACK machine ID: ${data.listenerId}`
            );

            return;

          }


          // Ensure machine ID is available
          // to machineService.

          const ackData = {

            ...data,

            listenerId:
              machineId,

          };


          const state =
            await markCommandAck(
              ackData
            );


          console.log(
            "📊 Machine state updated:",
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

    });


    // ====================================
    // DISCONNECT
    // ====================================

    ws.on("close", async () => {

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


      // Only remove this connection
      // if it is still the active one.

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

    });


    // ====================================
    // ERROR
    // ====================================

    ws.on("error", (error) => {

      console.error(
        `❌ WebSocket error [${machineId || "unknown"}]:`,
        error.message
      );

    });

  });


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


    machineConnections.delete(
      machineId
    );


    return false;

  }


  try {

    ws.send(
      JSON.stringify(data)
    );


    console.log(
      `📤 Data sent to machine: ${machineId}`,
      data
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


  machineConnections.delete(
    machineId
  );


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