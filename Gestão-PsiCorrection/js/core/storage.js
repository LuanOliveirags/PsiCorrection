/* ═══════════════════════════════════════════════════════
   PsiCorrection — core/storage.js
   Persistência de avaliações: Firestore + cache em memória.

   Depende de (carregados antes):
     core/firebase.js  → _firestoreDB
     core/database.js  → DB
     modules/pacientes/db_pacientes.js → DB_PAC
   Globals usados em runtime:
     usuarioLogado (definido em script.js)
═══════════════════════════════════════════════════════ */

/** Cache local de avaliações do profissional logado. */
let _cacheAvaliacoes = [];

/**
 * Carrega avaliações do Firestore para o cache em memória.
 * Admin carrega todas; profissional carrega apenas as suas.
 * @param {string}  email
 * @param {boolean} isAdmin
 */
async function carregarAvaliacoes(email, isAdmin) {
  const col  = _firestoreDB.collection("avaliacoes");
  const snap = isAdmin
    ? await col.get()
    : await col.where("profissional.email", "==", email.toLowerCase().trim()).get();
  _cacheAvaliacoes = snap.docs.map(d => d.data());
}

/**
 * Persiste uma avaliação no cache e no Firestore.
 * Vincula (ou cria) automaticamente o paciente no DB_PAC.
 * @param {object} av - objeto de avaliação
 */
function salvarAvaliacao(av) {
  // Garante e-mail do profissional atual
  av.profissional.email = usuarioLogado.email;

  // ── Vínculo automático com paciente ──────────────────
  const nomePac = av.paciente?.nome?.trim();
  const nascPac = av.paciente?.nasc;
  if (nomePac && nascPac) {
    const existing = DB_PAC.getMeus().find(p =>
      p.nome.toLowerCase() === nomePac.toLowerCase() && p.nasc === nascPac
    );
    if (existing) {
      av.pacienteId = existing.id;
    } else {
      const sexoPac = av.paciente.sexo || "";
      const escMap  = { baixa: "fi", media: "mc", alta: "sc" };
      const escCod  = escMap[av.paciente.esc] || av.paciente.esc || "";
      const novo = DB_PAC.create({
        nome: nomePac, nasc: nascPac,
        sexo: (sexoPac === "M" || sexoPac === "F") ? sexoPac : "",
        esc: escCod,
        cpf: "", tel: "", email: "", resp: "", telResp: "", enc: "", queixa: "", obs: ""
      });
      av.pacienteId = novo.id;
    }
  }
  // ─────────────────────────────────────────────────────

  if (!av.id) av.id = Date.now();
  _cacheAvaliacoes.push(av);
  _firestoreDB.collection("avaliacoes").doc(String(av.id)).set(av).catch(console.error);

  // Plano "1 Avaliação": bloqueia após salvar
  const usr = DB.findByEmail(usuarioLogado.email);
  if (usr && usr.plano === "1avaliacao" && usr.role !== "admin") {
    DB.bloquear(usuarioLogado.email);
  }
}

/** Retorna todas as avaliações do cache (admin). @internal */
function _todasAvaliacoes() {
  return _cacheAvaliacoes;
}

/**
 * Retorna as avaliações visíveis para o usuário logado.
 * Admin vê tudo; profissional vê apenas as suas.
 * @returns {object[]}
 */
function getAvaliacoes() {
  const todas = _todasAvaliacoes();
  if (usuarioLogado?.role === "admin") return todas;
  return todas.filter(a => a.profissional?.email === usuarioLogado?.email);
}

/**
 * Remove uma avaliação do cache e do Firestore.
 * Respeita controle de acesso: só remove se o usuário tem permissão.
 * @param {number|string} id
 */
function excluirAvaliacao(id) {
  const idNum     = Number(id);
  const permitidos = getAvaliacoes().map(a => Number(a.id));
  if (!permitidos.includes(idNum)) return;
  _cacheAvaliacoes = _cacheAvaliacoes.filter(a => Number(a.id) !== idNum);
  _firestoreDB.collection("avaliacoes").doc(String(id)).delete().catch(console.error);
}
