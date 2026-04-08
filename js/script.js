/* ═══════════════════════════════════════════════════════
   PsiCorrection — script.js
   Estado global da aplicação, UI de dashboard, histórico,
   modal de resultados e gerenciamento de usuários (admin).

   Dependências já carregadas:
     core/firebase.js  · core/database.js  · core/utils.js
     core/storage.js   · core/auth.js      · core/navigation.js
     modules/…         · engine/calculator.js
═══════════════════════════════════════════════════════ */

// ──────────────────────────────────────────────────────
// ESTADO GLOBAL
// ──────────────────────────────────────────────────────
let usuarioLogado    = null;  // preenchido por core/auth.js
window.__getUsuarioLogado = () => usuarioLogado;
let avaliacaoAtiva   = null;  // última avaliação calculada (NEUPSILIN adulto)
let modalAvaliacaoId = null;
const _charts        = {};   // instâncias Chart.js activas por ctx

// Sistema de notificações
const notificacoes = [];
function mostrarNotificacao(mensagem, tipo = 'info') {
  const notif = document.createElement('div');
  notif.className = `notificacao notificacao-${tipo}`;
  notif.innerHTML = `
    <span>${mensagem}</span>
    <button onclick="this.parentElement.remove()">×</button>
  `;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 5000);
}

// Gamificação: Pontos por avaliações
let pontosUsuario = parseInt(localStorage.getItem('psi_pontos') || '0');
function adicionarPontos(pontos, motivo) {
  pontosUsuario += pontos;
  localStorage.setItem('psi_pontos', pontosUsuario);
  mostrarNotificacao(`+${pontos} pontos: ${motivo}! Total: ${pontosUsuario}`, 'success');
  atualizarBadgePontos();
}
function atualizarBadgePontos() {
  const badge = document.getElementById('badge-pontos');
  if (badge) badge.textContent = pontosUsuario;
}

// Chat de suporte simples
function abrirChatSuporte() {
  const chat = document.createElement('div');
  chat.id = 'chat-suporte';
  chat.innerHTML = `
    <div class="chat-header">💬 Suporte PsiCorrection <button onclick="fecharChatSuporte()">×</button></div>
    <div class="chat-messages" id="chat-messages">
      <div class="message bot">Olá! Como posso ajudar hoje?</div>
    </div>
    <div class="chat-input">
      <input type="text" id="chat-input" placeholder="Digite sua mensagem..." onkeypress="enviarMensagem(event)">
      <button onclick="enviarMensagem()">Enviar</button>
    </div>
  `;
  document.body.appendChild(chat);
  chat.style.display = 'block';
}

function fecharChatSuporte() {
  const chat = document.getElementById('chat-suporte');
  if (chat) chat.remove();
}

function enviarMensagem(event) {
  if (event && event.key !== 'Enter') return;
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  adicionarMensagem('user', msg);
  input.value = '';
  // Simulação de resposta automática
  setTimeout(() => adicionarMensagem('bot', 'Obrigado pelo feedback! Entraremos em contato em breve.'), 1000);
}

function adicionarMensagem(tipo, texto) {
  const messages = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = `message ${tipo}`;
  msg.textContent = texto;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
}

// Exportar dados para backup (apenas admin)
function exportarDados() {
  if (!usuarioLogado || usuarioLogado.role !== "admin") {
    mostrarNotificacao('Apenas administradores podem exportar dados!', 'error');
    return;
  }

  const dados = {
    usuario: usuarioLogado,
    avaliacoes: getAvaliacoes(),
    pacientes: DB_PAC.getMeus(),
    pontos: pontosUsuario,
    exportadoEm: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-psicorrection-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  mostrarNotificacao('Dados exportados com sucesso!', 'success');
}

// Tema personalizado
function aplicarTemaPersonalizado(corPrimaria) {
  document.documentElement.style.setProperty('--primary', corPrimaria);
  localStorage.setItem('psi_tema_cor', corPrimaria);
  mostrarNotificacao('Tema personalizado aplicado!', 'success');
}

// Lembretes de sessões
let lembretes = JSON.parse(localStorage.getItem('psi_lembretes') || '[]');

function adicionarLembrete(descricao, dataHora) {
  lembretes.push({ id: Date.now(), descricao, dataHora: new Date(dataHora).toISOString() });
  localStorage.setItem('psi_lembretes', JSON.stringify(lembretes));
  verificarLembretes();
  mostrarNotificacao('Lembrete agendado!', 'success');
}

function verificarLembretes() {
  const agora = new Date();
  lembretes.forEach(l => {
    const d = new Date(l.dataHora);
    if (d > agora && d - agora < 60000) { // 1 minuto antes
      mostrarNotificacao(`Lembrete: ${l.descricao}`, 'warning');
      // Remover após notificar
      lembretes = lembretes.filter(ll => ll.id !== l.id);
      localStorage.setItem('psi_lembretes', JSON.stringify(lembretes));
    }
  });
}

// Verificar lembretes a cada minuto
setInterval(verificarLembretes, 60000);

function abrirModalLembrete() {
  document.getElementById('lembrete-descricao').value = '';
  document.getElementById('lembrete-datahora').value = '';
  document.getElementById('modal-lembrete-overlay').classList.remove('hidden');
}

function fecharModalLembrete() {
  document.getElementById('modal-lembrete-overlay').classList.add('hidden');
}

function salvarLembrete() {
  const desc = document.getElementById('lembrete-descricao').value.trim();
  const dataHora = document.getElementById('lembrete-datahora').value;
  if (!desc || !dataHora) {
    mostrarNotificacao('Preencha todos os campos!', 'error');
    return;
  }
  adicionarLembrete(desc, dataHora);
  fecharModalLembrete();
}

// Relatório automático em PDF
async function gerarRelatorioPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.text('Relatório PsiCorrection', 20, 30);

  doc.setFontSize(12);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 20, 50);
  doc.text(`Usuário: ${usuarioLogado?.nome || 'N/A'}`, 20, 60);

  const lista = getAvaliacoes();
  doc.text(`Total de Avaliações: ${lista.length}`, 20, 80);

  // Adicionar tabela simples
  let y = 100;
  lista.slice(-10).forEach((a, i) => {
    doc.text(`${i+1}. ${a.pacienteNome} - ${a.instrumento} (${formatarData(a.data)})`, 20, y);
    y += 10;
  });

  doc.save(`relatorio-psicorrection-${new Date().toISOString().slice(0,10)}.pdf`);
  mostrarNotificacao('Relatório PDF gerado!', 'success');
}

// ──────────────────────────────────────────────────────
// INICIALIZAÇÃO
// ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // Aplica tema salvo antes de qualquer render
  const _temaS = localStorage.getItem("psi_tema") || "light";
  document.documentElement.setAttribute("data-theme", _temaS);
  const _btnTema = document.getElementById("btn-tema");
  if (_btnTema) _btnTema.textContent = _temaS === "dark" ? "☀️" : "🌙";

  // Carrega tema personalizado
  const _temaCor = localStorage.getItem("psi_tema_cor");
  if (_temaCor) document.documentElement.style.setProperty('--primary', _temaCor);

  atualizarBadgePontos(); // Atualiza pontos na inicialização

  // Auth anônima garante que as regras do Firestore sejam cumpridas
  await firebase.auth().signInAnonymously().catch(console.error);

  // Inicializa banco (cria admin padrão se Firestore ainda estiver vazio)
  await inicializarDB();

  // Tenta restaurar sessão
  const sessao = sessionStorage.getItem("neupsilin_user");
  if (sessao) {
    try {
      usuarioLogado = JSON.parse(sessao);
      usuarioLogado.role = normalizarRole(usuarioLogado.role || "profissional");
      const _srole = usuarioLogado.role;
      await DB.carregarTodos(_srole === "admin", usuarioLogado.email);
      if (["admin", "profissional", "psicologo"].includes(_srole)) {
        await DB_PAC.carregarCache(usuarioLogado.email, _srole === "admin");
        await carregarAvaliacoes(usuarioLogado.email, _srole === "admin");
      } else if (_srole === "colaborador") {
        await DB_PAC.carregarCache(usuarioLogado.email, false, usuarioLogado.clinicaId);
      }
      await carregarNormas(usuarioLogado.email, _srole);  // registra sessão + busca tabelas
      DB.verificarExpiracoes();
      abrirDashboard();
      exibirAvisoObrigatorio();
    } catch (_) {
      sessionStorage.removeItem("neupsilin_user");
      usuarioLogado = null;
    }
  }

  // Listener Enter no login
  document.getElementById("login-crp").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("login-senha").focus();
  });
  document.getElementById("login-senha").addEventListener("keydown", e => {
    if (e.key === "Enter") fazerLogin();
  });

  // Abas dos subtestes NEUPSILIN
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => {
        c.classList.remove("active"); c.classList.add("hidden");
      });
      btn.classList.add("active");
      const cont = document.getElementById("tab-" + tabId);
      cont.classList.remove("hidden"); cont.classList.add("active");
    });
  });

  // Subtotais em tempo real
  document.querySelectorAll(".score-input").forEach(inp =>
    inp.addEventListener("input", atualizarSubtotal));

  // Mostra/oculta campos de adolescente conforme data de nascimento
  const nascInput = document.getElementById("pac-nasc");
  const grpEsc = document.getElementById("pac-esc")?.closest(".form-group");
  const grpTipoEscola = document.getElementById("grp-tipo-escola");
  const grpSerie = document.getElementById("grp-serie");
  if (nascInput && grpTipoEscola && grpSerie) {
    nascInput.addEventListener("change", () => {
      const nasc = nascInput.value;
      if (!nasc) return;
      const idade = calcularIdade(nasc);
      const isAdol = idade >= 12 && idade <= 18;
      grpTipoEscola.style.display = isAdol ? "" : "none";
      grpSerie.style.display = isAdol ? "" : "none";
      if (grpEsc) grpEsc.style.display = isAdol ? "none" : "";
      // Limpa seleção ao trocar
      if (!isAdol) {
        document.getElementById("pac-tipo-escola").value = "";
        document.getElementById("pac-serie").value = "";
      } else {
        document.getElementById("pac-esc").value = "";
      }
    });
  }

  // Abas WISC
  document.querySelectorAll(".wisc-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.wiscTab;
      document.querySelectorAll(".wisc-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".wisc-tab-content").forEach(c => {
        c.classList.remove("active"); c.classList.add("hidden");
      });
      btn.classList.add("active");
      const cont = document.getElementById("wisc-tab-" + tabId);
      if (cont) { cont.classList.remove("hidden"); cont.classList.add("active"); }
    });
  });

  // Subtotais e EI estimado WISC em tempo real
  document.querySelectorAll(".wisc-score").forEach(inp =>
    inp.addEventListener("input", atualizarSubtotalWISC));
});

// ──────────────────────────────────────────────────────
// Ferramentas dropdown
// ──────────────────────────────────────────────────────
function toggleFerramentasMenu() {
  const menu = document.getElementById('ferramentas-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

document.addEventListener('click', (event) => {
  const menu = document.getElementById('ferramentas-menu');
  if (!menu) return;
  const opened = menu.style.display === 'block';
  if (!opened) return;

  const target = event.target;
  if (target.closest('#btn-ferramentas') || target.closest('#ferramentas-menu')) return;
  menu.style.display = 'none';
});

// ──────────────────────────────────────────────────────
// RENDER: Stats e tabelas
// ──────────────────────────────────────────────────────
function atualizarStats() {
  const lista = getAvaliacoes();
  const agora = new Date();
  const mes   = lista.filter(a => {
    const d = new Date(a.data);
    return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
  });
  const pacientes = DB_PAC.getMeus();
  const statTotal = document.getElementById("stat-total");
  if (statTotal) statTotal.textContent = lista.length;
  document.getElementById("stat-pacientes").textContent = pacientes.length;
  document.getElementById("stat-mes").textContent       = mes.length;

  // Atualizar gráficos
  atualizarGraficosDashboard();
}

function atualizarGraficosDashboard() {
  const lista = getAvaliacoes();

  // Gráfico de avaliações por mês
  const meses = {};
  lista.forEach(a => {
    const d = new Date(a.data);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    meses[key] = (meses[key] || 0) + 1;
  });
  const labelsMes = Object.keys(meses).sort();
  const dataMes = labelsMes.map(m => meses[m]);

  if (_charts['avaliacoes-mes']) _charts['avaliacoes-mes'].destroy();
  const ctxMes = document.getElementById('chart-avaliacoes-mes');
  if (ctxMes) {
    _charts['avaliacoes-mes'] = new Chart(ctxMes, {
      type: 'line',
      data: {
        labels: labelsMes,
        datasets: [{
          label: 'Avaliações',
          data: dataMes,
          borderColor: 'var(--primary)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // Gráfico de distribuição por teste
  const tipos = {};
  lista.forEach(a => {
    const tipo = a.instrumento || 'Outro';
    tipos[tipo] = (tipos[tipo] || 0) + 1;
  });
  const labelsTipo = Object.keys(tipos);
  const dataTipo = labelsTipo.map(t => tipos[t]);

  if (_charts['tipos-teste']) _charts['tipos-teste'].destroy();
  const ctxTipo = document.getElementById('chart-tipos-teste');
  if (ctxTipo) {
    _charts['tipos-teste'] = new Chart(ctxTipo, {
      type: 'doughnut',
      data: {
        labels: labelsTipo,
        datasets: [{
          data: dataTipo,
          backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }
}

function renderizarTabelaRecentes() {
  const lista   = getAvaliacoes().slice(-5).reverse();
  const tbody   = document.getElementById("tbody-recentes");
  const isAdmin = usuarioLogado?.role === "admin";

  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Nenhuma avaliação registrada.</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(a => {
    const isBFP  = a.tipoTeste === "BFP";
    const teste  = a.tipoTeste || "NEUPSILIN";
    const bgColor = isBFP ? "rgb(99,102,241)"
      : teste === "WISC-IV"       ? "var(--accent)"
      : teste === "NEUPSILIN-INF" ? "var(--success)" : "var(--primary)";
    const testeLabel = isBFP ? "BFP"
      : teste === "NEUPSILIN-ADULTO" ? "NEUPSILIN" : teste;
    const classeGeral = isBFP
      ? (() => { const ts = a.fatorScores?.N?.tscore ?? 50; return { badge: ts >= 60 ? "badge-inferior" : ts >= 45 ? "badge-medio" : "badge-superior", label: `N: T${ts}` }; })()
      : a.tipoTeste === "WISC-IV"
        ? (a.indices?.fsiq?.classe || { badge: "badge-medio", label: "—" })
        : (a.classeGeral || { badge: "badge-medio", label: "—" });

    return `
    <tr>
      <td>${formatarData(a.data)}</td>
      <td>${a.paciente.nome}
        <span class="badge" style="font-size:10px;padding:2px 6px;margin-left:4px;background:${bgColor};color:#fff">${testeLabel}</span>
        ${isAdmin ? `<span style="font-size:11px;color:var(--text-muted)"> / ${a.profissional?.nome || a.profissional?.email || ""}</span>` : ""}
      </td>
      <td><span class="badge ${classeGeral.badge}">${classeGeral.label}</span></td>
      <td><button class="btn btn-sm btn-primary" onclick="abrirModal(${a.id})">Ver</button></td>
    </tr>`;
  }).join("");
}

function renderizarHistorico(filtro = "") {
  const lista   = getAvaliacoes().reverse();
  const tbody   = document.getElementById("tbody-historico");
  const isAdmin = usuarioLogado?.role === "admin";

  // Cabeçalho dinâmico
  const thead = document.querySelector("#tabela-historico thead tr");
  if (thead) {
    thead.innerHTML = `
      <th>Data</th>
      ${isAdmin ? "<th>Profissional</th>" : ""}
      <th>Teste</th><th>Paciente</th><th>Idade</th>
      <th>Escore / QI</th><th>Classificação</th><th>Ações</th>`;
  }

  const vis  = filtro ? lista.filter(a => a.paciente.nome.toLowerCase().includes(filtro.toLowerCase())) : lista;
  const cols = isAdmin ? 8 : 7;

  if (!vis.length) {
    tbody.innerHTML = `<tr><td colspan="${cols}" class="empty-row">Nenhuma avaliação encontrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = vis.map(a => {
    const isWISC = a.tipoTeste === "WISC-IV";
    const isINF  = a.tipoTeste === "NEUPSILIN-INF";
    const isBFP  = a.tipoTeste === "BFP";
    const testeBadge = isBFP
      ? `<span class="badge" style="background:rgb(99,102,241);color:#fff">BFP</span>`
      : isWISC
        ? `<span class="badge" style="background:var(--accent);color:#fff">WISC-IV</span>`
        : isINF
          ? `<span class="badge" style="background:var(--success);color:#fff">NEUPSILIN-INF</span>`
          : `<span class="badge" style="background:var(--primary);color:#fff">NEUPSILIN</span>`;
    const classeGeral = isBFP
      ? (() => { const ts = a.fatorScores?.N?.tscore ?? 50; return { badge: ts >= 60 ? "badge-inferior" : ts >= 45 ? "badge-medio" : "badge-superior", label: `N: T${ts}` }; })()
      : isWISC
        ? (a.indices?.fsiq?.classe || { badge: "badge-medio", label: "—" })
        : (a.classeGeral || { badge: "badge-medio", label: "—" });
    const scoreCol = isBFP ? `T-N: ${a.fatorScores?.N?.tscore ?? "—"}`
      : isWISC  ? `QI: ${a.indices?.fsiq?.score ?? "—"}`
      : `${a.totalBruto}/${a.maxTotal}`;

    return `
    <tr>
      <td>${formatarData(a.data)}</td>
      ${isAdmin ? `<td><span style="font-size:12px;color:var(--text-muted)">${a.profissional?.nome || a.profissional?.email || "—"}</span></td>` : ""}
      <td>${testeBadge}</td>
      <td>${a.paciente.nome}</td>
      <td>${a.paciente.idade} anos</td>
      <td>${scoreCol}</td>
      <td><span class="badge ${classeGeral.badge}">${classeGeral.label}</span></td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-sm btn-primary" onclick="abrirModal(${a.id})">Ver</button>
        <button class="btn btn-sm btn-danger"  onclick="confirmarExcluir(${a.id})">🗑</button>
      </td>
    </tr>`;
  }).join("");
}

function filtrarHistorico() {
  renderizarHistorico(document.getElementById("busca-historico").value);
}

// ──────────────────────────────────────────────────────
// MODAL DE RESULTADO
// ──────────────────────────────────────────────────────
function abrirModal(id) {
  const idNum = Number(id);
  const av    = getAvaliacoes().find(a => Number(a.id) === idNum);
  if (!av) return;

  modalAvaliacaoId = id;
  document.getElementById("modal-body").innerHTML = engine.buildHTML(av, "modal");
  document.getElementById("modal-pdf-btn").onclick = () => engine.exportarPDF(av);
  document.getElementById("modal-del-btn").onclick = () => confirmarExcluir(id);
  document.getElementById("modal-overlay").classList.remove("hidden");
  requestAnimationFrame(() => engine.renderGraphs(av, "modal"));
}

function fecharModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  modalAvaliacaoId = null;
}

function confirmarExcluir(id) {
  if (!confirm("Deseja excluir esta avaliação? Esta ação não pode ser desfeita.")) return;
  excluirAvaliacao(id);
  fecharModal();
  atualizarStats();
  renderizarTabelaRecentes();
  renderizarHistorico(document.getElementById("busca-historico")?.value || "");
}

// ──────────────────────────────────────────────────────
// GERENCIAMENTO DE USUÁRIOS (admin only)
// ──────────────────────────────────────────────────────
let _editandoEmail = null; // null = criando | string = editando
let _ativandoEmail = null; // email sendo ativado

/**
 * Mostra/oculta o campo de clínica vinculada conforme o role selecionado.
 * Também popula o select com todos os psicólogos cadastrados.
 */
function toggleClinicaField() {
  const role  = document.getElementById("usr-role").value;
  const group = document.getElementById("usr-clinica-group");
  if (!group) return;
  const mostrar = ["colaborador", "cliente"].includes(role);
  group.style.display = mostrar ? "" : "none";
  if (mostrar) { _popularSelectClinica(); _atualizarNomeClinicaDisplay(); }
  else {
    const nd = document.getElementById("usr-clinica-nome-display");
    if (nd) nd.style.display = "none";
  }
}

function _popularSelectClinica() {
  const sel = document.getElementById("usr-clinica-id");
  if (!sel) return;
  const valorAtual = sel.value;
  const psis = DB.getAll().filter(u =>
    ["profissional", "psicologo"].includes(u.role) && !u.bloqueado
  );
  sel.innerHTML =
    '<option value="">— Selecione o Psicólogo responsável —</option>' +
    psis.map(u => {
      const cn = u.clinicaNome ? ` · ${u.clinicaNome}` : "";
      return `<option value="${u.email}">${u.nome}${cn} &lt;${u.email}&gt;</option>`;
    }).join("");
  if (valorAtual) sel.value = valorAtual;
}

/** Atualiza o badge de nome da clínica no modal de usuário (admin). */
function _atualizarNomeClinicaDisplay() {
  const sel      = document.getElementById("usr-clinica-id");
  const nomeDpy  = document.getElementById("usr-clinica-nome-display");
  const nomeText = document.getElementById("usr-clinica-nome-text");
  if (!sel || !nomeDpy || !nomeText) return;
  const psiEmail = sel.value;
  if (!psiEmail) { nomeDpy.style.display = "none"; return; }
  const psi  = DB.findByEmail(psiEmail);
  const nome = psi?.clinicaNome || "";
  nomeText.textContent  = nome || "(nome da clínica ainda não definido)";
  nomeText.style.color  = nome ? "var(--text)" : "var(--text-muted)";
  nomeText.style.fontStyle = nome ? "normal" : "italic";
  nomeDpy.style.display = "";
}

function abrirModalUsuario(emailEditar = null) {
  _editandoEmail = emailEditar;
  const errEl  = document.getElementById("usr-error");
  const okEl   = document.getElementById("usr-success");
  errEl.classList.add("hidden");
  okEl.classList.add("hidden");

  const titulo    = document.getElementById("modal-usr-titulo");
  const btnSalvar = document.getElementById("usr-salvar-btn");
  const senhaHint  = document.getElementById("usr-senha-hint");
  const senhaLabel = document.getElementById("usr-senha-label");
  const planoGroup = document.getElementById("usr-plano-group");

  // Psicólogo: restringe roles disponíveis no select
  const _isPsi = ["profissional", "psicologo"].includes(usuarioLogado?.role);
  const roleSelEl = document.getElementById("usr-role");
  if (roleSelEl) {
    if (_isPsi) {
      roleSelEl.innerHTML =
        '<option value="colaborador">Colaborador</option>' +
        '<option value="cliente">Cliente</option>';
    } else {
      roleSelEl.innerHTML =
        '<option value="profissional">Psicólogo</option>' +
        '<option value="colaborador">Colaborador</option>' +
        '<option value="cliente">Cliente</option>';
    }
  }
  // Psicólogo: oculta campos que não fazem sentido para Colab/Cliente
  const crpGroup    = document.getElementById("usr-crp")?.closest(".form-group");
  if (crpGroup) crpGroup.style.display = _isPsi ? "none" : "";
  const ocultarGroup = document.getElementById("usr-ocultar-aplicacao")?.closest("div[style*='border-top']");
  if (ocultarGroup) ocultarGroup.style.display = _isPsi ? "none" : "";

  if (emailEditar) {
    // Psicólogo não pode editar usuários de outras clínicas
    const u = DB.findByEmail(emailEditar);
    if (_isPsi && u?.clinicaId !== usuarioLogado.email) {
      alert("Acesso negado: este usuário não pertence à sua clínica.");
      return;
    }
    titulo.textContent          = "Editar Usuário";
    btnSalvar.textContent       = "Salvar Alterações";
    document.getElementById("usr-nome").value   = u.nome;
    document.getElementById("usr-email").value  = u.email;
    document.getElementById("usr-email").disabled = true;
    document.getElementById("usr-senha").value  = "";
    document.getElementById("usr-crp").value    = u.crp || "";
    document.getElementById("usr-cpf").value    = u.cpf || "";
    document.getElementById("usr-role").value   = u.role || "profissional";
    const clinicaSel = document.getElementById("usr-clinica-id");
    if (clinicaSel) clinicaSel.value = u.clinicaId || "";
    toggleClinicaField();
    const ocultarChk = document.getElementById("usr-ocultar-aplicacao");
    if (ocultarChk) ocultarChk.checked = !!(u.ocultarAplicacao);
    senhaLabel.textContent = "Nova Senha";
    senhaHint.classList.remove("hidden");
    if (planoGroup) planoGroup.style.display = "none";
  } else {
    titulo.textContent          = "Novo Usuário";
    btnSalvar.textContent       = "Criar Usuário";
    document.getElementById("usr-nome").value   = "";
    document.getElementById("usr-email").value  = "";
    document.getElementById("usr-email").disabled = false;
    document.getElementById("usr-senha").value  = "";
    document.getElementById("usr-crp").value    = "";
    document.getElementById("usr-cpf").value    = "";
    document.getElementById("usr-role").value   = _isPsi ? "colaborador" : "profissional";
    if (document.getElementById("usr-plano")) document.getElementById("usr-plano").value  = "1mes";
    const clinicaSel = document.getElementById("usr-clinica-id");
    if (clinicaSel) {
      // Psicólogo: pré-seleciona a própria clínica
      clinicaSel.value = _isPsi ? usuarioLogado.email : "";
    }
    toggleClinicaField();
    // Para psicólogo, forc_a o clinicaId para si mesmo no display
    if (_isPsi) _atualizarNomeClinicaDisplay();
    const ocultarChk = document.getElementById("usr-ocultar-aplicacao");
    if (ocultarChk) ocultarChk.checked = false;
    senhaLabel.textContent = "Senha *";
    senhaHint.classList.add("hidden");
    if (planoGroup) planoGroup.style.display = _isPsi ? "none" : "";
  }
  document.getElementById("modal-usuario-overlay").classList.remove("hidden");
}

function fecharModalUsuario() {
  document.getElementById("modal-usuario-overlay").classList.add("hidden");
  document.getElementById("usr-email").disabled = false;
  _editandoEmail = null;
}

/** Alterna entre tema claro e escuro, persistindo a preferência. */
function toggleTema() {
  const html     = document.documentElement;
  const temAtual = html.getAttribute("data-theme") || "light";
  const novoTema = temAtual === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", novoTema);
  localStorage.setItem("psi_tema", novoTema);
  const btn = document.getElementById("btn-tema");
  if (btn) btn.textContent = novoTema === "dark" ? "☀️" : "🌙";
}

async function executarImportNormas() {
  const btn    = document.getElementById("btn-import-normas");
  const status = document.getElementById("import-normas-status");
  const selInst = document.getElementById("import-normas-instrumento");
  const txtJson = document.getElementById("import-normas-json");
  if (!btn || !status || !selInst || !txtJson) return;

  const instrumento = selInst.value;
  const jsonRaw     = txtJson.value.trim();

  if (!jsonRaw) {
    status.style.display = "block";
    status.style.color = "var(--danger)";
    status.textContent = "\u274C Cole o JSON das tabelas antes de gravar.";
    return;
  }

  let tabelas;
  try {
    tabelas = JSON.parse(jsonRaw);
  } catch (e) {
    status.style.display = "block";
    status.style.color = "var(--danger)";
    status.textContent = "\u274C JSON inválido: " + e.message;
    return;
  }

  btn.disabled = true;
  btn.textContent = "Gravando...";
  status.style.display = "block";
  status.style.color = "var(--text-muted)";
  status.textContent = "\u23F3 Gravando tabelas de " + instrumento + " no Firestore...";

  try {
    await importarNormasFirestore(instrumento, tabelas);
    status.style.color = "var(--success)";
    status.textContent = "\u2705 Normas de " + instrumento.toUpperCase() + " gravadas com sucesso! (" + Object.keys(tabelas).length + " entradas)";
    btn.textContent = "\u2705 Concluído";
    txtJson.value = "";
    setTimeout(() => { btn.disabled = false; btn.textContent = "\uD83D\uDCBE Gravar no Firestore"; }, 3000);
  } catch (e) {
    status.style.color = "var(--danger)";
    status.textContent = "\u274C Erro: " + e.message;
    btn.disabled = false;
    btn.textContent = "\uD83D\uDCBE Gravar no Firestore";
  }
}

async function salvarUsuario() {
  const nome       = document.getElementById("usr-nome").value.trim();
  const email      = document.getElementById("usr-email").value.trim();
  const senha      = document.getElementById("usr-senha").value;
  const crp        = document.getElementById("usr-crp").value.trim();
  const cpf        = document.getElementById("usr-cpf").value.trim();
  const role       = document.getElementById("usr-role").value;
  const plano      = document.getElementById("usr-plano")?.value || "vitalicio";
  const _isPsi     = ["profissional", "psicologo"].includes(usuarioLogado?.role);
  // Psicólogo: clinicaId é sempre o próprio email; admin usa o campo do modal
  const clinicaId  = _isPsi
    ? usuarioLogado.email
    : (document.getElementById("usr-clinica-id")?.value.trim() || "");
  const ocultarAplicacao = document.getElementById("usr-ocultar-aplicacao")?.checked || false;

  const errEl = document.getElementById("usr-error");
  const okEl  = document.getElementById("usr-success");
  errEl.classList.add("hidden");
  okEl.classList.add("hidden");

  // Psicólogo só pode criar/editar Colaborador ou Cliente
  if (_isPsi && !["colaborador", "cliente"].includes(role)) {
    errEl.textContent = "Você só pode criar usuários do tipo Colaborador ou Cliente.";
    errEl.classList.remove("hidden");
    return;
  }

  // CPF obrigatório para todos os perfis (usado no login)
  if (!cpf) {
    errEl.textContent = "O CPF é obrigatório — o usuário precisará dele para fazer login.";
    errEl.classList.remove("hidden");
    return;
  }
  const _cpfCheck = validarFormatoCPF(cpf);
  if (!_cpfCheck.ok) {
    errEl.textContent = _cpfCheck.mensagem;
    errEl.classList.remove("hidden");
    return;
  }

  if (["colaborador", "cliente"].includes(role) && !clinicaId) {
    errEl.textContent = "Selecione a clínica (psicólogo responsável) para este perfil.";
    errEl.classList.remove("hidden");
    return;
  }

  try {
    if (_editandoEmail) {
      // Psicólogo: garantia extra de que o usuário editado é da sua clínica
      if (_isPsi) {
        const _uTgt = DB.findByEmail(_editandoEmail);
        if (!_uTgt || _uTgt.clinicaId !== usuarioLogado.email) {
          errEl.textContent = "Acesso negado: usuário não pertence à sua clínica.";
          errEl.classList.remove("hidden"); return;
        }
      }
      await DB.updateAdmin(_editandoEmail, { nome: nome || undefined, crp, cpf, role, ocultarAplicacao, novaSenha: senha || undefined, clinicaId });
      okEl.textContent = "Usuário atualizado com sucesso!";
    } else {
      const _clinicaNomeAuto = _isPsi ? (usuarioLogado.clinicaNome || "") : "";
      await DB.create({ email, senha, nome, crp, cpf, role, plano, ocultarAplicacao, clinicaId, clinicaNome: _clinicaNomeAuto });
      okEl.textContent = `Usuário "${nome}" criado com sucesso!`;
    }
    okEl.classList.remove("hidden");
    setTimeout(() => fecharModalUsuario(), 1200);
    _pintarUsuarios();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove("hidden");
  }
}

function excluirUsuarioAdmin(email) {
  if (email === usuarioLogado.email) { alert("Você não pode excluir sua própria conta."); return; }
  // Psicólogo só pode excluir usuários da sua clínica
  if (["profissional", "psicologo"].includes(usuarioLogado?.role)) {
    const _u = DB.findByEmail(email);
    if (!_u || _u.clinicaId !== usuarioLogado.email) { alert("Acesso negado."); return; }
  }
  if (!confirm(`Deseja excluir o usuário "${email}"? Esta ação não pode ser desfeita.`)) return;
  DB.delete(email);
  _pintarUsuarios();
}

function bloquearUsuario(email) {
  if (email === usuarioLogado.email) { alert("Você não pode bloquear sua própria conta."); return; }
  // Psicólogo só pode bloquear usuários da sua clínica
  if (["profissional", "psicologo"].includes(usuarioLogado?.role)) {
    const _u = DB.findByEmail(email);
    if (!_u || _u.clinicaId !== usuarioLogado.email) { alert("Acesso negado."); return; }
  }
  if (!confirm(`Bloquear o acesso de "${email}"?`)) return;
  DB.bloquear(email);
  _pintarUsuarios();
}

function abrirModalAtivacao(email) {
  _ativandoEmail = email;
  const u = DB.findByEmail(email);
  document.getElementById("modal-ativacao-desc").textContent = `Ativar acesso para ${u.nome} (${email})`;
  document.getElementById("ativacao-plano").value = "1mes";
  document.getElementById("modal-ativacao-overlay").classList.remove("hidden");
}

function fecharModalAtivacao() {
  document.getElementById("modal-ativacao-overlay").classList.add("hidden");
  _ativandoEmail = null;
}

function confirmarAtivacao() {
  if (!_ativandoEmail) return;
  DB.ativar(_ativandoEmail, document.getElementById("ativacao-plano").value);
  fecharModalAtivacao();
  _pintarUsuarios();
}

/** Renderiza o DOM da lista de usuários a partir do cache. */
function _pintarUsuarios() {
  DB.verificarExpiracoes();
  const busca      = (document.getElementById("usr-busca")?.value || "").toLowerCase().trim();
  const todos      = DB.getAll();
  const isAdmin    = usuarioLogado?.role === "admin";
  const roMap      = { admin: "Administrador", profissional: "Psicólogo", psicologo: "Psicólogo", colaborador: "Colaborador", cliente: "Cliente" };
  const bMap       = { admin: "badge-admin", profissional: "badge-prof", psicologo: "badge-prof", colaborador: "badge-colab", cliente: "badge-client" };
  const planoLabel = { "1mes": "1 Mês", "3meses": "3 Meses", "vitalicio": "Vitalício", "1avaliacao": "1 Avaliação" };

  const filtrados  = busca ? todos.filter(u => u.nome.toLowerCase().includes(busca) || u.email.toLowerCase().includes(busca)) : todos;
  const ativos     = filtrados.filter(u => !u.bloqueado);
  const bloqueados = filtrados.filter(u =>  u.bloqueado);

  const cA = document.getElementById("count-ativos");
  const cB = document.getElementById("count-bloqueados");
  if (cA) cA.textContent = ativos.length;
  if (cB) cB.textContent = bloqueados.length;

  // ── Função auxiliar: linha de usuário ──────────────
  const rowUser = u => {
    const expiraStr = u.expiracao
      ? (() => {
          const d    = new Date(u.expiracao);
          const diff = Math.ceil((d - new Date()) / 86400000);
          const cor  = diff <= 7 ? "color:var(--danger);font-weight:600" : diff <= 30 ? "color:var(--warning)" : "";
          return `<span style="${cor}">${d.toLocaleDateString("pt-BR")} (${diff}d)</span>`;
        })()
      : '<span style="color:var(--success)">Vitalício</span>';
    const crpCol = ["colaborador", "cliente"].includes(u.role)
      ? (() => {
          if (!u.clinicaId) return '<small style="color:var(--danger);font-weight:600">⚠️ sem clínica</small>';
          const _psi = DB.findByEmail(u.clinicaId);
          const _cn  = _psi?.clinicaNome || "";
          return _cn
            ? `<div style="line-height:1.5"><strong style="font-size:13px">${_cn}</strong><br><small style="color:var(--text-muted)">🏥 ${u.clinicaId}</small></div>`
            : `<small style="color:var(--text-muted)">🏥 ${u.clinicaId}</small>`;
        })()
      : (u.crp || "—");
    return `<tr>
      <td><strong>${u.nome}</strong></td>
      <td>${u.email}</td>
      <td>${crpCol}</td>
      <td><span class="badge ${bMap[u.role] || ''}">${roMap[u.role] || u.role}</span></td>
      <td><span class="badge" style="background:var(--primary-light,#e8f0fe);color:var(--primary)">${planoLabel[u.plano] || u.plano || "—"}</span></td>
      <td>${expiraStr}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm btn-secondary" onclick="abrirModalUsuario('${u.email}')">✏️ Editar</button>
        ${u.email !== usuarioLogado.email
          ? `<button class="btn btn-sm btn-danger" onclick="bloquearUsuario('${u.email}')">🚫 Bloquear</button>
             <button class="btn btn-sm btn-danger" onclick="excluirUsuarioAdmin('${u.email}')">🗑 Excluir</button>`
          : `<span style="font-size:11px;color:var(--text-muted);padding:5px 4px">Conta atual</span>`}
      </td>
    </tr>`;
  };

  const tbAtivos = document.getElementById("tbody-usuarios-ativos");
  if (tbAtivos) {
    if (!ativos.length) {
      tbAtivos.innerHTML = '<tr><td colspan="7" class="empty-row">Nenhum usuário ativo.</td></tr>';
    } else if (isAdmin) {
      // ── Admin: agrupa usuários por clínica ──────────
      const groupHeader = (icon, titulo, count) =>
        `<tr style="background:var(--bg-input,#f1f5f9);border-top:2px solid var(--border)">
          <td colspan="7" style="padding:8px 14px;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);border-bottom:1px solid var(--border)">
            ${icon} ${titulo}
            <span style="font-weight:400;font-size:11px;margin-left:6px">${count} usuário${count !== 1 ? "s" : ""}</span>
          </td>
        </tr>`;

      const admins     = ativos.filter(u => u.role === "admin");
      const psis       = ativos.filter(u => ["profissional", "psicologo"].includes(u.role));
      const members    = ativos.filter(u => ["colaborador", "cliente"].includes(u.role));
      const outros     = ativos.filter(u => !["admin","profissional","psicologo","colaborador","cliente"].includes(u.role));

      let html = "";

      // 1. Uma seção por psicólogo/clínica
      psis.forEach(psi => {
        const mems     = members.filter(m => m.clinicaId === psi.email);
        const nomeClin = psi.clinicaNome ? `${psi.clinicaNome} — ${psi.nome}` : psi.nome;
        html += groupHeader("🏥", nomeClin, 1 + mems.length);
        html += rowUser(psi);
        mems.forEach(m => { html += rowUser(m); });
      });

      // 2. Membros cujo psicólogo não está no cache (clínica inativa)
      const memsSoltos = members.filter(m => !psis.find(p => p.email === m.clinicaId));
      if (memsSoltos.length) {
        html += groupHeader("⚠️", "Sem Psicólogo Vinculado", memsSoltos.length);
        memsSoltos.forEach(m => { html += rowUser(m); });
      }

      // 3. Administradores
      if (admins.length) {
        html += groupHeader("👑", "Administradores", admins.length);
        admins.forEach(a => { html += rowUser(a); });
      }

      // 4. Perfis desconhecidos
      if (outros.length) {
        html += groupHeader("❓", "Outros", outros.length);
        outros.forEach(u => { html += rowUser(u); });
      }

      tbAtivos.innerHTML = html || '<tr><td colspan="7" class="empty-row">Nenhum usuário ativo.</td></tr>';
    } else {
      // ── Psicólogo: lista plana (só sua clínica) ─────
      tbAtivos.innerHTML = ativos.map(rowUser).join("");
    }
  }

  const tbBloq = document.getElementById("tbody-usuarios-bloqueados");
  if (tbBloq) {
    if (!bloqueados.length) {
      tbBloq.innerHTML = '<tr><td colspan="6" class="empty-row">Nenhum usuário bloqueado.</td></tr>';
    } else {
      tbBloq.innerHTML = bloqueados.map(u => `
    <tr>
      <td><strong>${u.nome}</strong></td>
      <td>${u.email}</td>
      <td>${u.crp || "—"}</td>
      <td><span class="badge ${bMap[u.role] || ''}">${roMap[u.role] || u.role}</span></td>
      <td>${u.bloqueadoEm ? formatarData(u.bloqueadoEm) : "—"}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm btn-primary"   onclick="abrirModalAtivacao('${u.email}')">✅ Ativar</button>
        <button class="btn btn-sm btn-secondary" onclick="abrirModalUsuario('${u.email}')">✏️ Editar</button>
        <button class="btn btn-sm btn-danger"    onclick="excluirUsuarioAdmin('${u.email}')">🗑 Excluir</button>
      </td>
    </tr>`).join("");
    }
  }
}

/**
 * Busca usuários frescos do Firestore e então renderiza.
 * Chamado na navegação. Operações de mutação (criar/bloquear/excluir)
 * já atualizam o cache e chamam _pintarUsuarios() diretamente.
 */
async function renderizarUsuarios() {
  const role = usuarioLogado?.role;
  const isPsi = ["profissional", "psicologo"].includes(role);

  // Psicólogo: exibe apenas usuários da sua clínica; oculta seções que não fazem sentido para ele
  const secImport  = document.querySelector("#sec-usuarios > .card:first-child"); // importar normas
  if (secImport) secImport.style.display = isPsi ? "none" : "";

  const tbA = document.getElementById("tbody-usuarios-ativos");
  if (tbA) tbA.innerHTML = '<tr><td colspan="7" class="empty-row">Carregando…</td></tr>';
  try {
    // Admin: carrega tudo; Psicólogo: carrega apenas os da sua clínica
    if (isPsi) {
      await DB.carregarPorClinica(usuarioLogado.email);
    } else {
      await DB.carregarTodos(true, usuarioLogado.email);
    }
  } catch (e) {
    console.error("[usuarios] erro ao carregar:", e);
    if (tbA) tbA.innerHTML = '<tr><td colspan="7" class="empty-row" style="color:var(--danger)">Erro ao carregar usuários. Verifique a conexão.</td></tr>';
    return;
  }
  _pintarUsuarios();
}
