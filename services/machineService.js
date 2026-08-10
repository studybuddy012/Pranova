const {
  getMachine: getMachineFromDb,
  createMachine,
  updateMachine: updateMachineInDb,
  isMachineOwner,
  getMachinesByOwner,
  deleteMachine,
} = require("./machineRepository");


// ========================================
// RUNTIME MACHINE STATE
// ========================================
//
// IMPORTANT:
// Har machine ka state apne machineId ke andar
// separately stored rahega.
//
// Machine A ka state kabhi Machine B ke state
// ke comparison me use nahi hoga.
//

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
    machines.get(
      machineId
    );


  // ======================================
  // NEW MACHINE
  // ======================================

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

  }


  // ======================================
  // EXISTING MACHINE
  // ======================================

  else {

    machine.connected =
      true;

    // Don't unnecessarily overwrite
    // actual machine status here.

    if (
      machine.status ===
      "offline"
    ) {

      machine.status =
        "idle";

    }

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
// BUILD PERSISTENT STATE SNAPSHOT
// ========================================
//
// IMPORTANT:
// Timestamp is NOT included.
//
// Otherwise every packet would look different
// because lastMachineStateAt changes.
//

function getPersistentState(
  machine
) {

  return {

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

  };

}


// ========================================
// CHECK STATE CHANGE
// ========================================

function hasStateChanged(
  previousMachine,
  currentMachine
) {

  if (!previousMachine) {

    return true;

  }


  const previousState =
    getPersistentState(
      previousMachine
    );


  const currentState =
    getPersistentState(
      currentMachine
    );


  return (
    JSON.stringify(
      previousState
    ) !==
    JSON.stringify(
      currentState
    )
  );

}


// ========================================
// UPDATE MACHINE STATE
// ========================================

async function updateMachineState(
  data
) {

  if (!data) {

    return null;

  }


  const machineId =
    data.listenerId;


  if (!machineId) {

    throw new Error(
      "listenerId is required"
    );

  }


  // ======================================
  // GET PREVIOUS MACHINE
  // ======================================

  let machine =
    machines.get(
      machineId
    );


  // ======================================
  // CREATE RUNTIME MACHINE IF REQUIRED
  // ======================================

  if (!machine) {

    registerMachine(
      machineId
    );


    machine =
      machines.get(
        machineId
      );

  }


  // ======================================
  // SAVE PREVIOUS STATE
  // ======================================

  const previousMachine = {
    ...machine,
  };


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


  // ======================================
  // SAVE RUNTIME STATE
  // ======================================

  machines.set(
    machineId,
    machine
  );


  // ======================================
  // CHECK ACTUAL STATE CHANGE
  // ======================================

  const changed =
    hasStateChanged(
      previousMachine,
      machine
    );


  // ======================================
  // NO CHANGE
  // ======================================
  //
  // Runtime state update ho gaya,
  // lekin Firestore write ki zarurat nahi.
  //

  if (!changed) {

    console.log(
      `⏭️ No persistent state change [${machineId}] — Firestore write skipped`
    );


    return {
      ...machine,
    };

  }


  // ======================================
  // STATE CHANGED
  // ======================================

  console.log(
    `🔄 Persistent machine state changed [${machineId}]`
  );


  console.log(
    getPersistentState(machine)
  );


  // ======================================
  // FIRESTORE WRITE
  // ======================================

  try {

    await updateMachineInDb(
      machineId,
      getPersistentState(
        machine
      )
    );


    console.log(
      `🔥 Firestore machine state updated [${machineId}]`
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
// COMMAND SENT
// ========================================

async function markCommandSent(
  machineId,
  command
) {

  const machine =
    machines.get(
      machineId
    );


  if (!machine) {

    throw new Error(
      `Machine not found: ${machineId}`
    );

  }


  // ======================================
  // UPDATE RUNTIME
  // ======================================

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


  // ======================================
  // PERSIST COMMAND
  // ======================================

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
    data.listenerId;


  if (!machineId) {

    throw new Error(
      "listenerId is required"
    );

  }


  const machine =
    machines.get(
      machineId
    );


  if (!machine) {

    throw new Error(
      `Machine not found: ${machineId}`
    );

  }


  // ======================================
  // ACK DATA
  // ======================================

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


  // ======================================
  // PERSIST ACK
  // ======================================

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
    machines.get(
      machineId
    );


  if (!machine) {

    return null;

  }


  // ======================================
  // CHECK WHETHER ALREADY OFFLINE
  // ======================================

  const wasConnected =
    machine.connected;


  machine.connected =
    false;

  machine.status =
    "offline";


  machines.set(
    machineId,
    machine
  );


  // ======================================
  // ALREADY OFFLINE
  // ======================================
  //
  // Firebase ko duplicate offline write
  // nahi karni.
  //

  if (!wasConnected) {

    console.log(
      `⏭️ Machine already offline [${machineId}] — Firestore write skipped`
    );


    return {
      ...machine,
    };

  }


  // ======================================
  // FIRESTORE
  // ======================================

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


    console.log(
      `🔌 Machine marked offline [${machineId}]`
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


  // ======================================
  // REMOVE RUNTIME STATE
  // ======================================

  machines.delete(
    machineId
  );


  // ======================================
  // REMOVE FIRESTORE RECORD
  // ======================================

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

  markCommandSent,

  markCommandAck,

  disconnectMachine,

  createUserMachine,

  checkMachineOwnership,

  getUserMachines,

  deleteUserMachine,

};