const express = require("express");

const verifyToken =
  require("../middleware/auth");

const {
  getMachine,
  getAllMachines,
  markCommandSent,
  checkMachineOwnership,
  createUserMachine,
  getUserMachines,
} = require("../services/machineService");

const {
  sendToMachine,
  isMachineConnected,
} = require("../services/machineSocket");

const {
  generatePairingCode,
  setPairingCode,
  updateMachine,
} = require("../services/machineRepository");

const router =
  express.Router();


// ========================================
// GET MY MACHINES
// ========================================

router.get(
  "/",
  verifyToken,
  async (req, res) => {

    try {

      const machines =
        await getUserMachines(
          req.user.uid
        );

      res.json({

        success: true,

        machines,

      });

    } catch (error) {

      console.error(
        "Machine list error:",
        error.message
      );

      res.status(500).json({

        success: false,

        message:
          "Failed to get machines",

      });
    }
  }
);


// ========================================
// GET MACHINE STATUS
// ========================================

router.get(
  "/:machineId/status",
  verifyToken,
  async (req, res) => {

    try {

      const {
        machineId,
      } = req.params;


      const owner =
        await checkMachineOwnership(
          machineId,
          req.user.uid
        );


      if (!owner) {

        return res.status(403).json({

          success: false,

          message:
            "You do not have access to this machine",

        });
      }


      const machine =
        getMachine(
          machineId
        );


      if (!machine) {

        return res.status(404).json({

          success: false,

          message:
            "Machine is not currently connected",

        });
      }


      res.json({

        success: true,

        machine,

      });

    } catch (error) {

      console.error(
        "Machine status error:",
        error.message
      );

      res.status(500).json({

        success: false,

        message:
          "Failed to get machine status",

      });
    }
  }
);


// ========================================
// REGISTER MACHINE
// ========================================

router.post(
  "/register",
  verifyToken,
  async (req, res) => {

    try {

      const {
        machineId,
        name,
      } = req.body;


      if (!machineId) {

        return res.status(400).json({

          success: false,

          message:
            "machineId is required",

        });
      }


      const existing =
        await require(
          "../services/machineRepository"
        ).getMachine(
          machineId
        );


      if (existing) {

        return res.status(409).json({

          success: false,

          message:
            "Machine is already registered",

        });
      }


      const machine =
        await createUserMachine(

          machineId,

          req.user.uid,

          name ||
            "AlphaCut Machine"

        );


      res.status(201).json({

        success: true,

        message:
          "Machine registered successfully",

        machine,

      });

    } catch (error) {

      console.error(
        "Machine registration error:",
        error.message
      );

      res.status(500).json({

        success: false,

        message:
          "Failed to register machine",

      });
    }
  }
);


// ========================================
// GENERATE PAIRING CODE
// ========================================

router.post(
  "/pairing-code",
  verifyToken,
  async (req, res) => {

    try {

      const {
        machineId,
      } = req.body;


      if (!machineId) {

        return res.status(400).json({

          success: false,

          message:
            "machineId is required",

        });
      }


      const machine =
        await getMachine(
          machineId
        );


      if (!machine) {

        return res.status(404).json({

          success: false,

          message:
            "Machine not found",

        });
      }


      // ----------------------------------------
      // Already paired
      // ----------------------------------------

      if (machine.paired) {

        return res.status(409).json({

          success: false,

          message:
            "Machine is already paired",

        });
      }


      // ----------------------------------------
      // Generate code
      // ----------------------------------------

      const pairingCode =
        generatePairingCode();


      const updatedMachine =
        await setPairingCode(
          machineId,
          pairingCode
        );


      console.log(
        `🔐 Pairing code generated for ${machineId}`
      );


      res.json({

        success: true,

        machineId,

        pairingCode,

        pairingCodeCreatedAt:
          updatedMachine
            .pairingCodeCreatedAt,

      });

    } catch (error) {

      console.error(
        "Pairing code error:",
        error.message
      );

      res.status(500).json({

        success: false,

        message:
          "Failed to generate pairing code",

      });
    }
  }
);


// ========================================
// PAIR MACHINE
// ========================================

router.post(
  "/pair",
  verifyToken,
  async (req, res) => {

    try {

      const {
        machineId,
        pairingCode,
      } = req.body;


      // ----------------------------------------
      // VALIDATION
      // ----------------------------------------

      if (!machineId) {

        return res.status(400).json({

          success: false,

          message:
            "machineId is required",

        });
      }


      if (!pairingCode) {

        return res.status(400).json({

          success: false,

          message:
            "pairingCode is required",

        });
      }


      if (
        !/^\d{6}$/.test(
          String(pairingCode)
        )
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Pairing code must be exactly 6 digits",

        });
      }


      // ----------------------------------------
      // GET MACHINE
      // ----------------------------------------

      const machine =
        await getMachine(
          machineId
        );


      if (!machine) {

        return res.status(404).json({

          success: false,

          message:
            "Machine not found",

        });
      }


      // ----------------------------------------
      // ALREADY PAIRED
      // ----------------------------------------

      if (machine.paired) {

        return res.status(409).json({

          success: false,

          message:
            "Machine is already paired",

        });
      }


      // ----------------------------------------
      // CHECK CODE
      // ----------------------------------------

      if (
        machine.pairingCode
        !== String(pairingCode)
      ) {

        return res.status(401).json({

          success: false,

          message:
            "Invalid pairing code",

        });
      }


      // ----------------------------------------
      // CODE EXPIRATION
      // ----------------------------------------

      if (
        !machine.pairingCodeCreatedAt
      ) {

        return res.status(401).json({

          success: false,

          message:
            "Pairing code has expired",

        });
      }


      const createdAt =
        new Date(
          machine.pairingCodeCreatedAt
        ).getTime();


      const now =
        Date.now();


      const age =
        now - createdAt;


      const TEN_MINUTES =
        10 * 60 * 1000;


      if (
        age < 0
        || age > TEN_MINUTES
      ) {

        return res.status(401).json({

          success: false,

          message:
            "Pairing code has expired",

        });
      }


      // ----------------------------------------
      // PAIR MACHINE
      // ----------------------------------------

      const updatedMachine =
        await updateMachine(

          machineId,

          {

            ownerId:
              req.user.uid,

            paired:
              true,

            pairingCode:
              null,

            pairingCodeCreatedAt:
              null,

          }

        );


      console.log(
        `🔗 Machine paired: ${machineId} → ${req.user.uid}`
      );


      // ----------------------------------------
      // RESPONSE
      // ----------------------------------------

      res.json({

        success: true,

        message:
          "Machine paired successfully",

        machine:
          updatedMachine,

      });

    } catch (error) {

      console.error(
        "Machine pairing error:",
        error.message
      );

      res.status(500).json({

        success: false,

        message:
          "Failed to pair machine",

      });
    }
  }
);


// ========================================
// SEND COMMAND
// ========================================

router.post(
  "/command",
  verifyToken,
  async (req, res) => {

    try {

      const {
        machineId,
        command,
      } = req.body;


      // ----------------------------------------
      // VALIDATION
      // ----------------------------------------

      if (!machineId) {

        return res.status(400).json({

          success: false,

          message:
            "machineId is required",

        });
      }


      if (!command) {

        return res.status(400).json({

          success: false,

          message:
            "command is required",

        });
      }


      // ----------------------------------------
      // OWNERSHIP
      // ----------------------------------------

      const owner =
        await checkMachineOwnership(
          machineId,
          req.user.uid
        );


      if (!owner) {

        console.log(
          `🚫 Unauthorized machine access: ${req.user.uid} → ${machineId}`
        );


        return res.status(403).json({

          success: false,

          message:
            "You do not have access to this machine",

        });
      }


      // ----------------------------------------
      // CONNECTION
      // ----------------------------------------

      if (
        !isMachineConnected(
          machineId
        )
      ) {

        return res.status(503).json({

          success: false,

          message:
            "Machine is not connected",

          machineId,

        });
      }


      // ----------------------------------------
      // SEND COMMAND
      // ----------------------------------------

      const sent =
        sendToMachine(

          machineId,

          {

            type:
              "command",

            machineId,

            command,

            timestamp:
              new Date()
                .toISOString(),

            requestedBy:
              req.user.uid,

          }

        );


      if (!sent) {

        return res.status(503).json({

          success: false,

          message:
            "Failed to send command",

          machineId,

        });
      }


      // ----------------------------------------
      // UPDATE COMMAND STATE
      // ----------------------------------------

      await markCommandSent(

        machineId,

        command

      );


      // ----------------------------------------
      // RESPONSE
      // ----------------------------------------

      res.json({

        success: true,

        message:
          "Command sent to machine",

        machineId,

        command,

        requestedBy:
          req.user.uid,

      });

    } catch (error) {

      console.error(
        "Machine command error:",
        error.message
      );


      res.status(500).json({

        success: false,

        message:
          "Failed to send machine command",

      });
    }
  }
);


// ========================================
// EXPORT
// ========================================

module.exports = router;
