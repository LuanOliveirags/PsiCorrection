/* ═══════════════════════════════════════════════════════
   PsiCorrection — core/crp-validator.js
   Validação automática de CRP (Conselho Regional de Psicologia).

   CAMADAS DE VALIDAÇÃO:
     1. Formato  → regex client-side, instantâneo (sem rede)
     2. BD       → CRP digitado deve bater com o cadastrado pelo admin
     3. API ext  → consulta ao CFP (configure CRP_API_URL); fire-and-forget,
                   nunca bloqueia o login — só registra em _audit

   ISENÇÃO:
     Usuários com role "admin" são isentos de toda verificação.
     Para profissionais: o admin DEVE cadastrar o CRP ao criar a conta.

   CONFIGURAÇÃO:
     CRP_API_URL — URL de um proxy / Cloud Function que consulte o CFP.
                   Deixe vazio ("") para usar apenas formato + BD próprio.
                   Contrato esperado: GET ?crp=XX/NNNNN → { ativo: bool }

   USO:
     // Chamado em auth.js após verificar credenciais:
     const { ok, mensagem } = await validarCRPLogin(crpDigitado, usuarioData, email);
     if (!ok) { mostraErro(mensagem); return; }
═══════════════════════════════════════════════════════ */

// ── Configuração ──────────────────────────────────────
// URL do proxy/function que acessa a API do CFP.
// Quando o endpoint estiver disponível, defina de QUALQUER uma das formas:
//   1. Edite a constante abaixo (deploy permanente):
//        const _CRP_API_URL_PADRAO = "https://us-central1-psicorrection.cloudfunctions.net/validarCRP";
//   2. Configure em runtime sem alterar este arquivo (ex.: Firestore RemoteConfig):
//        window.PSI_CONFIG = { CRP_API_URL: "https://..." }   // antes dos scripts
//   3. Teste pontual no console do admin:
//        window.PSI_CONFIG = { CRP_API_URL: "https://..." }
const _CRP_API_URL_PADRAO = "";          // ← altere aqui quando tiver o endpoint
const CRP_API_TIMEOUT_MS  = 5000;

// URL base do Cadastro CFP para busca e verificação manual
const CFP_BUSCA_URL = "https://cadastro.cfp.org.br/";

/** Retorna a URL da API, preferindo override em window.PSI_CONFIG */
function _getCRPApiUrl() {
  return window.PSI_CONFIG?.CRP_API_URL || _CRP_API_URL_PADRAO;
}

// Formato válido: "XX/NNNNN" (1-2 dígitos de região / 3-6 dígitos número)
const _CRP_REGEX = /^\d{1,2}\/\d{3,6}$/;

// ── Normalização ──────────────────────────────────────

/**
 * Remove variações de digitação e normaliza para "XX/NNNNN".
 * Aceita: "CRP 06/123456", "crp06/1234", "06/123.456" etc.
 * @param {string} raw
 * @returns {string}
 */
function normalizarCRP(raw = "") {
  return raw.trim()
    .replace(/^CRP\s*/i, "")
    .replace(/\s+/g, "")
    .replace(/[.\-_]/g, "")
    .toUpperCase();
}

// ── Camada 1: Formato ─────────────────────────────────

/**
 * Valida apenas o formato do CRP (não consulta nenhuma fonte externa).
 * @param {string} crp — raw ou normalizado
 * @returns {{ ok: boolean, mensagem: string }}
 */
function validarFormatoCRP(crp) {
  const norm = normalizarCRP(crp);
  if (!norm) {
    return { ok: false, mensagem: "Informe seu CRP para continuar." };
  }
  if (!_CRP_REGEX.test(norm)) {
    return { ok: false, mensagem: "Formato inválido. Use: 06/123456  (região / número do CRP)." };
  }
  return { ok: true, mensagem: "" };
}

// ── Camada 2: Banco de dados próprio ─────────────────

/**
 * Valida o CRP digitado contra o CRP cadastrado pelo admin no Firestore.
 * @param {string} crpDigitado
 * @param {object} usuarioData — documento Firestore do usuário
 * @returns {{ ok: boolean, mensagem: string }}
 */
function validarCRPBancoDados(crpDigitado, usuarioData) {
  if (!usuarioData.crp) {
    return {
      ok: false,
      mensagem: "CRP não cadastrado para esta conta. Contate o administrador."
    };
  }
  if (normalizarCRP(crpDigitado) !== normalizarCRP(usuarioData.crp)) {
    return { ok: false, mensagem: "CRP não corresponde ao cadastrado nesta conta." };
  }
  return { ok: true, mensagem: "" };
}

// ── Camada 3: API externa CFP (fire-and-forget) ───────

/**
 * Consulta a API externa do CFP via proxy configurado. Não bloqueia o login.
 * Se nenhum proxy estiver configurado, tenta consultar o CFP por CPF diretamente
 * (funciona somente se o endpoint CFP suportar CORS — usa fallback silencioso).
 * @param {string} crp   — normalizado (ex.: "06/123456")
 * @param {string} email — e-mail do usuário (para auditoria)
 * @param {string} [cpf] — CPF do profissional (opcional, melhora a validação)
 */
async function validarCRPExternoAsync(crp, email, cpf) {
  const apiUrl = _getCRPApiUrl();
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), CRP_API_TIMEOUT_MS);

  try {
    let resp, json;

    if (apiUrl) {
      // Proxy/Cloud Function configurado: envia CRP + CPF (se disponível)
      const params = new URLSearchParams({ crp });
      if (cpf) params.set("cpf", normalizarCPF(cpf));
      resp = await fetch(`${apiUrl}?${params}`, {
        signal:  controller.signal,
        headers: { Accept: "application/json" }
      });
      json = await resp.json();
    } else {
      // Sem proxy: tenta a API pública do CFP diretamente (pode ser bloqueado por CORS)
      const cpfNum = cpf ? normalizarCPF(cpf) : null;
      const cfpEndpoint = cpfNum
        ? `https://cadastro.cfp.org.br/api/profissional/cpf/${encodeURIComponent(cpfNum)}`
        : `https://cadastro.cfp.org.br/api/profissional/crp/${encodeURIComponent(crp)}`;
      resp = await fetch(cfpEndpoint, {
        signal:  controller.signal,
        headers: { Accept: "application/json" },
        mode:    "cors"
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      // Normaliza resposta do CFP para o formato interno { ativo: bool, nome: string, crp: string }
      const crpCFP = data?.numeroCRP ?? data?.crp ?? "";
      json = {
        ativo:    data?.situacao === "ATIVO" || data?.ativo === true,
        nome:     data?.nome ?? "",
        crpCFP:   crpCFP,
        crpBate:  cpfNum ? normalizarCRP(crpCFP) === normalizarCRP(crp) : undefined
      };
    }

    const status = json.ativo ? "✓ ativo" : "⚠ inativo / não encontrado";
    console.info(`[crp] CFP — CRP ${crp}: ${status}` + (json.nome ? ` (${json.nome})` : ""));

    if (typeof _firestoreDB !== "undefined") {
      _firestoreDB.collection("_audit").add({
        tipo: "crp_api_externa", email, crp,
        cpfUsado: cpf ? "sim" : "não",
        resultado: { ativo: json.ativo, crpBate: json.crpBate ?? null },
        ts: new Date().toISOString()
      }).catch(() => {});
    }
  } catch (e) {
    if (e.name !== "AbortError") {
      console.info(`[crp] API CFP indisponível (${e.message}) — o login prosseguirá normalmente.`);
    }
  } finally {
    clearTimeout(tid);
  }
}

/**
 * Abre o Cadastro CFP em nova aba para verificação manual do profissional.
 * @param {string} [cpf] — CPF para pré-preencher a busca (opcional)
 * @param {string} [crp] — CRP para pré-preencher a busca (opcional)
 */
function abrirCadastroCFP(cpf, crp) {
  // A URL do CFP não suporta parâmetros de busca diretamente por query string públicos;
  // abrimos a página principal para o usuário fazer a verificação manual.
  window.open(CFP_BUSCA_URL, "_blank", "noopener,noreferrer");
}

// ── CPF (admin) ─────────────────────────────────────

/** Remove caracteres não numéricos do CPF. */
function normalizarCPF(raw = "") {
  return String(raw).replace(/\D/g, "");
}

/**
 * Valida formato e dígitos verificadores do CPF.
 * @param {string} cpf — raw (pode ter máscara) ou só dígitos
 * @returns {{ ok: boolean, mensagem: string }}
 */
function validarFormatoCPF(cpf) {
  const d = normalizarCPF(cpf);
  if (!d) return { ok: false, mensagem: "Informe o CPF para continuar." };
  if (d.length !== 11) return { ok: false, mensagem: "CPF inválido — deve conter 11 dígitos." };
  if (/^(\d)\1{10}$/.test(d)) return { ok: false, mensagem: "CPF inválido." };
  let s = 0;
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i);
  let v1 = (s * 10) % 11; if (v1 >= 10) v1 = 0;
  if (v1 !== +d[9]) return { ok: false, mensagem: "CPF inválido (dígito verificador)." };
  s = 0;
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i);
  let v2 = (s * 10) % 11; if (v2 >= 10) v2 = 0;
  if (v2 !== +d[10]) return { ok: false, mensagem: "CPF inválido (dígito verificador)." };
  return { ok: true, mensagem: "" };
}

// ── Validação completa no login ───────────────────────

/**
 * Executa todas as camadas de validação em sequência.
 * Admin (role === "admin") é isento — retorna ok imediatamente.
 *
 * @param {string} crpDigitado
 * @param {object} usuarioData — dados do Firestore
 * @param {string} email
 * @returns {Promise<{ ok: boolean, mensagem: string, crpNorm: string }>}
 */
async function validarCRPLogin(crpDigitado, usuarioData, email) {
  // Admin isento de toda verificação
  if (usuarioData.role === "admin") return { ok: true, mensagem: "", crpNorm: "" };

  // Camada 1: formato
  const fmt = validarFormatoCRP(crpDigitado);
  if (!fmt.ok) return { ...fmt, crpNorm: "" };

  const crpNorm = normalizarCRP(crpDigitado);

  // Camada 2: banco de dados
  const db = validarCRPBancoDados(crpDigitado, usuarioData);
  if (!db.ok) return { ...db, crpNorm };

  // Camada 3: API externa CFP (fire-and-forget — não bloqueia o login)
  // Passa o CPF armazenado no Firestore (se houver) para validação cruzada CPF→CRP.
  validarCRPExternoAsync(crpNorm, email, usuarioData.cpf ?? null);

  return { ok: true, mensagem: "", crpNorm };
}

// ── Feedback visual em tempo real (DOM) ──────────────

/**
 * Atualiza o ícone de status e o hint do campo CRP enquanto o usuário digita.
 * Chamado via oninput no input#login-crp.
 * @param {HTMLInputElement} input
 */
function atualizarStatusCRP(input) {
  const status = document.getElementById("crp-status");
  const hint   = document.getElementById("crp-hint");
  if (!status || !hint) return;

  const isCpf = input.dataset.mode === "cpf";
  const val   = input.value.trim();

  if (!val) {
    status.textContent = "";
    hint.textContent   = isCpf
      ? "Formato: 000.000.000-00  ·  CPF do administrador"
      : "Formato: 06/123456  ·  Exigido pelo CFP";
    hint.className = "crp-hint";
    return;
  }

  if (isCpf) {
    const { ok, mensagem } = validarFormatoCPF(val);
    if (ok) {
      status.textContent = "✓";
      status.style.color = "var(--success)";
      hint.textContent   = "CPF válido";
      hint.className     = "crp-hint crp-hint--ok";
    } else {
      status.textContent = "✗";
      status.style.color = "var(--danger)";
      hint.textContent   = mensagem;
      hint.className     = "crp-hint crp-hint--err";
    }
    return;
  }

  const { ok, mensagem } = validarFormatoCRP(val);
  const cfpLink = document.getElementById("crp-cfp-link");
  if (ok) {
    status.textContent = "✓";
    status.style.color = "var(--success)";
    hint.textContent   = `CRP ${normalizarCRP(val)} — formato válido`;
    hint.className     = "crp-hint crp-hint--ok";
    // Exibe link de verificação no Cadastro CFP
    if (cfpLink) {
      cfpLink.classList.remove("hidden");
      const crpNorm = normalizarCRP(val);
      cfpLink.onclick = (e) => {
        e.preventDefault();
        abrirCadastroCFP(null, crpNorm);
      };
    }
  } else {
    status.textContent = "✗";
    status.style.color = "var(--danger)";
    hint.textContent   = mensagem;
    hint.className     = "crp-hint crp-hint--err";
    if (cfpLink) cfpLink.classList.add("hidden");
  }
}
