import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { syncAllInventory } from "@/lib/sync";

export async function POST() {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await syncAllInventory();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in sync:", error);
    return NextResponse.json(
      { success: false, error: "Error al sincronizar" },
      { status: 500 }
    );
  }
}
