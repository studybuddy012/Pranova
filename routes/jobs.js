const express = require("express");
const { db } = require("../services/firebase");
const verifyToken = require("../middleware/auth");

const router = express.Router();


// ========================================
// GET ALL JOBS
// ========================================

router.get("/", verifyToken, async (req, res) => {

  try {

    const userId = req.user.uid;

    const snapshot = await db
      .collection("users")
      .doc(userId)
      .collection("jobs")
      .get();

    const jobs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      jobs,
    });

  } catch (error) {

    console.error("Get jobs error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch jobs",
    });
  }
});


// ========================================
// GET SINGLE JOB
// ========================================

router.get("/:jobId", verifyToken, async (req, res) => {

  try {

    const userId = req.user.uid;
    const { jobId } = req.params;

    const doc = await db
      .collection("users")
      .doc(userId)
      .collection("jobs")
      .doc(jobId)
      .get();

    if (!doc.exists) {

      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    res.json({
      success: true,
      job: {
        id: doc.id,
        ...doc.data(),
      },
    });

  } catch (error) {

    console.error("Get job error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch job",
    });
  }
});


// ========================================
// CREATE JOB
// ========================================

router.post("/", verifyToken, async (req, res) => {

  try {

    const userId = req.user.uid;
    const jobData = req.body;

    if (!jobData || Object.keys(jobData).length === 0) {

      return res.status(400).json({
        success: false,
        message: "Job data is required",
      });
    }

    const jobRef = await db
      .collection("users")
      .doc(userId)
      .collection("jobs")
      .add({
        ...jobData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    res.status(201).json({
      success: true,
      message: "Job created successfully",
      jobId: jobRef.id,
    });

  } catch (error) {

    console.error("Create job error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create job",
    });
  }
});


// ========================================
// UPDATE JOB
// ========================================

router.put("/:jobId", verifyToken, async (req, res) => {

  try {

    const userId = req.user.uid;
    const { jobId } = req.params;

    await db
      .collection("users")
      .doc(userId)
      .collection("jobs")
      .doc(jobId)
      .update({
        ...req.body,
        updatedAt: new Date(),
      });

    res.json({
      success: true,
      message: "Job updated successfully",
    });

  } catch (error) {

    console.error("Update job error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update job",
    });
  }
});


// ========================================
// DELETE JOB
// ========================================

router.delete("/:jobId", verifyToken, async (req, res) => {

  try {

    const userId = req.user.uid;
    const { jobId } = req.params;

    await db
      .collection("users")
      .doc(userId)
      .collection("jobs")
      .doc(jobId)
      .delete();

    res.json({
      success: true,
      message: "Job deleted successfully",
    });

  } catch (error) {

    console.error("Delete job error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete job",
    });
  }
});


module.exports = router;