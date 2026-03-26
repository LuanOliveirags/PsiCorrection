/* ═══════════════════════════════════════════════════════
   PsiCorrection — core/utils.js
   Utilitários compartilhados entre todos os módulos.
   Sem dependências externas — carregado primeiro.
═══════════════════════════════════════════════════════ */

/**
 * Calcula a idade em anos a partir de uma data de nascimento (YYYY-MM-DD).
 * @param {string} nasc
 * @returns {number}
 */
function calcularIdade(nasc) {
  const hoje = new Date();
  const nascData = new Date(nasc);
  let idade = hoje.getFullYear() - nascData.getFullYear();
  const m = hoje.getMonth() - nascData.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nascData.getDate())) idade--;
  return idade;
}

/**
 * Formata uma string ISO para data/hora legível em pt-BR.
 * @param {string} iso
 * @returns {string}  ex.: "19/03/2026 14:30"
 */
function formatarData(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

/**
 * Formata uma string YYYY-MM-DD para DD/MM/YYYY.
 * @param {string} str
 * @returns {string}
 */
function formatarDataBR(str) {
  if (!str) return "—";
  const [y, m, d] = str.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Formata uma string ISO para YYYY-MM-DD (uso em nomes de arquivo).
 * @param {string} iso
 * @returns {string}
 */
function formatarDataArq(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Remove tags HTML de uma string.
 * @param {string} str
 * @returns {string}
 */
function stripHTML(str) {
  return str.replace(/<[^>]+>/g, "");
}

/**
 * Normaliza valores de role de usuário para os nomes suportados.
 * Aceita diferenças de caixa, acentuação e valores legados.
 */
function normalizarRole(role) {
  const raw = String(role || "").toLowerCase().trim();
  const semDiacritico = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const key = semDiacritico.replace(/[^a-z0-9]/g, "");

  switch (key) {
    case "admin":
      return "admin";
    case "profissional":
      return "profissional";
    case "psicologo":
      return "psicologo";
    case "colaborador":
      return "colaborador";
    case "cliente":
      return "cliente";
    default:
      return "profissional";
  }
}

/**
 * Converte o nome de uma classe CSS de badge em pares de cor RGB
 * para uso no jsPDF (background e texto).
 * @param {string} badge
 * @returns {{ bg: number[], txt: number[] }}
 */
function badgeParaCor(badge) {
  const map = {
    "badge-superior":   { bg: [220, 252, 231], txt: [21, 128, 61]  },
    "badge-medio-sup":  { bg: [209, 250, 229], txt: [6,  95,  70]  },
    "badge-medio":      { bg: [219, 234, 254], txt: [29, 78,  216] },
    "badge-medio-inf":  { bg: [254, 249, 195], txt: [161, 98,  7]  },
    "badge-iinferior":  { bg: [254, 226, 226], txt: [185, 28,  28] },
    "badge-inferior":   { bg: [254, 226, 226], txt: [185, 28,  28] },
    "badge-admin":      { bg: [239, 246, 255], txt: [29,  78,  216]},
    "badge-prof":       { bg: [240, 253, 244], txt: [21, 128,  61] }
  };
  return map[badge] || { bg: [226, 232, 240], txt: [100, 116, 139] };
}

/**
 * Alterna o modo de edição da interpretação clínica.
 * Quando em edição, o <div> fica com contentEditable e borda azul.
 * @param {HTMLButtonElement} btn
 */
function toggleEditarInterp(btn) {
  const wrapper = btn.closest(".resultado-interp-wrapper");
  const div = wrapper.querySelector(".resultado-interp");
  const editing = div.dataset.editavel === "true";

  if (editing) {
    div.contentEditable = "false";
    div.dataset.editavel = "false";
    div.classList.remove("editando");
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Editar';
    btn.classList.remove("salvando");
  } else {
    div.contentEditable = "true";
    div.dataset.editavel = "true";
    div.classList.add("editando");
    div.focus();
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Salvar';
    btn.classList.add("salvando");
  }
}
