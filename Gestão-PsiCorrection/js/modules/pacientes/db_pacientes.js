/* ═══════════════════════════════════════════════════════
   PACIENTES — Banco de Dados e Ficha Cadastral
   Armazenamento: Firebase Firestore ("pacientes")
   Cache em memória populado após o login.
═══════════════════════════════════════════════════════ */

/** Gera uma senha temporária aleatória de 10 caracteres. */
function _gerarSenhaTemp() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!";
  return Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map(b => chars[b % chars.length]).join("");
}

const DB_PAC = {
  _cache: [], // populado por carregarCache() após o login

  // ── Carga do Firestore ─────────────────────────────
  async carregarCache(email, isAdmin, clinicaId = null) {
    const col = _firestoreDB.collection("pacientes");
    let snap;
    if (isAdmin) {
      snap = await col.get();
    } else if (clinicaId) {
      // Colaborador: vê todos os pacientes da clínica pelo email do psicólogo
      snap = await col.where("emailProfissional", "==", clinicaId.toLowerCase().trim()).get();
    } else {
      snap = await col.where("emailProfissional", "==", email.toLowerCase().trim()).get();
    }
    this._cache = snap.docs.map(d => d.data());
  },

  // ── Leituras síncronas (via cache) ────────────────
  getAll()    { return this._cache; },
  getById(id) { return this._cache.find(p => p.id === id) || null; },

  // Retorna apenas os pacientes visíveis para o usuário logado
  getMeus() {
    if (usuarioLogado?.role === "admin") return this._cache;
    // Colaborador/Cliente: vê pacientes da clínica vinculada
    const cid = usuarioLogado?.clinicaId;
    if (["colaborador", "cliente"].includes(usuarioLogado?.role))
      return cid ? this._cache.filter(p => p.emailProfissional === cid) : [];
    return this._cache.filter(p => p.emailProfissional === usuarioLogado?.email);
  },

  // ── Criar paciente e disparar escrita no Firestore ─
  create(dados) {
    const id  = "pac_" + Date.now();
    // Colaborador/Cliente: paciente pertence à clínica vinculada (email do psicólogo)
    const emailProf = (["colaborador", "cliente"].includes(usuarioLogado?.role) && usuarioLogado?.clinicaId)
      ? usuarioLogado.clinicaId
      : (usuarioLogado?.email || "");
    const pac = {
      id,
      ...dados,
      emailProfissional: emailProf,
      criadoEm: new Date().toISOString()
    };
    this._cache.push(pac);
    _firestoreDB.collection("pacientes").doc(id).set(pac).catch(console.error);
    return pac;
  },

  update(id, dados) {
    const idx = this._cache.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const atualizado = { ...this._cache[idx], ...dados, atualizadoEm: new Date().toISOString() };
    this._cache[idx] = atualizado;
    _firestoreDB.collection("pacientes").doc(id)
      .update({ ...dados, atualizadoEm: atualizado.atualizadoEm }).catch(console.error);
    return atualizado;
  },

  // Só permite excluir pacientes do próprio usuário (ou admin)
  delete(id) {
    const permitidos = this.getMeus().map(p => p.id);
    if (!permitidos.includes(id)) return;
    this._cache = this._cache.filter(p => p.id !== id);
    _firestoreDB.collection("pacientes").doc(id).delete().catch(console.error);
  }
};

// ──────────────────────────────────────────────────────
// PACIENTES – Ficha Cadastral
// ──────────────────────────────────────────────────────
let _editandoPacId = null;

const ESC_LABEL = {
  "": "Não informada", ne: "Não alfabetizado", fi: "Fund. Incompleto",
  fc: "Fund. Completo",  mi: "Médio Incompleto",  mc: "Médio Completo",
  si: "Superior Incompleto", sc: "Superior Completo", pg: "Pós-graduação"
};
const SEXO_LABEL = { "": "Não informado", M: "Masculino", F: "Feminino", O: "Outro" };

function calcularIdadePac(nasc) {
  if (!nasc) return null;
  const hoje = new Date(), dn = new Date(nasc + "T00:00:00");
  let idade = hoje.getFullYear() - dn.getFullYear();
  if (hoje < new Date(hoje.getFullYear(), dn.getMonth(), dn.getDate())) idade--;
  return idade;
}

function renderizarPacientes() {
  let lista = DB_PAC.getMeus();
  const filtro = (document.getElementById("pac-busca")?.value || "").toLowerCase();
  if (filtro) lista = lista.filter(p => p.nome.toLowerCase().includes(filtro));

  const isAdmin = usuarioLogado?.role === "admin";
  const thProf  = document.getElementById("pac-th-prof");
  if (thProf) thProf.style.display = isAdmin ? "" : "none";

  const empty  = document.getElementById("pac-empty");
  const tabela = document.getElementById("pac-table");
  const tbody  = document.getElementById("tbody-pacientes");

  if (!lista.length) {
    empty.style.display  = "block";
    tabela.style.display = "none";
    return;
  }
  empty.style.display  = "none";
  tabela.style.display = "";

  const avaliacoes = getAvaliacoes();
  tbody.innerHTML = lista.map(p => {
    const idade  = calcularIdadePac(p.nasc);
    const qtdAv  = avaliacoes.filter(a =>
      a.pacienteId === p.id ||
      a.paciente.nome.toLowerCase().trim() === p.nome.toLowerCase().trim()
    ).length;
    const queixa = p.queixa
      ? (p.queixa.length > 45 ? p.queixa.slice(0, 45) + "…" : p.queixa)
      : `<span style='color:var(--text-muted);font-style:italic'>—</span>`;

    // Resolve nome do profissional a partir do e-mail armazenado
    const profNome = (() => {
      if (!isAdmin) return "";
      if (!p.emailProfissional) return `<span style="color:var(--text-muted);font-style:italic">—</span>`;
      const u = DB.findByEmail(p.emailProfissional);
      return u ? u.nome : `<span style="font-size:11px;color:var(--text-muted)">${p.emailProfissional}</span>`;
    })();

    return `
    <tr>
      <td><strong>${p.nome}</strong>${p.sexo ? ` <span style="font-size:11px;color:var(--text-muted)">· ${SEXO_LABEL[p.sexo]}</span>` : ""}</td>
      <td>${idade !== null ? idade + " anos" : "—"}</td>
      <td>${p.tel || "—"}</td>
      <td style="font-size:13px">${queixa}</td>
      ${isAdmin ? `<td style="font-size:13px">${profNome}</td>` : ""}
      <td style="text-align:center"><span class="badge badge-medio">${qtdAv}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-primary" style="padding:4px 10px;font-size:12px" onclick="abrirModalCorrecaoPac('${p.id}')">&#129514; Corrigir</button>
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px;margin-left:4px" onclick="verFichaPaciente('${p.id}')">&#128203; Ver</button>
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px;margin-left:4px" onclick="abrirModalPaciente('${p.id}')">&#9999;&#65039;</button>
        <button class="btn" style="padding:4px 10px;font-size:12px;margin-left:4px;background:var(--danger);color:#fff" onclick="excluirPaciente('${p.id}')">&#128465;&#65039;</button>
      </td>
    </tr>`;
  }).join("");
}

function abrirModalPaciente(id = null) {
  _editandoPacId = id;
  ["nome","nasc","cpf","tel","email","resp","tel-resp","enc","queixa","obs"].forEach(c => {
    const el = document.getElementById("pac-f-" + c);
    if (el) el.value = "";
  });
  document.getElementById("pac-f-sexo").value = "";
  document.getElementById("pac-f-esc").value  = "";
  document.getElementById("pac-err").classList.add("hidden");
  const _sucEl = document.getElementById("pac-success");
  if (_sucEl) _sucEl.classList.add("hidden");
  const _btn = document.querySelector("#modal-pac-overlay .btn-primary");
  if (_btn) { _btn.disabled = false; _btn.textContent = "💾 Salvar Ficha"; }
  document.getElementById("modal-pac-titulo").textContent =
    id ? "\u270F\uFE0F Editar Ficha" : "\u{1F464} Nova Ficha Cadastral";

  if (id) {
    const p = DB_PAC.getById(id);
    if (p) {
      document.getElementById("pac-f-nome").value     = p.nome    || "";
      document.getElementById("pac-f-nasc").value     = p.nasc    || "";
      document.getElementById("pac-f-sexo").value     = p.sexo    || "";
      document.getElementById("pac-f-cpf").value      = p.cpf     || "";
      document.getElementById("pac-f-esc").value      = p.esc     || "";
      document.getElementById("pac-f-tel").value      = p.tel     || "";
      document.getElementById("pac-f-email").value    = p.email   || "";
      document.getElementById("pac-f-resp").value     = p.resp    || "";
      document.getElementById("pac-f-tel-resp").value = p.telResp || "";
      document.getElementById("pac-f-enc").value      = p.enc     || "";
      document.getElementById("pac-f-queixa").value   = p.queixa  || "";
      document.getElementById("pac-f-obs").value      = p.obs     || "";
    }
  }
  document.getElementById("modal-pac-overlay").classList.remove("hidden");
}

function fecharModalPaciente() {
  document.getElementById("modal-pac-overlay").classList.add("hidden");
  _editandoPacId = null;
}

async function salvarPaciente() {
  const errEl = document.getElementById("pac-err");
  errEl.classList.add("hidden");

  const nome = document.getElementById("pac-f-nome").value.trim();
  const nasc = document.getElementById("pac-f-nasc").value;
  if (!nome) { errEl.textContent = "O nome é obrigatório.";              errEl.classList.remove("hidden"); return; }
  if (!nasc) { errEl.textContent = "A data de nascimento é obrigatória."; errEl.classList.remove("hidden"); return; }

  const dados = {
    nome, nasc,
    sexo:    document.getElementById("pac-f-sexo").value,
    cpf:     document.getElementById("pac-f-cpf").value.trim(),
    esc:     document.getElementById("pac-f-esc").value,
    tel:     document.getElementById("pac-f-tel").value.trim(),
    email:   document.getElementById("pac-f-email").value.trim().toLowerCase(),
    resp:    document.getElementById("pac-f-resp").value.trim(),
    telResp: document.getElementById("pac-f-tel-resp").value.trim(),
    enc:     document.getElementById("pac-f-enc").value.trim(),
    queixa:  document.getElementById("pac-f-queixa").value.trim(),
    obs:     document.getElementById("pac-f-obs").value.trim()
  };

  if (_editandoPacId) {
    DB_PAC.update(_editandoPacId, dados);
    fecharModalPaciente();
    renderizarPacientes();
    atualizarStats();
    return;
  }

  DB_PAC.create(dados);
  renderizarPacientes();
  atualizarStats();

  // ── Auto-criar usuário Cliente se o paciente tiver e-mail ──
  if (dados.email) {
    const _btn = document.querySelector("#modal-pac-overlay .btn-primary");
    const _sucEl = document.getElementById("pac-success");
    if (_btn) { _btn.disabled = true; _btn.textContent = "Criando acesso…"; }
    try {
      const _existeDoc = await _firestoreDB.collection("usuarios").doc(dados.email).get();
      if (!_existeDoc.exists) {
        const _senhaTemp    = _gerarSenhaTemp();
        const _clinicaIdAuto = ["colaborador"].includes(usuarioLogado?.role)
          ? (usuarioLogado.clinicaId || "")
          : (["profissional", "psicologo"].includes(usuarioLogado?.role) ? (usuarioLogado.email || "") : "");
        await DB.create({
          email:          dados.email,
          senha:          _senhaTemp,
          nome:           dados.nome,
          role:           "cliente",
          plano:          "vitalicio",
          clinicaId:      _clinicaIdAuto,
          clinicaNome:    usuarioLogado?.clinicaNome || "",
          primeiroAcesso: true,
          cpf:            (dados.cpf || "").replace(/\D/g, "")
        });
        // Exibe senha temporária no modal antes de fechar
        if (_sucEl) {
          _sucEl.innerHTML = `
            ✅ Ficha salva! Login de cliente criado automaticamente.<br>
            <span style="font-size:12px;line-height:2">
              📧 <strong>${dados.email}</strong> &nbsp;|&nbsp;
              🔑 Senha temporária: <code style="background:var(--bg-body,#f0f4f8);padding:2px 8px;border-radius:4px;font-size:13px;font-weight:700;letter-spacing:1.5px">${_senhaTemp}</code>
            </span><br>
            <small style="color:var(--text-muted)">Anote a senha. O cliente deverá redefini-la no primeiro acesso.</small>`;
          _sucEl.classList.remove("hidden");
          if (_btn) { _btn.disabled = false; _btn.textContent = "✅ Concluído — Fechar"; _btn.onclick = fecharModalPaciente; }
          return; // mantém modal aberto para exibir a senha
        }
      }
    } catch (e) {
      console.warn("[auto-cliente]", e);
    }
    if (_btn) { _btn.disabled = false; _btn.textContent = "💾 Salvar Ficha"; }
  }

  fecharModalPaciente();
}

function excluirPaciente(id) {
  if (!confirm("Deseja excluir a ficha deste paciente? Esta ação não pode ser desfeita.")) return;
  DB_PAC.delete(id);
  renderizarPacientes();
  atualizarStats();
}

function verFichaPaciente(id) {
  const p = DB_PAC.getById(id);
  if (!p) return;
  const avaliacoes = getAvaliacoes().filter(a =>
    a.pacienteId === p.id ||
    a.paciente.nome.toLowerCase().trim() === p.nome.toLowerCase().trim()
  );
  const idade = calcularIdadePac(p.nasc);
  const fmtDate = d => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  let html = `
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;margin:20px 0 18px">
      <div style="background:var(--primary);color:#fff;padding:16px 20px;display:flex;align-items:center;gap:14px">
        <div style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0">&#128100;</div>
        <div style="flex:1">
          <div style="font-size:19px;font-weight:700">${p.nome}</div>
          <div style="font-size:13px;opacity:.85">${idade !== null ? idade + " anos" : ""} ${p.sexo ? "· " + SEXO_LABEL[p.sexo] : ""}</div>
        </div>
        <span class="badge" style="background:rgba(255,255,255,.25);color:#fff;font-size:12px">${avaliacoes.length} avaliação(ões)</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr">
        ${fichaRow("&#128197; Nascimento",   fmtDate(p.nasc))}
        ${fichaRow("&#129366; CPF",          p.cpf     || "—")}
        ${fichaRow("&#128218; Escolaridade", ESC_LABEL[p.esc] || "—")}
        ${fichaRow("&#128222; Telefone",     p.tel     || "—")}
        ${fichaRow("&#9993;&#65039; E-mail", p.email   || "—")}
        ${p.resp    ? fichaRow("&#128101; Responsável",      p.resp)    : fichaRow("\u00a0", "\u00a0")}
        ${p.telResp ? fichaRow("&#128222; Tel. Responsável", p.telResp) : fichaRow("\u00a0", "\u00a0")}
        ${p.enc ? `<div style="grid-column:1/-1;padding:10px 16px;border-top:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">&#127973;&#65039; Encaminhado por</div>
          <div style="font-weight:500;font-size:14px">${p.enc}</div></div>` : ""}
      </div>
    </div>`;

  if (p.queixa) html += `
    <div class="pac-bloco-queixa">
      <p class="pac-bloco-titulo">QUEIXA PRINCIPAL</p>
      <div class="pac-bloco-texto pac-bloco-primary">${p.queixa}</div>
    </div>`;

  if (p.obs) html += `
    <div class="pac-bloco-queixa">
      <p class="pac-bloco-titulo">OBSERVAÇÕES</p>
      <div class="pac-bloco-texto pac-bloco-warning">${p.obs}</div>
    </div>`;

  if (avaliacoes.length) html += `
    <p class="pac-bloco-titulo" style="margin-top:4px">HISTÓRICO DE AVALIAÇÕES</p>
    <table class="table" style="margin:0">
      <thead><tr><th>Data</th><th>Teste</th><th>Classificação</th><th></th></tr></thead>
      <tbody>${avaliacoes.map(a => {
        const dataFmt = a.data ? new Date(a.data).toLocaleDateString("pt-BR") : "—";
        const badgeColor = a.tipoTeste === "WISC-IV" ? "badge-medio" : a.tipoTeste === "NEUPSILIN-INF" ? "badge-superior" : "badge-medio";
        const classeWisc = a.tipoTeste === "WISC-IV" ? (a.indices?.fsiq?.classe?.label || "—") : (a.classeGeral?.label || "—");
        return `
        <tr style="cursor:pointer" onclick="abrirResultadoDaFicha('${a.id}')">
          <td>${dataFmt}</td>
          <td><span class="badge ${badgeColor}" style="font-size:11px">${a.tipoTeste || "NEUPSILIN"}</span></td>
          <td>${classeWisc}</td>
          <td><button class="btn btn-primary" style="padding:3px 10px;font-size:11px" onclick="event.stopPropagation();abrirResultadoDaFicha('${a.id}')">&#128203; Ver</button></td>
        </tr>`;
      }).join("")}
      </tbody>
    </table>`;

  document.getElementById("modal-ver-pac-body").innerHTML = html;
  document.getElementById("btn-editar-pac-ficha").onclick = () => { fecharVerPaciente(); abrirModalPaciente(id); };
  document.getElementById("modal-ver-pac-overlay").classList.remove("hidden");
}

function fichaRow(label, value) {
  return `<div class="pac-ficha-row">
    <div class="pac-ficha-row-label">${label}</div>
    <div class="pac-ficha-row-value">${value}</div>
  </div>`;
}

function fecharVerPaciente() {
  document.getElementById("modal-ver-pac-overlay").classList.add("hidden");
}

function abrirResultadoDaFicha(avaliacaoId) {
  fecharVerPaciente();
  requestAnimationFrame(() => abrirModal(avaliacaoId));
}

// ──────────────────────────────────────────────────────
// INICIAR CORREÇÃO A PARTIR DA FICHA
// ──────────────────────────────────────────────────────
let _correcaoPacId = null;

// Mapeamento de escolaridade da ficha → NEUPSILIN Adulto
const _escNeupsilin = {
  ne: "baixa", fi: "", fc: "media", mi: "media",
  mc: "alta",  si: "alta", sc: "alta", pg: "alta"
};

function abrirModalCorrecaoPac(id) {
  _correcaoPacId = id;
  const p = DB_PAC.getById(id);
  const desc = document.getElementById("correcao-pac-desc");
  desc.textContent = p ? `Paciente: ${p.nome}` : "";
  document.getElementById("modal-correcao-pac-overlay").classList.remove("hidden");
}

function fecharModalCorrecaoPac() {
  document.getElementById("modal-correcao-pac-overlay").classList.add("hidden");
  _correcaoPacId = null;
}

function irParaCorrecaoPac(secao) {
  const p = _correcaoPacId ? DB_PAC.getById(_correcaoPacId) : null;
  fecharModalCorrecaoPac();

  // Navega para a seção (limpa o formulário antes)
  navegarPara(secao);

  if (!p) return;

  // Aguarda o DOM estar pronto antes de preencher
  requestAnimationFrame(() => {
    const sexo = (p.sexo === "M" || p.sexo === "F") ? p.sexo : "M";

    if (secao === "nova-avaliacao") {
      _setVal("pac-nome", p.nome);
      _setVal("pac-nasc", p.nasc);
      _setVal("pac-sexo", sexo);
      _setVal("pac-esc",  _escNeupsilin[p.esc] || "");
    } else if (secao === "neupsilin-inf") {
      _setVal("ninf-nome", p.nome);
      _setVal("ninf-nasc", p.nasc);
    } else if (secao === "wisc") {
      _setVal("wisc-nome", p.nome);
      _setVal("wisc-nasc", p.nasc);
      _setVal("wisc-sexo", sexo);
    }
  });
}

function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.value = val;
}
