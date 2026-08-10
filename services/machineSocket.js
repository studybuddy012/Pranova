const {
  getMachine: getMachineFromDb,
  createMachine,
  updateMachine: updateMachineInDb,
  isMachineOwner,
  getMachinesByOwner,
  deleteMachine,
  generatePairingCode,
} = require("./machineRepository");


// ========================================
// RUNTIME MACHINE STATE
// ========================================

const machines = new Map();


// ========================================
// GET MACHINE
// ========================================

function getMachine(machineId) {

  return (
    machines.get(machineId) ||
    null
  );

}


// ========================================
// GET ALL RUNTIME MACHINES
// ========================================

function getAllMachines() {

  return Array.from(
    machines.values()
  );

}


// ========================================
// GET MACHINE FROM FIRESTORE
// ========================================

async function getMachineDetails(
  machineId
) {

  return await getMachineFromDb(
    machineId
  );

}


// ========================================
// REGISTER / CONNECT MACHINE
// ========================================

function registerMachine(
  machineId
) {

  if (!machineId) {

    throw new Error(
      "machineId is required"
    );

  }


  let machine =
    machines.get(machineId);


  if (!machine) {

    machine = {

      connected:
        true,

      machineId,

      status:
        "idle",

      dispatcherReady:
        false,

      sawReady:
        false,

      firmwareVersion:
        null,

      machineState:
        null,

      emergency:
        false,

      lastMachineStateAt:
        null,

      lastCommand:
        null,

      lastCommandStatus:
        null,

      lastCommandAt:
        null,

      lastAck:
        null,

      lastAckAt:
        null,

    };

  } else {

    machine.connected =
      true;

    machine.status =
      "idle";

  }


  machines.set(
    machineId,
    machine
  );


  return {
    ...machine,
  };

}


// ========================================
// UPDATE MACHINE STATE
// ========================================
//
// IMPORTANT:
// This function writes to Firestore only when
// the caller has detected an actual state change.
// The RPi agent already prevents duplicate states.
//

async function updateMachineState(
  data
) {

  if (!data) {
    return null;
  }


  const machineId =
    data.listenerId ||
    data.machineId;


  if (!machineId) {

    throw new Error(
      "machineId is required"
    );

  }


  let machine =
    machines.get(machineId);


  if (!machine) {

    registerMachine(
      machineId
    );

    machine =
      machines.get(machineId);

  }


  const state =
    data.state || {};


  // ======================================
  // CONNECTION
  // ======================================

  if (
    typeof state.connected ===
    "boolean"
  ) {

    machine.connected =
      state.connected;

  }


  // ======================================
  // DISPATCHER
  // ======================================

  if (
    typeof state.dispatcherReady ===
    "boolean"
  ) {

    machine.dispatcherReady =
      state.dispatcherReady;

  }


  // ======================================
  // SAW
  // ======================================

  if (
    typeof state.sawReady ===
    "boolean"
  ) {

    machine.sawReady =
      state.sawReady;

  }


  // ======================================
  // FIRMWARE
  // ======================================

  if (
    state.firmwareVersion !==
    undefined
  ) {

    machine.firmwareVersion =
      state.firmwareVersion;

  }


  // ======================================
  // MACHINE STATE
  // ======================================

  if (
    state.machineState !==
    undefined
  ) {

    machine.machineState =
      state.machineState;


    if (
      state.machineState
    ) {

      machine.status =
        String(
          state.machineState
        ).toLowerCase();

    }

  }


  // ======================================
  // EMERGENCY
  // ======================================

  if (
    typeof state.emergency ===
    "boolean"
  ) {

    machine.emergency =
      state.emergency;

  }


  // ======================================
  // TIMESTAMP
  // ======================================

  machine.lastMachineStateAt =
    data.timestamp ||
    new Date().toISOString();


  machines.set(
    machineId,
    machine
  );


  // ======================================
  // PERSIST
  // ======================================

  try {

    await updateMachineInDb(

      machineId,

      {

        connected:
          machine.connected,

        status:
          machine.status,

        dispatcherReady:
          machine.dispatcherReady,

        sawReady:
          machine.sawReady,

        firmwareVersion:
          machine.firmwareVersion,

        machineState:
          machine.machineState,

        emergency:
          machine.emergency,

        lastMachineStateAt:
          machine.lastMachineStateAt,

      }

    );

  } catch (error) {

    console.error(
      `⚠️ Failed to persist machine state [${machineId}]:`,
      error.message
    );

  }


  return {
    ...machine,
  };

}


// ========================================
// CREATE MACHINE PAIRING CODE
// ========================================
//
// Called when an ESP32/RPi successfully
// authenticates with the server.
//
// If already paired:
//     no new code is generated.
//
// If unpaired:
//     generate 6-digit code
//     save to Firestore
//     return code to socket
//

async function createMachinePairingCode(
  machineId
) {

  if (!machineId) {

    throw new Error(
      "machineId is required"
    );

  }


  // ======================================
  // GET MACHINE
  // ======================================

  const machine =
    await getMachineFromDb(
      machineId
    );


  if (!machine) {

    throw new Error(
      `Machine not found: ${machineId}`
    );

  }


  // ======================================
  // ALREADY PAIRED
  // ======================================

  if (
    machine.paired === true &&
    machine.ownerId
  ) {

    return {

      machineId,

      paired:
        true,

      pairingCode:
        null,

      pairingCodeCreatedAt:
        null,

      expiresIn:
        0,

    };

  }


  // ======================================
  // GENERATE CODE
  // ======================================

  const pairingCode =
    generatePairingCode();


  const pairingCodeCreatedAt =
    new Date().toISOString();


  // ======================================
  // SAVE CODE
  // ======================================

  await updateMachineInDb(

    machineId,

    {

      pairingCode,

      pairingCodeCreatedAt,

      paired:
        false,

    }

  );


  console.log(
    `🔐 Pairing code generated [${machineId}]: ${pairingCode}`
  );


  // ======================================
  // RETURN
  // ======================================

  return {

    machineId,

    paired:
      false,

    pairingCode,

    pairingCodeCreatedAt,

    // 10 minutes
    expiresIn:
      600,

  };

}


// ========================================
// COMMAND SENT
// ========================================

async function markCommandSent(
  machineId,
  command
) {

  const machine =
    machines.get(machineId);


  if (!machine) {

    throw new Error(
      `Machine not found: ${machineId}`
    );

  }


  machine.lastCommand =
    command;

  machine.lastCommandStatus =
    "sent";

  machine.lastCommandAt =
    new Date().toISOString();


  machines.set(
    machineId,
    machine
  );


  try {

    await updateMachineInDb(

      machineId,

      {

        lastCommand:
          machine.lastCommand,

        lastCommandStatus:
          machine.lastCommandStatus,

        lastCommandAt:
          machine.lastCommandAt,

      }

    );

  } catch (error) {

    console.error(
      `⚠️ Failed to persist command state [${machineId}]:`,
      error.message
    );

  }


  return {
    ...machine,
  };

}


// ========================================
// COMMAND ACK
// ========================================

async function markCommandAck(
  data
) {

  if (!data) {

    throw new Error(
      "ACK data is required"
    );

  }


  const machineId =
    data.listenerId ||
    data.machineId;


  if (!machineId) {

    throw new Error(
      "machineId is required"
    );

  }


  const machine =
    machines.get(machineId);


  if (!machine) {

    throw new Error(
      `Machine not found: ${machineId}`
    );

  }


  machine.lastAck = {

    command:
      data.command,

    success:
      data.success,

    executed:
      data.executed,

    error:
      data.error ||
      null,

  };


  machine.lastAckAt =
    data.timestamp ||
    new Date().toISOString();


  machine.lastCommandStatus =
    data.success
      ? "acknowledged"
      : "failed";


  machines.set(
    machineId,
    machine
  );


  try {

    await updateMachineInDb(

      machineId,

      {

        lastAck:
          machine.lastAck,

        lastAckAt:
          machine.lastAckAt,

        lastCommandStatus:
          machine.lastCommandStatus,

      }

    );

  } catch (error) {

    console.error(
      `⚠️ Failed to persist ACK [${machineId}]:`,
      error.message
    );

  }


  return {
    ...machine,
  };

}


// ========================================
// DISCONNECT MACHINE
// ========================================

async function disconnectMachine(
  machineId
) {

  const machine =
    machines.get(machineId);


  if (!machine) {
    return null;
  }


  machine.connected =
    false;

  machine.status =
    "offline";


  machines.set(
    machineId,
    machine
  );


  try {

    await updateMachineInDb(

      machineId,

      {

        connected:
          false,

        status:
          "offline",

      }

    );

  } catch (error) {

    console.error(
      `⚠️ Failed to persist disconnect [${machineId}]:`,
      error.message
    );

  }


  return {
    ...machine,
  };

}


// ========================================
// CREATE MACHINE FOR USER
// ========================================

async function createUserMachine(
  machineId,
  ownerId,
  name
) {

  return await createMachine(

    machineId,

    ownerId,

    name

  );

}


// ========================================
// CHECK MACHINE OWNERSHIP
// ========================================

async function checkMachineOwnership(
  machineId,
  ownerId
) {

  return await isMachineOwner(

    machineId,

    ownerId

  );

}


// ========================================
// GET USER MACHINES
// ========================================

async function getUserMachines(
  ownerId
) {

  return await getMachinesByOwner(
    ownerId
  );

}


// ========================================
// DELETE USER MACHINE
// ========================================

async function deleteUserMachine(
  machineId,
  ownerId
) {

  const owner =
    await isMachineOwner(

      machineId,

      ownerId

    );


  if (!owner) {

    throw new Error(
      "Machine ownership verification failed"
    );

  }


  // Remove runtime state
  machines.delete(
    machineId
  );


  // Remove Firestore record
  await deleteMachine(
    machineId
  );


  return true;

}


// ========================================
// EXPORTS
// ========================================

module.exports = {

  getMachine,

  getAllMachines,

  getMachineDetails,

  registerMachine,

  updateMachineState,

  createMachinePairingCode,

  markCommandSent,

  markCommandAck,

  disconnectMachine,

  createUserMachine,

  checkMachineOwnership,

  getUserMachines,

  deleteUserMachine,

};
