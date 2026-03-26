/* ═══════════════════════════════════════════════════════
   PsiCorrection — js/normas/index.js
   Fonte de verdade dos dados normativos.

   Arquitetura de proteção em camadas:
     Nível 1 (bundle): normas/*.js contém apenas funções e META (sem tabelas).
     Nível 2 (runtime): tabelas só ficam na memória APÓS login.
     Nível 3 (servidor): tabelas carregadas do Firestore
                          via getter → getServidorNormas().

   Uso:
     const { wisc }      = NORMAS;
     wisc.tabelas        → carrega do Firestore (fallback vazio)
     NORMAS.meta("wisc") → { id, versao, fonte, tipo, nota }
═══════════════════════════════════════════════════════ */

// ── Ponto de acesso unificado ─────────────────────────
// As propriedade `tabelas` são GETTERS: preferem Firestore,
// fazem fallback no bundle se o servidor ainda não foi seeded.
const NORMAS = Object.freeze({

  /* ─── WISC-IV ─────────────────────────────────────── */
  wisc: {
    meta:               WISC_META,
    get tabelas()       { return getServidorNormas()?.wisc ?? WISC_NORMAS; },
    indices:            WISC_INDICES,
    subtestesPorIndice: WISC_SUBTESTES_POR_INDICE,
    subNomes:           WISC_SUB_NOMES,
    calcularIndice:     calcularIndiceWISC,
    classificarQI:      classificarQI
  },

  /* ─── NEUPSILIN Adulto ────────────────────────────── */
  neupsilin: {
    meta:               NEUPSILIN_META,
    get tabelas()       { return getServidorNormas()?.neupsilin ?? NEUPSILIN_NORMAS; },
    maxScores:          MAX_SCORES,
    areaNomes:          AREA_NOMES,
    subNomes:           SUB_NOMES,
    getFaixaEtaria:     getFaixaEtaria,
    classificarZ:       classificarZ,
    calcularZArea:      calcularZArea,
    classificacaoGeral: classificacaoGeral
  },

  /* ─── NEUPSILIN-INF ───────────────────────────────── */
  "neupsilin-inf": {
    meta:           NEUPSILIN_INF_META,
    get tabelas()   { return getServidorNormas()?.["neupsilin-inf"] ?? NORMAS_INF; },
    maxScores:      MAX_SCORES_INF,
    areaNomes:      AREA_NOMES_INF,
    subNomes:       SUB_NOMES_INF,
    getFaixaEtaria: getFaixaEtariaInf,
    calcularZArea:  calcularZAreaInf
  },

  /* ─── BFP ─────────────────────────────────────────── */
  bfp: {
    meta:           BFP_META,
    get tabelas()   { return getServidorNormas()?.bfp ?? BFP_NORMAS_FACETA; },
    fatores:        BFP_FATORES,
    facetas:        BFP_FACETAS,
    tScore:         bfpTScore,
    percentil:      bfpPercentil,
    classificar:    bfpClassificar,
    badgeCor:       bfpBadgeCor,
    classeGenerica: bfpClasseGenerica
  },

  /**
   * Retorna o metadado de versionamento de um instrumento.
   * @param {"wisc"|"neupsilin"|"neupsilin-inf"|"bfp"} id
   * @returns {{ versao, fonte, tipo, nota }}
   */
  meta(id) { return this[id]?.meta ?? null; }

});

// ── Seed já executado ────────────────────────────────────
// Tabelas normativas estão no Firestore.
// Não há dados expostos no bundle.
