import { type NextRequest, NextResponse } from "next/server";

const SUNIZE_API_KEY = process.env.SUNIZE_API_KEY;
const SUNIZE_API_SECRET = process.env.SUNIZE_API_SECRET;
const SUNIZE_API_URL = process.env.SUNIZE_API_URL || "https://api.sunize.com.br/v1";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount_cents, utm_params, metadata } = body;

    console.log("[v0] Generating PIX transaction:", { amount_cents, metadata });

    // ✅ Converte centavos pra reais
    const amount = amount_cents / 100;

    console.log("[v0] Amount in reais:", amount);

    const payload = {
      external_id: `BELLA_${Date.now()}_${Math.random().toString(36).slice(2)}`, // Mais único pra evitar duplicados
      total_amount: amount, // em reais
      payment_method: "PIX",
      items: [
        {
          id: `item_${Date.now()}`,
          title: `Doação de R$${amount.toFixed(2)} para ${metadata || "Bella"}`,
          description: "Contribuição para ajudar a Bella",
          price: amount, // em reais
          quantity: 1,
          is_physical: false,
        },
      ],
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1",
      customer: {
        name: "Doador Anônimo",
        email: "anon@example.com",
        phone: "+5511912345678", // Exemplo válido; mude pro teu se quiser
        document_type: "CPF",
        document: "12345678909", // CPF fake válido pra teste (gere um novo em site de gerador CPF)
      },
      // Opcional: Se quiser webhook pra notificar pagamento
      // notification_url: "https://seu-site.com/webhook",
    };

    console.log("[v0] Sending payload to Sunize:", JSON.stringify(payload, null, 2));

    const response = await fetch(`${SUNIZE_API_URL}/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SUNIZE_API_KEY,
        "x-api-secret": SUNIZE_API_SECRET,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log("[v0] Sunize response status:", response.status);
    console.log("[v0] Sunize response:", responseText);

    if (!response.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { message: responseText };
      }
      console.error("[v0] Sunize error:", errorData);
      return NextResponse.json(
        {
          error: "Erro ao gerar PIX",
          details: errorData,
        },
        { status: response.status },
      );
    }

    const data = JSON.parse(responseText);
    console.log("[v0] PIX generated successfully:", data);

    return NextResponse.json({
      transaction_id: data.id,
      qrcode_text: data.pix?.payload || "",
      qrcode: data.pix?.payload || "",
      status: data.status,
    });
  } catch (error) {
    console.error("[v0] Error generating PIX:", error);
    return NextResponse.json(
      {
        error: "Erro interno ao processar pagamento",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}