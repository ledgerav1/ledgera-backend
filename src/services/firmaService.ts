import PDFDocument from "pdfkit";
import axios from "axios";

const FIRMA_API_KEY = process.env.FIRMA_API_KEY!;
const BASE = "https://api.firma.dev/functions/v1/signing-request-api";

const headers = {
  Authorization: FIRMA_API_KEY,
  "Content-Type": "application/json",
};

export async function registerWebhook(url: string): Promise<void> {
  try {
    const list = await axios.get(BASE + "/webhooks", { headers });
    const exists = list.data?.some((w: any) => w.url === url);
    if (exists) return;

    await axios.post(
      BASE + "/webhooks",
      {
        url,
        events: [
          "signing_request.sent",
          "signing_request.viewed",
          "signing_request.finished",
          "signing_request.cancelled",
          "signing_request.expired",
        ],
      },
      { headers }
    );
    console.log("Firma.dev webhook registered:", url);
  } catch (err: any) {
    console.warn("Firma webhook registration skipped:", err?.response?.data || err.message);
  }
}

function buildPDF(params: {
  clientName: string;
  clientContact: string;
  state: string;
  locationCount: number;
  monthlyFee: number;
  setupFee: number;
  documentType: string;
  documentLabel: string;
  effectiveDate: string;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const {
      clientName,
      clientContact,
      state,
      locationCount,
      monthlyFee,
      setupFee,
      documentLabel,
      documentType,
      effectiveDate,
    } = params;

    const doc = new PDFDocument({ margin: 60, size: "LETTER" });
    const chunks: Buffer[] = [];

    doc.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
    doc.on("error", reject);

    doc.fontSize(18).font("Helvetica-Bold").text("LEDGERA GLOBAL, INC.", { align: "center" });
    doc.fontSize(14).font("Helvetica").text(documentLabel.toUpperCase(), { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#888888").text("Effective Date: " + effectiveDate, { align: "center" });
    doc.fillColor("#000000").moveDown(1);

    doc
      .fontSize(10)
      .font("Helvetica")
      .text(
        `This ${documentLabel} ("Agreement") is entered into as of ${effectiveDate} ` +
          `between Ledgera Global, Inc., a Delaware C-Corporation ("Service Provider"), ` +
          `and ${clientName}, a ${state} corporation ("Client").`,
        { align: "justify" }
      );
    doc.moveDown(1);

    const section = (title: string, body: string) => {
      doc.fontSize(10).font("Helvetica-Bold").text(title);
      doc.fontSize(10).font("Helvetica").text(body, { align: "justify" });
      doc.moveDown(0.8);
    };

    if (documentType === "msa") {
      section(
        "1. Scope of Services",
        "Service Provider shall provide accounting, reporting, financial management, and " +
          "margin/recovery intelligence services to Client across all Locations. Additional Locations " +
          "incur a Setup Fee of $2,500 and Monthly Fee of $1,250 per Location. All reporting adheres " +
          "to SEC-grade recordkeeping standards."
      );

      section(
        "2. Term",
        "Initial Term: 12 months from Effective Date. Automatically renews month-to-month " +
          "unless either party provides 30 days written notice of non-renewal."
      );

      section(
        "3. Fees & Payment (Net 15)",
        `Setup Fee: $${setupFee.toLocaleString()} total (${locationCount} location(s) x $2,500). ` +
          `Monthly Fee: $${monthlyFee.toLocaleString()}/mo (${locationCount} location(s) x $1,250). ` +
          "Payment due within 15 days of invoice. Late payments accrue 1.5% interest per month."
      );

      section(
        "4. Early Termination",
        "Client may not terminate during the Initial Term except upon material uncured breach. " +
          "Early termination fee: greater of 50% of remaining Monthly Fees or $5,000 minimum."
      );

      section(
        "5. Confidentiality & Data Security",
        "Both parties shall maintain strict confidentiality. Service Provider employs encrypted " +
          "databases, role-based access controls, and full transaction logging."
      );

      section(
        "6. Limitation of Liability",
        "Limited to direct damages not exceeding total fees paid in the 12 months preceding the " +
          "claim. No liability for indirect, consequential, or punitive damages."
      );

      section(
        "7. Indemnification",
        "Each party shall indemnify the other from third-party claims arising from its own breach, " +
          "negligence, or willful misconduct."
      );

      section(
        "8. Force Majeure",
        "Neither party is liable for delays caused by events beyond reasonable control. " +
          "Affected party must provide prompt written notice."
      );

      section(
        "9. Governing Law & Dispute Resolution",
        `Governed by the laws of the State of ${state}. Good-faith mediation required before ` +
          `litigation. Unresolved disputes subject to courts in ${state}.`
      );

      section(
        "10. Amendments & Miscellaneous",
        "Amendments must be in writing and signed by both parties. Client may not assign this " +
          "Agreement without prior written consent. Severability applies."
      );
    }

    if (documentType === "nda") {
      section(
        "1. Definition of Confidential Information",
        "Includes business plans, financial data, proprietary software, client lists, trade " +
          "secrets, and all non-public information shared between the Parties."
      );

      section(
        "2. Obligations of Confidentiality",
        "Each Party shall hold all Confidential Information in strict confidence and use it " +
          "solely for evaluating a potential business relationship."
      );

      section("3. Term", "Three (3) years from Effective Date. Trade secret obligations survive indefinitely.");

      section(
        "4. Return or Destruction",
        "Upon request, each Party shall return or certifiably destroy all Confidential " +
          "Information within 10 business days and confirm in writing."
      );

      section(
        "5. No License or Obligation",
        "Nothing herein grants any IP rights. This NDA does not obligate either Party to enter " +
          "into any further agreement."
      );

      section(
        "6. Remedies",
        "Breach may cause irreparable harm. Either Party may seek injunctive relief without " +
          "posting bond, in addition to all other available remedies."
      );

      section("7. Governing Law", `Governed by the laws of the State of ${state}.`);
    }

    if (documentType === "loi") {
      doc
        .fontSize(10)
        .font("Helvetica-BoldOblique")
        .text(
          "Note: This LOI is non-binding except Sections 4 (Confidentiality), " +
            "5 (Exclusivity), and 6 (Governing Law).",
          { align: "justify" }
        );
      doc.font("Helvetica").moveDown(0.8);

      section(
        "1. Proposed Services",
        "Real-time financial reporting, cash recovery tracking, EBITDA analysis, " +
          "SEC-grade audit trail, multi-location financial consolidation."
      );

      section(
        "2. Proposed Commercial Terms",
        `Setup Fee: $2,500/location. Monthly Fee: $1,250/location. Initial Term: 12 months. ` +
          `Payment Terms: Net 15. Performance Kicker (optional): 5% of verified recovered cash, quarterly.`
      );

      section(
        "3. Proposed Timeline",
        "NDA execution within 3 business days. Due diligence within 10 business days. " +
          "MSA execution within 20 business days. Platform onboarding within 5 business days of MSA."
      );

      section(
        "4. Confidentiality (Binding)",
        "All discussions and proposed terms shall be kept strictly confidential for two (2) years."
      );

      section(
        "5. Exclusivity (Binding)",
        "For 30 days from this LOI, Prospective Client shall not negotiate with competing " +
          "financial management platforms without prior written consent from Ledgera."
      );

      section("6. Governing Law (Binding)", `Binding provisions governed by the laws of the State of ${state}.`);

      section(
        "7. No Obligation",
        "Except as stated in Sections 4-6, this LOI creates no binding obligation. " +
          "Either party may withdraw at any time prior to a binding agreement."
      );
    }

    if (documentType === "iou") {
      section(
        "1. Shared Values & Operating Principles",
        "Transparency, Integrity, Accountability, Collaboration, and Compliance govern " +
          "all interactions between the Parties."
      );

      section(
        "2. Data Governance & Handling",
        "All data processed per CCPA/GDPR. Retained for a minimum of 7 years for audit " +
          "purposes. Data breach notification within 72 hours. Client data never sold or shared."
      );

      section(
        "3. Reporting & Communication Standards",
        "Monthly: Cash Flow & Recovery Report, EBITDA & Margin Analysis, KPI Summary. " +
          "Quarterly: Executive Summary. On Request: Audit Trail Export."
      );

      section(
        "4. Escalation & Dispute Protocol",
        "Level 1: Direct contacts (3 days). Level 2: Financial/Operations leads (7 days). " +
          "Level 3: Executive escalation (14 days). Level 4: Formal mediation per MSA."
      );

      section(
        "5. Ethical Standards & Anti-Corruption",
        "Both Parties comply with FCPA and all applicable anti-corruption laws. No improper " +
          "payments, gifts, or incentives shall be offered or accepted."
      );

      section(
        "6. Review & Amendment",
        "This IU shall be reviewed annually. Amendments effective upon written agreement. " +
          "In conflict with the MSA, the MSA governs."
      );
    }

    doc.moveDown(1.5);
    doc.fontSize(10).font("Helvetica-Bold").text("SIGNATURES", { align: "center" });
    doc.moveDown(0.5);

    const sigY = doc.y;

    doc.fontSize(9).font("Helvetica-Bold").text("Ledgera Global, Inc.", 60, sigY);
    doc.fontSize(9).font("Helvetica").text("Service Provider · Delaware C-Corp", 60, doc.y);
    doc.moveDown(2);
    doc.moveTo(60, doc.y).lineTo(260, doc.y).stroke();
    doc.fontSize(8).text("Authorized Signature", 60, doc.y + 4);
    doc.moveDown(1.5);
    doc.moveTo(60, doc.y).lineTo(260, doc.y).stroke();
    doc.fontSize(8).text("Printed Name / Title / Date", 60, doc.y + 4);

    doc.fontSize(9).font("Helvetica-Bold").text(clientName, 320, sigY);
    doc.fontSize(9).font("Helvetica").text(`${clientContact} · ${state} Corporation`, 320, sigY + 14);
    doc.moveTo(320, sigY + 56).lineTo(540, sigY + 56).stroke();
    doc.fontSize(8).text("Client Signature", 320, sigY + 60);
    doc.moveTo(320, sigY + 80).lineTo(540, sigY + 80).stroke();
    doc.fontSize(8).text("Printed Name / Title / Date", 320, sigY + 84);

    doc.end();
  });
}

export interface SendFirmaParams {
  clientName: string;
  clientContact: string;
  clientEmail: string;
  state: string;
  locationCount: number;
  monthlyFee: number;
  setupFee: number;
  documentType: string;
  documentLabel: string;
}

export interface FirmaResult {
  signingRequestId: string;
  status: string;
  signingUrl?: string;
  expiresAt?: string;
}

export async function sendFirmaDoc(params: SendFirmaParams): Promise<FirmaResult> {
  const effectiveDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const pdfBase64 = await buildPDF({ ...params, effectiveDate });

  const createRes = await axios.post(
    BASE + "/signing-requests",
    {
      name: params.documentLabel + " — " + params.clientName,
      description: "Ledgera Global, Inc. — " + effectiveDate,
      document: pdfBase64,
      expiration_hours: 168,
      settings: {
        allow_download: true,
        attach_pdf_on_finish: true,
        send_signing_email: true,
        send_finish_email: true,
        send_expiration_email: true,
        send_cancellation_email: true,
        allow_editing_before_sending: false,
      },
      recipients: [
        {
          id: "temp_client",
          name: params.clientContact,
          email: params.clientEmail,
          role: "signer",
        },
        {
          id: "temp_ledgera",
          name: "Ledgera Global",
          email: process.env.LEDGERA_SIGNER_EMAIL || "hello@ledgeraglobal.com",
          role: "signer",
        },
      ],
      fields: [
        {
          type: "signature",
          recipient_id: "temp_client",
          page: 1,
          x: 320,
          y: 680,
          width: 180,
          height: 40,
          required: true,
        },
        {
          type: "date",
          recipient_id: "temp_client",
          page: 1,
          x: 320,
          y: 730,
          width: 180,
          height: 24,
          required: true,
        },
        {
          type: "signature",
          recipient_id: "temp_ledgera",
          page: 1,
          x: 60,
          y: 680,
          width: 180,
          height: 40,
          required: true,
        },
        {
          type: "date",
          recipient_id: "temp_ledgera",
          page: 1,
          x: 60,
          y: 730,
          width: 180,
          height: 24,
          required: true,
        },
      ],
    },
    { headers }
  );

  const signingRequestId: string = createRes.data.id;

  const sendRes = await axios.post(BASE + "/signing-requests/" + signingRequestId + "/send", {}, { headers });

  let signingUrl: string | undefined;
  try {
    const usersRes = await axios.get(BASE + "/signing-requests/" + signingRequestId + "/users", {
      headers,
    });
    const clientUser = usersRes.data?.find((u: any) => u.email === params.clientEmail);
    if (clientUser?.id) {
      signingUrl = "https://app.firma.dev/signing/" + clientUser.id;
    }
  } catch (_) {
    // Non-critical — email was still sent
  }

  return {
    signingRequestId,
    status: sendRes.data?.message || "sent",
    signingUrl,
    expiresAt: sendRes.data?.expires_at,
  };
}
