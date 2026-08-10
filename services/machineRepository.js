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

  if (!machineId) {
    throw new Error(
      "machineId is required"
    );
  }

  if (!pairingCode) {
    throw new Error(
      "pairingCode is required"
    );
  }

  if (!/^\d{6}$/.test(pairingCode)) {
    throw new Error(
      "pairingCode must be exactly 6 digits"
    );
  }

  const machine =
    await getMachine(machineId);

  if (!machine) {
    throw new Error(
      "Machine not found"
    );
  }

  await updateMachine(
    machineId,
    {
      pairingCode,

      pairingCodeCreatedAt:
        new Date().toISOString(),

      paired: false,
    }
  );

  return getMachine(machineId);
}


// ========================================
// CREATE MACHINE
// ========================================

async function createMachine(
  machineId,
  ownerId = null,
  name = "AlphaCut Machine"
) {

  if (!machineId) {
    throw new Error(
      "machineId is required"
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

  const now =
    new Date().toISOString();

  const machine = {

    machineId,

    ownerId,

    name,

    paired:
      ownerId !== null,

    pairingCode: null,

    pairingCodeCreatedAt: null,

    connected: false,

    status: "offline",

    dispatcherReady: false,

    sawReady: false,

    firmwareVersion: null,

    machineState: null,

    emergency: false,

    createdAt: now,

    updatedAt: now,
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

  if (!machineId) {
    throw new Error(
      "machineId is required"
    );
  }

  if (!updates) {
    throw new Error(
      "updates are required"
    );
  }

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

  if (!machineId || !ownerId) {
    return false;
  }

  const machine =
    await getMachine(
      machineId
    );

  if (!machine) {
    return false;
  }

  return (
    machine.ownerId === ownerId
  );
}


// ========================================
// GET USER MACHINES
// ========================================

async function getMachinesByOwner(
  ownerId
) {

  if (!ownerId) {
    return [];
  }

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
      machineId: doc.id,
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

  if (!machineId) {
    throw new Error(
      "machineId is required"
    );
  }

  await machinesCollection
    .doc(machineId)
    .delete();

  return true;
}


// ========================================
// EXPORTS
// ========================================

module.exports = {

  getMachine,

  generatePairingCode,

  setPairingCode,

  createMachine,

  updateMachine,

  isMachineOwner,

  getMachinesByOwner,

  deleteMachine,

};
