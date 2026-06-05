// Shared audit-log writer.
//
// Records an entry in the `audit_log` table. Used by the admin handlers
// (human actions) and by automation such as the referral validator
// (actor = a `system:*` pseudo-id). Best-effort: a logging failure must
// never break the operation being audited, so errors are swallowed.
//
// Uses the same shared serverless-mysql singleton as every handler, so the
// INSERT runs on the caller's existing connection — call before `mysql.end()`.

const mysql = require("../db");

async function logAuditAction(adminId, action, entityType, entityId, details = null) {
  try {
    await mysql.query(
      "INSERT INTO audit_log (admin_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)",
      [adminId, action, entityType, entityId, details ? JSON.stringify(details) : null],
    );
  } catch (error) {
    console.error("Failed to log audit action:", error);
    // Don't throw - audit logging shouldn't break the main operation
  }
}

module.exports = { logAuditAction };
