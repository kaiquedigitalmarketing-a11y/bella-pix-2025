// ============================================================================
// 🎯 APP.JS - BELLA LP (PRINCIPAL) - VERSÃO LIMPA CORRIGIDA
// ============================================================================

// ✅ 1) CAPTURA DOS PARÂMETROS UTM (SEM SCK/SRC/FACEBOOK)
function captureUtmParameters() {
  const urlParams = new URLSearchParams(window.location.search)

  const utmParams = {
    src: null, // ← SEMPRE null (igual ao PHP)
    sck: null, // ← SEMPRE null (igual ao PHP)
    utm_source: urlParams.get("utm_source"),
    utm_campaign: urlParams.get("utm_campaign"),
    utm_medium: urlParams.get("utm_medium"),
    utm_content: urlParams.get("utm_content"),
    utm_term: urlParams.get("utm_term"),
    // ✅ SEM fbclid, _fbc, _fbp
  }

  localStorage.setItem("utm_params", JSON.stringify(utmParams))
  console.log("[Bella] 📊 UTM params captured:", utmParams)
}

// ✅ 2) RECUPERA OS PARÂMETROS UTM SALVOS
function getUtmParameters() {
  const stored = localStorage.getItem("utm_params")
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch (e) {
      console.error("[Bella] ❌ Error parsing UTM params:", e)
      return {}
    }
  }
  return {}
}

// ✅ Executa captura ao carregar
captureUtmParameters()

// ============================================================================
// 🎨 CONTROLE DO MODAL
// ============================================================================

const modal = document.getElementById("pix-modal")
const modalBackdrop = modal ? modal.querySelector(".modal-backdrop") : null
const modalClose = document.getElementById("modal-close")
const modalAmount = document.getElementById("modal-amount")
const modalStatus = document.getElementById("modal-status")
const modalTimer = document.getElementById("modal-timer")
const modalQrcode = document.getElementById("modal-qrcode")
const modalPixText = document.getElementById("modal-pix-text")
const modalBtnCopy = document.getElementById("modal-btn-copy")
const modalSuccess = document.getElementById("modal-success")

let currentEventSource = null
let currentTransactionId = null

// ✅ Abrir modal
function openModal() {
  modal.style.display = "flex"
  document.body.style.overflow = "hidden"
  setTimeout(() => modal.classList.add("show"), 10)
}

// ✅ Fechar modal
function closeModal() {
  modal.classList.remove("show")
  document.body.style.overflow = ""
  setTimeout(() => {
    modal.style.display = "none"
    resetModal()
  }, 250)
  if (currentEventSource) {
    currentEventSource.close()
    currentEventSource = null
  }
}

// ✅ Resetar modal
function resetModal() {
  modalStatus.textContent = "⏳ Aguardando pagamento"
  modalStatus.className = "modal-status blink"
  modalStatus.style.color = ""
  modalStatus.style.fontSize = ""
  modalQrcode.innerHTML = ""
  modalPixText.value = ""
  modalSuccess.style.display = "none"
  currentTransactionId = null
}

// ✅ Fechar modal ao clicar no X ou backdrop
if (modalClose) modalClose.addEventListener("click", closeModal)
if (modalBackdrop) modalBackdrop.addEventListener("click", closeModal)

// ✅ Fechar modal com ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal.classList.contains("show")) {
    closeModal()
  }
})

// ============================================================================
// 💰 GERAÇÃO DE PIX
// ============================================================================

// ✅ Botões de valor
const optionBtns = document.querySelectorAll(".option-btn")

optionBtns.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const value = Number.parseInt(btn.dataset.value)
    if (!value || isNaN(value)) {
      alert("❌ Valor inválido.")
      return
    }

    // Desabilita todos os botões
    optionBtns.forEach((b) => (b.disabled = true))
    btn.textContent = "Gerando PIX..."

    try {
      await generatePix(value)
    } catch (error) {
      console.error("[Bella] ❌ Error generating PIX:", error)
      alert("❌ Erro ao gerar PIX. Tente novamente.")
    } finally {
      // Reabilita os botões
      optionBtns.forEach((b) => {
        b.disabled = false
        const val = Number.parseInt(b.dataset.value)
        // ✅ CORRIGIDO: Mostra valor em reais, não centavos
        const amount_in_reais = val / 100
        b.textContent = `R$ ${amount_in_reais}`
      })
    }
  })
})

// ✅ Função para gerar PIX
async function generatePix(amount) {
  console.log("[Bella] 🚀 Gerando PIX de R$", amount)

  // ✅ Recupera UTMs do localStorage
  const utmParams = getUtmParameters()
  console.log("[Bella] 📊 UTM params being sent:", utmParams)

  // ✅ CORRIGIDO: Converte centavos para reais no display
  const amount_in_reais = amount / 100
  modalAmount.textContent = `R$ ${amount_in_reais.toFixed(2).replace('.', ',')}`
  openModal()

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount_cents: amount, // ✅ CORRETO - envia em centavos
        utm_params: utmParams,
        metadata: "BELLA", // 🔥 Identificador único para Bella
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    const data = await response.json()
    console.log("[Bella] ✅ PIX generated:", data)

    if (!data.transaction_id || !data.qrcode_text) {
      throw new Error("Resposta inválida da API")
    }

    currentTransactionId = data.transaction_id

    // ✅ Gera QR Code usando a biblioteca QRCode
    modalQrcode.innerHTML = ""
    const QRCode = window.QRCode
    const qrcode = new QRCode(modalQrcode, {
      text: data.qrcode_text,
      width: 200,
      height: 200,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H,
    })

    modalPixText.value = data.qrcode_text

    // ✅ Inicia SSE para monitorar status
    startSSE(data.transaction_id)
  } catch (error) {
    console.error("[Bella] ❌ Error generating PIX:", error)
    alert(`❌ Erro ao gerar PIX: ${error.message}`)
    closeModal()
  }
}

// ============================================================================
// 📡 SSE - SERVER-SENT EVENTS
// ============================================================================

function startSSE(transactionId) {
  if (currentEventSource) {
    currentEventSource.close()
  }

  console.log("[Bella] 📡 Starting SSE for transaction:", transactionId)
  currentEventSource = new EventSource(`/api/status/${transactionId}`)

  currentEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      console.log("[Bella] 📩 SSE message received:", data)

      if (data.status === "paid") {
        console.log("[Bella] ✅ Payment confirmed!")

        try {
          // ✅ CORRIGIDO: Pega o valor em reais do modal
          const amountText = modalAmount.textContent.replace('R$ ', '').replace(',', '.')
          const amount = parseFloat(amountText) || 0

          if (typeof window.utmify === "function") {
            window.utmify("event", "Purchase", {
              currency: "BRL",
              value: amount,
            })
            console.log("[Bella] 🎯 Purchase event sent to Utmify:", amount)
          } else {
            console.warn("[Bella] ⚠️ utmify function not found")
          }
        } catch (err) {
          console.error("[Bella] ❌ Error sending Purchase event:", err)
        }

        // ✅ ATUALIZAR UI
        modalStatus.textContent = "✅ Pagamento Confirmado!"
        modalStatus.className = "modal-status"
        modalStatus.style.color = "#6F9E16"
        modalStatus.style.fontSize = "1.2rem"
        modalSuccess.style.display = "block"

        // Fecha SSE
        if (currentEventSource) {
          currentEventSource.close()
          currentEventSource = null
        }

        // Fecha modal após 5s
        setTimeout(() => {
          closeModal()
        }, 5000)
      }
    } catch (error) {
      console.error("[Bella] ❌ Error parsing SSE message:", error)
    }
  }

  currentEventSource.onerror = (error) => {
    console.error("[Bella] ❌ SSE error:", error)
    if (currentEventSource) {
      currentEventSource.close()
      currentEventSource = null
    }
  }
}

// ============================================================================
// 📋 COPIAR CÓDIGO PIX
// ============================================================================

modalBtnCopy.addEventListener("click", () => {
  const code = modalPixText.value
  if (!code) {
    alert("❌ Nenhum código PIX para copiar.")
    return
  }

  navigator.clipboard
    .writeText(code)
    .then(() => {
      const originalHTML = modalBtnCopy.innerHTML
      modalBtnCopy.innerHTML = "<span>✅ COPIADO!</span>"
      setTimeout(() => {
        modalBtnCopy.innerHTML = originalHTML
      }, 2000)
    })
    .catch((error) => {
      console.error("[Bella] ❌ Error copying:", error)
      alert("❌ Erro ao copiar. Copie manualmente.")
      modalPixText.select()
    })
})

// ============================================================================
// 🔄 SCROLL SUAVE
// ============================================================================

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault()
    const target = document.querySelector(this.getAttribute("href"))
    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }
  })
})

console.log("[Bella] ✅ App initialized successfully!")