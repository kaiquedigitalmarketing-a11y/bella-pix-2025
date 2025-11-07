import type { NextRequest } from "next/server"

const SUNIZE_API_KEY = "ck_9c099bc368ef5a7a912828239b8ce9d8"
const SUNIZE_API_SECRET = "cs_4ebfed9e4e41f92270f936e5eb80ab95"
const SUNIZE_API_URL = "https://api.sunize.com.br/v1"

export async function GET(request: NextRequest, { params }: { params: { transaction_id: string } }) {
  const { transaction_id } = params

  console.log("[SSE] Starting SSE for transaction:", transaction_id)

  // Cria um stream de Server-Sent Events
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      // Função para enviar dados ao cliente
      const sendEvent = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(message))
      }

      // Polling a cada 3 segundos
      const intervalId = setInterval(async () => {
        try {
          const response = await fetch(`${SUNIZE_API_URL}/transactions/${transaction_id}`, {
            headers: {
              "x-api-key": SUNIZE_API_KEY,
              "x-api-secret": SUNIZE_API_SECRET,
            },
          })

          if (response.ok) {
            const data = await response.json()
            console.log("[SSE] Transaction status:", data.status)

            // Mapeia o status da Sunize para o formato esperado pelo frontend
            const status = data.status === "AUTHORIZED" ? "paid" : "pending"

            sendEvent({ status, transaction_id: data.id })

            // Se pago, encerra o stream
            if (status === "paid") {
              clearInterval(intervalId)
              controller.close()
            }
          } else {
            console.error("[SSE] Error fetching status:", response.status)
          }
        } catch (error) {
          console.error("[SSE] Error:", error)
          clearInterval(intervalId)
          controller.close()
        }
      }, 3000)

      // Limpa o interval após 10 minutos (timeout)
      setTimeout(() => {
        clearInterval(intervalId)
        controller.close()
      }, 600000)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
