/* ═══════════════════════════════════════════════════════
   NEUPSILIN — Banco de Dados (Firebase Firestore)
   Usuários persistidos no Firestore com senha em SHA-256.
   Cache em memória garante leituras síncronas após o login.
═══════════════════════════════════════════════════════ */



const ADMIN_PADRAO = {
  email: "luanoliveirags@gmail.com",
  nome:  "Luan Gs",
  crp:   "",
  role:  "admin"
};
const ADMIN_SENHA_PADRAO = "Space@10";

/**
 * Gera hash SHA-256 de uma senha (retorna Promise<string hex>).
 * Usamos WebCrypto nativo — sem bibliotecas externas.
 */
async function hashSenha(senha) {
  const encoded = new TextEncoder().encode(senha);
  const buffer  = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ──────────────────────────────────────────────────────
   Banco de dados de usuários
   ID do documento Firestore = e-mail (normalizado)
────────────────────────────────────────────────────── */
const DB = {
  _cache: [], // cache em memória, populado após o login

  // ── Carga do Firestore ─────────────────────────────
  // isAdmin=true carrega todos; false carrega só o próprio usuário.
  async carregarTodos(isAdmin, email = "") {
    const col = _firestoreDB.collection("usuarios");
    if (isAdmin) {
      const snap = await col.get();
      this._cache = snap.docs.map(d => d.data());
    } else {
      const doc = await col.doc(email.toLowerCase().trim()).get();
      this._cache = doc.exists ? [doc.data()] : [];
    }
  },

  /**
   * Carrega do Firestore apenas os usuários vinculados a uma clínica
   * (colaboradores e clientes cujo clinicaId == email do psicólogo).
   */
  async carregarPorClinica(clinicaIdEmail) {
    const snap = await _firestoreDB.collection("usuarios")
      .where("clinicaId", "==", clinicaIdEmail.toLowerCase().trim())
      .get();
    this._cache = snap.docs.map(d => d.data());
  },

  // ── Leituras síncronas (via cache) ────────────────
  getAll() {
    return this._cache;
  },

  findByEmail(email) {
    return this._cache.find(u => u.email === email.toLowerCase().trim()) || null;
  },

  // ── Criar usuário ──────────────────────────────────
  async create({ email, senha, nome, crp = "", cpf = "", role = "profissional", plano = "1mes", ocultarAplicacao = false, clinicaId = "", primeiroAcesso = false, clinicaNome = "" }) {
    role = typeof normalizarRole === 'function' ? normalizarRole(role) : String(role || "profissional").toLowerCase().trim();
    if (!email || !senha || !nome) throw new Error("Preencha todos os campos obrigatórios.");
    if (senha.length < 6) throw new Error("A senha deve ter ao menos 6 caracteres.");
    if (["colaborador", "cliente"].includes(role) && !clinicaId)
      throw new Error("Selecione a clínica (psicólogo responsável) para este perfil.");

    const emailNorm = email.toLowerCase().trim();
    if (this.findByEmail(emailNorm)) throw new Error("E-mail já cadastrado.");

    const usuario = {
      email: emailNorm,
      senhaHash: await hashSenha(senha),
      nome:  nome.trim(),
      crp:   crp.trim(),
      cpf:   cpf.replace(/\D/g, ""),
      role,
      plano,
      expiracao: calcularExpiracao(plano),
      bloqueado: false,
      ocultarAplicacao,
      clinicaId:      ["colaborador", "cliente"].includes(role) ? clinicaId.toLowerCase().trim() : "",
      clinicaNome:    clinicaNome.trim() || "",
      primeiroAcesso: !!primeiroAcesso,
      criadoEm: new Date().toISOString()
    };
    await _firestoreDB.collection("usuarios").doc(emailNorm).set(usuario);
    this._cache.push(usuario);
    return usuario;
  },

  // ── Atualizar usuário pelo admin ───────────────────
  async updateAdmin(email, { nome, crp, cpf, role, ocultarAplicacao, novaSenha, clinicaId } = {}) {
    const emailNorm = email.toLowerCase().trim();
    const idx = this._cache.findIndex(u => u.email === emailNorm);
    if (idx === -1) throw new Error("Usuário não encontrado.");

    const novoRole = role !== undefined
      ? (typeof normalizarRole === 'function' ? normalizarRole(role) : String(role).toLowerCase().trim())
      : this._cache[idx].role;
    if (["colaborador", "cliente"].includes(novoRole) && clinicaId === "")
      throw new Error("Selecione a clínica (psicólogo responsável) para este perfil.");

    const updates = {};
    if (nome !== undefined)             updates.nome = nome.trim();
    if (crp !== undefined)              updates.crp  = crp.trim();
    if (cpf !== undefined)              updates.cpf  = cpf.replace(/\D/g, "");
    if (role !== undefined)             updates.role = novoRole;
    if (ocultarAplicacao !== undefined) updates.ocultarAplicacao = ocultarAplicacao;
    if (clinicaId !== undefined)
      updates.clinicaId = ["colaborador", "cliente"].includes(novoRole) ? clinicaId.toLowerCase().trim() : "";
    if (novaSenha) {
      if (novaSenha.length < 6) throw new Error("A nova senha deve ter ao menos 6 caracteres.");
      updates.senhaHash = await hashSenha(novaSenha);
    }
    await _firestoreDB.collection("usuarios").doc(emailNorm).update(updates);
    Object.assign(this._cache[idx], updates);
  },

  // ── Atualizar perfil do próprio usuário ────────────
  async updatePerfil(email, { nome, crp, novaSenha } = {}) {
    const emailNorm = email.toLowerCase().trim();
    const idx = this._cache.findIndex(u => u.email === emailNorm);
    if (idx === -1) throw new Error("Usuário não encontrado.");

    const updates = {};
    if (nome) updates.nome = nome.trim();
    if (crp !== undefined) updates.crp = crp.trim();
    if (novaSenha) {
      if (novaSenha.length < 6) throw new Error("A senha deve ter ao menos 6 caracteres.");
      updates.senhaHash = await hashSenha(novaSenha);
    }
    await _firestoreDB.collection("usuarios").doc(emailNorm).update(updates);
    Object.assign(this._cache[idx], updates);
    return this._cache[idx];
  },

  // ── Excluir usuário ────────────────────────────────
  delete(email) {
    const emailNorm = email.toLowerCase().trim();
    this._cache = this._cache.filter(u => u.email !== emailNorm);
    _firestoreDB.collection("usuarios").doc(emailNorm).delete().catch(console.error);
  },

  // ── Bloquear usuário ───────────────────────────────
  bloquear(email) {
    const emailNorm = email.toLowerCase().trim();
    const idx = this._cache.findIndex(u => u.email === emailNorm);
    if (idx === -1) return;
    const ts = new Date().toISOString();
    this._cache[idx].bloqueado   = true;
    this._cache[idx].bloqueadoEm = ts;
    _firestoreDB.collection("usuarios").doc(emailNorm)
      .update({ bloqueado: true, bloqueadoEm: ts }).catch(console.error);
  },

  // ── Ativar usuário ─────────────────────────────────
  ativar(email, plano) {
    const emailNorm = email.toLowerCase().trim();
    const idx = this._cache.findIndex(u => u.email === emailNorm);
    if (idx === -1) return;
    const ts       = new Date().toISOString();
    const expiracao = calcularExpiracao(plano);
    Object.assign(this._cache[idx], { bloqueado: false, plano, expiracao, ativadoEm: ts });
    delete this._cache[idx].bloqueadoEm;
    _firestoreDB.collection("usuarios").doc(emailNorm).update({
      bloqueado: false,
      plano,
      expiracao,
      ativadoEm: ts,
      bloqueadoEm: firebase.firestore.FieldValue.delete()
    }).catch(console.error);
  },

  // ── Verificar expirados e bloquear ────────────────
  verificarExpiracoes() {
    const agora = new Date();
    this._cache.forEach((u, i) => {
      if (u.role === "admin" || u.bloqueado || !u.expiracao) return;
      if (new Date(u.expiracao) < agora) {
        const ts = new Date().toISOString();
        this._cache[i].bloqueado   = true;
        this._cache[i].bloqueadoEm = ts;
        _firestoreDB.collection("usuarios").doc(u.email)
          .update({ bloqueado: true, bloqueadoEm: ts }).catch(console.error);
      }
    });
  }
};

/** Calcula a data de expiração com base no plano. Retorna null para vitalício e por avaliação. */
function calcularExpiracao(plano) {
  if (plano === "vitalicio" || plano === "1avaliacao") return null;
  const d = new Date();
  if (plano === "1mes")   d.setMonth(d.getMonth() + 1);
  if (plano === "3meses") d.setMonth(d.getMonth() + 3);
  return d.toISOString();
}

/** Inicializa o banco criando o admin padrão se ainda não houver nenhum usuário. */
async function inicializarDB() {
  const snap = await _firestoreDB.collection("usuarios").limit(1).get();
  if (snap.empty) {
    await DB.create({ ...ADMIN_PADRAO, senha: ADMIN_SENHA_PADRAO, plano: "vitalicio" });
  }
}
