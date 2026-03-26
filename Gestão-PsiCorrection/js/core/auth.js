/* ═══════════════════════════════════════════════════════
   PsiCorrection — core/auth.js
   Autenticação, sessão e perfil do profissional.

   Depende de (carregados antes):
     core/firebase.js   → _firestoreDB
     core/database.js   → DB, hashSenha
     core/storage.js    → _cacheAvaliacoes, carregarAvaliacoes
     modules/pacientes/ → DB_PAC
   Globals usados em runtime:
     usuarioLogado, atualizarStats, renderizarTabelaRecentes (script.js)
     limparFormulario (modules/neupsilin/avaliacao.js)
═══════════════════════════════════════════════════════ */

/** Alterna visibilidade da senha no campo de login. */
function toggleSenha(btn) {
  const input  = document.getElementById("login-senha");
  const eyeOn  = document.getElementById("eye-open");
  const eyeOff = document.getElementById("eye-off");
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  eyeOn.classList.toggle("hidden",  isPassword);
  eyeOff.classList.toggle("hidden", !isPassword);
}

/** Normaliza valores de role antes de decisões no fluxo de login. */
function pillarRole(role) {
  if (typeof normalizarRole === "function") {
    return normalizarRole(role);
  }
  return String(role || "").toLowerCase().trim();
}

/** Autentica o profissional via Firestore e inicia a sessão. */
// Dados temporários do usuário em primeiro acesso (aguardando troca de senha)
let _primeiroAcessoData = null;

/** Autentica o profissional via Firestore e inicia a sessão. */
async function fazerLogin() {
  const email    = document.getElementById("login-email").value.trim().toLowerCase();
  const senha    = document.getElementById("login-senha").value;
  const errDiv   = document.getElementById("login-error");
  const btnLogin = document.querySelector("#page-login .btn-primary");

  if (!email || !senha) {
    errDiv.textContent = "Preencha e-mail e senha.";
    errDiv.classList.remove("hidden");
    return;
  }

  // Pré-validação do CPF — só executa se o campo identificador estiver visível
  const _identField  = document.getElementById("login-crp");
  const _identValue  = _identField?.value.trim() ?? "";
  const _crpGroupEl  = document.getElementById("login-crp-group");
  const _crpHidden   = _crpGroupEl && _crpGroupEl.style.display === "none";

  // Pré-validação de CPF apenas se o campo estiver visível (admin tem campo oculto)
  if (!_crpHidden) {
    const _cpfPreCheck = validarFormatoCPF(_identValue);
    if (!_cpfPreCheck.ok) {
      errDiv.textContent = _cpfPreCheck.mensagem;
      errDiv.classList.remove("hidden");
      return;
    }
  }

  if (btnLogin) { btnLogin.disabled = true; btnLogin.textContent = "Entrando…"; }

  // Garante que a auth anônima já está pronta antes de qualquer query ao Firestore
  try {
    if (!firebase.auth().currentUser) {
      await firebase.auth().signInAnonymously();
    }
  } catch (_) { /* silencioso — Firestore pode ter regras abertas */ }

  try {
    const doc = await _firestoreDB.collection("usuarios").doc(email).get();
    if (!doc.exists) {
      errDiv.textContent = "E-mail ou senha incorretos.";
      errDiv.classList.remove("hidden");
      return;
    }

    const usuarioData = doc.data();

    // Garantia extra: e-mail do administrador padrão sempre roda como admin.
    // Para evitar casos em que o campo role esteja vazio no Firestore.
    const rawRole = (usuarioData.role || "").trim() ||
      (email === ADMIN_PADRAO.email ? "admin" : "profissional");
    usuarioData.role = pillarRole(rawRole);

    if (email === ADMIN_PADRAO.email && usuarioData.role !== "admin") {
      usuarioData.role = "admin";
      _firestoreDB.collection("usuarios").doc(email)
        .update({ role: "admin" }).catch(console.error);
    }

    const hash = await hashSenha(senha);
    if (hash !== usuarioData.senhaHash) {
      errDiv.textContent = "E-mail ou senha incorretos.";
      errDiv.classList.remove("hidden");
      return;
    }

    if (usuarioData.role !== "admin" && !usuarioData.bloqueado && usuarioData.expiracao) {
      if (new Date(usuarioData.expiracao) < new Date()) {
        _firestoreDB.collection("usuarios").doc(email)
          .update({ bloqueado: true, bloqueadoEm: new Date().toISOString() })
          .catch(console.error);
        errDiv.textContent = "Seu acesso expirou. Entre em contato com o administrador.";
        errDiv.classList.remove("hidden");
        return;
      }
    }

    if (usuarioData.bloqueado && usuarioData.role !== "admin") {
      errDiv.textContent = "Seu acesso está bloqueado ou expirado. Entre em contato com o administrador.";
      errDiv.classList.remove("hidden");
      return;
    }

    // ── Primeiro Acesso: redirecionar para troca de senha obrigatória ──
    if (usuarioData.primeiroAcesso) {
      const _paClinicaId = ["colaborador", "cliente"].includes(usuarioData.role)
        ? (usuarioData.clinicaId || "")
        : (usuarioData.role === "admin" ? null : email);
      if (["colaborador", "cliente"].includes(usuarioData.role) && !_paClinicaId) {
        errDiv.textContent = "Sua conta não está vinculada a nenhuma clínica. Entre em contato com o administrador.";
        errDiv.classList.remove("hidden");
        return;
      }
      await DB.carregarTodos(usuarioData.role === "admin", email);
      let _paCn = "";
      if (["colaborador", "cliente"].includes(usuarioData.role) && _paClinicaId) {
        try { const _d = await _firestoreDB.collection("usuarios").doc(_paClinicaId).get(); _paCn = _d.exists ? (_d.data().clinicaNome || "") : ""; } catch { /* silencioso */ }
      } else if (usuarioData.role !== "admin") { _paCn = usuarioData.clinicaNome || ""; }
      _primeiroAcessoData = {
        email:      usuarioData.email,
        nome:       usuarioData.nome,
        crp:        usuarioData.crp || "",
        role:       usuarioData.role,
        clinicaId:  _paClinicaId,
        clinicaNome: _paCn
      };
      document.getElementById("page-login").classList.add("hidden");
      const _paPage = document.getElementById("page-primeiro-acesso");
      _paPage.classList.remove("hidden");
      _paPage.style.display = "flex";
      document.getElementById("pa-error").classList.add("hidden");
      document.getElementById("pa-senha-nova").value      = "";
      document.getElementById("pa-senha-confirmar").value = "";
      if (btnLogin) { btnLogin.disabled = false; btnLogin.textContent = "Entrar"; }
      return;
    }

    // ── Validação de CPF — admin é isento (pode não ter CPF cadastrado) ──
    if (usuarioData.role !== "admin") {
      const cpfFinal = validarFormatoCPF(_identValue);
      if (!cpfFinal.ok) {
        errDiv.textContent = cpfFinal.mensagem;
        errDiv.classList.remove("hidden");
        return;
      }
      if (!usuarioData.cpf) {
        // Usuário sem CPF cadastrado — bloqueia login até admin corrigir
        errDiv.textContent = "CPF não registrado no cadastro. Solicite ao administrador que atualize seus dados.";
        errDiv.classList.remove("hidden");
        return;
      }
      if (normalizarCPF(_identValue) !== normalizarCPF(usuarioData.cpf)) {
        errDiv.textContent = "E-mail, senha ou CPF incorretos.";
        errDiv.classList.remove("hidden");
        return;
      }
      // Para psicólogos: dispara verificação assíncrona no cadastro do CFP (não bloqueia o login)
      if (!["colaborador", "cliente"].includes(usuarioData.role)) {
        validarCRPExternoAsync(usuarioData.crp || "", email, _identValue);
      }
    }

    // Determina clinicaId e valida vínculo obrigatório
    const clinicaId = ["colaborador", "cliente"].includes(usuarioData.role)
      ? (usuarioData.clinicaId || "")
      : (usuarioData.role === "admin" ? null : email);
    if (["colaborador", "cliente"].includes(usuarioData.role) && !clinicaId) {
      errDiv.textContent = "Sua conta não está vinculada a nenhuma clínica. Entre em contato com o administrador.";
      errDiv.classList.remove("hidden");
      return;
    }

    await DB.carregarTodos(usuarioData.role === "admin", email);
    if (["admin", "profissional", "psicologo"].includes(usuarioData.role)) {
      await DB_PAC.carregarCache(email, usuarioData.role === "admin");
      await carregarAvaliacoes(email, usuarioData.role === "admin");
    } else if (usuarioData.role === "colaborador") {
      await DB_PAC.carregarCache(email, false, clinicaId);
    }
    await carregarNormas(email, usuarioData.role);  // registra sessão + busca tabelas
    if (estadoNormas().state === "error") {
      console.warn("[login] Normas não carregadas:", estadoNormas().error);
    }
    DB.verificarExpiracoes();

    // Resolve clinicaNome e clinicaLogoUrl: para Colaborador/Cliente, busca no doc do Psicólogo responsável
    let clinicaNome    = "";
    let clinicaLogoUrl = "";
    if (["colaborador", "cliente"].includes(usuarioData.role) && clinicaId) {
      try {
        const _psiDoc = await _firestoreDB.collection("usuarios").doc(clinicaId).get();
        clinicaNome    = _psiDoc.exists ? (_psiDoc.data().clinicaNome    || "") : "";
        clinicaLogoUrl = _psiDoc.exists ? (_psiDoc.data().clinicaLogoUrl || "") : "";
      } catch { /* silencioso */ }
    } else if (usuarioData.role !== "admin") {
      clinicaNome    = usuarioData.clinicaNome    || "";
      clinicaLogoUrl = usuarioData.clinicaLogoUrl || "";
    }

    errDiv.classList.add("hidden");
    usuarioLogado = {
      email:      usuarioData.email,
      nome:       usuarioData.nome,
      crp:        usuarioData.crp,
      cpf:        usuarioData.role === "admin" ? "" : normalizarCPF(_identValue),
      role:       usuarioData.role,
      clinicaId,
      clinicaNome,
      clinicaLogoUrl
    };
    sessionStorage.setItem("neupsilin_user", JSON.stringify(usuarioLogado));
    limparFormulario();
    abrirDashboard();
    exibirAvisoObrigatorio();
  } catch (e) {
    console.error("[login] erro:", e);
    errDiv.textContent = "Erro: " + (e?.message || e?.code || JSON.stringify(e) || "desconhecido");
    errDiv.classList.remove("hidden");
  } finally {
    if (btnLogin) { btnLogin.disabled = false; btnLogin.textContent = "Entrar"; }
  }
}

/**
 * Detecta o papel do usuário pelo e-mail e alterna o campo identificador
 * entre CPF (psicólogo/colaborador/cliente) ou oculto (admin).
 * Chamado no onblur do campo e-mail.
 */
async function detectarCampoIdentificador() {
  const email = document.getElementById("login-email").value.trim().toLowerCase();
  if (!email) return;

  const crpGroup  = document.getElementById("login-crp-group");
  const crpInput  = document.getElementById("login-crp");
  const crpHint   = document.getElementById("crp-hint");
  const crpStatus = document.getElementById("crp-status");
  if (!crpInput) return;

  try {
    const doc = await _firestoreDB.collection("usuarios").doc(email).get();
    if (!doc.exists) return;

    crpInput.value          = "";
    crpStatus.textContent   = "";
    crpHint.className       = "crp-hint";

    const cfpLink = document.getElementById("crp-cfp-link");
    const role = pillarRole(doc.data().role || "profissional");

    // Primeiro acesso: ocultar campo identificador (não é necessário CPF)
    if (doc.data().primeiroAcesso) {
      crpGroup.style.display = "none";
      crpInput.value         = "";
      crpGroup.querySelector("label").innerHTML =
        'Acesso <span class="crp-label-badge" style="background:var(--warning,#f59e0b);color:#fff">Primeiro Acesso</span>';
      crpHint.textContent = "🔑 Use a senha temporária enviada pelo sistema.";
      crpHint.className   = "crp-hint";
      if (cfpLink) cfpLink.classList.add("hidden");
      return;
    }

    // ── ADMIN: campo CPF não é necessário — ocultar ──
    if (role === "admin") {
      crpGroup.style.display = "none";
      crpInput.value         = "";
      crpGroup.querySelector("label").innerHTML =
        'CPF <span class="crp-label-badge crp-label-badge--admin">Admin</span>';
      crpHint.textContent  = "";
      if (cfpLink) cfpLink.classList.add("hidden");
      return;
    }

    crpGroup.style.display = ""; // garante visibilidade para demais usuários

    const _roleLabel = { colaborador: 'Colaborador', cliente: 'Cliente' }[role] || 'Psicólogo';
    crpInput.dataset.mode = "cpf";
    crpGroup.querySelector("label").innerHTML =
      `CPF <span class="crp-label-badge">${_roleLabel}</span>`;
    crpInput.placeholder = "000.000.000-00";
    crpInput.maxLength   = 14;
    crpHint.textContent  = "Formato: 000.000.000-00  ·  CPF de acesso";
    if (cfpLink) cfpLink.classList.add("hidden");

  } catch { /* silencioso — não bloqueia login */ }
}

/**
 * Conclui o fluxo de primeiro acesso: valida e salva a nova senha,
 * define primeiroAcesso = false e abre o dashboard.
 */
async function concluirPrimeiroAcesso() {
  const errEl = document.getElementById("pa-error");
  errEl.classList.add("hidden");
  const nova = document.getElementById("pa-senha-nova").value;
  const cfm  = document.getElementById("pa-senha-confirmar").value;

  if (!nova || nova.length < 6) {
    errEl.textContent = "A senha deve ter pelo menos 6 caracteres.";
    errEl.classList.remove("hidden"); return;
  }
  if (nova !== cfm) {
    errEl.textContent = "As senhas não coincidem.";
    errEl.classList.remove("hidden"); return;
  }

  const btn = document.getElementById("pa-btn-confirmar");
  if (btn) { btn.disabled = true; btn.textContent = "Salvando…"; }

  try {
    const { email, nome, crp, role, clinicaId, clinicaNome } = _primeiroAcessoData;

    // Atualiza senha e zera a flag primeiroAcesso
    await DB.updateAdmin(email, { novaSenha: nova });
    await _firestoreDB.collection("usuarios").doc(email).update({ primeiroAcesso: false });
    const _uIdx = DB._cache.findIndex(u => u.email === email);
    if (_uIdx !== -1) DB._cache[_uIdx].primeiroAcesso = false;

    // Carrega caches necessários conforme perfil
    if (["admin", "profissional", "psicologo"].includes(role)) {
      await DB_PAC.carregarCache(email, role === "admin");
      await carregarAvaliacoes(email, role === "admin");
    } else if (role === "colaborador") {
      await DB_PAC.carregarCache(email, false, clinicaId);
    }
    await carregarNormas(email, role);
    DB.verificarExpiracoes();

    usuarioLogado = { email, nome, crp, cpf: "", role, clinicaId, clinicaNome };
    sessionStorage.setItem("neupsilin_user", JSON.stringify(usuarioLogado));

    document.getElementById("page-primeiro-acesso").classList.add("hidden");
    document.getElementById("page-primeiro-acesso").style.display = "";
    _primeiroAcessoData = null;
    limparFormulario();
    abrirDashboard();
    exibirAvisoObrigatorio();
  } catch (e) {
    errEl.textContent = "Erro ao salvar senha: " + (e?.message || String(e));
    errEl.classList.remove("hidden");
    if (btn) { btn.disabled = false; btn.textContent = "🔒 Definir Senha e Entrar"; }
  }
}

/** Encerra a sessão e limpa os caches em memória. */
function fazerLogout() {
  sessionStorage.removeItem("neupsilin_user");
  usuarioLogado    = null;
  _primeiroAcessoData = null;
  DB._cache        = [];
  DB_PAC._cache    = [];
  _cacheAvaliacoes = [];
  // Reseta o cache da clínica para evitar vazamento de dados entre sessões (multi-tenant)
  if (typeof DB_CLINICA !== "undefined") {
    DB_CLINICA._perfilCache  = null;
    DB_CLINICA._agendamentos = [];
    DB_CLINICA._financeiro   = [];
    DB_CLINICA._loaded       = false;
  }
  limparNormasMemoria(); // descarta tabelas normativas da memória
  document.getElementById("page-login").classList.remove("hidden");
  document.getElementById("page-login").classList.add("active");
  document.getElementById("page-dashboard").classList.add("hidden");
  document.getElementById("page-primeiro-acesso").classList.add("hidden");
  document.getElementById("login-email").value = "";
  document.getElementById("login-senha").value = "";
  // Resetar campo identificador para modo CPF (padrão) e garantir visibilidade
  const _crpGroupReset = document.getElementById("login-crp-group");
  const _identReset = document.getElementById("login-crp");
  if (_crpGroupReset) _crpGroupReset.style.display = "";
  if (_identReset) {
    _identReset.value = "";
    _identReset.dataset.mode  = "cpf";
    _identReset.placeholder   = "000.000.000-00";
    _identReset.maxLength     = 14;
    const _lbl = document.querySelector("#login-crp-group label");
    if (_lbl) _lbl.innerHTML = 'CPF <span class="crp-label-badge">Psic\u00f3logo</span>';
    const _hint = document.getElementById("crp-hint");
    if (_hint) { _hint.textContent = "Formato: 000.000.000-00 \u00b7 Confirma seu registro no CFP"; _hint.className = "crp-hint"; }
    const _st = document.getElementById("crp-status");
    if (_st) _st.textContent = "";
    const _cfpLink = document.getElementById("crp-cfp-link");
    if (_cfpLink) _cfpLink.classList.add("hidden");
  }
}

// ── Aviso Obrigatório CFP ────────────────────────────────────

/** Exibe o aviso obrigatório CFP após login (uma vez por sessão de aba). */
function exibirAvisoObrigatorio() {
  if (sessionStorage.getItem("psi_aviso_aceito")) return;
  const el = document.getElementById("modal-aviso-overlay");
  if (el) el.classList.remove("hidden");
}

/** Habilita o botão de aceitar conforme o checkbox. */
function atualizarBotaoAviso() {
  const cb  = document.getElementById("aviso-checkbox");
  const btn = document.getElementById("aviso-btn-aceitar");
  if (btn) btn.disabled = !cb?.checked;
}

/** Registra a aceitação do aviso e fecha o modal. */
function aceitarAviso() {
  if (!document.getElementById("aviso-checkbox")?.checked) return;
  sessionStorage.setItem("psi_aviso_aceito", "1");
  const el = document.getElementById("modal-aviso-overlay");
  if (el) el.classList.add("hidden");
}

/** Transita da tela de login para o dashboard após autenticação. */
function abrirDashboard() {
  const role = pillarRole(usuarioLogado.role || "profissional");
  usuarioLogado.role = role;
  document.getElementById("page-login").classList.add("hidden");
  document.getElementById("page-dashboard").classList.remove("hidden");
  // Exibe cargo, nome e CRP/CPF
  let cargo = "";
  if (usuarioLogado.role === "psicologo" || usuarioLogado.role === "profissional") cargo = "Psicólogo";
  else if (usuarioLogado.role === "colaborador") cargo = "Colaborador";
  else if (usuarioLogado.role === "cliente") cargo = "Cliente";
  else if (usuarioLogado.role === "admin") cargo = "Administrador";
  else cargo = usuarioLogado.role;

  document.getElementById("sidebar-user-nome").innerHTML = `<span style='font-size:12px;color:var(--text-muted)'>${cargo}:</span><br><strong>${usuarioLogado.nome}</strong>`;

  let infoExtra = "";
  if (usuarioLogado.role === "psicologo" || usuarioLogado.role === "profissional") {
    infoExtra = usuarioLogado.crp ? `CRP: ${usuarioLogado.crp}` : "";
  } else if (usuarioLogado.cpf) {
    infoExtra = `CPF: ${usuarioLogado.cpf}`;
  }
  document.getElementById("sidebar-user-crp").textContent = infoExtra;
  document.getElementById("topbar-user-name").textContent  = usuarioLogado.nome;

  // ── Exibir/ocultar itens de menu conforme perfil ──
  document.querySelectorAll(".nav-item[data-roles]").forEach(el => {
    const roles = el.dataset.roles.split(" ");
    el.style.display = roles.includes(role) ? "flex" : "none";
  });

  // ── Exibir/ocultar botão de exportar dados (apenas admin) ──
  const btnExportar = document.getElementById("btn-exportar-dados");
  if (btnExportar) btnExportar.style.display = role === "admin" ? "block" : "none";

  // Atualiza o cabeçalho interno da seção Clínica com dados do consultório
  try {
    _atualizarNavClinica(
      usuarioLogado.clinicaNome || "",
      usuarioLogado.clinicaLogoUrl || ""
    );
  } catch(e) { /* gestao.js ainda não carregado */ }
  const _uApl = DB.findByEmail(usuarioLogado.email);
  if (_uApl?.ocultarAplicacao && role !== "admin") {
    document.querySelectorAll(".nav-aplicacao").forEach(el => el.style.display = "none");
  }
  const btnSenha = document.getElementById("btn-alterar-senha");
  if (btnSenha) btnSenha.style.display = role !== "admin" ? "block" : "none";

  // ── Seção inicial conforme perfil ──
  const secaoInicial = ["colaborador", "cliente"].includes(role) ? "clinica" : "dashboard";
  document.querySelectorAll(".sec").forEach(s => {
    s.style.display = "none";
    s.classList.remove("active");
  });
  const secEl = document.getElementById("sec-" + secaoInicial);
  secEl.style.display = "block";
  secEl.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  const navAtivo = document.querySelector(`.nav-item[onclick*="'${secaoInicial}'"]`);
  if (navAtivo) navAtivo.classList.add("active");

  document.getElementById("topbar-title").textContent =
    secaoInicial === "clinica" ? "Gestão da Clínica" : "Dashboard";

  if (secaoInicial === "dashboard") {
    try { atualizarStats(); } catch(e) { console.warn("[dashboard] atualizarStats:", e); }
    try { renderizarTabelaRecentes(); } catch(e) { console.warn("[dashboard] renderizarTabelaRecentes:", e); }
  } else if (secaoInicial === "clinica") {
    try { renderizarClinica(); } catch(e) { console.warn("[clinica] renderizarClinica:", e); }
  }
}

// ── Modal de Perfil ────────────────────────────────────

/** Abre o modal de edição de perfil do profissional logado. */
function abrirModalPerfil() {
  if (!usuarioLogado) return;
  const u = DB.findByEmail(usuarioLogado.email);
  document.getElementById("perfil-nome").value  = u ? u.nome  : "";
  document.getElementById("perfil-crp").value   = u ? u.crp   : "";
  document.getElementById("perfil-email").value = usuarioLogado.email;
  ["perfil-senha-atual", "perfil-senha-nova", "perfil-senha-confirmar"].forEach(id => {
    document.getElementById(id).value = "";
  });
  // Define cor do tema atual
  const corAtual = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#2563eb';
  document.getElementById("perfil-cor-tema").value = corAtual;
  // Exibe o nome da clínica quando disponível
  const _clinicaInfoEl   = document.getElementById("perfil-clinica-info");
  const _clinicaNomeText = document.getElementById("perfil-clinica-nome-text");
  if (_clinicaInfoEl && _clinicaNomeText) {
    const _cn = usuarioLogado.clinicaNome || "";
    _clinicaNomeText.textContent = _cn;
    _clinicaInfoEl.style.display = _cn ? "" : "none";
  }
  document.getElementById("perfil-error").classList.add("hidden");
  document.getElementById("perfil-success").classList.add("hidden");
  document.getElementById("modal-perfil-overlay").classList.remove("hidden");
}

function fecharModalPerfil() {
  document.getElementById("modal-perfil-overlay").classList.add("hidden");
}

/** Salva alterações de nome, CRP e/ou senha do usuário logado. */
async function salvarPerfil() {
  const errEl = document.getElementById("perfil-error");
  const okEl  = document.getElementById("perfil-success");
  errEl.classList.add("hidden");
  okEl.classList.add("hidden");

  const nome       = document.getElementById("perfil-nome").value.trim();
  const crp        = document.getElementById("perfil-crp").value.trim();
  const senhaAtual = document.getElementById("perfil-senha-atual").value;
  const senhaNova  = document.getElementById("perfil-senha-nova").value;
  const senhaCfm   = document.getElementById("perfil-senha-confirmar").value;

  if (!nome) {
    errEl.textContent = "O nome não pode ficar em branco.";
    errEl.classList.remove("hidden");
    return;
  }

  const querTrocarSenha = senhaAtual || senhaNova || senhaCfm;
  if (querTrocarSenha) {
    if (!senhaAtual) {
      errEl.textContent = "Informe a senha atual para poder trocá-la.";
      errEl.classList.remove("hidden");
      return;
    }
    if (!senhaNova || !senhaCfm) {
      errEl.textContent = "Preencha a nova senha e a confirmação.";
      errEl.classList.remove("hidden");
      return;
    }
    if (senhaNova.length < 6) {
      errEl.textContent = "A nova senha deve ter pelo menos 6 caracteres.";
      errEl.classList.remove("hidden");
      return;
    }
    if (senhaNova !== senhaCfm) {
      errEl.textContent = "As senhas não coincidem.";
      errEl.classList.remove("hidden");
      return;
    }
    const hashAtual = await hashSenha(senhaAtual);
    const usuario   = DB.findByEmail(usuarioLogado.email);
    if (!usuario || usuario.senhaHash !== hashAtual) {
      errEl.textContent = "Senha atual incorreta.";
      errEl.classList.remove("hidden");
      return;
    }
  }

  try {
    const atualizado = await DB.updatePerfil(usuarioLogado.email, {
      nome,
      crp,
      novaSenha: querTrocarSenha ? senhaNova : undefined
    });
    usuarioLogado.nome = atualizado.nome;
    usuarioLogado.crp  = atualizado.crp;
    sessionStorage.setItem("neupsilin_user", JSON.stringify(usuarioLogado));
    // Exibe cargo, nome e CRP/CPF
    let cargo = "";
    if (usuarioLogado.role === "psicologo" || usuarioLogado.role === "profissional") cargo = "Psicólogo";
    else if (usuarioLogado.role === "colaborador") cargo = "Colaborador";
    else if (usuarioLogado.role === "cliente") cargo = "Cliente";
    else if (usuarioLogado.role === "admin") cargo = "Administrador";
    else cargo = usuarioLogado.role;
    document.getElementById("sidebar-user-nome").innerHTML = `<span style='font-size:12px;color:var(--text-muted)'>${cargo}:</span><br><strong>${usuarioLogado.nome}</strong>`;
    let infoExtra = "";
    if (usuarioLogado.role === "psicologo" || usuarioLogado.role === "profissional") {
      infoExtra = usuarioLogado.crp ? `CRP: ${usuarioLogado.crp}` : "";
    } else if (usuarioLogado.cpf) {
      infoExtra = `CPF: ${usuarioLogado.cpf}`;
    }
    document.getElementById("sidebar-user-crp").textContent = infoExtra;
    document.getElementById("topbar-user-name").textContent  = usuarioLogado.nome;
    okEl.textContent = "Perfil atualizado com sucesso!";
    okEl.classList.remove("hidden");
    setTimeout(() => fecharModalPerfil(), 1800);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove("hidden");
  }
}