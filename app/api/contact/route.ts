import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json(
        { ok: false, error: "Моля, попълнете всички полета." },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Невалиден имейл адрес." },
        { status: 400 }
      );
    }

    // Send email using Resend or similar service
    // For now, we'll use a simple fetch to Resend API
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
      // If no Resend API key, log the message and return success
      // In production, you'd want to set up proper email sending
      console.log("Contact form submission:", { name, email, message });
      console.log("Note: RESEND_API_KEY not configured. Email not sent.");

      // Still return success for development
      return NextResponse.json({ ok: true });
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "UDITO Contact <noreply@udito.bg>",
        to: ["office@designedbypo.com"],
        reply_to: email,
        subject: `Ново запитване от ${name}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333; border-bottom: 2px solid #5856d6; padding-bottom: 10px;">Ново запитване от UDITO</h2>

            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0 0 10px;"><strong>Име:</strong> ${name}</p>
              <p style="margin: 0 0 10px;"><strong>Имейл:</strong> <a href="mailto:${email}">${email}</a></p>
            </div>

            <div style="background: #fff; border: 1px solid #e9ecef; padding: 20px; border-radius: 8px;">
              <h3 style="color: #5856d6; margin-top: 0;">Съобщение:</h3>
              <p style="color: #333; line-height: 1.6; white-space: pre-wrap;">${message}</p>
            </div>

            <hr style="border: none; border-top: 1px solid #e9ecef; margin: 30px 0;" />
            <p style="color: #6c757d; font-size: 12px; text-align: center;">
              Този имейл е изпратен автоматично от контактната форма на UDITO.
            </p>
          </div>
        `,
        text: `Ново запитване от UDITO\n\nИме: ${name}\nИмейл: ${email}\n\nСъобщение:\n${message}`,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json().catch(() => ({}));
      console.error("Resend API error:", errorData);
      return NextResponse.json(
        { ok: false, error: "Грешка при изпращане на имейла." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { ok: false, error: "Възникна грешка. Опитайте отново." },
      { status: 500 }
    );
  }
}
