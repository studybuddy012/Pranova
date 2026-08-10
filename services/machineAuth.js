const crypto = require("crypto");


// ========================================
// MACHINE CONFIGURATION
// ========================================

const MACHINE_ID = process.env.MACHINE_ID;
const MACHINE_SECRET = process.env.MACHINE_SECRET;


// ========================================
// VERIFY MACHINE
// ========================================

function verifyMachine(listenerId, secret) {

  // Missing credentials
  if (!listenerId || !secret) {
    return false;
  }


  // Server configuration missing
  if (!MACHINE_ID || !MACHINE_SECRET) {

    console.error(
      "❌ Machine authentication environment variables missing"
    );

    return false;
  }


  // Check machine ID
  if (listenerId !== MACHINE_ID) {
    return false;
  }


  // Convert secrets to buffers
  const providedSecret =
    Buffer.from(secret);

  const expectedSecret =
    Buffer.from(MACHINE_SECRET);


  // timingSafeEqual requires
  // both buffers to have same length
  if (
    providedSecret.length !==
    expectedSecret.length
  ) {
    return false;
  }


  // Secure secret comparison
  return crypto.timingSafeEqual(
    providedSecret,
    expectedSecret
  );
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  verifyMachine,
};