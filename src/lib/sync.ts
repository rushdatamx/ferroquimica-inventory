import { prisma } from "./prisma";
import { getAmazonInventory, updateAmazonInventory } from "./amazon";
import { getMLInventory, updateMLInventory } from "./mercadolibre";

export interface SyncResult {
  success: boolean;
  message: string;
  details?: {
    sku: string;
    previousQty: number;
    newQty: number;
    amazonSales: number;
    mlSales: number;
    amazonUpdated: boolean;
    mlUpdated: boolean;
    error?: string;
  }[];
}

/**
 * Sincronización bidireccional de inventario
 *
 * Lógica:
 * 1. Lee el inventario actual de Amazon y ML
 * 2. Calcula las ventas (diferencia entre lo que teníamos y lo que hay ahora)
 * 3. Resta las ventas de la bodega
 * 4. Sincroniza el nuevo número a todas las plataformas
 *
 * Ejemplo:
 * - Bodega: 100, Amazon: 100, ML: 100 (sincronizado)
 * - Se venden 3 en ML → ML ahora reporta 97
 * - Se vende 1 en Amazon → Amazon ahora reporta 99
 * - Total ventas: 4
 * - Nueva cantidad: 100 - 4 = 96
 * - Se actualiza: Bodega: 96, Amazon: 96, ML: 96
 */
export async function syncAllInventory(): Promise<SyncResult> {
  const results: SyncResult["details"] = [];

  try {
    // Get all products with their platform IDs
    const products = await prisma.product.findMany();

    for (const product of products) {
      const productResult = {
        sku: product.sku,
        previousQty: product.warehouseQty,
        newQty: product.warehouseQty,
        amazonSales: 0,
        mlSales: 0,
        amazonUpdated: false,
        mlUpdated: false,
        error: undefined as string | undefined,
      };

      try {
        // Cantidades anteriores (lo que teníamos registrado)
        const previousAmazonQty = product.amazonQty;
        const previousMLQty = product.mlQty;

        // Cantidades actuales en las plataformas
        let currentAmazonQty = product.amazonQty;
        let currentMLQty = product.mlQty;

        // Fetch current Amazon inventory if ASIN is set
        if (product.amazonAsin) {
          const amazonData = await getAmazonInventory(product.sku);
          if (amazonData) {
            currentAmazonQty = amazonData.quantity;
          }
        }

        // Fetch current ML inventory if item ID is set
        if (product.mlItemId) {
          const mlData = await getMLInventory(product.mlItemId);
          if (mlData) {
            currentMLQty = mlData.quantity;
          }
        }

        // Calcular ventas (solo si bajó, no si subió por algún ajuste manual)
        const amazonSales = Math.max(0, previousAmazonQty - currentAmazonQty);
        const mlSales = Math.max(0, previousMLQty - currentMLQty);
        const totalSales = amazonSales + mlSales;

        productResult.amazonSales = amazonSales;
        productResult.mlSales = mlSales;

        // Nueva cantidad = bodega actual - ventas totales
        const newQty = Math.max(0, product.warehouseQty - totalSales);
        productResult.newQty = newQty;

        // Actualizar Amazon con la nueva cantidad
        if (product.amazonAsin) {
          const amazonSuccess = await updateAmazonInventory(product.sku, newQty);
          productResult.amazonUpdated = amazonSuccess;
        }

        // Actualizar ML con la nueva cantidad
        if (product.mlItemId) {
          const mlSuccess = await updateMLInventory(product.mlItemId, newQty);
          productResult.mlUpdated = mlSuccess;
        }

        // Actualizar la base de datos con las nuevas cantidades
        await prisma.product.update({
          where: { id: product.id },
          data: {
            warehouseQty: newQty,  // Bodega se actualiza con las ventas restadas
            amazonQty: newQty,     // Registro de lo que pusimos en Amazon
            mlQty: newQty,         // Registro de lo que pusimos en ML
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
      (r) => !r.error && (r.amazonUpdated || r.mlUpdated || r.amazonSales > 0 || r.mlSales > 0)
    ).length;
    const errorCount = results.filter((r) => r.error).length;
    const totalSales = results.reduce((sum, r) => sum + (r.amazonSales || 0) + (r.mlSales || 0), 0);

    await prisma.syncLog.create({
      data: {
        status: errorCount === 0 ? "success" : "partial",
        message: `Sincronizados ${successCount}/${results.length} productos. Ventas detectadas: ${totalSales}`,
        details: JSON.stringify(results),
      },
    });

    return {
      success: errorCount === 0,
      message: `Sincronización completada. ${successCount} productos actualizados. Ventas detectadas: ${totalSales}`,
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
