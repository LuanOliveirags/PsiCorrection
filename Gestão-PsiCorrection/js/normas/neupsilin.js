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
  tipo:    "estimada",
  nota:    "Media/DP sao estimativas. Substituir pelos dados do Manual Vetor Editora."
};

// Tabelas normativas carregadas do Firestore em runtime (após login).
// Fallback vazio — sem dados no bundle público.
const NEUPSILIN_NORMAS = {};

/* Escores mÃ¡ximos por Ã¡rea */
const MAX_SCORES = {
  orientacao: 6,
  atencao:    32,
  percepcao:  20,
  memoria:    36,
  habilidades:10,
  linguagem:  33,
  funcoes:    26,
  praxias:    20
};

/* Nomes de exibiÃ§Ã£o */
const AREA_NOMES = {
  orientacao:  "OrientaÃ§Ã£o TÃªmporo-Espacial",
  atencao:     "AtenÃ§Ã£o",
  percepcao:   "PercepÃ§Ã£o Visual",
  memoria:     "MemÃ³ria",
  habilidades: "CÃ¡lculo",
  linguagem:   "Linguagem",
  funcoes:     "FunÃ§Ãµes Executivas",
  praxias:     "Praxias"
};

/* Sub-nomes */
const SUB_NOMES = {
  dia_semana:"Dia da semana", dia_mes:"Dia do mÃªs", mes:"MÃªs", ano:"Ano", local:"Local", cidade:"Cidade",
  digitos_direto:"DÃ­gitos â€” Ordem Direta", digitos_inverso:"DÃ­gitos â€” Ordem Inversa", cancelamento:"Cancelamento de Letras",
  nomeacao:"NomeaÃ§Ã£o de Figuras", discriminacao:"DiscriminaÃ§Ã£o de Figuras",
  trabalho_verbal:"MemÃ³ria de Trabalho Verbal", evocacao_imediata:"EvocaÃ§Ã£o Imediata", evocacao_tardia:"EvocaÃ§Ã£o Tardia", reconhecimento:"Reconhecimento", semantica:"MemÃ³ria SemÃ¢ntica",
  calculo_mental:"CÃ¡lculo Mental", problemas:"Problemas AritmÃ©ticos",
  fluencia:"FluÃªncia Verbal", compreensao_oral:"CompreensÃ£o Oral", repeticao:"RepetiÃ§Ã£o", leitura:"Leitura", escrita:"Escrita",
  fluencia_fonemica:"FluÃªncia FonÃªmica", controle_inibitorico:"Controle InibitÃ³rio", resolucao_problemas:"ResoluÃ§Ã£o de Problemas", abstracao:"AbstraÃ§Ã£o Verbal",
  construtiva:"Praxia Construtiva", ideomotora:"Praxia Ideomotora"
};

/** Retorna faixa etÃ¡ria para acesso Ã s normas do NEUPSILIN Adulto (12â€“90 anos) */
function getFaixaEtaria(idade) {
  if (idade <= 18) return "12-18";
  if (idade <= 25) return "19-25";
  if (idade <= 35) return "26-35";
  if (idade <= 49) return "36-49";
  if (idade <= 64) return "50-64";
  return "65+";
}

/**
 * Classifica escore-Z em categoria qualitativa.
 * CritÃ©rios baseados em percentis (1 dp = ~16th, 1,5 dp = ~7th etc.)
 */
function classificarZ(z) {
  if (z >= 1.0)  return { label: "Superior",         badge: "badge-superior", interp: "desempenho acima do esperado para o grupo de referÃªncia" };
  if (z >= 0.5)  return { label: "MÃ©dio-Superior",   badge: "badge-medio-sup", interp: "desempenho levemente acima da mÃ©dia" };
  if (z >= -0.5) return { label: "MÃ©dio",             badge: "badge-medio", interp: "desempenho dentro da mÃ©dia esperada" };
  if (z >= -1.0) return { label: "MÃ©dio-Inferior",   badge: "badge-medio-inf", interp: "desempenho levemente abaixo da mÃ©dia â€” acompanhamento recomendado" };
  return           { label: "Inferior",              badge: "badge-inferior", interp: "desempenho significativamente abaixo da mÃ©dia â€” avaliaÃ§Ã£o aprofundada indicada" };
}

/**
 * Calcula escore-Z para uma área. Tabelas carregadas do Firestore.
 */
function calcularZArea(area, score, escolaridade, idade) {
  const faixa = getFaixaEtaria(idade);
  const tabelas = getServidorNormas()?.neupsilin ?? NEUPSILIN_NORMAS;
  const norma = tabelas[area]?.[escolaridade]?.[faixa];
  if (!norma) {
    if (!getServidorNormas()) console.warn("[neupsilin] Normas não carregadas do servidor.");
    return { z: 0, classe: classificarZ(0), media: 0, dp: 1, normalizacaoUsada: "indisponivel" };
  }
  const z = (score - norma.media) / norma.dp;
  const normalizacaoUsada = "estimada";
  return { z: +z.toFixed(2), classe: classificarZ(z), media: norma.media, dp: norma.dp, normalizacaoUsada };
}

/**
 * ClassificaÃ§Ã£o geral pela mÃ©dia dos z-scores de todas as Ã¡reas.
 */
function classificacaoGeral(zScores) {
  const media = zScores.reduce((a, b) => a + b, 0) / zScores.length;
  return classificarZ(media);
}

