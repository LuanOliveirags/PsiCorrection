/* ═══════════════════════════════════════════════════════
   PsiCorrection — core/navigation.js
   Roteamento SPA e controle de sidebar.

   Depende em runtime de:
     limparFormulario    → modules/neupsilin/avaliacao.js
     limparFormularioInf → modules/neupsilin/avaliacao-inf.js
     limparWISC          → modules/wisc/avaliacao.js
     limparBFP           → modules/bfp/avaliacao.js
     inicializarBFPForm  → modules/bfp/avaliacao.js
     renderizarHistorico, renderizarPacientes, renderizarUsuarios → script.js
═══════════════════════════════════════════════════════ */

/**
 * Matriz de permissões por perfil.
 * Sub-seções (nova-avaliacao, wisc, bfp, etc.) herdam as permissões
 * da seção pai (testes / aplicacao).
 */
const _PERMISSOES = {
  admin:        ["dashboard","testes","nova-avaliacao","neupsilin-inf","wisc","aplicacao","bfp","historico","pacientes","clinica","usuarios"],
  profissional: ["dashboard","testes","nova-avaliacao","neupsilin-inf","wisc","aplicacao","bfp","historico","pacientes","clinica","usuarios"],
  psicologo:    ["dashboard","testes","nova-avaliacao","neupsilin-inf","wisc","aplicacao","bfp","historico","pacientes","clinica","usuarios"],
  colaborador:  ["pacientes","clinica"],
  cliente:      ["clinica"],
};

/** Verifica se o usuário logado pode acessar a seção. */
function _podeAcessar(secao) {
  const role = window.__getUsuarioLogado?.()?.role || "profissional";
  const permitidas = _PERMISSOES[role] ?? _PERMISSOES["profissional"];
  return permitidas.includes(secao);
}

/**
 * Navega para uma seção do SPA, ocultando as demais.
 * @param {string}       secao  - chave da seção (ex.: "wisc", "dashboard")
 * @param {HTMLElement|null} linkEl - item de nav que deve ficar "active"
 */
function navegarPara(secao, linkEl) {
  if (!_podeAcessar(secao)) {
    console.warn("[nav] Acesso negado:", secao, "para role:", window.__getUsuarioLogado?.()?.role);
    return;
  }
  document.querySelectorAll(".sec").forEach(s => {
    s.classList.remove("active");
    s.style.display = "none";
  });
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

  const el = document.getElementById("sec-" + secao);
  if (el) {
    el.classList.remove("hidden");
    el.style.display = "block";
    el.classList.add("active");
  }
  if (linkEl) linkEl.classList.add("active");

  // Abre Correção de Testes para seções filhas, mantém também aberto no histórico/pacientes/testes
  if (["dashboard","historico","pacientes","testes"].includes(secao)) {
    _setNavCorrecoes(true);
  }

  // Marca menu pai Correção de Testes quando subitem selecionado
  if (["dashboard","historico","pacientes","testes"].includes(secao)) {
    const correcoesMenu = document.querySelector(".nav-correcoes-item");
    if (correcoesMenu) correcoesMenu.classList.add("active");
  }

  // Marca menu pai Gestão da Clínica para a seção clinica
  if (secao === "clinica") {
    const clinicaMenu = document.querySelector(".nav-clinica-item");
    if (clinicaMenu) clinicaMenu.classList.add("active");
  }

  // Fecha sidebar no mobile
  document.getElementById("sidebar").classList.remove("open");

  const titulos = {
    dashboard:        "Dashboard",
    testes:           "Correção de Testes",
    "nova-avaliacao": "NEUPSILIN Adulto — Correção",
    "neupsilin-inf":  "NEUPSILIN-INF — Correção Infantil",
    wisc:             "WISC-IV — Correção",
    aplicacao:        "Aplicação de Testes",
    bfp:              "BFP — Bateria Fatorial de Personalidade",
    historico:        "Histórico de Avaliações",
    pacientes:        "Pacientes",
    clinica:          "Gestão da Clínica",
    usuarios:         "Gerenciar Usuários"
  };
  document.getElementById("topbar-title").textContent = titulos[secao] || secao;

  // Marca menu pai Correção de Testes quando subitem selecionado
  if (["dashboard","historico","pacientes"].includes(secao)) {
    const correcoesMenu = document.querySelector(".nav-correcoes-item");
    if (correcoesMenu) correcoesMenu.classList.add("active");
  }

  // Ações de inicialização por seção
  if (secao === "historico")      renderizarHistorico();
  if (secao === "pacientes")      renderizarPacientes();
  if (secao === "clinica")        renderizarClinica();
  if (secao === "usuarios")       renderizarUsuarios();
  if (secao === "nova-avaliacao") limparFormulario();
  if (secao === "neupsilin-inf")  limparFormularioInf();
  if (secao === "wisc")           limparWISC();
  if (secao === "bfp")            { limparBFP(); inicializarBFPForm(); }
}

/** Alterna abertura/fechamento da sidebar no mobile. */
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
}

/**
 * Colapsa ou expande o grupo de sub-itens da navegação principal.
 * @param {HTMLElement} el - o item "Gestão da Clínica"
 */
function _toggleNavGrupo(el) {
  const grupo = document.getElementById("nav-subitems-principal");
  if (!grupo) return;
  const colapsado = grupo.classList.toggle("colapsado");
  el.classList.toggle("colapsado", colapsado);
  try { localStorage.setItem("_navGrupoColapsado", colapsado ? "1" : "0"); } catch(e) {}
}

/**
 * Ajusta estado do menu Correção de Testes (expandido/colapsado).
 */
function _setNavCorrecoes(expand) {
  const grupo = document.getElementById("nav-subitems-correcoes");
  const botao = document.querySelector(".nav-correcoes-item");
  const chevron = document.getElementById("nav-chevron-correcoes");
  if (!grupo) return;

  const colapsado = !expand;
  grupo.classList.toggle("colapsado", colapsado);
  if (botao) botao.classList.toggle("colapsado", colapsado);
  if (chevron) chevron.textContent = colapsado ? "▸" : "▾";
  try { localStorage.setItem("_navCorrecoesColapsado", colapsado ? "1" : "0"); } catch(e) {}
}

/**
 * Alterna os subitens do menu Correção de Testes.
 */
function _toggleNavCorrecoes(el) {
  const grupo = document.getElementById("nav-subitems-correcoes");
  if (!grupo) return;
  const isCollapsed = grupo.classList.contains("colapsado");
  _setNavCorrecoes(isCollapsed);
  if (el) el.classList.toggle("colapsado", isCollapsed);
}
/** Restaura o estado colapsado do grupo ao carregar a página. */
function _restaurarNavGrupo() {
  if (localStorage.getItem("_navGrupoColapsado") === "1") {
    const grupo  = document.getElementById("nav-subitems-principal");
    const header = document.querySelector(".nav-clinica-item");
    if (grupo)  grupo.classList.add("colapsado");
    if (header) header.classList.add("colapsado");
  }

  if (localStorage.getItem("_navCorrecoesColapsado") === "1") {
    _setNavCorrecoes(false);
  } else {
    _setNavCorrecoes(true);
  }
}

document.addEventListener("DOMContentLoaded", _restaurarNavGrupo);
