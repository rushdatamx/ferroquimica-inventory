import { NextResponse } from "next/server";
import { syncAllInventory } from "@/lib/sync";

export async function GET(request: Request) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await syncAllInventory();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in cron sync:", error);
    return NextResponse.json(
      { success: false, error: "Error al sincronizar" },
      { status: 500 }
    );
  }
}
