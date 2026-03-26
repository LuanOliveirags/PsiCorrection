// ─────────────────────────────────────────────────────────
// WISC-IV — Escala de Inteligência Wechsler para Crianças (4.ª edição)
// Wechsler, D. (2013). Adaptação e padronização brasileira:
// Ambiel, N.F., Santos, A.A.A. dos, & Castro, N.R. de. Pearson.
//
// Tabelas normativas carregadas do Firestore em runtime (após login).
// Nenhum dado normativo é distribuído no bundle público.
// ─────────────────────────────────────────────────────────

const WISC_META = {
  id:      "wisc-iv",
  versao:  "2013_BR",
  fonte:   "Ambiel, N.F., Santos, A.A.A. & Castro, N.R. (2013). WISC-IV. Pearson.",
  tipo:    "estimada",
  nota:    "EI e FSIQ por formula z simplificada. Substituir pelos dados do Manual Pearson (2013)."
};
/** Nomes dos índices */
const WISC_INDICES = {
  cv: "Compreensão Verbal",
  rp: "Raciocínio Perceptual",
  mt: "Memória Operacional",
  vp: "Velocidade de Processamento"
};

// Tabelas normativas carregadas do Firestore em runtime (após login).
// Fallback vazio — sem dados no bundle público.
const WISC_NORMAS = {};

/** Subtestes por índice */
const WISC_SUBTESTES_POR_INDICE = {
  cv: ["semelhancas", "vocabulario", "compreensao"],
  rp: ["cubos", "conceitos_fig", "matrizes"],
  mt: ["digitos", "sequencia_ln"],
  vp: ["codigo", "procurar_simbolos"]
};

/** Nomes de exibição dos subtestes WISC */
const WISC_SUB_NOMES = {
  semelhancas:       "Semelhanças",
  vocabulario:       "Vocabulário",
  compreensao:       "Compreensão",
  cubos:             "Cubos",
  conceitos_fig:     "Conceitos Figurados",
  matrizes:          "Raciocínio com Matrizes",
  digitos:           "Dígitos",
  sequencia_ln:      "Sequência de Letras-Números",
  codigo:            "Código",
  procurar_simbolos: "Procurar Símbolos"
};

/**
 * Converte soma de escores ponderados em escore de índice (EI).
 * EI = 100 + 15 × (soma − média) / dp, clampado a [40, 160].
 */
function calcularIndiceWISC(soma, indice) {
  const tabelas = getServidorNormas()?.wisc ?? WISC_NORMAS;
  const norma = tabelas[indice];
  if (!norma) {
    if (!getServidorNormas()) console.warn("[wisc] Normas não carregadas do servidor.");
    return 100;
  }
  return Math.max(40, Math.min(160, Math.round(100 + 15 * (soma - norma.media) / norma.dp)));
}

/** Classifica um Escore de Índice ou QI Total do WISC (escala 40–160). */
function classificarQI(qi) {
  if (qi >= 130) return { label: "Muito Superior",              badge: "badge-superior",   interp: "desempenho muito acima da média para a faixa etária" };
  if (qi >= 120) return { label: "Superior",                    badge: "badge-superior",   interp: "desempenho acima da média para a faixa etária" };
  if (qi >= 110) return { label: "Médio-Superior",              badge: "badge-medio-sup",  interp: "desempenho levemente acima da média" };
  if (qi >= 90)  return { label: "Médio",                       badge: "badge-medio",      interp: "desempenho dentro da média esperada" };
  if (qi >= 80)  return { label: "Médio-Inferior",              badge: "badge-medio-inf",  interp: "desempenho levemente abaixo da média" };
  if (qi >= 70)  return { label: "Limítrofe",                   badge: "badge-inferior",   interp: "desempenho abaixo da média — investigação recomendada" };
  return                 { label: "Intelectualmente Deficiente", badge: "badge-inferior",  interp: "desempenho significativamente abaixo da média — avaliação aprofundada indicada" };
}

