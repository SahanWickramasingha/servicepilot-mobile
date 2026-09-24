/// <reference path="../worker-configuration.d.ts" />
interface Env {
  RESEND_API_KEY: string;
  OTP_STORE: KVNamespace;
  DEBUG_OTP?: string;
}

type OtpRecord = {
  email: string;
  otp: string;
  createdAt: number;
  lastSentAt: number;
  expiresAt: number;
  attempts: number;
};

const OTP_EXPIRY_SECONDS = 10 * 60; // 10 minutes
const OTP_RESEND_COOLDOWN_SECONDS = 30;
const MAX_VERIFY_ATTEMPTS = 5;
const otpSendLocks = new Map<string, Promise<void>>();

async function withOtpSendLock<T>(
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous =
    otpSendLocks.get(key) ??
    Promise.resolve();

  let release!: () => void;

  const current = new Promise<void>(
    (resolve) => {
      release = resolve;
    }
  );

  const tail = previous
    .catch(() => undefined)
    .then(() => current);

  otpSendLocks.set(key, tail);

  await previous.catch(() => undefined);

  try {
    return await operation();
  } finally {
    release();

    if (otpSendLocks.get(key) === tail) {
      otpSendLocks.delete(key);
    }
  }
}

function getExpirationTtl(
  expiresAt: number,
  now = Date.now()
): number {
  return Math.max(
    60,
    Math.ceil((expiresAt - now) / 1000)
  );
}

function isOtpDebugEnabled(env: Env): boolean {
  return env.DEBUG_OTP === "true";
}

/* -------------------------------------------------------
   JSON RESPONSE
------------------------------------------------------- */

function jsonResponse(
  data: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

/* -------------------------------------------------------
   EMAIL NORMALIZER
------------------------------------------------------- */

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/* -------------------------------------------------------
   OTP GENERATOR
------------------------------------------------------- */

function generateOtp(): string {
  const array = new Uint32Array(1);

  crypto.getRandomValues(array);

  const number =
    100000 + (array[0] % 900000);

  return number.toString();
}

/* -------------------------------------------------------
   SEND EMAIL USING RESEND
------------------------------------------------------- */

async function sendOtpEmail(
  email: string,
  otp: string,
  env: Env
): Promise<boolean> {
  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        from: "ServicePilot <onboarding@resend.dev>",

        to: [email],

        subject:
          "Your ServicePilot verification code",

        html: `
          <!DOCTYPE html>
          <html>
            <body
              style="
                margin:0;
                padding:0;
                background:#F3F4F6;
                font-family:Arial,Helvetica,sans-serif;
              "
            >
              <div
                style="
                  max-width:520px;
                  margin:40px auto;
                  background:#FFFFFF;
                  border-radius:16px;
                  padding:32px;
                  box-shadow:
                    0 10px 30px rgba(0,0,0,0.06);
                "
              >

                <h2
                  style="
                    margin:0 0 10px 0;
                    color:#111827;
                    text-align:center;
                  "
                >
                  ServicePilot
                </h2>

                <p
                  style="
                    margin:0;
                    color:#6B7280;
                    text-align:center;
                    font-size:14px;
                  "
                >
                  Email Verification
                </p>

                <div
                  style="
                    margin-top:30px;
                    color:#374151;
                    font-size:15px;
                    line-height:1.6;
                  "
                >
                  Enter the following verification code
                  in the ServicePilot app:
                </div>

                <div
                  style="
                    margin:28px 0;
                    padding:22px;
                    border-radius:14px;
                    background:#EFF6FF;
                    border:1px solid #DBEAFE;
                    text-align:center;
                  "
                >
                  <span
                    style="
                      color:#2563EB;
                      font-size:34px;
                      font-weight:700;
                      letter-spacing:9px;
                    "
                  >
                    ${otp}
                  </span>
                </div>

                <p
                  style="
                    color:#6B7280;
                    font-size:14px;
                    line-height:1.6;
                  "
                >
                  This verification code will expire
                  in 10 minutes.
                </p>

                <p
                  style="
                    color:#9CA3AF;
                    font-size:12px;
                    line-height:1.5;
                    margin-top:28px;
                  "
                >
                  If you did not create a ServicePilot
                  account, you can safely ignore this email.
                </p>

              </div>
            </body>
          </html>
        `,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();

    console.error(
      "RESEND EMAIL ERROR:",
      error
    );

    return false;
  }

  return true;
}

/* -------------------------------------------------------
   SEND OTP
------------------------------------------------------- */

async function sendOtp(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json<{
      email?: string;
    }>();

    if (!body.email) {
      return jsonResponse(
        {
          success: false,
          message: "Email is required.",
        },
        400
      );
    }

    const email = normalizeEmail(body.email);

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return jsonResponse(
        {
          success: false,
          message:
            "Please enter a valid email address.",
        },
        400
      );
    }

    const key = `otp:${email}`;

    return withOtpSendLock(
      key,
      () => sendOtpForEmail(email, key, env)
    );
  } catch (error) {
    console.error(
      "SEND OTP ERROR:",
      error
    );

    return jsonResponse(
      {
        success: false,
        message:
          "Something went wrong while sending the verification code.",
      },
      500
    );
  }
}

async function sendOtpForEmail(
  email: string,
  key: string,
  env: Env
): Promise<Response> {
  try {

    const now = Date.now();

    /* ---------------------------------------------------
       CHECK EXISTING OTP
    --------------------------------------------------- */

    const existingValue =
      await env.OTP_STORE.get(key);

    let otp: string;
    let createdAt: number;
    let attempts = 0;
    let previousValidRecord:
      | OtpRecord
      | null = null;

    if (existingValue) {
      try {
        const existingRecord =
          JSON.parse(
            existingValue
          ) as OtpRecord;

        /*
          IMPORTANT FIX

          If current OTP has not expired,
          DO NOT generate a new OTP.

          Reuse the same OTP so duplicate requests
          cannot invalidate the email that was
          already delivered.
        */

        if (
          existingRecord.expiresAt > now
        ) {
          previousValidRecord =
            existingRecord;

          otp = existingRecord.otp;
          createdAt =
            existingRecord.createdAt;
          attempts =
            existingRecord.attempts ?? 0;

          const secondsSinceLastSend =
            Math.floor(
              (now -
                existingRecord.lastSentAt) /
                1000
            );

          if (
            secondsSinceLastSend <
            OTP_RESEND_COOLDOWN_SECONDS
          ) {
            console.log(
              "OTP SEND SKIPPED - COOLDOWN",
              {
                email,
                secondsSinceLastSend,
              }
            );

            return jsonResponse({
              success: true,
              message:
                "Verification code was already sent.",
              cooldown: true,
            });
          }
        } else {
          otp = generateOtp();
          createdAt = now;
          attempts = 0;
        }
      } catch {
        otp = generateOtp();
        createdAt = now;
        attempts = 0;
      }
    } else {
      otp = generateOtp();
      createdAt = now;
      attempts = 0;
    }

    const expiresAt =
      createdAt +
      OTP_EXPIRY_SECONDS * 1000;

    const record: OtpRecord = {
      email,
      otp,
      createdAt,
      lastSentAt: now,
      expiresAt,
      attempts,
    };

    /* ---------------------------------------------------
       SAVE OTP
    --------------------------------------------------- */

    await env.OTP_STORE.put(
      key,
      JSON.stringify(record),
      {
        expirationTtl: getExpirationTtl(
          expiresAt,
          now
        ),
      }
    );

    /* ---------------------------------------------------
       DEBUG
       REMOVE OTP VALUE LOG BEFORE PRODUCTION
    --------------------------------------------------- */

    if (isOtpDebugEnabled(env)) {
      console.log("OTP SEND DEBUG", {
        email,
        otp,
        expiresAt:
          new Date(
            expiresAt
          ).toISOString(),
      });
    } else {
      console.log("OTP SEND", {
        email,
        expiresAt:
          new Date(
            expiresAt
          ).toISOString(),
      });
    }

    /* ---------------------------------------------------
       SEND EMAIL
    --------------------------------------------------- */

    const sent = await sendOtpEmail(
      email,
      otp,
      env
    );

    if (!sent) {
      if (previousValidRecord) {
        await env.OTP_STORE.put(
          key,
          JSON.stringify(previousValidRecord),
          {
            expirationTtl:
              getExpirationTtl(
                previousValidRecord.expiresAt
              ),
          }
        );
      } else {
        /*
          Do not leave a code in KV when
          the email failed to send.
        */

        await env.OTP_STORE.delete(key);
      }

      return jsonResponse(
        {
          success: false,
          message:
            "Unable to send verification email.",
        },
        500
      );
    }

    return jsonResponse({
      success: true,
      message:
        "Verification code sent successfully.",
    });
  } catch (error) {
    console.error(
      "SEND OTP ERROR:",
      error
    );

    return jsonResponse(
      {
        success: false,
        message:
          "Something went wrong while sending the verification code.",
      },
      500
    );
  }
}

/* -------------------------------------------------------
   VERIFY OTP
------------------------------------------------------- */

async function verifyOtp(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json<{
      email?: string;
      otp?: string;
    }>();

    if (!body.email || !body.otp) {
      return jsonResponse(
        {
          success: false,
          message:
            "Email and OTP are required.",
        },
        400
      );
    }

    const email =
      normalizeEmail(body.email);

    const enteredOtp =
      body.otp.trim();

    if (!/^\d{6}$/.test(enteredOtp)) {
      return jsonResponse(
        {
          success: false,
          message:
            "Verification code must contain 6 digits.",
        },
        400
      );
    }

    const key = `otp:${email}`;

    /* ---------------------------------------------------
       READ OTP
    --------------------------------------------------- */

    const savedValue =
      await env.OTP_STORE.get(key);

    if (!savedValue) {
      return jsonResponse(
        {
          success: false,
          message:
            "Verification code not found or expired. Please request a new code.",
        },
        400
      );
    }

    const record =
      JSON.parse(
        savedValue
      ) as OtpRecord;

    const now = Date.now();

    /* ---------------------------------------------------
       DEBUG
    --------------------------------------------------- */

    if (isOtpDebugEnabled(env)) {
      console.log("OTP VERIFY DEBUG", {
        email,
        enteredOtp,
        storedOtp: record.otp,
        matches:
          enteredOtp === record.otp,
        attempts:
          record.attempts,
        expiresAt:
          new Date(
            record.expiresAt
          ).toISOString(),
      });
    } else {
      console.log("OTP VERIFY", {
        email,
        matches:
          enteredOtp === record.otp,
        attempts:
          record.attempts,
        expiresAt:
          new Date(
            record.expiresAt
          ).toISOString(),
      });
    }

    /* ---------------------------------------------------
       EXPIRED
    --------------------------------------------------- */

    if (now > record.expiresAt) {
      await env.OTP_STORE.delete(key);

      return jsonResponse(
        {
          success: false,
          message:
            "Verification code has expired. Please request a new code.",
        },
        400
      );
    }

    /* ---------------------------------------------------
       TOO MANY ATTEMPTS
    --------------------------------------------------- */

    if (
      record.attempts >=
      MAX_VERIFY_ATTEMPTS
    ) {
      await env.OTP_STORE.delete(key);

      return jsonResponse(
        {
          success: false,
          message:
            "Too many incorrect attempts. Please request a new code.",
        },
        429
      );
    }

    /* ---------------------------------------------------
       INCORRECT OTP
    --------------------------------------------------- */

    if (
      record.otp !== enteredOtp
    ) {
      const updatedRecord: OtpRecord = {
        ...record,
        attempts:
          (record.attempts ?? 0) + 1,
      };

      const remainingSeconds =
        Math.max(
          60,
          Math.floor(
            (record.expiresAt -
              Date.now()) /
              1000
          )
        );

      await env.OTP_STORE.put(
        key,
        JSON.stringify(
          updatedRecord
        ),
        {
          expirationTtl:
            remainingSeconds,
        }
      );

      const attemptsLeft =
        MAX_VERIFY_ATTEMPTS -
        updatedRecord.attempts;

      return jsonResponse(
        {
          success: false,
          message:
            attemptsLeft > 0
              ? `Incorrect verification code. ${attemptsLeft} attempts remaining.`
              : "Too many incorrect attempts. Please request a new code.",
        },
        400
      );
    }

    /* ---------------------------------------------------
       SUCCESS
    --------------------------------------------------- */

    await env.OTP_STORE.delete(key);

    console.log(
      "OTP VERIFIED SUCCESSFULLY:",
      email
    );

    return jsonResponse({
      success: true,
      verified: true,
      message:
        "Email verified successfully.",
    });
  } catch (error) {
    console.error(
      "VERIFY OTP ERROR:",
      error
    );

    return jsonResponse(
      {
        success: false,
        message:
          "Something went wrong while verifying the code.",
      },
      500
    );
  }
}

/* -------------------------------------------------------
   WORKER ROUTER
------------------------------------------------------- */

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    const url =
      new URL(request.url);

    /* ---------------------------------------------------
       CORS
    --------------------------------------------------- */

    if (
      request.method === "OPTIONS"
    ) {
      return new Response(null, {
        status: 204,

        headers: {
          "Access-Control-Allow-Origin":
            "*",

          "Access-Control-Allow-Headers":
            "Content-Type",

          "Access-Control-Allow-Methods":
            "GET, POST, OPTIONS",
        },
      });
    }

    /* ---------------------------------------------------
       STATUS
    --------------------------------------------------- */

    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return jsonResponse({
        success: true,
        service:
          "ServicePilot OTP API",
        status: "running",
      });
    }

    /* ---------------------------------------------------
       SEND OTP
    --------------------------------------------------- */

    if (
      request.method === "POST" &&
      url.pathname === "/send-otp"
    ) {
      return sendOtp(
        request,
        env
      );
    }

    /* ---------------------------------------------------
       VERIFY OTP
    --------------------------------------------------- */

    if (
      request.method === "POST" &&
      url.pathname === "/verify-otp"
    ) {
      return verifyOtp(
        request,
        env
      );
    }

    /* ---------------------------------------------------
       404
    --------------------------------------------------- */

    return jsonResponse(
      {
        success: false,
        message:
          "Route not found.",
      },
      404
    );
  },
} satisfies ExportedHandler<Env>;
