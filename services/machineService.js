const {
  getMachine: getMachineFromDb,
  createMachine,
  updateMachine: updateMachineInDb,
  isMachineOwner,
  getMachinesByOwner,
  deleteMachine,
  generatePairingCode,
  setPairingCode,
} = require("./machineRepository");


// ========================================
// RUNTIME MACHINE STATE
// ========================================

const machines = new Map();


// ========================================
// PAIRING CODE EXPIRY
// ========================================

const PAIRING_CODE_EXPIRY_MS =
  10 * 60 * 1000; // 10 minutes


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
// GENERATE / REFRESH PAIRING CODE
// ========================================

async function createMachinePairingCode(
  machineId
) {

  if (!machineId) {

    throw new Error(
      "machineId is required"
    );

  }


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
  // DON'T GENERATE FOR ALREADY PAIRED MACHINE
  // ======================================

  if (
    machine.paired === true &&
    machine.ownerId
  ) {

    return {
      machineId,

      paired: true,

      pairingCode: null,

      message:
        "Machine is already paired",

    };

  }


  const pairingCode =
    generatePairingCode();


  const createdAt =
    new Date().toISOString();


  await setPairingCode(
    machineId,
    pairingCode
  );


  // Keep runtime info if machine
  // is currently connected.

  const runtime =
    machines.get(machineId);


  if (runtime) {

    runtime.pairingCode =
      pairingCode;

    runtime.pairingCodeCreatedAt =
      createdAt;

    machines.set(
      machineId,
      runtime
    );

  }


  console.log(
    `🔐 Pairing code generated [${machineId}]`
  );


  return {

    machineId,

    paired: false,

    pairingCode,

    pairingCodeCreatedAt:
      createdAt,

    expiresIn:
      PAIRING_CODE_EXPIRY_MS,

  };

}


// ========================================
// GET PAIRING INFORMATION
// ========================================

async function getMachinePairingInfo(
  machineId
) {

  const machine =
    await getMachineFromDb(
      machineId
    );


  if (!machine) {

    throw new Error(
      `Machine not found: ${machineId}`
    );

  }


  return {

    machineId,

    paired:
      machine.paired === true,

    ownerId:
      machine.ownerId ||
      null,

    pairingCode:
      machine.pairingCode ||
      null,

    pairingCodeCreatedAt:
      machine.pairingCodeCreatedAt ||
      null,

  };

}


// ========================================
// PAIR MACHINE WITH USER
// ========================================

async function pairMachine(
  machineId,
  ownerId,
  pairingCode
) {

  if (!machineId) {

    throw new Error(
      "machineId is required"
    );

  }

  if (!ownerId) {

    throw new Error(
      "ownerId is required"
    );

  }

  if (!pairingCode) {

    throw new Error(
      "pairingCode is required"
    );

  }


  const machine =
    await getMachineFromDb(
      machineId
    );


  if (!machine) {

    throw new Error(
      "Machine not found"
    );

  }


  // ======================================
  // ALREADY PAIRED
  // ======================================

  if (
    machine.paired === true &&
    machine.ownerId
  ) {

    throw new Error(
      "Machine is already paired"
    );

  }


  // ======================================
  // CODE CHECK
  // ======================================

  if (
    machine.pairingCode !==
    String(pairingCode)
  ) {

    throw new Error(
      "Invalid pairing code"
    );

  }


  // ======================================
  // EXPIRY CHECK
  // ======================================

  if (
    !machine.pairingCodeCreatedAt
  ) {

    throw new Error(
      "Pairing code is invalid"
    );

  }


  const createdAt =
    new Date(
      machine.pairingCodeCreatedAt
    ).getTime();


  const now =
    Date.now();


  if (
    Number.isNaN(createdAt) ||
    now - createdAt >
      PAIRING_CODE_EXPIRY_MS
  ) {

    throw new Error(
      "Pairing code has expired"
    );

  }


  // ======================================
  // PAIR MACHINE
  // ======================================

  await updateMachineInDb(
    machineId,
    {

      ownerId,

      paired:
        true,

      pairingCode:
        null,

      pairingCodeCreatedAt:
        null,

    }
  );


  console.log(
    `🔗 Machine paired [${machineId}] → ${ownerId}`
  );


  return await getMachineFromDb(
    machineId
  );

}


// ========================================
// BUILD PERSISTENT STATE SNAPSHOT
// ========================================

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


  // IMPORTANT:
  // machineId must represent the
  // actual ESP32 machine identity.

  const machineId =
    data.machineId ||
    data.listenerId;


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


  const previousMachine = {
    ...machine,
  };


  const state =
    data.state || {};


  if (
    typeof state.connected ===
    "boolean"
  ) {

    machine.connected =
      state.connected;

  }


  if (
    typeof state.dispatcherReady ===
    "boolean"
  ) {

    machine.dispatcherReady =
      state.dispatcherReady;

  }


  if (
    typeof state.sawReady ===
    "boolean"
  ) {

    machine.sawReady =
      state.sawReady;

  }


  if (
    state.firmwareVersion !==
    undefined
  ) {

    machine.firmwareVersion =
      state.firmwareVersion;

  }


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


  if (
    typeof state.emergency ===
    "boolean"
  ) {

    machine.emergency =
      state.emergency;

  }


  machine.lastMachineStateAt =
    data.timestamp ||
    new Date().toISOString();


  machines.set(
    machineId,
    machine
  );


  const changed =
    hasStateChanged(
      previousMachine,
      machine
    );


  if (!changed) {

    console.log(
      `⏭️ No persistent state change [${machineId}] — Firestore write skipped`
    );

    return {
      ...machine,
    };

  }


  console.log(
    `🔄 Persistent machine state changed [${machineId}]`
  );


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
    data.machineId ||
    data.listenerId;


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


  if (!wasConnected) {

    console.log(
      `⏭️ Machine already offline [${machineId}] — Firestore write skipped`
    );

    return {
      ...machine,
    };

  }


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


  machines.delete(
    machineId
  );


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

  createMachinePairingCode,

  getMachinePairingInfo,

  pairMachine,

};
