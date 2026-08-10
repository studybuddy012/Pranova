const { db } = require("./firebase");

const machinesCollection =
  db.collection("machines");


// ========================================
// GET MACHINE
// ========================================

async function getMachine(machineId) {

  const doc =
    await machinesCollection
      .doc(machineId)
      .get();


  if (!doc.exists) {
    return null;
  }


  return {
    machineId: doc.id,
    ...doc.data(),
  };

}

// ========================================
// GENERATE 6-DIGIT PAIRING CODE
// ========================================

function generatePairingCode() {

  return String(
    Math.floor(
      100000 +
      Math.random() * 900000
    )
  );

}


// ========================================
// SET PAIRING CODE
// ========================================

async function setPairingCode(
  machineId,
  pairingCode
) {

  const machine =
    await getMachine(machineId);

  if (!machine) {

    throw new Error(
      `Machine not found: ${machineId}`
    );

  }

  await updateMachine(
    machineId,
    {
      pairingCode:
        pairingCode,

      pairingCodeCreatedAt:
        new Date().toISOString(),

      paired:
        false,

      ownerId:
        null,
    }
  );

  return true;

}

// ========================================
// CREATE MACHINE
// ========================================

async function createMachine(
  machineId,
  ownerId,
  name = "AlphaCut Machine"
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


  const machineRef =
    machinesCollection
      .doc(machineId);


  const existing =
    await machineRef.get();


  if (existing.exists) {

    throw new Error(
      "Machine already exists"
    );

  }


  const machine = {

    machineId,

    ownerId,

    name,

    connected: false,

    status: "offline",

    dispatcherReady: false,

    sawReady: false,

    firmwareVersion: null,

    machineState: null,

    emergency: false,

    createdAt:
      new Date().toISOString(),

    updatedAt:
      new Date().toISOString(),

  };


  await machineRef.set(
    machine
  );


  return machine;

}


// ========================================
// UPDATE MACHINE
// ========================================

async function updateMachine(
  machineId,
  updates
) {

  const machineRef =
    machinesCollection
      .doc(machineId);


  await machineRef.set(

    {
      ...updates,

      updatedAt:
        new Date().toISOString(),

    },

    {
      merge: true,
    }

  );


  return getMachine(
    machineId
  );

}


// ========================================
// CHECK OWNERSHIP
// ========================================

async function isMachineOwner(
  machineId,
  ownerId
) {

  const machine =
    await getMachine(
      machineId
    );


  if (!machine) {
    return false;
  }


  return (
    machine.ownerId ===
    ownerId
  );

}


// ========================================
// GET USER MACHINES
// ========================================

async function getMachinesByOwner(
  ownerId
) {

  const snapshot =
    await machinesCollection
      .where(
        "ownerId",
        "==",
        ownerId
      )
      .get();


  return snapshot.docs.map(
    (doc) => ({

      machineId:
        doc.id,

      ...doc.data(),

    })
  );

}


// ========================================
// DELETE MACHINE
// ========================================

async function deleteMachine(
  machineId
) {

  await machinesCollection
    .doc(machineId)
    .delete();

}


// ========================================
// EXPORTS
// ========================================

module.exports = {

  getMachine,

  createMachine,

  updateMachine,

  isMachineOwner,

  getMachinesByOwner,

  deleteMachine,
  generatePairingCode,
  setPairingCode,

};
