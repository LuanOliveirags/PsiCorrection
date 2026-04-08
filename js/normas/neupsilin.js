/**
 * NEUPSILIN ADULTO — Funções e configuração normativa
 * Referência: Fonseca, R.P., Salles, J.F., & Parente, M.A.M.P. (2009).
 *             NEUPSILIN — Instrumento de Avaliação Neuropsicológica Breve. Vetor Editora.
 *
 * Tabelas normativas carregadas do Firestore em runtime (após login).
 * Nenhum dado normativo é distribuído no bundle público.
 */

const NEUPSILIN_META = {
  id:      "neupsilin-adulto",
  versao:  "2009_BR",
  fonte:   "Fonseca, R.P., Salles, J.F. & Parente, M.A.M.P. (2009). NEUPSILIN. Vetor Editora.",
  tipo:    "manual",
  nota:    "Normas oficiais do Manual Vetor Editora, estratificadas por faixa etária e escolaridade."
};

// Tabelas normativas carregadas do Firestore em runtime (após login).
// Fallback vazio — sem dados no bundle público.
const NEUPSILIN_NORMAS = {};

/* Escores máximos por área — conforme Manual NEUPSILIN Adulto */
const MAX_SCORES = {
  orientacao:  8,   // tempo(4) + espaço(4)
  atencao:    28,   // contagem inversa escore(20) + repetição dígitos(8)
  percepcao:  12,   // linhas(6) + heminegligência(1) + percepção faces(3) + reconhec. faces(2)
  memoria:    78,   // trabalho + verbal episódica + semântica LP + visual CP + prospectiva
  habilidades: 8,   // habilidades aritméticas total
  linguagem:  53,   // oral(22) + escrita(31)
  funcoes:    10,   // resolução problemas(2) + fluência verbal total(8) — total sintético
  praxias:    22    // ideomotora(3) + construtiva(16) + reflexiva(3)
};

/* Nomes de exibição */
const AREA_NOMES = {
  orientacao:  "Orientação Têmporo-Espacial",
  atencao:     "Atenção",
  percepcao:   "Percepção",
  memoria:     "Memória",
  habilidades: "Habilidades Aritméticas",
  linguagem:   "Linguagem",
  funcoes:     "Funções Executivas",
  praxias:     "Praxias"
};

/* Sub-nomes — conforme Manual NEUPSILIN Adulto */
const SUB_NOMES = {
  ot_tempo:                "Orientação Temporal",
  ot_espaco:               "Orientação Espacial",
  contagem_inversa:        "Contagem Inversa",
  repeticao_digitos:       "Repetição de Dígitos",
  verif_linhas:            "Verificação de Linhas",
  heminegligencia:         "Heminegligência Visual",
  percep_faces:            "Percepção de Faces",
  recon_faces:             "Reconhecimento de Faces",
  mem_trabalho:            "Memória de Trabalho",
  mem_verbal_episodica:    "Memória Verbal Episódica",
  mem_semantica_lp:        "Memória Semântica de Longo Prazo",
  mem_visual_cp:           "Memória Visual de Curto Prazo",
  mem_prospectiva:         "Memória Prospectiva",
  hab_aritmeticas:         "Habilidades Aritméticas",
  ling_oral:               "Linguagem Oral",
  ling_escrita:            "Linguagem Escrita",
  resolucao_problemas:     "Resolução de Problemas",
  fluencia_verbal:         "Fluência Verbal",
  praxia_ideomotora:       "Praxia Ideomotora",
  praxia_construtiva:      "Praxia Construtiva",
  praxia_reflexiva:        "Praxia Reflexiva"
};

/** Retorna faixa etária para acesso às normas do NEUPSILIN Adulto (12–90 anos) */
function getFaixaEtaria(idade) {
  if (idade <= 18) return "adolescente";
  if (idade <= 39) return "19-39";
  if (idade <= 59) return "40-59";
  if (idade <= 75) return "60-75";
  return "76-90";
}

/**
 * Resolve a chave de norma (escolaridade/série) e faixa etária para lookup no Firestore.
 * - Adultos (19+): usa escolaridade (baixa/media/alta) + faixa etária
 * - Adolescentes (12–18): usa chave combinada tipo_escola_serie (ex: "part_fund_setima")
 *   Nesse caso a "faixa" retornada é a própria chave de série e a "escolaridade" é o tipo de escola.
 */
function resolverChaveNorma(idade, escolaridade, tipoEscola, serie) {
  if (idade >= 19) {
    return { escolaridade, faixa: getFaixaEtaria(idade), isAdolescente: false };
  }
  // Adolescente: a chave no Firestore é tipoEscola (particular/publica), faixa = serie
  return { escolaridade: tipoEscola, faixa: serie, isAdolescente: true };
}

/**
 * Classifica escore-Z em categoria qualitativa.
 * Critérios baseados em percentis (1 dp = ~16th, 1,5 dp = ~7th etc.)
 */
function classificarZ(z) {
  if (z >= 1.0)  return { label: "Superior",         badge: "badge-superior", interp: "desempenho acima do esperado para o grupo de referência" };
  if (z >= 0.5)  return { label: "Médio-Superior",   badge: "badge-medio-sup", interp: "desempenho levemente acima da média" };
  if (z >= -0.5) return { label: "Médio",             badge: "badge-medio", interp: "desempenho dentro da média esperada" };
  if (z >= -1.0) return { label: "Médio-Inferior",   badge: "badge-medio-inf", interp: "desempenho levemente abaixo da média — acompanhamento recomendado" };
  return           { label: "Inferior",              badge: "badge-inferior", interp: "desempenho significativamente abaixo da média — avaliação aprofundada indicada" };
}

/**
 * Calcula escore-Z para uma área. Tabelas carregadas do Firestore.
 * Para adolescentes, tipoEscola e serie precisam ser passados.
 */
function calcularZArea(area, score, escolaridade, idade, tipoEscola, serie) {
  const chave = resolverChaveNorma(idade, escolaridade, tipoEscola, serie);
  const tabelas = getServidorNormas()?.neupsilin ?? NEUPSILIN_NORMAS;
  const norma = tabelas[area]?.[chave.escolaridade]?.[chave.faixa];
  if (!norma) {
    if (!getServidorNormas()) console.warn("[neupsilin] Normas não carregadas do servidor.");
    return { z: 0, classe: classificarZ(0), media: 0, dp: 1, normalizacaoUsada: "indisponivel" };
  }
  const z = (score - norma.media) / norma.dp;
  const normalizacaoUsada = "manual";
  return { z: +z.toFixed(2), classe: classificarZ(z), media: norma.media, dp: norma.dp, normalizacaoUsada };
}

/**
 * Classificação geral pela média dos z-scores de todas as áreas.
 */
function classificacaoGeral(zScores) {
  const media = zScores.reduce((a, b) => a + b, 0) / zScores.length;
  return classificarZ(media);
}

