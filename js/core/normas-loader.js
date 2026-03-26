/* ═══════════════════════════════════════════════════════
   PsiCorrection — core/normas-loader.js
   Carregamento seguro de tabelas normativas do Firestore.

   CAMADAS DE PROTEÇÃO:
   1. Bundle    : normas/*.js contém apenas funções e META (sem tabelas)
   2. Session   : carregarNormas() só chamado após login validado pela aplicação
   3. Firestore : regras verificam _sessoes/{uid}.role (não só request.auth)
   4. Cache     : tabelas cifradas em sessionStorage (AES-GCM, chave em memória)
   5. Auditoria : cada carregamento registrado em _audit (fire-and-forget)

   ESTRUTURA NO FIRESTORE:
     _normas/{instrumento}  →  { tabelas: {...}, _seedAt, _seedPor, _versao }
     _sessoes/{uid}         →  { role, email, validoAte }
     _audit/{autoId}        →  { uid, email, instrumentos, ts, ua }
═══════════════════════════════════════════════════════ */

// null = pré-login | {} = carregado, servidor sem dados | {...} = tabelas prontas
let _servidor = null;
// CryptoKey AES-GCM gerada uma vez por sessão de login — NUNCA vai para storage
let _cacheKey = null;
const _SS_KEY = "psi_nc"; // chave no sessionStorage (legado — valor único)
const _SS_PREFIX = "psi_nc_"; // prefixo per-instrument (ex: psi_nc_wisc)
const _INSTRUMENTOS = ["wisc", "neupsilin", "neupsilin-inf", "bfp"];
let _loadState = "idle";   // "idle" | "loading" | "loaded" | "error"
let _lastError = null;
let _loadPromise = null;

// ── Criptografia de cache ─────────────────────────────

async function _initCacheKey() {
  if (_cacheKey) return _cacheKey;
  _cacheKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
  );
  return _cacheKey;
}

async function _criptografar(dados) {
  const chave   = await _initCacheKey();
  const iv      = crypto.getRandomValues(new Uint8Array(12));
  const bytes   = new TextEncoder().encode(JSON.stringify(dados));
  const cifrado = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, bytes);
  const out     = new Uint8Array(12 + cifrado.byteLength);
  out.set(iv);
  out.set(new Uint8Array(cifrado), 12);
  return btoa(String.fromCharCode(...out));
}

async function _decriptarBlob(storageKey) {
  if (!_cacheKey) return null;
  const b64 = sessionStorage.getItem(storageKey);
  if (!b64) return null;
  try {
    const buf     = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const iv      = buf.slice(0, 12);
    const cifrado = buf.slice(12);
    const claro   = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, _cacheKey, cifrado);
    return JSON.parse(new TextDecoder().decode(claro));
  } catch {
    sessionStorage.removeItem(storageKey);
    return null;
  }
}

async function _decriptarCache() {
  if (!_cacheKey) return null;
  // Legado: chave única (migra para per-instrument)
  const legado = await _decriptarBlob(_SS_KEY);
  if (legado) {
    sessionStorage.removeItem(_SS_KEY);
    return legado;
  }
  // Per-instrument
  const resultado = {};
  let algum = false;
  for (const id of _INSTRUMENTOS) {
    const dados = await _decriptarBlob(_SS_PREFIX + id);
    if (dados) { resultado[id] = dados; algum = true; }
  }
  return algum ? resultado : null;
}

// ── Sessão Firestore (_sessoes) ───────────────────────

async function _registrarSessao(email, role) {
  const uid = firebase.auth().currentUser?.uid;
  if (!uid) return;
  const validoAte = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  await _firestoreDB.collection("_sessoes").doc(uid)
    .set({ role, email, validoAte })
    .catch(console.error);
}

async function _removerSessao() {
  const uid = firebase.auth().currentUser?.uid;
  if (!uid) return;
  await _firestoreDB.collection("_sessoes").doc(uid)
    .delete()
    .catch(console.error);
}

// ── Auditoria ─────────────────────────────────────────

function _registrarAuditoria(email, instrumentos) {
  const uid = firebase.auth().currentUser?.uid;
  if (!uid) return;
  _firestoreDB.collection("_audit").add({
    uid, email, instrumentos,
    ts: new Date().toISOString(),
    ua: navigator.userAgent.slice(0, 150)
  }).catch(console.error); // fire-and-forget, nunca bloqueia UI
}

// ── API pública ───────────────────────────────────────

/**
 * Busca tabelas normativas do Firestore após login bem-sucedido.
 *
 * Fluxo:
 *   1. Registra _sessoes/{uid} → habilita leitura de _normas pelas regras Firestore
 *   2. Verifica cache cifrado em sessionStorage (evita nova busca no mesmo tab)
 *   3. Busca _normas/{instrumento} em paralelo (4 documentos)
 *   4. Cifra e armazena em sessionStorage (chave permanece apenas em memória)
 *   5. Registra acesso em _audit
 *
 * @param {string} email  - email do profissional autenticado
 * @param {string} role   - "profissional" | "admin"
 * @returns {Promise<void>}
 */
async function carregarNormas(email = "", role = "profissional") {
  _loadState = "loading";
  _lastError = null;
  _mostrarStatusNormas("Carregando normas…", "loading");

  _loadPromise = _carregarNormasInterno(email, role);
  await _loadPromise;
  _loadPromise = null;
}

async function _carregarNormasInterno(email, role) {
  // 1. Registrar sessão (habilita regras Firestore para _normas)
  await _registrarSessao(email, role);

  // 2. Verificar cache cifrado per-instrument
  const cached = await _decriptarCache();
  if (cached) {
    _servidor = cached;
    _loadState = "loaded";
    _mostrarStatusNormas("✓ Normas carregadas", "success");
    console.info("[normas] ✓ Carregado do cache cifrado.");
    return;
  }

  // 3. Buscar instrumentos em paralelo
  const resultado = {};
  let algumEncontrado = false;

  try {
    const docs = await Promise.all(
      _INSTRUMENTOS.map(id => _firestoreDB.collection("_normas").doc(id).get())
    );
    for (let i = 0; i < _INSTRUMENTOS.length; i++) {
      if (docs[i].exists) {
        resultado[_INSTRUMENTOS[i]] = docs[i].data().tabelas ?? docs[i].data();
        algumEncontrado = true;
      }
    }
  } catch (e) {
    _servidor = {};
    _loadState = "error";
    _lastError = e.message;
    _mostrarStatusNormas("Erro ao carregar normas — resultados podem estar imprecisos", "error");
    console.warn("[normas] Fallback (Firestore indisponível):", e.message);
    return;
  }

  if (!algumEncontrado) {
    _servidor = {};
    _loadState = "error";
    _lastError = "Nenhum instrumento encontrado no servidor";
    _mostrarStatusNormas("Normas indisponíveis no servidor", "error");
    console.info("[normas] Servidor sem dados.");
    return;
  }

  _servidor = resultado;
  _loadState = "loaded";

  // 4. Cifrar e armazenar per-instrument em sessionStorage
  for (const id of Object.keys(resultado)) {
    try { sessionStorage.setItem(_SS_PREFIX + id, await _criptografar(resultado[id])); }
    catch (e) { console.warn("[normas] Cache " + id + ":", e.message); }
  }

  // 5. Auditoria (fire-and-forget)
  _registrarAuditoria(email, Object.keys(resultado));
  _mostrarStatusNormas("✓ Normas carregadas: " + Object.keys(resultado).join(", "), "success");
  console.info("[normas] ✓ Tabelas carregadas:", Object.keys(resultado).join(", "));
}

/**
 * Descarta tabelas da memória, invalida o cache cifrado e remove a sessão
 * do Firestore ao fazer logout.
 * Chamado por core/auth.js → fazerLogout().
 */
function limparNormasMemoria() {
  _servidor = null;
  _cacheKey = null;
  _loadState = "idle";
  _lastError = null;
  _loadPromise = null;
  sessionStorage.removeItem(_SS_KEY); // legado
  for (const id of _INSTRUMENTOS) sessionStorage.removeItem(_SS_PREFIX + id);
  _removerSessao();
}

/**
 * Retorna as tabelas carregadas do servidor (usadas pelos getters em normas/index.js).
 * @returns {object|null}
 */
function getServidorNormas() {
  return _servidor;
}

/** true se as tabelas já foram buscadas (com ou sem dados do servidor). */
function normasCarregadas() {
  return _servidor !== null;
}

/** Retorna o estado atual do carregamento de normas. */
function estadoNormas() {
  return { state: _loadState, error: _lastError };
}

/**
 * Garante que as normas estejam disponíveis.
 * Tenta cache → Firestore re-fetch. Retorna true se normas prontas.
 */
async function garantirNormas() {
  if (_loadState === "loaded" && _servidor && Object.keys(_servidor).length > 0) return true;
  if (_loadState === "loading" && _loadPromise) {
    await _loadPromise;
    return _servidor !== null && Object.keys(_servidor).length > 0;
  }
  const cached = await _decriptarCache();
  if (cached && Object.keys(cached).length > 0) {
    _servidor = cached;
    _loadState = "loaded";
    return true;
  }
  const user = JSON.parse(sessionStorage.getItem("neupsilin_user") || "null");
  if (user && firebase.auth().currentUser) {
    await carregarNormas(user.email, user.role || "profissional");
    return _servidor !== null && Object.keys(_servidor).length > 0;
  }
  return false;
}

/** Exibe toast temporário com status do carregamento de normas. */
function _mostrarStatusNormas(mensagem, tipo) {
  let el = document.getElementById("normas-status-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "normas-status-toast";
    document.body.appendChild(el);
  }
  const estilos = {
    loading: "background:#eff6ff;color:#1e40af;border:1px solid #93c5fd",
    success: "background:#f0fdf4;color:#166534;border:1px solid #86efac",
    error:   "background:#fef2f2;color:#991b1b;border:1px solid #fca5a5"
  };
  el.style.cssText = "position:fixed;top:16px;right:16px;z-index:10000;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:500;max-width:380px;box-shadow:0 4px 12px rgba(0,0,0,.15);transition:opacity .3s;" + (estilos[tipo] || estilos.loading);
  el.textContent = mensagem;
  el.style.opacity = "1";
  if (tipo !== "loading") {
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, tipo === "error" ? 6000 : 3000);
  }
}

/**
 * Admin: importa tabelas normativas para o Firestore.
 * Recebe o instrumento e o objeto de tabelas (já parseado).
 * @param {"wisc"|"neupsilin"|"neupsilin-inf"|"bfp"} instrumento
 * @param {object} tabelas — objeto com as normas (média/dp por condição)
 */
async function importarNormasFirestore(instrumento, tabelas) {
  if (!_INSTRUMENTOS.includes(instrumento)) {
    throw new Error("Instrumento inválido: " + instrumento);
  }
  if (!tabelas || typeof tabelas !== "object" || Object.keys(tabelas).length === 0) {
    throw new Error("Tabelas vazias ou inválidas.");
  }
  const uid = firebase.auth().currentUser?.uid;
  if (!uid) throw new Error("Não autenticado.");

  await _firestoreDB.collection("_normas").doc(instrumento).set({
    tabelas,
    _versao: tabelas._versao || "manual_oficial",
    _seedPor: usuarioLogado?.email || "admin",
    _seedAt: new Date().toISOString()
  });

  // Atualiza memória e cache local imediatamente
  if (!_servidor) _servidor = {};
  _servidor[instrumento] = tabelas;
  _loadState = "loaded";
  try { sessionStorage.setItem(_SS_PREFIX + instrumento, await _criptografar(tabelas)); }
  catch (_) { /* ok */ }
}
