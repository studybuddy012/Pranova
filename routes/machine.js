const express = require("express");

const verifyToken =
  require("../middleware/auth");

const {
  getMachine,
  getAllMachines,
  registerMachine,
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
  getMachine: getMachineFromDb,
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


      // ==================================
      // OWNERSHIP
      // ==================================

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


      // ==================================
      // RUNTIME MACHINE
      // ==================================

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
// PAIR MACHINE
// ========================================
//
// Website sends:
//
// {
//   machineId: "D885D1ABC31C",
//   pairingCode: "977343"
// }
//
// Server verifies:
//
// 1. Machine exists
// 2. Machine is not already paired
// 3. Pairing code matches
// 4. Code is not expired
// 5. Logged-in Firebase user becomes owner
//
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


      // ==================================
      // VALIDATION
      // ==================================

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


      // ==================================
      // NORMALIZE
      // ==================================

      const normalizedMachineId =
        String(
          machineId
        ).trim();


      const normalizedPairingCode =
        String(
          pairingCode
        ).trim();


      // ==================================
      // VALIDATE CODE FORMAT
      // ==================================

      if (
        !/^\d{6}$/.test(
          normalizedPairingCode
        )
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Pairing code must be exactly 6 digits",

        });

      }


      // ==================================
      // GET MACHINE
      // ==================================

      const machine =
        await getMachineFromDb(
          normalizedMachineId
        );


      if (!machine) {

        return res.status(404).json({

          success: false,

          message:
            "Machine not found",

        });

      }


      // ==================================
      // ALREADY PAIRED
      // ==================================

      if (
        machine.paired === true ||
        machine.ownerId
      ) {

        // Same user already owns it
        if (
          machine.ownerId ===
          req.user.uid
        ) {

          return res.status(200).json({

            success: true,

            alreadyPaired: true,

            message:
              "Machine is already paired with your account",

            machine: {

              ...machine,

              pairingCode:
                null,

            },

          });

        }


        return res.status(409).json({

          success: false,

          message:
            "Machine is already paired with another account",

        });

      }


      // ==================================
      // CHECK PAIRING CODE EXISTS
      // ==================================

      if (
        !machine.pairingCode ||
        !machine.pairingCodeCreatedAt
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Machine does not have an active pairing code",

        });

      }


      // ==================================
      // CHECK CODE
      // ==================================

      if (
        String(
          machine.pairingCode
        ) !==
        normalizedPairingCode
      ) {

        return res.status(401).json({

          success: false,

          message:
            "Invalid pairing code",

        });

      }


      // ==================================
      // CHECK EXPIRY
      // ==================================

      const createdAt =
        new Date(
          machine.pairingCodeCreatedAt
        ).getTime();


      if (
        Number.isNaN(
          createdAt
        )
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Invalid pairing code timestamp",

        });

      }


      // 10 minutes
      const PAIRING_CODE_LIFETIME =
        10 * 60 * 1000;


      const now =
        Date.now();


      const expired =
        now -
        createdAt >
        PAIRING_CODE_LIFETIME;


      if (expired) {

        return res.status(410).json({

          success: false,

          message:
            "Pairing code has expired. Generate a new code from the machine.",

        });

      }


      // ==================================
      // PAIR MACHINE
      // ==================================

      const updatedMachine =
        await updateMachine(

          normalizedMachineId,

          {

            ownerId:
              req.user.uid,

            paired:
              true,

            // Code is single-use
            pairingCode:
              null,

            pairingCodeCreatedAt:
              null,

            pairedAt:
              new Date().toISOString(),

          }

        );


      // ==================================
      // SUCCESS
      // ==================================

      console.log(
        `🔗 Machine paired successfully: ${normalizedMachineId} → ${req.user.uid}`
      );


      return res.status(200).json({

        success: true,

        message:
          "Machine paired successfully",

        machine: {

          machineId:
            updatedMachine.machineId,

          ownerId:
            updatedMachine.ownerId,

          name:
            updatedMachine.name,

          paired:
            updatedMachine.paired,

          connected:
            updatedMachine.connected,

          status:
            updatedMachine.status,

          firmwareVersion:
            updatedMachine.firmwareVersion,

        },

      });

    } catch (error) {

      console.error(
        "Machine pairing error:",
        error.message
      );


      return res.status(500).json({

        success: false,

        message:
          "Failed to pair machine",

      });

    }

  }
);


// ========================================
// CREATE / REGISTER MACHINE
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


      // ==================================
      // CHECK EXISTING MACHINE
      // ==================================

      const existing =
        await getMachineFromDb(
          machineId
        );


      if (existing) {

        return res.status(409).json({

          success: false,

          message:
            "Machine is already registered",

        });

      }


      // ==================================
      // CREATE
      // ==================================

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


      // ==================================
      // VALIDATION
      // ==================================

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


      // ==================================
      // OWNERSHIP
      // ==================================

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


      // ==================================
      // CONNECTION
      // ==================================

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


      // ==================================
      // SEND COMMAND
      // ==================================

      const sent =
        sendToMachine(

          machineId,

          {

            type:
              "command",

            command,

            timestamp:
              new Date().toISOString(),

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


      // ==================================
      // UPDATE COMMAND STATE
      // ==================================

      await markCommandSent(

        machineId,

        command

      );


      // ==================================
      // RESPONSE
      // ==================================

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

module.exports =
  router;
