const OTP_API_URL = "http://10.0.2.2:8787";

type SendOtpResponse = {
  success: boolean;
  message: string;
};

type VerifyOtpResponse = {
  success: boolean;
  verified?: boolean;
  message: string;
};

export async function sendOtp(
  email: string
): Promise<SendOtpResponse> {
  const response = await fetch(
    `${OTP_API_URL}/send-otp`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
      }),
    }
  );

  const data =
    (await response.json()) as SendOtpResponse;

  if (!response.ok) {
    throw new Error(
      data.message || "Unable to send OTP."
    );
  }

  return data;
}

export async function verifyOtp(
  email: string,
  otp: string
): Promise<VerifyOtpResponse> {
  const response = await fetch(
    `${OTP_API_URL}/verify-otp`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      }),
    }
  );

  const data =
    (await response.json()) as VerifyOtpResponse;

  if (!response.ok) {
    throw new Error(
      data.message || "Unable to verify OTP."
    );
  }

  return data;
}