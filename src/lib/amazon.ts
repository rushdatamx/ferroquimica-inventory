// Amazon SP-API Integration for Seller Flex Inventory

interface AmazonTokens {
  access_token: string;
  expires_in: number;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const response = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.AMAZON_REFRESH_TOKEN!,
      client_id: process.env.AMAZON_CLIENT_ID!,
      client_secret: process.env.AMAZON_CLIENT_SECRET!,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Amazon access token: ${error}`);
  }

  const data: AmazonTokens = await response.json();

  // Cache the token (expire 5 minutes early to be safe)
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  return data.access_token;
}

// Get inventory from Amazon Seller Flex
export async function getAmazonInventory(
  sku: string
): Promise<{ quantity: number } | null> {
  try {
    const accessToken = await getAccessToken();

    // Using the Inventory API for Seller Flex
    // Endpoint: GET /fba/inventory/v1/summaries
    const response = await fetch(
      `https://sellingpartnerapi-na.amazon.com/fba/inventory/v1/summaries?` +
        new URLSearchParams({
          details: "true",
          granularityType: "Marketplace",
          granularityId: "ATVPDKIKX0DER", // Amazon.com.mx marketplace
          sellerSkus: sku,
          marketplaceIds: "A1AM78C64UM0Y8", // Mexico marketplace ID
        }),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-amz-access-token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`Amazon inventory error for ${sku}:`, error);
      return null;
    }

    const data = await response.json();
    const inventorySummary = data.inventorySummaries?.[0];

    if (inventorySummary) {
      return {
        quantity: inventorySummary.totalQuantity || 0,
      };
    }

    return null;
  } catch (error) {
    console.error(`Error getting Amazon inventory for ${sku}:`, error);
    return null;
  }
}

// Update inventory on Amazon Seller Flex
export async function updateAmazonInventory(
  sku: string,
  quantity: number
): Promise<boolean> {
  try {
    const accessToken = await getAccessToken();

    // For Seller Flex, we use the External Fulfillment Inventory API
    // This updates inventory for externally fulfilled items
    const response = await fetch(
      "https://sellingpartnerapi-na.amazon.com/externalFulfillment/inventory/2021-01-06/locations/DEFAULT/skuQuantities",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-amz-access-token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          skuQuantities: [
            {
              sellerSku: sku,
              quantity: quantity,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`Amazon update error for ${sku}:`, error);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Error updating Amazon inventory for ${sku}:`, error);
    return false;
  }
}
