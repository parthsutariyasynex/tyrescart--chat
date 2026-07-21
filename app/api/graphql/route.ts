import { NextResponse } from "next/server";

const GRAPHQL_ENDPOINT = "https://www.tyrescart.com/graphql";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const rawText = await response.text();

    try {
      const data = JSON.parse(rawText);
      return NextResponse.json(data, { status: response.status || 200 });
    } catch {
      console.warn("GraphQL Proxy received non-JSON payload from Magento endpoint:", rawText.slice(0, 300));
      return NextResponse.json(
        {
          errors: [
            {
              message: rawText || "Magento GraphQL endpoint returned non-JSON HTML/text response.",
            },
          ],
        },
        { status: response.status || 500 }
      );
    }
  } catch (error) {
    console.error("GraphQL Proxy internal error:", error);
    return NextResponse.json(
      { errors: [{ message: error instanceof Error ? error.message : "Failed to proxy GraphQL request" }] },
      { status: 500 }
    );
  }
}
