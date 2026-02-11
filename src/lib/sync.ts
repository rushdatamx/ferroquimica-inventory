import { prisma } from "./prisma";
import { getAmazonInventory, updateAmazonInventory } from "./amazon";
import { getMLInventory, updateMLInventory } from "./mercadolibre";

export interface SyncResult {
  success: boolean;
  message: string;
  details?: {
    sku: string;
    amazonUpdated: boolean;
    mlUpdated: boolean;
    error?: string;
  }[];
}

export async function syncAllInventory(): Promise<SyncResult> {
  const results: SyncResult["details"] = [];

  try {
    // Get all products with their platform IDs
    const products = await prisma.product.findMany();

    for (const product of products) {
      const productResult = {
        sku: product.sku,
        amazonUpdated: false,
        mlUpdated: false,
        error: undefined as string | undefined,
      };

      try {
        // Get current inventory from platforms
        let amazonQty = product.amazonQty;
        let mlQty = product.mlQty;

        // Fetch current Amazon inventory if ASIN is set
        if (product.amazonAsin) {
          const amazonData = await getAmazonInventory(product.sku);
          if (amazonData) {
            amazonQty = amazonData.quantity;
          }
        }

        // Fetch current ML inventory if item ID is set
        if (product.mlItemId) {
          const mlData = await getMLInventory(product.mlItemId);
          if (mlData) {
            mlQty = mlData.quantity;
          }
        }

        // Update warehouse quantity to both platforms
        const warehouseQty = product.warehouseQty;

        // Update Amazon if ASIN is set
        if (product.amazonAsin) {
          const amazonSuccess = await updateAmazonInventory(
            product.sku,
            warehouseQty
          );
          productResult.amazonUpdated = amazonSuccess;
        }

        // Update ML if item ID is set
        if (product.mlItemId) {
          const mlSuccess = await updateMLInventory(product.mlItemId, warehouseQty);
          productResult.mlUpdated = mlSuccess;
        }

        // Update product with current platform quantities
        await prisma.product.update({
          where: { id: product.id },
          data: {
            amazonQty,
            mlQty,
            lastSyncAt: new Date(),
          },
        });
      } catch (error) {
        productResult.error =
          error instanceof Error ? error.message : "Unknown error";
      }

      results.push(productResult);
    }

    // Log the sync result
    const successCount = results.filter(
      (r) => !r.error && (r.amazonUpdated || r.mlUpdated)
    ).length;
    const errorCount = results.filter((r) => r.error).length;

    await prisma.syncLog.create({
      data: {
        status: errorCount === 0 ? "success" : "partial",
        message: `Sincronizados ${successCount}/${results.length} productos`,
        details: JSON.stringify(results),
      },
    });

    return {
      success: errorCount === 0,
      message: `Sincronización completada. ${successCount} productos actualizados, ${errorCount} errores.`,
      details: results,
    };
  } catch (error) {
    // Log the error
    await prisma.syncLog.create({
      data: {
        status: "error",
        message: error instanceof Error ? error.message : "Error desconocido",
        details: JSON.stringify({ error }),
      },
    });

    return {
      success: false,
      message: error instanceof Error ? error.message : "Error en sincronización",
      details: results,
    };
  }
}
