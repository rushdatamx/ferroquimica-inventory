// Mercado Libre API Integration

interface MLTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface MLVariation {
  id: number;
  available_quantity: number;
  sold_quantity: number;
  attribute_combinations: {
    name: string;
    value_name: string;
  }[];
}

interface MLItem {
  id: string;
  available_quantity: number;
  variations?: MLVariation[];
}

let cachedMLToken: { token: string; refreshToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedMLToken && Date.now() < cachedMLToken.expiresAt) {
    return cachedMLToken.token;
  }

  // If we have a refresh token, use it
  const refreshToken = cachedMLToken?.refreshToken || process.env.ML_REFRESH_TOKEN;

  if (!refreshToken) {
    throw new Error(
      "No ML refresh token available. Please authorize the app first."
    );
  }

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ML_CLIENT_ID!,
      client_secret: process.env.ML_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get ML access token: ${error}`);
  }

  const data: MLTokens = await response.json();

  // Cache the token (expire 5 minutes early to be safe)
  cachedMLToken = {
    token: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  return data.access_token;
}

/**
 * Get inventory from Mercado Libre
 * Soporta 2 casos:
 * 1. Producto simple (sin variantes): usa available_quantity del item
 * 2. Producto con variantes (colores, tallas): usa available_quantity de la variación específica
 *
 * @param itemId - ID de la publicación (ej: MLM3510860724)
 * @param variationId - ID de la variación (opcional, ej: 183256741)
 */
export async function getMLInventory(
  itemId: string,
  variationId?: string | null
): Promise<{ quantity: number } | null> {
  try {
    const accessToken = await getAccessToken();

    const response = await fetch(
      `https://api.mercadolibre.com/items/${itemId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`ML inventory error for ${itemId}:`, error);
      return null;
    }

    const data: MLItem = await response.json();

    // Caso 1: Producto con variantes - buscar la variación específica
    if (variationId && data.variations && data.variations.length > 0) {
      const variation = data.variations.find(
        (v) => v.id.toString() === variationId
      );
      if (variation) {
        return {
          quantity: variation.available_quantity || 0,
        };
      }
      console.error(`Variation ${variationId} not found in item ${itemId}`);
      return null;
    }

    // Caso 2: Producto simple - usar available_quantity del item
    return {
      quantity: data.available_quantity || 0,
    };
  } catch (error) {
    console.error(`Error getting ML inventory for ${itemId}:`, error);
    return null;
  }
}

/**
 * Update inventory on Mercado Libre
 * Soporta 2 casos:
 * 1. Producto simple: actualiza available_quantity del item
 * 2. Producto con variantes: actualiza available_quantity de la variación específica
 *
 * @param itemId - ID de la publicación (ej: MLM3510860724)
 * @param quantity - Nueva cantidad
 * @param variationId - ID de la variación (opcional, ej: 183256741)
 */
export async function updateMLInventory(
  itemId: string,
  quantity: number,
  variationId?: string | null
): Promise<boolean> {
  try {
    const accessToken = await getAccessToken();

    let body: Record<string, unknown>;

    // Caso 1: Producto con variantes - actualizar la variación específica
    if (variationId) {
      body = {
        variations: [
          {
            id: parseInt(variationId),
            available_quantity: quantity,
          },
        ],
      };
    } else {
      // Caso 2: Producto simple
      body = {
        available_quantity: quantity,
      };
    }

    const response = await fetch(
      `https://api.mercadolibre.com/items/${itemId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`ML update error for ${itemId}:`, error);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Error updating ML inventory for ${itemId}:`, error);
    return false;
  }
}

// Generate authorization URL for initial setup
export function getMLAuthUrl(): string {
  const redirectUri = process.env.ML_REDIRECT_URI || "https://ferroquimica-inventory.vercel.app/api/ml-callback";
  return `https://auth.mercadolibre.com.mx/authorization?response_type=code&client_id=${process.env.ML_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}`;
}
