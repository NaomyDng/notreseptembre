import { google } from "googleapis";

async function appendToGoogleSheet(row) {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEETS_TAB_NAME || "Feuille 1";

  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error("Variables Google manquantes");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:J`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [row]
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const body = req.body || {};

    const fullName = (body.fullName || "").trim();
    const phone = (body.phone || "").trim();
    const email = (body.email || "").trim();
    const attendance = (body.attendance || "").trim();
    const menuChoice = (body.menuChoice || "").trim();
    const messageInline = (body.messageInline || "").trim();
    const submittedAt = body.submittedAt || new Date().toISOString();
    const source = body.source || "notre-septembre-site";

    if (!fullName || !attendance || !menuChoice) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    if (!phone && !email) {
      return res.status(400).json({ error: "Email ou téléphone requis" });
    }

    await appendToGoogleSheet([
      submittedAt,
      fullName,
      phone,
      email,
      attendance,
      menuChoice,
      messageInline,
      source,
      email ? "oui" : "non",
      phone ? "oui" : "non"
    ]);

    return res.status(200).json({
      ok: true,
      sentEmail: false,
      sentWhatsApp: false
    });
  } catch (error) {
    console.error("ERREUR RSVP:", error);
    return res.status(500).json({
      error: error.message || "Erreur interne"
    });
  }
}
