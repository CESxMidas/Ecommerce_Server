import nodemailer from "nodemailer";

let transporter = null;

function normalizeAppPassword(password) {
  return String(password).replace(/\s/g, "");
}

function getEmailFrom() {
  return (
    process.env.EMAIL_FROM?.trim() ||
    (process.env.GMAIL_USER?.trim()
      ? `"E-commerce Shop" <${process.env.GMAIL_USER.trim()}>`
      : "E-commerce Shop <onboarding@resend.dev>")
  );
}

function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function getTransporter() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = normalizeAppPassword(process.env.GMAIL_APP_PASSWORD || "");

  if (!user || !pass) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      family: 4,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      auth: {
        user,
        pass,
      },
    });
  }

  return transporter;
}

export function isEmailConfigured() {
  return (
    isResendConfigured() ||
    Boolean(
      process.env.GMAIL_USER?.trim() &&
        normalizeAppPassword(process.env.GMAIL_APP_PASSWORD || ""),
    )
  );
}

export async function verifyEmailConnection() {
  if (isResendConfigured()) {
    console.log(`[Email] Resend API configured (${getEmailFrom()})`);

    return true;
  }

  const transport = getTransporter();

  if (!transport) {
    console.warn(
      "[Email] Chưa cấu hình — thêm GMAIL_USER và GMAIL_APP_PASSWORD vào .env",
    );

    return false;
  }

  try {
    await transport.verify();

    console.log(`[Email] Gmail SMTP OK (${process.env.GMAIL_USER})`);

    return true;
  } catch (error) {
    console.error("[Email] Gmail SMTP lỗi:", error.message);

    return false;
  }
}

async function sendWithResend({ to, subject, html, text }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getEmailFrom(),
      to,
      subject,
      html,
      text,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || data?.error || "Resend API failed");
  }

  return data;
}

async function sendMail({ to, subject, html, text }) {
  if (isResendConfigured()) {
    try {
      await sendWithResend({ to, subject, html, text });

      return { sent: true };
    } catch (error) {
      console.error("Email send failed:", error.message);

      return { sent: false, reason: error.message };
    }
  }

  const transport = getTransporter();

  if (!transport) {
    return { sent: false, reason: "not_configured" };
  }

  try {
    await transport.sendMail({
      from: getEmailFrom(),
      to,
      subject,
      html,
      text,
    });

    return { sent: true };
  } catch (error) {
    console.error("Email send failed:", error.message);

    return { sent: false, reason: error.message };
  }
}

function buildOtpEmailHtml({ title, name, otp, note }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1e293b; margin-bottom: 8px;">${title}</h2>
      <p style="color: #475569; line-height: 1.6;">Xin chào <strong>${name}</strong>,</p>
      <p style="color: #475569; line-height: 1.6;">${note}</p>
      <div style="margin: 24px 0; padding: 16px 24px; background: #f1f5f9; border-radius: 8px; text-align: center;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2563eb;">${otp}</span>
      </div>
      <p style="color: #64748b; font-size: 13px;">Mã có hiệu lực trong 15 phút. Không chia sẻ mã cho người khác.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 12px;">Email tự động từ dự án E-commerce (đồ án).</p>
    </div>
  `;
}

export async function sendVerificationEmail({ to, name, otp }) {
  return sendMail({
    to,
    subject: "[E-commerce] Mã xác minh tài khoản",
    text: `Xin chào ${name},\n\nMã xác minh: ${otp}\n\nMã hết hạn sau 15 phút.`,
    html: buildOtpEmailHtml({
      title: "Xác minh tài khoản",
      name,
      otp,
      note: "Mã xác minh tài khoản của bạn là:",
    }),
  });
}

export async function sendPasswordResetEmail({ to, name, otp }) {
  return sendMail({
    to,
    subject: "[E-commerce] Mã đặt lại mật khẩu",
    text: `Xin chào ${name},\n\nMã đặt lại mật khẩu: ${otp}\n\nMã hết hạn sau 15 phút.`,
    html: buildOtpEmailHtml({
      title: "Đặt lại mật khẩu",
      name,
      otp,
      note: "Mã đặt lại mật khẩu của bạn là:",
    }),
  });
}

export async function sendEmailChangeVerificationEmail({ to, name, otp }) {
  return sendMail({
    to,
    subject: "[E-commerce] Ma xac minh email moi",
    text: `Xin chao ${name},\n\nMa xac minh email moi: ${otp}\n\nMa het han sau 15 phut.`,
    html: buildOtpEmailHtml({
      title: "Xac minh email moi",
      name,
      otp,
      note: "Ma xac minh email moi cua ban la:",
    }),
  });
}

export async function sendLicenseKeysEmail({ to, name, orderId, keys }) {
  const keyText = keys
    .map((entry) => `${entry.productName}: ${entry.keys.join(", ")}`)
    .join("\n");

  const keyHtml = keys
    .map(
      (entry) =>
        `<li><strong>${entry.productName}</strong>: <code>${entry.keys.join(
          ", ",
        )}</code></li>`,
    )
    .join("");

  return sendMail({
    to,
    subject: `[E-commerce] License keys for order #${orderId}`,
    text: `Xin chao ${name},\n\nLicense keys cua don #${orderId}:\n${keyText}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1e293b;">License keys for order #${orderId}</h2>
        <p style="color: #475569;">Xin chao <strong>${name}</strong>, day la license key da mua:</p>
        <ul style="color: #0f172a; line-height: 1.8;">${keyHtml}</ul>
      </div>
    `,
  });
}

export function assertEmailSent(mailResult) {
  if (!isEmailConfigured()) {
    throw new Error(
      "Server chưa cấu hình Gmail. Thêm GMAIL_USER và GMAIL_APP_PASSWORD vào file .env (App Password).",
    );
  }

  if (!mailResult?.sent) {
    throw new Error(
      `Không gửi được email Gmail: ${mailResult?.reason || "unknown"}. Kiểm tra App Password và thử lại.`,
    );
  }
}
