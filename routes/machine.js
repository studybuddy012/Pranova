const express = require("express");

const verifyToken = require("../middleware/auth");

const {
  getMachine,
  getAllMachines,
  registerMachine,
  markCommandSent,
  checkMachineOwnership,
  createUserMachine,
} = require("../services/machineService");

const {
  sendToMachine,
  isMachineConnected,
} = require("../services/machineSocket");

const router = express.Router();


// ========================================
// GET MY MACHINES
// ========================================

router.get("/", verifyToken, async (req, res) => {

  try {

    const {
      getUserMachines,
    } = require("../services/machineService");


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

});


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
      // OWNERSHIP CHECK
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
// CREATE / CLAIM MACHINE
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
      // CHECK IF ALREADY EXISTS
      // ==================================

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


module.exports = router;