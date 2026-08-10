const { getAuth } = require("firebase-admin/auth");

async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization token required",
      });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format",
      });
    }

    const idToken = authHeader.split("Bearer ")[1];

    if (!idToken) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    const decodedToken = await getAuth().verifyIdToken(idToken);

    req.user = decodedToken;

    next();

  } catch (error) {

    console.error("Authentication failed:", error.message);

    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }
}

module.exports = verifyToken;