import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  try {
    // Exchange code for tokens
    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.ML_CLIENT_ID!,
        client_secret: process.env.ML_CLIENT_SECRET!,
        code: code,
        redirect_uri: process.env.ML_REDIRECT_URI!,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: "Failed to exchange code", details: error },
        { status: 500 }
      );
    }

    const tokens = await response.json();

    // In production, you would save the refresh_token to the database or environment
    // For now, we'll return it so you can manually add it to the environment
    return NextResponse.json({
      message: "Autorización exitosa",
      refresh_token: tokens.refresh_token,
      instructions:
        "Guarda el refresh_token en la variable de entorno ML_REFRESH_TOKEN",
    });
  } catch (error) {
    console.error("ML callback error:", error);
    return NextResponse.json(
      { error: "Error en callback de ML" },
      { status: 500 }
    );
  }
}
