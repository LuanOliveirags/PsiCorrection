/* ═══════════════════════════════════════════════════════
   CLÍNICA — js/modules/clinica/gestao.js  (v2)
   Gestão de Agenda, Financeiro e Perfil da Clínica.

   Novidades v2:
     · Barra de métricas em tempo real (hoje/semana/receita/pendentes)
     · Strip "Hoje" com cards clicáveis no topo da agenda
     · "Próxima sessão" destacada em gradiente
     · Toggle rápido de status com um clique no badge
     · Detecção de conflito de horários no modal
     · Auto-preenchimento de hora fim e valor padrão
     · Agendamento recorrente semanal (4 semanas)
     · Contador de sessão por paciente (#1, #2…)
     · Filtro por período (hoje/semana/mês/próximos)
     · Gráfico de receita dos últimos 6 meses (Chart.js)
     · Barra de progresso de meta mensal
     · Ticket médio e tendência % vs. mês anterior
     · Exportação CSV do financeiro
     · Mensagem de cobrança para WhatsApp (clipboard)
     · Toast de feedback não intrusivo

   Coleções no Firestore:
     "clinicas"           → perfil por email do profissional
     "agendamentos"       → agenda de sessões/consultas
     "financeiro_clinica" → registros de pagamento

   Depende de (carregados antes):
     core/firebase.js               → _firestoreDB
     modules/pacientes/db_pacientes.js → DB_PAC
   Globals usados em runtime:
     usuarioLogado
═══════════════════════════════════════════════════════ */

// ──────────────────────────────────────────────────────
// BANCO DE DADOS — DB_CLINICA
// ──────────────────────────────────────────────────────

/**
 * Retorna o email do psicólogo responsável pela clínica do usuário atual.
 * Para Colaborador/Cliente usa clinicaId; para Psicólogo usa o próprio email;
 * para Admin retorna null (vê tudo).
 */
function _emailClinica() {
  const role = usuarioLogado?.role;
  if (["colaborador", "cliente"].includes(role)) return usuarioLogado?.clinicaId || null;
  if (role === "admin") return null;
  return usuarioLogado?.email || null;
}

const DB_CLINICA = {
  _perfilCache:  null,
  _agendamentos: [],
  _financeiro:   [],
  _loaded:       false,

  async carregar(email, isAdmin, clinicaId = null) {
    const emailNorm   = email.toLowerCase().trim();
    // Para colaborador/cliente usa o email do psicólogo; para os demais usa o próprio
    const emailFiltro = clinicaId || emailNorm;
    try {
      const doc = await _firestoreDB.collection("clinicas").doc(emailFiltro).get();
      this._perfilCache = doc.exists ? doc.data() : null;

      const colAgen = _firestoreDB.collection("agendamentos");
      const snapAgen = isAdmin
        ? await colAgen.orderBy("data", "desc").limit(500).get()
        : await colAgen.where("emailProfissional", "==", emailFiltro).orderBy("data", "desc").get();
      this._agendamentos = snapAgen.docs.map(d => d.data());

      const colFin = _firestoreDB.collection("financeiro_clinica");
      const snapFin = isAdmin
        ? await colFin.orderBy("data", "desc").limit(500).get()
        : await colFin.where("emailProfissional", "==", emailFiltro).orderBy("data", "desc").get();
      this._financeiro = snapFin.docs.map(d => d.data());
    } catch (err) {
      console.error("[DB_CLINICA] Erro ao carregar:", err);
    }
    this._loaded = true;
  },

  getPerfil() { return this._perfilCache; },

  async salvarPerfil(email, dados) {
    const emailNorm = email.toLowerCase().trim();
    const perfil = { ...dados, email: emailNorm, atualizadoEm: new Date().toISOString() };
    await _firestoreDB.collection("clinicas").doc(emailNorm).set(perfil, { merge: true });
    this._perfilCache = { ...(this._perfilCache || {}), ...perfil };
    return this._perfilCache;
  },

  getMeusAgendamentos() {
    if (usuarioLogado?.role === "admin") return this._agendamentos;
    const ef = _emailClinica();
    return ef ? this._agendamentos.filter(a => a.emailProfissional === ef) : [];
  },

  criarAgendamento(dados) {
    const id = "agen_" + Date.now() + "_" + Math.floor(Math.random() * 9999);
    const agen = { id, ...dados, emailProfissional: _emailClinica() || "", criadoEm: new Date().toISOString() };
    this._agendamentos.unshift(agen);
    _firestoreDB.collection("agendamentos").doc(id).set(agen).catch(console.error);
    return agen;
  },

  atualizarAgendamento(id, dados) {
    const idx = this._agendamentos.findIndex(a => a.id === id);
    if (idx === -1) return null;
    const atualizado = { ...this._agendamentos[idx], ...dados, atualizadoEm: new Date().toISOString() };
    this._agendamentos[idx] = atualizado;
    _firestoreDB.collection("agendamentos").doc(id)
      .update({ ...dados, atualizadoEm: atualizado.atualizadoEm }).catch(console.error);
    return atualizado;
  },

  deletarAgendamento(id) {
    const permitidos = this.getMeusAgendamentos().map(a => a.id);
    if (!permitidos.includes(id)) return;
    this._agendamentos = this._agendamentos.filter(a => a.id !== id);
    _firestoreDB.collection("agendamentos").doc(id).delete().catch(console.error);
  },

  getMeuFinanceiro() {
    if (usuarioLogado?.role === "admin") return this._financeiro;
    const ef = _emailClinica();
    return ef ? this._financeiro.filter(f => f.emailProfissional === ef) : [];
  },

  criarFinanceiro(dados) {
    const id = "fin_" + Date.now();
    const reg = { id, ...dados, emailProfissional: _emailClinica() || "", criadoEm: new Date().toISOString() };
    this._financeiro.unshift(reg);
    _firestoreDB.collection("financeiro_clinica").doc(id).set(reg).catch(console.error);
    return reg;
  },

  atualizarFinanceiro(id, dados) {
    const idx = this._financeiro.findIndex(f => f.id === id);
    if (idx === -1) return null;
    const atualizado = { ...this._financeiro[idx], ...dados, atualizadoEm: new Date().toISOString() };
    this._financeiro[idx] = atualizado;
    _firestoreDB.collection("financeiro_clinica").doc(id)
      .update({ ...dados, atualizadoEm: atualizado.atualizadoEm }).catch(console.error);
    return atualizado;
  },

  deletarFinanceiro(id) {
    const permitidos = this.getMeuFinanceiro().map(f => f.id);
    if (!permitidos.includes(id)) return;
    this._financeiro = this._financeiro.filter(f => f.id !== id);
    _firestoreDB.collection("financeiro_clinica").doc(id).delete().catch(console.error);
  }
};

// ──────────────────────────────────────────────────────
// ESTADO LOCAL
// ──────────────────────────────────────────────────────
let _editandoAgenId = null;
let _editandoFinId  = null;
let _abaClinAtiva   = "perfil"; // primeira aba padrão
let _chartReceita   = null;
let _chartFormas    = null;

// ──────────────────────────────────────────────────────
// CONSTANTES DE UI
// ──────────────────────────────────────────────────────
const AGEN_STATUS_INFO = {
  agendado:  { cor: "#3b82f6", bg: "#eff6ff", label: "Agendado"  },
  realizado: { cor: "#16a34a", bg: "#f0fdf4", label: "Realizado" },
  cancelado: { cor: "#dc2626", bg: "#fef2f2", label: "Cancelado" },
  falta:     { cor: "#ea580c", bg: "#fff7ed", label: "Falta"     }
};
const AGEN_STATUS_CICLO = ["agendado", "realizado", "falta", "cancelado"];
const AGEN_TIPO_EMOJI = {
  sessao: "🛋️", avaliacao: "📋", devolutiva: "📢",
  triagem: "🔍", reuniao: "🤝", outro: "📌"
};
const AGEN_TIPO_LABEL = {
  sessao: "Sessão", avaliacao: "Avaliação", devolutiva: "Devolutiva",
  triagem: "Triagem", reuniao: "Reunião/Supervisão", outro: "Outro"
};
const FIN_STATUS_PAG = {
  pago:     { cor: "#16a34a", bg: "#f0fdf4", label: "Pago"     },
  pendente: { cor: "#ea580c", bg: "#fff7ed", label: "Pendente" },
  parcial:  { cor: "#d97706", bg: "#fffbeb", label: "Parcial"  },
  isento:   { cor: "#6b7280", bg: "#f9fafb", label: "Isento"   }
};
const FIN_FORMA_LABEL = {
  pix: "Pix", dinheiro: "Dinheiro", cartao_debito: "Cartão Débito",
  cartao_credito: "Cartão Crédito", transferencia: "Transferência",
  plano_saude: "Plano de Saúde", outro: "Outro"
};

// ──────────────────────────────────────────────────────
// UTILITÁRIOS
// ──────────────────────────────────────────────────────
const fmtBRL = v => (parseFloat(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function _hoje() { return new Date().toISOString().slice(0, 10); }

function _semanaIso() {
  const now  = new Date();
  const dia  = now.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  const seg  = new Date(now); seg.setDate(now.getDate() + diff);
  const dom  = new Date(seg); dom.setDate(seg.getDate() + 6);
  return { inicio: seg.toISOString().slice(0, 10), fim: dom.toISOString().slice(0, 10) };
}

function _mesAtual()     { return new Date().toISOString().slice(0, 7); }
function _mesAnterior()  {
  const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7);
}

/** Quantas sessões "realizado" um paciente já tem. */
function _numeroSessao(pacienteId) {
  if (!pacienteId) return 0;
  return DB_CLINICA.getMeusAgendamentos()
    .filter(a => a.pacienteId === pacienteId && a.status === "realizado").length;
}

/** Próximo agendamento futuro não cancelado. */
function _proximoAgendamento() {
  const hoje = _hoje();
  return DB_CLINICA.getMeusAgendamentos()
    .filter(a => a.status === "agendado" && a.data >= hoje)
    .sort((a, b) => {
      const d = a.data.localeCompare(b.data);
      return d !== 0 ? d : (a.horaInicio || "").localeCompare(b.horaInicio || "");
    })[0] || null;
}

/** Detecta conflito de horários */
function _detectarConflito(data, hIni, hFim, excluirId = null) {
  if (!data || !hIni) return null;
  return DB_CLINICA.getMeusAgendamentos().find(a => {
    if (excluirId && a.id === excluirId) return false;
    if (a.data !== data || a.status === "cancelado") return false;
    const aiIni = a.horaInicio || "00:00";
    const aiFim = a.horaFim   || "23:59";
    const noFim = hFim        || "23:59";
    return hIni < aiFim && noFim > aiIni;
  }) ?? null;
}

// ──────────────────────────────────────────────────────
// INICIALIZAÃ‡ÃƒO / ROTEAMENTO
// ──────────────────────────────────────────────────────
async function renderizarClinica() {
  if (!DB_CLINICA._loaded) {
    const clinicaId = ["colaborador", "cliente"].includes(usuarioLogado?.role)
      ? (usuarioLogado?.clinicaId || null)
      : null;
    await DB_CLINICA.carregar(usuarioLogado?.email || "", usuarioLogado?.role === "admin", clinicaId);
  }

  // Controla visibilidade das abas da clínica conforme perfil
  const role = usuarioLogado?.role || "profissional";
  document.querySelectorAll(".clin-tab-btn[data-roles]").forEach(btn => {
    const roles = btn.dataset.roles.split(" ");
    btn.style.display = roles.includes(role) ? "" : "none";
  });

  // Ocultar cards financeiros para perfil cliente
  const cardReceita   = document.getElementById("clin-m-receita")?.closest(".clin-metric-card");
  const cardPendentes = document.getElementById("clin-m-pendentes")?.closest(".clin-metric-card");
  if (cardReceita)   cardReceita.style.display   = role === "cliente" ? "none" : "";
  if (cardPendentes) cardPendentes.style.display = role === "cliente" ? "none" : "";

  // Redefinir aba ativa se não permitida para o perfil
  if (_abaClinAtiva === "financeiro" && role === "cliente") _abaClinAtiva = "agenda";
  if (_abaClinAtiva === "perfil" && ["colaborador", "cliente"].includes(role)) _abaClinAtiva = "agenda";

  _renderOverview();
  _trocarAbaClin(_abaClinAtiva);
}

function _trocarAbaClin(aba) {
  // Guarda de acesso por perfil
  const role = usuarioLogado?.role || "profissional";
  if (aba === "financeiro" && role === "cliente") return;
  if (aba === "perfil" && ["colaborador", "cliente"].includes(role)) return;
  if (aba === "teleconsulta" && ["colaborador", "cliente"].includes(role)) return;
  if (aba === "pacientes" && ["colaborador", "cliente"].includes(role)) return;

  _abaClinAtiva = aba;
  document.querySelectorAll(".clin-tab-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.aba === aba));
  document.querySelectorAll(".clin-tab-pane").forEach(p => {
    p.style.display = (p.id === "clin-pane-" + aba) ? "block" : "none";
  });
  if (aba === "agenda")        _renderAgenda();
  if (aba === "financeiro")    _renderFinanceiro();
  if (aba === "perfil")        _renderPerfil();
  if (aba === "teleconsulta")  _renderTeleconsulta();
  if (aba === "pacientes")     _renderPacientes();
}

// ──────────────────────────────────────────────────────
// OVERVIEW — métricas globais no topo
// ──────────────────────────────────────────────────────
function _renderOverview() {
  const hoje   = _hoje();
  const semana = _semanaIso();
  const mes    = _mesAtual();
  const mesAnt = _mesAnterior();
  const all    = DB_CLINICA.getMeusAgendamentos();
  const fin    = DB_CLINICA.getMeuFinanceiro();

  const hojeCount   = all.filter(a => a.data === hoje && a.status !== "cancelado").length;
  const semanaCount = all.filter(a => a.data >= semana.inicio && a.data <= semana.fim && a.status !== "cancelado").length;
  const receitaMes  = fin.filter(f => f.statusPag === "pago" && f.data?.startsWith(mes))
                         .reduce((s, f) => s + (parseFloat(f.valor) || 0), 0);
  const receitaAnt  = fin.filter(f => f.statusPag === "pago" && f.data?.startsWith(mesAnt))
                         .reduce((s, f) => s + (parseFloat(f.valor) || 0), 0);
  const pendentesN  = fin.filter(f => f.statusPag === "pendente").length;
  const realizados  = all.filter(a => a.status === "realizado").length;
  const agendTotal  = all.filter(a => a.status !== "cancelado").length;
  const taxaComp    = agendTotal > 0 ? Math.round(realizados / agendTotal * 100) : 0;

  const el = id => document.getElementById(id);
  if (el("clin-m-hoje"))     el("clin-m-hoje").textContent     = hojeCount;
  if (el("clin-m-semana"))   el("clin-m-semana").textContent   = semanaCount;
  if (el("clin-m-receita"))  el("clin-m-receita").textContent  = fmtBRL(receitaMes);
  if (el("clin-m-pendentes")) el("clin-m-pendentes").textContent = pendentesN;
  if (el("clin-m-taxa"))      el("clin-m-taxa").textContent      = taxaComp + "%";

  // Tendência de receita
  if (el("clin-m-receita-trend") && receitaAnt > 0) {
    const pct  = ((receitaMes - receitaAnt) / receitaAnt * 100).toFixed(0);
    const cor  = pct >= 0 ? "#16a34a" : "#dc2626";
    const seta = pct >= 0 ? "↑" : "↓";
    el("clin-m-receita-trend").innerHTML =
      `<span style="color:${cor};font-weight:700">${seta} ${Math.abs(pct)}%</span> vs. mês anterior`;
  }

  // Badge de pendentes na aba
  const tabFin = document.querySelector('.clin-tab-btn[data-aba="financeiro"] .clin-tab-notif');
  if (tabFin) { tabFin.textContent = pendentesN || ""; tabFin.style.display = pendentesN ? "" : "none"; }
}

// ──────────────────────────────────────────────────────
// ABA: AGENDA
// ──────────────────────────────────────────────────────
function _renderAgenda() {
  _renderHojeStrip();
  _renderProximaSessao();

  const filtroData    = document.getElementById("agen-filtro-data")?.value   || "";
  const filtroStatus  = document.getElementById("agen-filtro-status")?.value || "";
  const filtroPeriodo = document.getElementById("agen-filtro-periodo")?.value || "";
  const filtroTipo    = document.getElementById("agen-filtro-tipo")?.value   || "";
  const filtroBusca   = (document.getElementById("agen-busca")?.value        || "").toLowerCase();

  const hoje   = _hoje();
  const semana = _semanaIso();
  const mes    = _mesAtual();

  let lista = DB_CLINICA.getMeusAgendamentos();
  if (filtroData)                    lista = lista.filter(a => a.data === filtroData);
  if (filtroStatus)                  lista = lista.filter(a => a.status === filtroStatus);
  if (filtroTipo)                    lista = lista.filter(a => a.tipo === filtroTipo);
  if (filtroBusca)                   lista = lista.filter(a => (a.pacienteNome || "").toLowerCase().includes(filtroBusca));
  if (filtroPeriodo === "hoje")      lista = lista.filter(a => a.data === hoje);
  if (filtroPeriodo === "semana")    lista = lista.filter(a => a.data >= semana.inicio && a.data <= semana.fim);
  if (filtroPeriodo === "mes")       lista = lista.filter(a => a.data?.startsWith(mes));
  if (filtroPeriodo === "futuros")   lista = lista.filter(a => a.data >= hoje && a.status === "agendado");

  // Ordena: futuros e hoje primeiro (asc), depois passados (desc)
  const futuros  = lista.filter(a => a.data >= hoje)
    .sort((a, b) => a.data.localeCompare(b.data) || (a.horaInicio||"").localeCompare(b.horaInicio||""));
  const passados = lista.filter(a => a.data < hoje)
    .sort((a, b) => b.data.localeCompare(a.data));
  lista = [...futuros, ...passados];

  const empty  = document.getElementById("agen-empty");
  const tabela = document.getElementById("agen-table");
  const tbody  = document.getElementById("tbody-agendamentos");

  if (!lista.length) {
    empty.style.display  = "block";
    tabela.style.display = "none";
    return;
  }
  empty.style.display  = "none";
  tabela.style.display = "";

  tbody.innerHTML = lista.map(a => {
    const si       = AGEN_STATUS_INFO[a.status] || { cor: "#6b7280", bg: "#f9fafb", label: a.status || "—" };
    const eHoje    = a.data === hoje;
    const dataFmt  = eHoje ? "🌅 Hoje" : (a.data ? new Date(a.data + "T00:00:00").toLocaleDateString("pt-BR") : "—");
    const horario  = [a.horaInicio, a.horaFim].filter(Boolean).join(" – ") || "—";
    const rowClass = a.status === "cancelado" ? "row-cancelado"
                   : a.status === "falta"     ? "row-falta"
                   : a.status === "realizado" ? "row-realizado"
                   : eHoje                    ? "row-hoje" : "";
    const badge    = `<span class="status-badge clickable"
                        style="background:${si.bg};color:${si.cor};border:1px solid ${si.cor}33"
                        title="Clique para avançar o status"
                        onclick="toggleStatusAgendamento('${a.id}')">${si.label}</span>`;
    const numSessao = a.pacienteId
      ? (_numeroSessao(a.pacienteId) + (a.status === "agendado" ? 1 : 0))
      : "—";
    const emoji = AGEN_TIPO_EMOJI[a.tipo] || "📌";
    return `<tr class="${rowClass}">
      <td style="white-space:nowrap;font-weight:${eHoje ? 700 : 400}">${dataFmt}</td>
      <td style="white-space:nowrap;font-weight:600">${horario}</td>
      <td style="font-weight:600">${a.pacienteNome || "—"}</td>
      <td><span title="${AGEN_TIPO_LABEL[a.tipo]||''}">${emoji} ${AGEN_TIPO_LABEL[a.tipo] || "Outro"}</span></td>
      <td style="text-align:center;font-weight:700;color:var(--text-muted);font-size:13px">#${numSessao}</td>
      <td>${badge}</td>
      <td style="font-size:12px;color:var(--text-muted);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
          title="${(a.obs||"").replace(/"/g,'&quot;')}">${a.obs || "—"}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-secondary" style="padding:4px 9px;font-size:12px" title="Editar" onclick="abrirModalAgendamento('${a.id}')">✏️</button>
          <button class="btn" style="padding:4px 9px;font-size:12px;background:#dcfce7;color:#16a34a;border:1px solid #bbf7d0" title="Registrar pagamento" onclick="cobrarAgendamento('${a.id}')">💳</button>
          <button class="btn" style="padding:4px 9px;font-size:12px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe" title="Agendar retorno (+7 dias)" onclick="agendarRetorno('${a.id}')">🔁</button>
          <button class="btn" style="padding:4px 9px;font-size:12px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5" title="Excluir" onclick="deletarAgendamentoUI('${a.id}')">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

function _renderHojeStrip() {
  const hoje  = _hoje();
  const lista = DB_CLINICA.getMeusAgendamentos()
    .filter(a => a.data === hoje)
    .sort((a, b) => (a.horaInicio||"").localeCompare(b.horaInicio||""));
  const strip = document.getElementById("hoje-strip");
  const cards = document.getElementById("hoje-cards");
  if (!strip || !cards) return;
  if (!lista.length) { strip.style.display = "none"; return; }
  strip.style.display = "";
  cards.innerHTML = lista.map(a => {
    const si      = AGEN_STATUS_INFO[a.status] || { cor: "#6b7280", bg: "#f9fafb" };
    const horario = [a.horaInicio, a.horaFim].filter(Boolean).join("–") || "?";
    const emoji   = AGEN_TIPO_EMOJI[a.tipo] || "📌";
    return `<div class="hoje-card ${a.status}" onclick="abrirModalAgendamento('${a.id}')" title="Clique para editar">
      <div class="hoje-card-hora">${horario}</div>
      <div class="hoje-card-nome">${a.pacienteNome || "—"}</div>
      <div class="hoje-card-tipo">${emoji} ${AGEN_TIPO_LABEL[a.tipo]||"Outro"}</div>
      <div style="margin-top:6px">
        <span class="status-badge" style="background:${si.bg};color:${si.cor};border:1px solid ${si.cor}33;font-size:10px">
          ${AGEN_STATUS_INFO[a.status]?.label || a.status}
        </span>
      </div>
    </div>`;
  }).join("");
}

function _renderProximaSessao() {
  const prox = _proximoAgendamento();
  const el   = document.getElementById("clin-proxima");
  const info = document.getElementById("clin-proxima-info");
  if (!el || !info) return;
  if (!prox) { el.style.display = "none"; return; }
  el.style.display = "";
  const dataFmt = prox.data === _hoje()
    ? "hoje"
    : new Date(prox.data + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const horario = [prox.horaInicio, prox.horaFim].filter(Boolean).join(" – ") || "";
  const numSessao = _numeroSessao(prox.pacienteId) + 1;
  info.textContent = `${prox.pacienteNome || "Paciente"} · ${dataFmt}${horario ? " às " + horario : ""} · Sessão #${numSessao}`;
}

/** Avança o status no ciclo: agendado → realizado → falta → cancelado → agendado */
function toggleStatusAgendamento(id) {
  const a = DB_CLINICA.getMeusAgendamentos().find(x => x.id === id);
  if (!a) return;
  const idx    = AGEN_STATUS_CICLO.indexOf(a.status);
  const novoSt = AGEN_STATUS_CICLO[(idx + 1) % AGEN_STATUS_CICLO.length];
  DB_CLINICA.atualizarAgendamento(id, { status: novoSt });
  _renderAgenda();
  _renderOverview();
  _toast(`Status alterado para "${AGEN_STATUS_INFO[novoSt]?.label || novoSt}"`);
}

// ──────────────────────────────────────────────────────
// ABA: FINANCEIRO
// ──────────────────────────────────────────────────────
function _renderFinanceiro() {
  const filtroMes    = document.getElementById("fin-filtro-mes")?.value    || "";
  const filtroStatus = document.getElementById("fin-filtro-status")?.value || "";
  const filtroBusca  = (document.getElementById("fin-busca")?.value        || "").toLowerCase();

  let lista = DB_CLINICA.getMeuFinanceiro();
  lista = [...lista].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  if (filtroMes)    lista = lista.filter(f => f.data?.startsWith(filtroMes));
  if (filtroStatus) lista = lista.filter(f => f.statusPag === filtroStatus);
  if (filtroBusca)  lista = lista.filter(f =>
    (f.pacienteNome || "").toLowerCase().includes(filtroBusca) ||
    (f.obs || "").toLowerCase().includes(filtroBusca));


  // Controle de acesso do colaborador: só pode ver/registrar pagamentos, sem métricas
  const role = usuarioLogado?.role || "profissional";
  const el = id => document.getElementById(id);
  if (role === "colaborador") {
    // Esconde todos os cards de resumo, meta, gráficos, projeção, inadimplentes e exportação
    [
      "fin-total-valor", "fin-total-pago", "fin-total-pend", "fin-ticket-medio", "fin-n-sessoes",
      "fin-trend-pago", "meta-bar-wrap", "chart-receita", "chart-formas", "fin-formas-card",
      "fin-projecao-val", "fin-projecao-sub", "fin-inadimplentes", "fin-projecao-card", "fin-extras-grid"
    ].forEach(id => { const e = el(id); if (e) e.closest('.fin-resumo-card,.meta-bar-wrap,.fin-chart-card,.fin-extras-grid,.fin-inadimplentes,.fin-projecao-card')?.classList?.add('hidden'); });
    // Esconde barra de meta mensal, gráficos, projeção, inadimplentes, exportação CSV
    if (el("meta-bar-wrap")) el("meta-bar-wrap").style.display = "none";
    if (el("fin-formas-card")) el("fin-formas-card").style.display = "none";
    if (el("fin-inadimplentes")) el("fin-inadimplentes").style.display = "none";
    if (el("fin-projecao-val")) el("fin-projecao-val").style.display = "none";
    if (el("fin-projecao-sub")) el("fin-projecao-sub").style.display = "none";
    // Esconde botão de exportar CSV
    const bar = document.querySelector('.fin-action-bar');
    if (bar) bar.style.display = "none";
  } else {
    // Cálculos
    const totalValor = lista.reduce((s, f) => s + (parseFloat(f.valor) || 0), 0);
    const totalPago  = lista.filter(f => f.statusPag === "pago").reduce((s, f) => s + (parseFloat(f.valor) || 0), 0);
    const totalPend  = lista.filter(f => f.statusPag === "pendente").reduce((s, f) => s + (parseFloat(f.valor) || 0), 0);
    const nPago      = lista.filter(f => f.statusPag === "pago").length;
    const ticket     = nPago > 0 ? totalPago / nPago : 0;

    if (el("fin-total-valor"))  el("fin-total-valor").textContent  = fmtBRL(totalValor);
    if (el("fin-total-pago"))   el("fin-total-pago").textContent   = fmtBRL(totalPago);
    if (el("fin-total-pend"))   el("fin-total-pend").textContent   = fmtBRL(totalPend);
    if (el("fin-ticket-medio")) el("fin-ticket-medio").textContent = fmtBRL(ticket);
    if (el("fin-n-sessoes"))    el("fin-n-sessoes").textContent    = `${nPago} sessão(ões) paga(s)`;

    // Tendência: receita mês atual vs. anterior (sobre todos os registros, não apenas filtrados)
    const todaFin = DB_CLINICA.getMeuFinanceiro();
    const mes    = _mesAtual();
    const mesAnt = _mesAnterior();
    const pagoMes = todaFin.filter(f => f.statusPag === "pago" && f.data?.startsWith(mes))
                            .reduce((s, f) => s + (parseFloat(f.valor) || 0), 0);
    const pagoAnt = todaFin.filter(f => f.statusPag === "pago" && f.data?.startsWith(mesAnt))
                            .reduce((s, f) => s + (parseFloat(f.valor) || 0), 0);
    if (el("fin-trend-pago") && pagoAnt > 0) {
      const pct = ((pagoMes - pagoAnt) / pagoAnt * 100).toFixed(0);
      const cor = pct >= 0 ? "#16a34a" : "#dc2626";
      el("fin-trend-pago").innerHTML = `<span style="color:${cor};font-weight:700">${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct)}%</span> vs. mês anterior`;
    }

    // Meta mensal
    const perf = DB_CLINICA.getPerfil();
    const meta = parseFloat(perf?.metaMensal) || 0;
    const metaWrap = el("meta-bar-wrap");
    if (metaWrap) {
      if (meta > 0) {
        metaWrap.style.display = "";
        const pct = Math.min(100, Math.round(pagoMes / meta * 100));
        if (el("meta-bar-pct"))  el("meta-bar-pct").textContent  = pct + "%";
        if (el("meta-bar-fill")) el("meta-bar-fill").style.width = pct + "%";
        if (el("meta-bar-sub"))  el("meta-bar-sub").textContent  =
          `${fmtBRL(pagoMes)} de ${fmtBRL(meta)} · faltam ${fmtBRL(Math.max(0, meta - pagoMes))}`;
      } else {
        metaWrap.style.display = "none";
      }
    }

    // Gráfico
    _buildChartReceita();
    _buildChartFormas();
    _renderInadimplentes();

    // Projeção do mês
    if (el("fin-projecao-val")) {
      const valorPad2  = parseFloat(perf?.valorPadrao) || 0;
      const sessoesMes = DB_CLINICA.getMeusAgendamentos()
        .filter(a => a.status === "agendado" && a.data?.startsWith(mes)).length;
      el("fin-projecao-val").textContent = fmtBRL(sessoesMes * valorPad2);
      if (el("fin-projecao-sub"))
        el("fin-projecao-sub").textContent = `${sessoesMes} sessão(ões) agend. × ${fmtBRL(valorPad2)}`;
    }
    // Mostra barra de ações
    const bar = document.querySelector('.fin-action-bar');
    if (bar) bar.style.display = "";
  }

  // Tabela
  const empty  = el("fin-empty");
  const tabela = el("fin-table");
  const tbody  = el("tbody-financeiro");

  if (!lista.length) { empty.style.display = "block"; tabela.style.display = "none"; return; }
  empty.style.display  = "none";
  tabela.style.display = "";

  tbody.innerHTML = lista.map(f => {
    const si    = FIN_STATUS_PAG[f.statusPag] || { cor: "#6b7280", bg: "#f9fafb", label: f.statusPag || "—" };
    const dataFmt = f.data ? new Date(f.data + "T00:00:00").toLocaleDateString("pt-BR") : "—";
    const badge = `<span class="status-badge" style="background:${si.bg};color:${si.cor};border:1px solid ${si.cor}33">${si.label}</span>`;
    return `<tr>
      <td style="white-space:nowrap">${dataFmt}</td>
      <td style="font-weight:600">${f.pacienteNome || "—"}</td>
      <td style="font-weight:700;color:#16a34a">${fmtBRL(parseFloat(f.valor)||0)}</td>
      <td>${FIN_FORMA_LABEL[f.formaPagamento] || f.formaPagamento || "—"}</td>
      <td>${badge}</td>
      <td style="font-size:12px;color:var(--text-muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
          title="${(f.obs||"").replace(/"/g,'&quot;')}">${f.obs || "—"}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn" style="padding:4px 9px;font-size:12px;background:#dcfce7;color:#16a34a;border:1px solid #bbf7d0"
                  title="Copiar mensagem de cobrança para WhatsApp" onclick="copiarMsgCobranca('${f.id}')">💬</button>
          <button class="btn btn-secondary" style="padding:4px 9px;font-size:12px" title="Editar" onclick="abrirModalFinanceiro('${f.id}')">✏️</button>
          <button class="btn" style="padding:4px 9px;font-size:12px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5" title="Excluir" onclick="deletarFinanceiroUI('${f.id}')">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

/** Gráfico de receita (últimos 6 meses) com Chart.js */
function _buildChartReceita() {
  const canvas = document.getElementById("chart-receita");
  if (!canvas || typeof Chart === "undefined") return;
  const todaFin = DB_CLINICA.getMeuFinanceiro();
  const agora   = new Date();
  const meses = [], valores = [];
  for (let i = 5; i >= 0; i--) {
    const d     = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const key   = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    const total = todaFin.filter(f => f.statusPag === "pago" && f.data?.startsWith(key))
                         .reduce((s, f) => s + (parseFloat(f.valor) || 0), 0);
    meses.push(label);
    valores.push(total);
  }
  if (_chartReceita) { _chartReceita.destroy(); _chartReceita = null; }
  _chartReceita = new Chart(canvas, {
    type: "bar",
    data: {
      labels: meses,
      datasets: [{
        label: "Receita (R$)",
        data: valores,
        backgroundColor: valores.map((_, i) => i === 5 ? "#1d4ed8" : "rgba(109,40,217,.35)"),
        borderRadius: 7,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => fmtBRL(ctx.parsed.y) } }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => "R$ " + v.toLocaleString("pt-BR") },
          grid: { color: "rgba(0,0,0,.05)" }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

/** Gráfico donut de formas de pagamento (registros "Pago"). */
function _buildChartFormas() {
  const canvas = document.getElementById("chart-formas");
  if (!canvas || typeof Chart === "undefined") return;
  const lista = DB_CLINICA.getMeuFinanceiro().filter(f => f.statusPag === "pago");
  const totais = {};
  lista.forEach(f => {
    const forma = f.formaPagamento || "outro";
    totais[forma] = (totais[forma] || 0) + (parseFloat(f.valor) || 0);
  });
  const entries = Object.entries(totais).sort((a, b) => b[1] - a[1]);
  const fc = document.getElementById("fin-formas-card");
  if (!entries.length) { if (fc) fc.style.display = "none"; return; }
  if (fc) fc.style.display = "";
  const labels = entries.map(([k]) => FIN_FORMA_LABEL[k] || k);
  const values = entries.map(([, v]) => v);
  const CORES  = ["#1d4ed8","#7c3aed","#0891b2","#16a34a","#d97706","#dc2626","#6b7280"];
  if (_chartFormas) { _chartFormas.destroy(); _chartFormas = null; }
  _chartFormas = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: CORES.slice(0, values.length), borderWidth: 2, borderColor: "#fff" }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtBRL(ctx.raw)}` } }
      }
    }
  });
}

/** Lista os pacientes com mais pagamentos pendentes. */
function _renderInadimplentes() {
  const container = document.getElementById("fin-inadimplentes");
  if (!container) return;
  const lista = DB_CLINICA.getMeuFinanceiro().filter(f => f.statusPag === "pendente");
  if (!lista.length) { container.style.display = "none"; return; }
  const porPac = {};
  lista.forEach(f => {
    const key = f.pacienteId || ("__" + f.pacienteNome);
    if (!porPac[key]) porPac[key] = { nome: f.pacienteNome || "Sem nome", total: 0, count: 0 };
    porPac[key].total += parseFloat(f.valor) || 0;
    porPac[key].count++;
  });
  const ranking = Object.values(porPac).sort((a, b) => b.total - a.total).slice(0, 5);
  container.style.display = "";
  container.innerHTML = `<div class="fin-inadim-header">⚠️ Pacientes com pagamentos pendentes</div>
    ${ranking.map(p =>
      `<div class="fin-inadim-row">
        <span class="fin-inadim-nome">${p.nome}</span>
        <span class="fin-inadim-info">${p.count} reg. · <strong>${fmtBRL(p.total)}</strong></span>
      </div>`
    ).join("")}`;
}

/** Exporta todos os registros para CSV com BOM (funciona no Excel). */
function exportarCSVFinanceiro() {
  const lista = DB_CLINICA.getMeuFinanceiro();
  if (!lista.length) { alert("Nenhum registro para exportar."); return; }
  const cabecalho = ["Data", "Paciente", "Valor (R$)", "Forma Pagamento", "Status", "Observações"];
  const linhas = lista.map(f => [
    f.data || "",
    `"${(f.pacienteNome || "").replace(/"/g, '""')}"`,
    (parseFloat(f.valor) || 0).toFixed(2).replace(".", ","),
    FIN_FORMA_LABEL[f.formaPagamento] || f.formaPagamento || "",
    FIN_STATUS_PAG[f.statusPag]?.label || f.statusPag || "",
    `"${(f.obs || "").replace(/"/g, '""')}"`
  ].join(";"));
  const csv  = "\uFEFF" + [cabecalho.join(";"), ...linhas].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `financeiro_${_mesAtual()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  _toast("📥 CSV exportado com sucesso!");
}

/** Gera e copia mensagem de cobrança para o WhatsApp (clipboard). */
async function copiarMsgCobranca(finId) {
  const f        = DB_CLINICA.getMeuFinanceiro().find(x => x.id === finId);
  if (!f) return;
  const perf     = DB_CLINICA.getPerfil();
  const clinNome = perf?.nome || usuarioLogado?.nome || "Psicóloga(o)";
  const dataFmt  = f.data ? new Date(f.data + "T00:00:00").toLocaleDateString("pt-BR") : "";
  const status   = f.statusPag === "pago" ? "✅ *Pagamento confirmado!*" : "⏳ *Pagamento pendente*";
  const msg = `Olá, ${f.pacienteNome || ""}! 😊\n\n${status}\n\n` +
    `📅 *Data da sessão:* ${dataFmt}\n` +
    `💰 *Valor:* ${fmtBRL(parseFloat(f.valor)||0)}\n` +
    `💳 *Forma de pagamento:* ${FIN_FORMA_LABEL[f.formaPagamento] || f.formaPagamento || "—"}\n` +
    `\nQualquer dúvida, estou à disposição! 🙏\n— *${clinNome}*`;
  try {
    await navigator.clipboard.writeText(msg);
    _toast("💬 Mensagem copiada! Cole no WhatsApp.");
  } catch {
    prompt("Copie a mensagem abaixo:", msg);
  }
}

// ──────────────────────────────────────────────────────
// ABA: PERFIL
// ──────────────────────────────────────────────────────
function _renderPerfil() {
  const p = DB_CLINICA.getPerfil();
  if (!p) return;
  const mapa = {
    "clin-nome": "nome", "clin-cnpj": "cnpj",
    "clin-end": "endereco", "clin-tel": "telefone",
    "clin-email": "emailClinica", "clin-site": "site",
    "clin-hora": "horario", "clin-obs": "obs",
    "clin-val-padrao": "valorPadrao",
    "clin-duracao-padrao": "duracaoPadrao",
    "clin-meta-mensal": "metaMensal"
  };
  Object.entries(mapa).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.value = p[key] || "";
  });
  // Exibe logo salvo no preview
  const logoUrl = p.logoUrl || "";
  const previewImg  = document.getElementById("clin-logo-preview-img");
  const previewEmoji = document.getElementById("clin-logo-preview-emoji");
  const removerBtn  = document.getElementById("clin-logo-remover");
  if (previewImg && previewEmoji) {
    if (logoUrl) {
      previewImg.src = logoUrl;
      previewImg.style.display = "block";
      previewEmoji.style.display = "none";
      if (removerBtn) removerBtn.style.display = "";
    } else {
      previewImg.style.display = "none";
      previewEmoji.style.display = "";
      if (removerBtn) removerBtn.style.display = "none";
    }
  }
  _atualizarNavClinica(p.nome || "", logoUrl);
}

async function salvarPerfilClinica() {
  const mapa = {
    "clin-nome": "nome", "clin-cnpj": "cnpj",
    "clin-end": "endereco", "clin-tel": "telefone",
    "clin-email": "emailClinica", "clin-site": "site",
    "clin-hora": "horario", "clin-obs": "obs",
    "clin-val-padrao": "valorPadrao",
    "clin-duracao-padrao": "duracaoPadrao",
    "clin-meta-mensal": "metaMensal"
  };
  const dados = {};
  Object.entries(mapa).forEach(([id, key]) => {
    dados[key] = (document.getElementById(id)?.value || "").trim();
  });
  // Inclui logo: usa a pendente (se o usuário selecionou nova) ou a já salva
  const perfAtual = DB_CLINICA.getPerfil();
  dados.logoUrl = _logoClinicaPendente !== null ? _logoClinicaPendente : (perfAtual?.logoUrl || "");

  const btn = document.getElementById("clin-btn-salvar");
  const err = document.getElementById("clin-perfil-err");
  if (err) err.classList.add("hidden");
  btn.textContent = "Salvando…";
  btn.disabled    = true;
  try {
    await DB_CLINICA.salvarPerfil(usuarioLogado.email, dados);
    // Propaga clinicaNome (e logoUrl) para o doc do Psicólogo
    if (["profissional", "psicologo"].includes(usuarioLogado?.role)) {
      const cNome = dados.nome || "";
      const cLogo = dados.logoUrl || "";
      await _firestoreDB.collection("usuarios").doc(usuarioLogado.email)
        .update({ clinicaNome: cNome, clinicaLogoUrl: cLogo }).catch(console.error);
      const _uIdx = DB._cache.findIndex(u => u.email === usuarioLogado.email);
      if (_uIdx !== -1) { DB._cache[_uIdx].clinicaNome = cNome; DB._cache[_uIdx].clinicaLogoUrl = cLogo; }
      usuarioLogado.clinicaNome    = cNome;
      usuarioLogado.clinicaLogoUrl = cLogo;
      sessionStorage.setItem("neupsilin_user", JSON.stringify(usuarioLogado));
    }
    _logoClinicaPendente = null; // limpa pendente após salvar
    _atualizarNavClinica(dados.nome, dados.logoUrl);
    btn.textContent = "✅ Configurações salvas!";
    setTimeout(() => { btn.textContent = "💾 Salvar Configurações"; btn.disabled = false; }, 2400);
    _renderOverview();
    _toast("✅ Configurações da clínica salvas!");
  } catch (e) {
    btn.textContent = "Erro — tente novamente";
    btn.disabled    = false;
    if (err) { err.textContent = String(e); err.classList.remove("hidden"); }
  }
}

/** Variável temporária para logo pendente de salvar (base64 ou null para remover). */
let _logoClinicaPendente = null;

/** Atualiza a brand da sidebar e o cabeçalho da seção com nome e logo dinâmicos da clínica. */
function _atualizarNavClinica(nome, logoUrl) {
  // A brand da sidebar (logo + "PsiCorrection") é fixa — não muda com o perfil da clínica.
  // Apenas o cabeçalho interno da seção reflete o nome/logo do consultório.

  // ── Cabeçalho da seção Gestão da Clínica ──
  const hNomeEl  = document.getElementById("clin-header-nome");
  const hImgEl   = document.getElementById("clin-header-logo-img");
  const hEmojiEl = document.getElementById("clin-header-logo-emoji");
  if (hNomeEl)  hNomeEl.textContent = nome || "Gestão da Clínica";
  if (hImgEl && hEmojiEl) {
    if (logoUrl) {
      hImgEl.src = logoUrl;
      hImgEl.style.display = "block";
      hEmojiEl.style.display = "none";
    } else {
      hImgEl.style.display = "none";
      hEmojiEl.style.display = "";
    }
  }
}

/** Lida com o upload do logo: valida tamanho e converte para base64. */
function handleLogoClinica(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 512 * 1024) {
    alert("Imagem muito grande. Máximo permitido: 500 KB.");
    event.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;
    _logoClinicaPendente = base64;
    // Atualiza preview
    const previewImg   = document.getElementById("clin-logo-preview-img");
    const previewEmoji = document.getElementById("clin-logo-preview-emoji");
    const removerBtn   = document.getElementById("clin-logo-remover");
    if (previewImg)   { previewImg.src = base64; previewImg.style.display = "block"; }
    if (previewEmoji) previewEmoji.style.display = "none";
    if (removerBtn)   removerBtn.style.display = "";
  };
  reader.readAsDataURL(file);
}

/** Remove o logo da clínica (marca para exclusão ao salvar). */
function removerLogoClinica() {
  _logoClinicaPendente = ""; // string vazia = remover
  const previewImg   = document.getElementById("clin-logo-preview-img");
  const previewEmoji = document.getElementById("clin-logo-preview-emoji");
  const removerBtn   = document.getElementById("clin-logo-remover");
  const fileInput    = document.getElementById("clin-logo-input");
  if (previewImg)   { previewImg.src = ""; previewImg.style.display = "none"; }
  if (previewEmoji) previewEmoji.style.display = "";
  if (removerBtn)   removerBtn.style.display = "none";
  if (fileInput)    fileInput.value = "";
}

// ──────────────────────────────────────────────────────
// MODAL — AGENDAMENTO
// ──────────────────────────────────────────────────────
function abrirModalAgendamento(id = null, pacienteIdPresel = null) {
  _editandoAgenId = id;
  document.getElementById("modal-agen-titulo").textContent = id ? "✏️ Editar Agendamento" : "📅 Novo Agendamento";

  const sel = document.getElementById("agen-f-paciente");
  sel.innerHTML = '<option value="">— Selecione o paciente —</option>';
  DB_PAC.getMeus().forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id; opt.dataset.nome = p.nome; opt.textContent = p.nome;
    sel.appendChild(opt);
  });

  document.getElementById("agen-err").classList.add("hidden");
  document.getElementById("agen-conflito").style.display = "none";

  if (id) {
    const a = DB_CLINICA.getMeusAgendamentos().find(x => x.id === id);
    if (a) {
      sel.value = a.pacienteId || "";
      document.getElementById("agen-f-data").value     = a.data       || "";
      document.getElementById("agen-f-hora-ini").value = a.horaInicio || "";
      document.getElementById("agen-f-hora-fim").value = a.horaFim    || "";
      document.getElementById("agen-f-tipo").value     = a.tipo       || "sessao";
      document.getElementById("agen-f-status").value   = a.status     || "agendado";
      document.getElementById("agen-f-obs").value      = a.obs        || "";
      document.getElementById("agen-f-repetir").checked = false;
    }
  } else {
    sel.value = pacienteIdPresel || "";
    document.getElementById("agen-f-data").value     = _hoje();
    document.getElementById("agen-f-hora-ini").value = "";
    document.getElementById("agen-f-hora-fim").value = "";
    document.getElementById("agen-f-tipo").value     = "sessao";
    document.getElementById("agen-f-status").value   = "agendado";
    document.getElementById("agen-f-obs").value      = "";
    document.getElementById("agen-f-repetir").checked = false;
  }
  document.getElementById("modal-agen-overlay").classList.remove("hidden");
}

function fecharModalAgendamento() {
  document.getElementById("modal-agen-overlay").classList.add("hidden");
  _editandoAgenId = null;
}

/** Auto-preenche hora fim com base na duração padrão configurada. */
function autoPreencherHoraFim() {
  const hIni = document.getElementById("agen-f-hora-ini").value;
  const dur  = parseInt(DB_CLINICA.getPerfil()?.duracaoPadrao) || 0;
  if (hIni && dur) {
    const [h, m] = hIni.split(":").map(Number);
    const total  = h * 60 + m + dur;
    const hFim   = String(Math.floor(total / 60) % 24).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
    document.getElementById("agen-f-hora-fim").value = hFim;
  }
  _verificarConflitoCampos();
}

function _verificarConflitoCampos() {
  const data  = document.getElementById("agen-f-data").value;
  const hIni  = document.getElementById("agen-f-hora-ini").value;
  const hFim  = document.getElementById("agen-f-hora-fim").value;
  const alrt  = document.getElementById("agen-conflito");
  if (!alrt) return;
  const c = _detectarConflito(data, hIni, hFim, _editandoAgenId);
  if (c) {
    alrt.textContent = `⚠️ Conflito com ${c.pacienteNome || "outro paciente"} (${c.horaInicio || "?"}–${c.horaFim || "?"}).`;
    alrt.style.display = "";
  } else {
    alrt.style.display = "none";
  }
}

function salvarAgendamento() {
  const errDiv = document.getElementById("agen-err");
  errDiv.classList.add("hidden");

  const sel           = document.getElementById("agen-f-paciente");
  const pacienteId    = sel.value;
  const pacienteNome  = sel.options[sel.selectedIndex]?.dataset.nome || "";
  const data          = document.getElementById("agen-f-data").value;
  const horaInicio    = document.getElementById("agen-f-hora-ini").value;
  const horaFim       = document.getElementById("agen-f-hora-fim").value;
  const tipo          = document.getElementById("agen-f-tipo").value;
  const status        = document.getElementById("agen-f-status").value;
  const obs           = document.getElementById("agen-f-obs").value.trim();
  const repetir       = document.getElementById("agen-f-repetir").checked;

  if (!data) {
    errDiv.textContent = "Informe a data do agendamento.";
    errDiv.classList.remove("hidden");
    return;
  }

  const dados = { pacienteId, pacienteNome, data, horaInicio, horaFim, tipo, status, obs };

  if (_editandoAgenId) {
    DB_CLINICA.atualizarAgendamento(_editandoAgenId, dados);
    _toast("✅ Agendamento atualizado!");
  } else {
    DB_CLINICA.criarAgendamento(dados);
    if (repetir) {
      for (let s = 1; s <= 4; s++) {
        const d = new Date(data + "T00:00:00");
        d.setDate(d.getDate() + s * 7);
        DB_CLINICA.criarAgendamento({ ...dados, data: d.toISOString().slice(0, 10) });
      }
      _toast("📅 5 agendamentos criados (semanal — 4 semanas).");
    } else {
      _toast("📅 Agendamento criado!");
    }
  }

  fecharModalAgendamento();
  _renderAgenda();
  _renderOverview();
}

function deletarAgendamentoUI(id) {
  if (!confirm("Excluir este agendamento? Esta ação não pode ser desfeita.")) return;
  DB_CLINICA.deletarAgendamento(id);
  _renderAgenda();
  _renderOverview();
}

// ──────────────────────────────────────────────────────
// MODAL — FINANCEIRO
// ──────────────────────────────────────────────────────
function abrirModalFinanceiro(id = null, pacienteIdPresel = null, dataPresel = null) {
  _editandoFinId = id;
  document.getElementById("modal-fin-titulo").textContent = id ? "✏️ Editar Registro" : "💰 Novo Registro Financeiro";

  const sel = document.getElementById("fin-f-paciente");
  sel.innerHTML = '<option value="">— Selecione o paciente —</option>';
  DB_PAC.getMeus().forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id; opt.dataset.nome = p.nome; opt.textContent = p.nome;
    sel.appendChild(opt);
  });

  document.getElementById("fin-err").classList.add("hidden");
  const valorPad = DB_CLINICA.getPerfil()?.valorPadrao || "";

  if (id) {
    const f = DB_CLINICA.getMeuFinanceiro().find(x => x.id === id);
    if (f) {
      sel.value = f.pacienteId || "";
      document.getElementById("fin-f-data").value   = f.data           || "";
      document.getElementById("fin-f-valor").value  = f.valor          || "";
      document.getElementById("fin-f-forma").value  = f.formaPagamento || "pix";
      document.getElementById("fin-f-status").value = f.statusPag      || "pago";
      document.getElementById("fin-f-obs").value    = f.obs            || "";
    }
  } else {
    sel.value = pacienteIdPresel || "";
    document.getElementById("fin-f-data").value   = dataPresel || _hoje();
    document.getElementById("fin-f-valor").value  = valorPad;
    document.getElementById("fin-f-forma").value  = "pix";
    document.getElementById("fin-f-status").value = "pago";
    document.getElementById("fin-f-obs").value    = "";
  }
  document.getElementById("modal-fin-overlay").classList.remove("hidden");
}

function fecharModalFinanceiro() {
  document.getElementById("modal-fin-overlay").classList.add("hidden");
  _editandoFinId = null;
}

function salvarFinanceiro() {
  const errDiv = document.getElementById("fin-err");
  errDiv.classList.add("hidden");

  const sel          = document.getElementById("fin-f-paciente");
  const pacienteId   = sel.value;
  const pacienteNome = sel.options[sel.selectedIndex]?.dataset.nome || "";
  const data         = document.getElementById("fin-f-data").value;
  const valor        = parseFloat(document.getElementById("fin-f-valor").value.replace(",", "."));
  const formaPagamento = document.getElementById("fin-f-forma").value;
  const statusPag    = document.getElementById("fin-f-status").value;
  const obs          = document.getElementById("fin-f-obs").value.trim();

  if (!data) {
    errDiv.textContent = "Informe a data do registro.";
    errDiv.classList.remove("hidden"); return;
  }
  if (isNaN(valor) || valor < 0) {
    errDiv.textContent = "Informe um valor válido (ex: 150.00).";
    errDiv.classList.remove("hidden"); return;
  }

  const dados = { pacienteId, pacienteNome, data, valor, formaPagamento, statusPag, obs };

  if (_editandoFinId) {
    DB_CLINICA.atualizarFinanceiro(_editandoFinId, dados);
    _toast("✅ Registro atualizado!");
  } else {
    DB_CLINICA.criarFinanceiro(dados);
    _toast("💰 Registro financeiro criado!");
  }

  fecharModalFinanceiro();
  _renderFinanceiro();
  _renderOverview();
}

/** Abre modal financeiro pré-preenchido a partir de um agendamento. */
function cobrarAgendamento(agenId) {
  const a = DB_CLINICA.getMeusAgendamentos().find(x => x.id === agenId);
  if (!a) return;
  abrirModalFinanceiro(null, a.pacienteId, a.data);
}

/** Cria um novo agendamento 7 dias após o informado, mesmo paciente/horário. */
function agendarRetorno(agenId) {
  const a = DB_CLINICA.getMeusAgendamentos().find(x => x.id === agenId);
  if (!a || a.status === "cancelado") return;
  const d = new Date((a.data || _hoje()) + "T00:00:00");
  d.setDate(d.getDate() + 7);
  const novaData = d.toISOString().slice(0, 10);
  const { id: _id, criadoEm: _c, atualizadoEm: _u, emailProfissional: _ep, ...resto } = a;
  DB_CLINICA.criarAgendamento({ ...resto, data: novaData, status: "agendado" });
  _renderAgenda();
  _renderOverview();
  _toast(`🔁 Retorno agendado: ${new Date(novaData + "T00:00:00").toLocaleDateString("pt-BR")}`);
}

function deletarFinanceiroUI(id) {
  if (!confirm("Excluir este registro financeiro? Esta ação não pode ser desfeita.")) return;
  DB_CLINICA.deletarFinanceiro(id);
  _renderFinanceiro();
  _renderOverview();
}

// ──────────────────────────────────────────────────────
// TOAST — feedback visual leve
// ──────────────────────────────────────────────────────
function _toast(msg, dur = 3000) {
  let el = document.getElementById("clin-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "clin-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity   = "1";
  el.style.transform = "translateX(-50%) translateY(0)";
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.opacity   = "0";
    el.style.transform = "translateX(-50%) translateY(20px)";
  }, dur);
}

// ══════════════════════════════════════════════════════
// TELECONSULTA — Videochamada via Jitsi Meet
// ══════════════════════════════════════════════════════

/** Estado da sala ativa. */
let _teleSalaAtiva = null; // { roomName, url, agenId }

/**
 * Preenche o select de agendamentos com os próximos agendamentos do dia/semana.
 */
function _renderTeleconsulta() {
  const sel = document.getElementById("tele-sel-agendamento");
  if (!sel) return;

  const hoje = _hoje();
  const agendamentos = DB_CLINICA.getMeusAgendamentos()
    .filter(a => a.data >= hoje && a.status !== "cancelado")
    .sort((a, b) => (a.data + (a.horaInicio || "")).localeCompare(b.data + (b.horaInicio || "")))
    .slice(0, 50);

  // Preserva seleção atual
  const valorAtual = sel.value;
  sel.innerHTML = '<option value="">— Sessão avulsa (sem agendamento) —</option>';

  agendamentos.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id;
    const dataFmt = a.data ? a.data.split("-").reverse().join("/") : "";
    const hora    = a.horaInicio ? ` ${a.horaInicio}` : "";
    opt.textContent = `${dataFmt}${hora} — ${a.pacienteNome || "Paciente"} (${a.tipo || "sessão"})`;
    sel.appendChild(opt);
  });

  if (valorAtual) sel.value = valorAtual;

  // Se já há sala ativa, mostra ela novamente
  if (_teleSalaAtiva) {
    _exibirSalaAtiva(_teleSalaAtiva);
  }
}

/**
 * Gera um nome de sala criptograficamente aleatório e inicia a videochamada.
 */
function gerarSalaTeleconsulta() {
  const sel     = document.getElementById("tele-sel-agendamento");
  const agenId  = sel?.value || "";

  // Gera código aleatório do Google Meet: 3-4-3 letras
  const googleCode = gerarCodigoGoogleMeet();
  const roomName = googleCode;
  const url = "https://meet.google.com/" + googleCode;
  const provider = "google";

  _teleSalaAtiva = { roomName, url, agenId, provider };

  _teleSalaAtiva = { roomName, url, agenId, provider };
  _exibirSalaAtiva(_teleSalaAtiva);
  _toast("✅ Sala criada! Compartilhe o link com o paciente.");
}

function gerarCodigoGoogleMeet() {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const parts = [3, 4, 3];
  return parts.map(len => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("")).join("-");
}

/**
 * Exibe o painel da sala ativa e carrega o iframe do Jitsi.
 * @param {{ roomName: string, url: string, agenId: string }} sala
 */
function _exibirSalaAtiva(sala) {
  // Determina o título da sessão
  let titulo = "Sessão Avulsa";
  let sub    = "";
  if (sala.agenId) {
    const a = DB_CLINICA.getMeusAgendamentos().find(x => x.id === sala.agenId);
    if (a) {
      const dataFmt = a.data ? a.data.split("-").reverse().join("/") : "";
      titulo = a.pacienteNome || "Paciente";
      sub    = `${dataFmt}${a.horaInicio ? " às " + a.horaInicio : ""} · ${a.tipo || "sessão"}`;
    }
  }

  const tituloEl = document.getElementById("tele-sala-titulo");
  const subEl    = document.getElementById("tele-sala-sub");
  const linkEl   = document.getElementById("tele-link-url");
  const iframe   = document.getElementById("tele-iframe");
  const salaDiv  = document.getElementById("tele-sala-ativa");
  const btnGoogle = document.getElementById("tele-btn-abrir-google");

  if (tituloEl) tituloEl.textContent = titulo;
  if (subEl)    subEl.textContent    = sub;
  if (linkEl)   linkEl.textContent   = sala.url;

  if (iframe) {
    iframe.style.display = "none";
    iframe.src = "about:blank";
  }
  if (btnGoogle) {
    btnGoogle.style.display = "inline-flex";
    btnGoogle.setAttribute("data-url", sala.url);
  }

  if (salaDiv) salaDiv.style.display = "block";
}

/**
 * Copia o link da sala para a área de transferência.
 */
function copiarLinkTeleconsulta() {
  if (!_teleSalaAtiva) return;
  navigator.clipboard.writeText(_teleSalaAtiva.url).then(() => {
    const btn = document.getElementById("tele-btn-copiar");
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = "✅ Copiado!";
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
    _toast("🔗 Link copiado para a área de transferência!");
  }).catch(() => {
    // Fallback para navegadores sem clipboard API
    const ta = document.createElement("textarea");
    ta.value = _teleSalaAtiva.url;
    ta.style.position = "fixed";
    ta.style.opacity  = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    _toast("🔗 Link copiado!");
  });
}

function abrirGoogleMeet() {
  if (!_teleSalaAtiva || _teleSalaAtiva.provider !== 'google') {
    const tipoSelect = document.getElementById('tele-tipo-sala');
    if (tipoSelect) tipoSelect.value = 'google';
    gerarSalaTeleconsulta();
  }

  const url = _teleSalaAtiva?.url;
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Abre o WhatsApp com o link da sala pré-preenchido.
 */
function enviarLinkTeleconsultaWhatsApp() {
  if (!_teleSalaAtiva) return;
  let titulo = "Sessão";
  if (_teleSalaAtiva.agenId) {
    const a = DB_CLINICA.getMeusAgendamentos().find(x => x.id === _teleSalaAtiva.agenId);
    if (a?.pacienteNome) titulo = a.pacienteNome;
  }
  const texto = encodeURIComponent(
    `Olá! Segue o link para nossa sessão de teleconsulta:\n${_teleSalaAtiva.url}\n\nClique no link para entrar — nenhuma instalação necessária.`
  );
  window.open("https://wa.me/?text=" + texto, "_blank", "noopener,noreferrer");
}

/**
 * Encerra a sala ativa: limpa o iframe e reseta o painel.
 */
function encerrarTeleconsulta() {
  if (!confirm("Deseja encerrar a sala de teleconsulta? A videochamada será interrompida.")) return;

  const iframe  = document.getElementById("tele-iframe");
  const salaDiv = document.getElementById("tele-sala-ativa");

  if (iframe)  iframe.src  = "about:blank";
  if (salaDiv) salaDiv.style.display = "none";

  _teleSalaAtiva = null;
  _toast("⏹ Teleconsulta encerrada.");
}

/**
 * Atalho para abrir a aba Teleconsulta com um agendamento pré-selecionado.
 * Pode ser chamado a partir dos botões na linha da agenda.
 * @param {string} agenId
 */
function abrirTeleconsultaComAgendamento(agenId) {
  _trocarAbaClin("teleconsulta");
  const sel = document.getElementById("tele-sel-agendamento");
  if (sel && agenId) sel.value = agenId;
}

/**
 * Renderiza a aba de Pacientes — lista de pacientes com ações
 */
function _renderPacientes() {
  const tbl = document.getElementById("tabela-pacientes");
  const vz = document.getElementById("tabela-pacientes-vazia");
  if (!tbl || !vz) return;

  const pacientes = DB_PAC?.getTodosPacientes?.() || [];
  const tbody = tbl.querySelector("tbody");

  if (!pacientes.length) {
    tbody.innerHTML = "";
    vz.style.display = "block";
    return;
  }

  vz.style.display = "none";
  tbody.innerHTML = pacientes.map(p => `
    <tr>
      <td>${p.nome || "—"}</td>
      <td>${p.email || "—"}</td>
      <td>${p.telefone || "—"}</td>
      <td>${p.dataCadastro ? new Date(p.dataCadastro).toLocaleDateString("pt-BR") : "—"}</td>
      <td style="text-align:center;white-space:nowrap;font-size:12px">
        <button class="btn btn-sm btn-secondary" onclick="abrirModalPaciente('${p.id}')" title="Editar">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deletarPacienteUI('${p.id}')" title="Deletar">🗑️</button>
      </td>
    </tr>
  `).join("");
}

/**
 * Abre o modal de paciente (novo ou edição)
 */
function abrirModalPaciente(id = null) {
  // Placeholder: integrar com modal de paciene já existente
  console.log("Abrir paciente:", id);
}

/**
 * Deleta um paciente com confirmação
 */
function deletarPacienteUI(id) {
  if (!confirm("Tem certeza que deseja deletar este paciente?")) return;
  // Placeholder: implementar deleção
  console.log("Deletar paciente:", id);
}
