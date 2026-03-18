import { google } from "googleapis";
import { Resend } from "resend";

export const runtime = "nodejs";
export const maxDuration = 15;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function normalizePhone(phone = "") {
  let cleaned = phone.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.slice(2);
  }

  if (!cleaned.startsWith("+")) {
    // Par défaut Belgique si l'invité écrit 04...
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
    lastName: parts.slice(-1).join("")
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
  const sheetName = process.env.GOOGLE_SHEETS_TAB_NAME || "RSVP";

  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error("google_sheets_env_missing");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [row]
    }
  });
}

async function sendEmailConfirmation({ email, fullName, attendance, menuChoice }) {
  if (!email) return false;

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!resendApiKey || !fromEmail) {
    throw new Error("email_env_missing");
  }

  const resend = new Resend(resendApiKey);

  const attendanceText = attendanceLabel(attendance);
  const menuText = menuLabel(menuChoice);

  const subject = "Confirmation de présence — Jonathan & Naomy";

  const html = `
    <div style="margin:0;padding:0;background:#07122d;color:#ffffff;font-family:Georgia,serif;">
      <div style="max-width:680px;margin:0 auto;padding:40px 24px;">
        <div style="border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:32px;background:rgba(255,255,255,0.04);">
          <h1 style="margin:0 0 18px;font-size:30px;line-height:1.2;color:#d7c08c;">
            Merci pour votre confirmation
          </h1>

          <p style="margin:0 0 14px;font-size:18px;line-height:1.7;">
            Bonjour <strong>${fullName}</strong>,
          </p>

          <p style="margin:0 0 14px;font-size:17px;line-height:1.7;">
            Votre présence au mariage du <strong>vendredi 18 septembre 2026</strong> a bien été enregistrée.
          </p>

          <p style="margin:0 0 14px;font-size:17px;line-height:1.7;">
            <strong>Présence :</strong> ${attendanceText}<br>
            <strong>Menu :</strong> ${menuText}
          </p>

          <p style="margin:0 0 22px;font-size:17px;line-height:1.7;">
            <strong>Lieu :</strong> Château Terblock — Sint-Jansbergdreef 2, 3090 Overijse
          </p>

          <div style="margin:24px 0;padding:18px 20px;border-radius:16px;border:1px solid rgba(215,192,140,0.28);background:rgba(215,192,140,0.08);">
            <p style="margin:0 0 8px;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#d7c08c;">
              Verset
            </p>
            <p style="margin:0;font-size:17px;line-height:1.8;color:#ffffff;">
              « C'est pourquoi l'homme quittera son père et sa mère, et s'attachera à sa femme, et ils deviendront une seule chair. »
              <br>
              <strong>— Genèse 2:24</strong>
            </p>
          </div>

          <p style="margin:0;font-size:17px;line-height:1.7;">
            Nous avons hâte de célébrer ce moment avec vous.
          </p>
        </div>
      </div>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: email,
    subject,
    html
  });

  if (error) {
    console.error("Resend error:", error);
    throw new Error("email_send_failed");
  }

  return true;
}

async function sendWhatsAppConfirmation({ phone, fullName, attendance, menuChoice }) {
  if (!phone) return false;

  const normalizedPhone = normalizePhone(phone);
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const languageCode = process.env.WHATSAPP_TEMPLATE_LANG || "fr";

  if (!token || !phoneNumberId || !templateName) {
    throw new Error("whatsapp_env_missing");
  }

  const attendanceText = attendanceLabel(attendance);
  const menuText = menuLabel(menuChoice);

  const url = `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: normalizedPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: fullName || "Invité" },
            { type: "text", text: attendanceText },
            { type: "text", text: menuText },
            { type: "text", text: "Genèse 2:24" }
          ]
        }
      ]
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("WhatsApp error:", errText);
    throw new Error("whatsapp_send_failed");
  }

  return true;
}

export async function POST(request) {
  try {
    const body = await request.json();

    const fullName = (body.fullName || "").trim();
    const phone = (body.phone || "").trim();
    const email = (body.email || "").trim();
    const attendance = (body.attendance || "").trim();
    const menuChoice = (body.menuChoice || "").trim();
    const messageInline = (body.messageInline || "").trim();
    const submittedAt = body.submittedAt || new Date().toISOString();
    const source = body.source || "site";

    if (!fullName || !attendance || !menuChoice) {
      return json({ error: "missing_required_fields" }, 400);
    }

    if (!email && !phone) {
      return json({ error: "missing_contact" }, 400);
    }

    const { firstName, lastName } = splitName(fullName);

    let sentEmail = false;
    let sentWhatsApp = false;

    await appendToGoogleSheet([
      submittedAt,
      fullName,
      firstName,
      lastName,
      phone,
      email,
      attendanceLabel(attendance),
      menuLabel(menuChoice),
      messageInline,
      source,
      email ? "oui" : "non",
      phone ? "oui" : "non"
    ]);

    if (email) {
      sentEmail = await sendEmailConfirmation({
        email,
        fullName,
        attendance,
        menuChoice
      });
    }

    if (phone) {
      sentWhatsApp = await sendWhatsAppConfirmation({
        phone,
        fullName,
        attendance,
        menuChoice
      });
    }

    return json({
      ok: true,
      sentEmail,
      sentWhatsApp
    });
  } catch (error) {
    console.error(error);
    return json({ error: "internal_error" }, 500);
  }
}