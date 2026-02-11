import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const products = await prisma.product.findMany({
      orderBy: { sku: "asc" },
    });

    const lastLog = await prisma.syncLog.findFirst({
      where: { status: "success" },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      products,
      lastSync: lastLog?.createdAt || null,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Error al obtener productos" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { sku, name, warehouseQty, amazonAsin, mlItemId } = body;

    const product = await prisma.product.create({
      data: {
        sku,
        name,
        warehouseQty: warehouseQty || 0,
        amazonAsin,
        mlItemId,
      },
    });

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: "Error al crear producto" },
      { status: 500 }
    );
  }
}
