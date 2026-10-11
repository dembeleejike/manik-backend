// Three ranks:
//   superadmin — the business owner. Exactly ONE person, identified by the
//                SUPER_ADMIN_EMAIL setting. Invisible to everyone below.
//   owner      — shown in the app as "Admin". Sees financials and settings,
//                can add admins and staff, but can't see or touch the super admin.
//   staff      — day-to-day tools only.
const SUPER = "superadmin";
const ADMIN = "owner"; // stored value kept for backward compatibility; displayed as "Admin"
const STAFF = "staff";

const superEmail = () => String(process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();

// The rank actually in force. When SUPER_ADMIN_EMAIL is set it is the ONLY
// source of truth: that email is the super admin and nobody else can be, even if
// the database were edited by hand.
function effectiveRole(admin) {
  const s = superEmail();
  const email = String((admin && admin.email) || "").trim().toLowerCase();
  if (s) {
    if (email && email === s) return SUPER;
    return admin.role === SUPER ? ADMIN : admin.role;
  }
  return admin.role;
}

const isOwnerLevel = (role) => role === ADMIN || role === SUPER;

module.exports = { SUPER, ADMIN, STAFF, superEmail, effectiveRole, isOwnerLevel };
