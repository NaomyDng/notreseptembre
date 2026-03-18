import { google } from "googleapis";

function normalizePhone(phone = "") {
  let cleaned = phone.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.slice(2);
  }

  if (!cleaned.startsWith("+")) {
    if (cleaned.startsWith("0")) {
      cleaned = "+32" + cleaned.slice(1);
    } else {
      cleaned = "+" + cleaned;
    }
  }

  return cleaned;
}

function splitName(fullName = "") {
  const clean = fullName.trim().replace(/\s+/g, " ");
  const parts = clean.split(" ");

  if (parts.length <= 1) {
    return { firstName: clean, lastName: "" };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.slice(-1).join(" ")
  };
}

function attendanceLabel(value = "") {
  switch (value) {
    case "matin":
      return "Cérémonie religieuse (11h)";
    case "soir":
      return "Soirée (19h)";
    case "journee":
      return "Toute la journée (11h + 19h)";
    default:
      return value || "-";
  }
}

function menuLabel(value = "") {
  switch (value) {
    case "poisson":
      return "Menu poisson";
    case "viande":
      return "Menu viande";
    case "poulet":
      return "Menu poulet";
    default:
      return value || "-";
  }
}

async function appendToGoogleSheet(row) {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEETS_TAB_NAME || "Feuille 1";

  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error("google_env_missing");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:L`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [row]
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const {
      fullName = "",
      phone = "",
      email = "",
      attendance = "",
      menuChoice = "",
      messageInline = "",
      submittedAt = new Date().toISOString(),
      source = "notre-septembre-site"
    } = req.body || {};

    const cleanFullName = fullName.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = email.trim();
    const cleanAttendance = attendance.trim();
    const cleanMenuChoice = menuChoice.trim();
    const cleanMessageInline = messageInline.trim();

    if (!cleanFullName || !cleanAttendance || !cleanMenuChoice) {
      return res.status(400).json({ error: "missing_required_fields" });
    }

    if (!cleanPhone && !cleanEmail) {
      return res.status(400).json({ error: "missing_contact" });
    }

    const { firstName, lastName } = splitName(cleanFullName);

    await appendToGoogleSheet([
      submittedAt,
      cleanFullName,
      firstName,
      lastName,
      cleanPhone ? normalizePhone(cleanPhone) : "",
      cleanEmail,
      attendanceLabel(cleanAttendance),
      menuLabel(cleanMenuChoice),
      cleanMessageInline,
      source,
      cleanEmail ? "oui" : "non",
      cleanPhone ? "oui" : "non"
    ]);

    return res.status(200).json({
      ok: true,
      sentEmail: false,
      sentWhatsApp: false
    });
  } catch (error) {
    console.error("RSVP API error:", error);
    return res.status(500).json({
      error: "internal_error",
      details: error.message || "unknown_error"
    });
  }
}